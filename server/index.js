const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
require('dotenv').config();
const pool = require('./db');

const app = express();
const port = Number(process.env.API_PORT || 5000);

app.use(cors());
app.use(express.json());

function parseUserId(rawUserId) {
  const userId = Number(rawUserId);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

async function userExists(userId) {
  const [rows] = await pool.query('SELECT id FROM users WHERE id = ? LIMIT 1', [userId]);
  return rows.length > 0;
}

// HEALTH CHECK
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: 'Database connection failed' });
  }
});

// SIGNUP
app.post('/api/signup', async (req, res) => {
  const { email, password } = req.body;

  try {
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ message: 'An account with that email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await pool.query(
      'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      [email, passwordHash]
    );

    res.status(201).json({ message: 'Account created successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// LOGIN
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    res.json({ message: 'Login successful', userId: user.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// HABIT TYPES
app.get('/api/habits', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, unit, description FROM habit_types ORDER BY id'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not load habit types' });
  }
});

// HABITS FOR ONE USER
app.get('/api/users/:userId/habits', async (req, res) => {
  const userId = parseUserId(req.params.userId);
  if (!userId) {
    return res.status(400).json({ message: 'Invalid user id' });
  }

  try {
    if (!(await userExists(userId))) {
      return res.status(404).json({ message: 'User not found' });
    }

    const [rows] = await pool.query(
      `SELECT
         he.id,
         he.user_id AS userId,
         ht.name AS habit,
         ht.unit,
         he.entry_date AS entryDate,
         CAST(he.value AS DOUBLE) AS value,
         he.notes
       FROM habit_entries he
       JOIN habit_types ht ON ht.id = he.habit_type_id
       WHERE he.user_id = ?
       ORDER BY he.entry_date DESC, ht.name ASC`,
      [userId]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not load habit entries' });
  }
});

// CREATE OR UPDATE A USER'S HABIT ENTRY
app.put('/api/users/:userId/habits/:habitName', async (req, res) => {
  const userId = parseUserId(req.params.userId);
  const habitName = String(req.params.habitName || '').toLowerCase();
  const { entryDate, value, notes = null } = req.body;
  const numericValue = Number(value);

  if (!userId) {
    return res.status(400).json({ message: 'Invalid user id' });
  }

  if (!entryDate || value === '' || value === null || value === undefined || Number.isNaN(numericValue) || numericValue < 0) {
    return res.status(400).json({ message: 'entryDate and a non-negative value are required' });
  }

  try {
    if (!(await userExists(userId))) {
      return res.status(404).json({ message: 'User not found' });
    }

    const [habitRows] = await pool.query(
      'SELECT id, name, unit FROM habit_types WHERE name = ? LIMIT 1',
      [habitName]
    );

    if (habitRows.length === 0) {
      return res.status(404).json({ message: 'Unknown habit type' });
    }

    const habit = habitRows[0];

    await pool.query(
      `INSERT INTO habit_entries
         (user_id, habit_type_id, entry_date, value, notes)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         value = VALUES(value),
         notes = VALUES(notes)`,
      [userId, habit.id, entryDate, numericValue, notes]
    );

    res.json({
      userId,
      habit: habit.name,
      unit: habit.unit,
      entryDate,
      value: numericValue,
      notes,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not save habit entry' });
  }
});

// DELETE ONE USER'S HABIT ENTRY
app.delete('/api/users/:userId/habits/:habitName/:entryDate', async (req, res) => {
  const userId = parseUserId(req.params.userId);
  const habitName = String(req.params.habitName || '').toLowerCase();
  const { entryDate } = req.params;

  if (!userId) {
    return res.status(400).json({ message: 'Invalid user id' });
  }

  try {
    const [result] = await pool.query(
      `DELETE he FROM habit_entries he
       JOIN habit_types ht ON ht.id = he.habit_type_id
       WHERE he.user_id = ? AND ht.name = ? AND he.entry_date = ?`,
      [userId, habitName, entryDate]
    );

    res.json({ deleted: result.affectedRows > 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not delete habit entry' });
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
