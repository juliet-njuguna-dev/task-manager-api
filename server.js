require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const initDB = require('./db');

const app = express();
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

const db = initDB();

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

app.post('/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const stmt = db.prepare('INSERT INTO users (email, password) VALUES (?, ?)');
    const result = stmt.run(email, hashedPassword);
    res.status(201).json({ id: result.lastInsertRowid, email });
  } catch (err) {
    res.status(400).json({ error: 'Email already exists or invalid data' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
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

app.post('/tasks', authenticateToken, async (req, res) => {
  try {
    const { title, description } = req.body;
    const idempotencyKey = req.headers['idempotency-key'];

    if (!title) return res.status(400).json({ error: 'Title is required' });

    if (idempotencyKey) {
      const existingTask = db
        .prepare('SELECT * FROM tasks WHERE idempotency_key = ? AND user_id = ?')
        .get(idempotencyKey, req.user.id);
      if (existingTask) {
        return res.status(200).json(existingTask);
      }
    }

    const stmt = db.prepare(
      'INSERT INTO tasks (user_id, title, description, idempotency_key) VALUES (?, ?, ?, ?)'
    );
    const result = stmt.run(req.user.id, title, description || '', idempotencyKey || null);
    res.status(201).json({ id: result.lastInsertRowid, title, description });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

app.get('/tasks', authenticateToken, async (req, res) => {
  const tasks = db.prepare('SELECT * FROM tasks WHERE user_id = ?').all(req.user.id);
  res.json(tasks);
});

app.put('/tasks/:id', authenticateToken, async (req, res) => {
  const { title, description, completed } = req.body;
  const task = db
    .prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  db.prepare('UPDATE tasks SET title = ?, description = ?, completed = ? WHERE id = ?').run(
    title || task.title,
    description || task.description,
    completed ?? task.completed,
    req.params.id
  );
  res.json({ message: 'Task updated' });
});

app.delete('/tasks/:id', authenticateToken, async (req, res) => {
  const task = db
    .prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ message: 'Task deleted' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));