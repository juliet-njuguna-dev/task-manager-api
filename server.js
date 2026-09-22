require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const initDB = require('./db');


const app = express();
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

let db;

// Middleware to check if user is logged in
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}

// Signup
app.post('/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.run(
      'INSERT INTO users (email, password) VALUES (?, ?)',
      [email, hashedPassword]
    );
    res.status(201).json({ id: result.lastID, email });
  } catch (err) {
    res.status(400).json({ error: 'Email already exists or invalid data' });
  }
});

// Login
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
      expiresIn: '24h',
    });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Create a task
app.post('/tasks', authenticateToken, async (req, res) => {
  try {
    const { title, description } = req.body;
    const idempotencyKey = req.headers['idempotency-key'];

    if (!title) return res.status(400).json({ error: 'Title is required' });

    // If an idempotency key was provided, check if we've seen it before
    if (idempotencyKey) {
      const existingTask = await db.get(
        'SELECT * FROM tasks WHERE idempotency_key = ? AND user_id = ?',
        [idempotencyKey, req.user.id]
      );
      if (existingTask) {
        // Same request as before — return the original result, don't create a duplicate
        return res.status(200).json(existingTask);
      }
    }

    const result = await db.run(
      'INSERT INTO tasks (user_id, title, description, idempotency_key) VALUES (?, ?, ?, ?)',
      [req.user.id, title, description || '', idempotencyKey || null]
    );
    res.status(201).json({ id: result.lastID, title, description });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Get all tasks for logged-in user
app.get('/tasks', authenticateToken, async (req, res) => {
  const tasks = await db.all('SELECT * FROM tasks WHERE user_id = ?', [req.user.id]);
  res.json(tasks);
});

// Update a task
app.put('/tasks/:id', authenticateToken, async (req, res) => {
  const { title, description, completed } = req.body;
  const task = await db.get('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [
    req.params.id,
    req.user.id,
  ]);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  await db.run(
    'UPDATE tasks SET title = ?, description = ?, completed = ? WHERE id = ?',
    [title || task.title, description || task.description, completed ?? task.completed, req.params.id]
  );
  res.json({ message: 'Task updated' });
});

// Delete a task
app.delete('/tasks/:id', authenticateToken, async (req, res) => {
  const task = await db.get('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [
    req.params.id,
    req.user.id,
  ]);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  await db.run('DELETE FROM tasks WHERE id = ?', [req.params.id]);
  res.json({ message: 'Task deleted' });
});

const PORT = process.env.PORT || 5000;

initDB().then((database) => {
  db = database;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});