const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
require('dotenv').config();
const pool = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

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

app.listen(5000, () => console.log('Server running on port 5000'));