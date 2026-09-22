# Task Manager API

A RESTful API for managing personal tasks, built with Node.js, Express, and SQLite. Includes JWT authentication, idempotent task creation, and rate limiting.

## Features

- User signup and login with JWT-based authentication
- Full CRUD operations for tasks (Create, Read, Update, Delete)
- Tasks are scoped to the authenticated user — no cross-user access
- **Idempotency** on task creation — sending the same request twice (e.g. due to a network retry) won't create duplicate tasks
- **Rate limiting** — protects the API from excessive requests (100 requests per 15 minutes per IP)
- Passwords hashed with bcrypt, never stored in plain text

## Tech stack

- **Runtime:** Node.js
- **Framework:** Express
- **Database:** SQLite
- **Auth:** JSON Web Tokens (JWT)
- **Security:** bcrypt (password hashing), express-rate-limit

## API Endpoints

### Auth

| Method | Endpoint | Description |
|---|---|---|
| POST | `/signup` | Create a new user account |
| POST | `/login` | Log in and receive a JWT token |

**Signup request body:**
```json
{ "email": "user@example.com", "password": "yourpassword" }
```

**Login request body:**
```json
{ "email": "user@example.com", "password": "yourpassword" }
```
Returns: `{ "token": "..." }`

### Tasks
All task endpoints require an `Authorization: Bearer <token>` header.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/tasks` | Create a new task |
| GET | `/tasks` | Get all tasks for the logged-in user |
| PUT | `/tasks/:id` | Update a task |
| DELETE | `/tasks/:id` | Delete a task |

**Create task request body:**
```json
{ "title": "Buy groceries", "description": "Milk, eggs, bread" }
```

**Idempotent task creation:** include an `Idempotency-Key` header with a unique value. If the same key is sent again, the original task is returned instead of a duplicate being created.
```
Idempotency-Key: unique-key-here
```

## Running locally

```bash
npm install
```

Create a `.env` file:
```
JWT_SECRET=your_secret_string
PORT=5000
```

Then run:
```bash
node server.js
```

## Why idempotency and rate limiting

Real-world clients (mobile apps, flaky networks) often retry requests automatically. Without idempotency, a single retried "create task" request could silently create duplicates. Rate limiting protects the API from being overwhelmed by excessive requests, whether accidental or malicious — a basic but essential production safeguard.