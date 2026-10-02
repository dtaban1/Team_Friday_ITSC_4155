const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const session = require("express-session");
require("dotenv").config();

const pool = require("./db");

const app = express();
const isProduction = process.env.NODE_ENV === "production";
const port = process.env.PORT || 5000;

if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error(
    "SESSION_SECRET must be set in production"
  );
}

app.set("trust proxy", 1);

app.use(
  cors({
    origin:
      process.env.CLIENT_URL ||
      "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.json());

app.use(
  session({
    name: "ontrack.sid",
    secret:
      process.env.SESSION_SECRET ||
      "ontrack-local-development-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

/*
 * Convert the user ID from the URL into a valid number.
 */
function parseUserId(rawUserId) {
  const userId = Number(rawUserId);

  return Number.isInteger(userId) && userId > 0
    ? userId
    : null;
}

/*
 * Check whether a user exists in the database.
 */
async function userExists(userId) {
  const [rows] = await pool.query(
    "SELECT id FROM users WHERE id = ? LIMIT 1",
    [userId]
  );

  return rows.length > 0;
}

// HEALTH CHECK
app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      ok: true,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      message: "Database connection failed",
    });
  }
});

// SIGNUP
app.post("/api/signup", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      message: "Email and password are required",
    });
  }

  try {
    const [existing] = await pool.query(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        message:
          "An account with that email already exists",
      });
    }

    const passwordHash = await bcrypt.hash(
      password,
      10
    );

    const [result] = await pool.query(
      `INSERT INTO users (email, password_hash)
       VALUES (?, ?)`,
      [email, passwordHash]
    );

    res.status(201).json({
      message: "Account created successfully",
      userId: result.insertId,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
});

// LOGIN
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(401).json({
      message: "Invalid email or password",
    });
  }

  try {
    const [rows] = await pool.query(
      `SELECT id, email, password_hash
       FROM users
       WHERE email = ?`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const user = rows[0];

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    req.session.userId = user.id;
    req.session.email = user.email;

    res.json({
      message: "Login successful",
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
});

// CHECK LOGIN SESSION
app.get("/api/session", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({
      message: "Not authenticated",
    });
  }

  res.json({
    user: {
      id: req.session.userId,
      email: req.session.email,
    },
  });
});

// LOGOUT
app.post("/api/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error(error);

      return res.status(500).json({
        message: "Unable to log out",
      });
    }

    res.clearCookie("ontrack.sid", {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
    });

    res.json({
      message: "Logged out successfully",
    });
  });
});

// HABIT TYPES
app.get("/api/habits", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, unit, description
       FROM habit_types
       ORDER BY id`
    );

    res.json(rows);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Could not load habit types",
    });
  }
});

// HABITS FOR ONE USER
app.get(
  "/api/users/:userId/habits",
  async (req, res) => {
    const userId = parseUserId(
      req.params.userId
    );

    if (!userId) {
      return res.status(400).json({
        message: "Invalid user id",
      });
    }

    try {
      if (!(await userExists(userId))) {
        return res.status(404).json({
          message: "User not found",
        });
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
         JOIN habit_types ht
           ON ht.id = he.habit_type_id
         WHERE he.user_id = ?
         ORDER BY
           he.entry_date DESC,
           ht.name ASC`,
        [userId]
      );

      res.json(rows);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Could not load habit entries",
      });
    }
  }
);

// CREATE OR UPDATE A USER'S HABIT ENTRY
app.put(
  "/api/users/:userId/habits/:habitName",
  async (req, res) => {
    const userId = parseUserId(
      req.params.userId
    );

    const habitName = String(
      req.params.habitName || ""
    ).toLowerCase();

    const {
      entryDate,
      value,
      notes = null,
    } = req.body;

    const numericValue = Number(value);

    if (!userId) {
      return res.status(400).json({
        message: "Invalid user id",
      });
    }

    if (
      !entryDate ||
      value === "" ||
      value === null ||
      value === undefined ||
      Number.isNaN(numericValue) ||
      numericValue < 0
    ) {
      return res.status(400).json({
        message:
          "entryDate and a non-negative value are required",
      });
    }

    try {
      if (!(await userExists(userId))) {
        return res.status(404).json({
          message: "User not found",
        });
      }

      const [habitRows] = await pool.query(
        `SELECT id, name, unit
         FROM habit_types
         WHERE name = ?
         LIMIT 1`,
        [habitName]
      );

      if (habitRows.length === 0) {
        return res.status(404).json({
          message: "Unknown habit type",
        });
      }

      const habit = habitRows[0];

      await pool.query(
        `INSERT INTO habit_entries
           (
             user_id,
             habit_type_id,
             entry_date,
             value,
             notes
           )
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           value = VALUES(value),
           notes = VALUES(notes)`,
        [
          userId,
          habit.id,
          entryDate,
          numericValue,
          notes,
        ]
      );

      res.json({
        userId,
        habit: habit.name,
        unit: habit.unit,
        entryDate,
        value: numericValue,
        notes,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Could not save habit entry",
      });
    }
  }
);

// DELETE ONE USER'S HABIT ENTRY
app.delete(
  "/api/users/:userId/habits/:habitName/:entryDate",
  async (req, res) => {
    const userId = parseUserId(
      req.params.userId
    );

    const habitName = String(
      req.params.habitName || ""
    ).toLowerCase();

    const { entryDate } = req.params;

    if (!userId) {
      return res.status(400).json({
        message: "Invalid user id",
      });
    }

    try {
      const [result] = await pool.query(
        `DELETE he
         FROM habit_entries he
         JOIN habit_types ht
           ON ht.id = he.habit_type_id
         WHERE he.user_id = ?
           AND ht.name = ?
           AND he.entry_date = ?`,
        [userId, habitName, entryDate]
      );

      res.json({
        deleted: result.affectedRows > 0,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Could not delete habit entry",
      });
    }
  }
);


// GET STREAK FOR A SPECIFIC HABIT
app.get(
  "/api/users/:userId/habits/:habitName/streak",
  async (req, res) => {
    const userId = parseUserId(req.params.userId);
    const habitName = String(req.params.habitName || "").toLowerCase();

    if (!userId) {
      return res.status(400).json({
        message: "Invalid user id",
      });
    }

    try {
      if (!(await userExists(userId))) {
        return res.status(404).json({
          message: "User not found",
        });
      }

      const [habitRows] = await pool.query(
        `SELECT id FROM habit_types WHERE name = ? LIMIT 1`,
        [habitName]
      );

      if (habitRows.length === 0) {
        return res.status(404).json({
          message: "Unknown habit type",
        });
      }

      const habitTypeId = habitRows[0].id;

      const [entries] = await pool.query(
        `SELECT entry_date
         FROM habit_entries
         WHERE user_id = ? AND habit_type_id = ? AND entry_date <= CURDATE()
         ORDER BY entry_date DESC`,
        [userId, habitTypeId]
      );

      let streak = 0;
      let expectedDate = new Date();
      expectedDate.setHours(0, 0, 0, 0);

      for (const row of entries) {
        const entryDate = new Date(row.entry_date);
        entryDate.setHours(0, 0, 0, 0);

        const diffDays = Math.round(
          (expectedDate - entryDate) / (1000 * 60 * 60 * 24)
        );

        if (diffDays === 0) {
          streak++;
          expectedDate.setDate(expectedDate.getDate() - 1);
        } else if (diffDays === 1 && streak === 0) {
          streak++;
          expectedDate = new Date(entryDate);
          expectedDate.setDate(expectedDate.getDate() - 1);
        } else {
          break;
        }
      }

      res.json({
        userId,
        habit: habitName,
        streak,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Could not calculate streak",
      });
    }
  }
);


app.listen(port, () => {
  console.log(
    `Server running on port ${port}`
  );
});