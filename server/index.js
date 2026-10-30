const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const session = require("express-session");
require("dotenv").config();

const pool = require("./db");
const { HABIT_GROUPS, findHabitGroup, validateSelectedHabits, addHabitsFromGroup } = require("./habitGroups");

const { setSchedule, getHistory } = require("./habitHistory");

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
  const { firstName, lastName, email, password } = req.body;

  const first = typeof firstName === "string" ? firstName.trim() : "";
  const last = typeof lastName === "string" ? lastName.trim() : "";

  if (!first || !last || first.length > 50 || last.length > 50 || !email || !password) {
    return res.status(400).json({
      message: "First name, last name, email and password are required",
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
      `INSERT INTO users (email, first_name, last_name, password_hash)
       VALUES (?, ?, ?, ?)`,
      [email, first, last, passwordHash]
    );

    // Every default habit is scheduled starting on account creation.
    await pool.query(`INSERT INTO habit_schedule_periods (user_id, habit_kind, habit_id, start_date)
      SELECT ?, 'standard', id, CURDATE() FROM habit_types`, [result.insertId]);
    
    req.session.userId = result.insertId;
    req.session.email = email;
    
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
app.get("/api/session", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({
      message: "Not authenticated",
    });
  }

  try {
    const [rows] = await pool.query(
      "SELECT id, email, first_name, last_name FROM users WHERE id = ? LIMIT 1",
      [req.session.userId]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        message: "Not authenticated",
      });
    }

    const user = rows[0];

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
      },
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
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

function requireHabitSession(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ message: "Please log in." });
  next();
}

// Monthly history always uses the logged-in account; no user id accepted from the client.
app.get("/api/habit-history", requireHabitSession, async (req, res) => {
  const month = String(req.query.month || "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0,4)) < 1000)
    return res.status(400).json({ message: "Provide a valid month (YYYY-MM)." });
  try { res.json(await getHistory(req.session.userId, month)); }
  catch (error) { console.error(error); res.status(500).json({ message: "Could not load habit history. Run the history migration first." }); }
});

// All habits, including removed ones, for the authenticated user's management page.
app.get("/api/habit-management", requireHabitSession, async (req, res) => {
  try {
    const [standard] = await pool.query(
      `SELECT ht.id, ht.name, ht.unit,
              (hidden.user_id IS NULL) AS isActive
       FROM habit_types ht
       LEFT JOIN user_hidden_habit_types hidden
         ON hidden.habit_type_id = ht.id AND hidden.user_id = ?
       ORDER BY ht.id`,
      [req.session.userId]
    );
    const [custom] = await pool.query(
      `SELECT id, name, unit, is_active AS isActive
       FROM custom_habits WHERE user_id = ? ORDER BY id`,
      [req.session.userId]
    );
    res.json({
      standard: standard.map((habit) => ({ ...habit, isActive: Boolean(habit.isActive), kind: "standard" })),
      custom: custom.map((habit) => ({ ...habit, isActive: Boolean(habit.isActive), kind: "custom" })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not load habit management." });
  }
});

// Preset groups are available to every logged-in user. The catalog itself is read-only.
app.get("/api/habit-groups", requireHabitSession, (_req, res) => {
  res.json(HABIT_GROUPS);
});

// Add a user-selected subset atomically. Existing habits are skipped rather than duplicated;
// previously removed habits are restored so that saved entries stay intact.
app.post("/api/habit-groups/:groupId", requireHabitSession, async (req, res) => {
  const group = findHabitGroup(req.params.groupId);
  if (!group) return res.status(404).json({ message: "Habit group not found." });

  let selected;
  try {
    selected = validateSelectedHabits(group, req.body?.habitIds);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const result = await addHabitsFromGroup(connection, req.session.userId, selected);
    await connection.commit();

    const count = result.added.length + result.restored.length;
    const message = count === 0
      ? `You already track all selected habits from “${group.name}”. No duplicates were added.`
      : `“${group.name}” added: ${result.added.length} new, ${result.restored.length} restored` +
        (result.skipped.length ? `, ${result.skipped.length} already tracked.` : ".");

    res.json({ groupId: group.id, ...result, message, alreadyAdded: count === 0 });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (rollbackError) { console.error(rollbackError); }
    }
    console.error(error);
    res.status(500).json({ message: "Could not add this group. Please try again." });
  } finally {
    if (connection) connection.release();
  }
});

// A hidden built-in habit remains in the global habit catalog and in the user's history.
app.patch("/api/habit-management/standard/:id/visibility", requireHabitSession, async (req, res) => {
  const id = parseUserId(req.params.id);
  const { active } = req.body || {};
  if (!id || typeof active !== "boolean") {
    return res.status(400).json({ message: "Choose a valid habit and visibility status." });
  }
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [types] = await connection.query("SELECT id FROM habit_types WHERE id = ?", [id]);
    if (!types.length) { await connection.rollback(); return res.status(404).json({ message: "Habit not found." }); }
    const [hidden] = await connection.query("SELECT 1 FROM user_hidden_habit_types WHERE user_id=? AND habit_type_id=?", [req.session.userId,id]);
    if (active && hidden.length) {
      await connection.query("DELETE FROM user_hidden_habit_types WHERE user_id=? AND habit_type_id=?", [req.session.userId,id]);
      await setSchedule(connection,req.session.userId,'standard',id,true);
    } else if (!active && !hidden.length) {
      await connection.query("INSERT INTO user_hidden_habit_types (user_id,habit_type_id) VALUES (?,?)", [req.session.userId,id]);
      await setSchedule(connection,req.session.userId,'standard',id,false);
    }
    await connection.commit();
    res.json({ id, kind: "standard", isActive: active });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(error);
    res.status(500).json({ message: "Could not update habit visibility." });
  } finally { if (connection) connection.release(); }
});

app.get("/api/custom-habits", requireHabitSession, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, name, unit FROM custom_habits WHERE user_id = ? AND is_active = 1 ORDER BY id", [req.session.userId]);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not load custom habits." });
  }
});

app.post("/api/custom-habits", requireHabitSession, async (req, res) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const unit = typeof req.body.unit === "string" ? req.body.unit.trim() : "";
  if (!name || name.length > 50 || !unit || unit.length > 30) {
    return res.status(400).json({ message: "Enter a habit name (up to 50 characters) and unit (up to 30 characters)." });
  }
  if (["water", "sleep"].includes(name.toLowerCase())) {
    return res.status(400).json({ message: "Water and sleep are already available." });
  }
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [result] = await connection.query("INSERT INTO custom_habits (user_id, name, unit) VALUES (?, ?, ?)", [req.session.userId, name, unit]);
    await setSchedule(connection,req.session.userId,'custom',result.insertId,true);
    await connection.commit();
    res.status(201).json({ id: result.insertId, name, unit });
  } catch (error) {
    if (connection) await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "A habit with this name already exists. Restore it from Removed habits if needed." });
    console.error(error);
    res.status(500).json({ message: "Could not create habit." });
  } finally { if (connection) connection.release(); }
});

// Editing a custom habit updates its label/unit, without touching past entries.
app.patch("/api/custom-habits/:id", requireHabitSession, async (req, res) => {
  const id = parseUserId(req.params.id);
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const unit = typeof req.body?.unit === "string" ? req.body.unit.trim() : "";
  if (!id || !name || name.length > 50 || !unit || unit.length > 30) {
    return res.status(400).json({ message: "Enter a valid name (1-50 characters) and unit (1-30 characters)." });
  }
  if (["water", "sleep"].includes(name.toLowerCase())) {
    return res.status(400).json({ message: "Water and sleep are built-in habits." });
  }
  try {
    const [result] = await pool.query(
      "UPDATE custom_habits SET name = ?, unit = ? WHERE id = ? AND user_id = ? AND is_active = 1",
      [name, unit, id, req.session.userId]
    );
    if (!result.affectedRows) return res.status(404).json({ message: "Habit not found." });
    res.json({ id, name, unit, isActive: true, kind: "custom" });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "You already have a habit with that name." });
    console.error(error);
    res.status(500).json({ message: "Could not edit habit." });
  }
});

// Removal is a reversible soft-delete: custom_habit_entries are never deleted.
app.patch("/api/custom-habits/:id/visibility", requireHabitSession, async (req, res) => {
  const id = parseUserId(req.params.id);
  const { active } = req.body || {};
  if (!id || typeof active !== "boolean") {
    return res.status(400).json({ message: "Choose a valid habit and visibility status." });
  }
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [before] = await connection.query("SELECT is_active FROM custom_habits WHERE id=? AND user_id=? FOR UPDATE",[id,req.session.userId]);
    if (!before.length) { await connection.rollback(); return res.status(404).json({ message: "Habit not found." }); }
    if (Boolean(before[0].is_active) !== active) {
      await connection.query("UPDATE custom_habits SET is_active=? WHERE id=? AND user_id=?",[active,id,req.session.userId]);
      await setSchedule(connection,req.session.userId,'custom',id,active);
    }
    await connection.commit();
    res.json({ id, kind: "custom", isActive: active });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(error);
    res.status(500).json({ message: "Could not update habit visibility." });
  } finally { if (connection) connection.release(); }
});

app.put("/api/custom-habits/:id/entries", requireHabitSession, async (req, res) => {
  const id = parseUserId(req.params.id);
  const { entryDate, value } = req.body;
  const number = Number(value);
  const validDate = typeof entryDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entryDate) &&
    Number.isFinite(Date.parse(entryDate)) && new Date(entryDate).toISOString().slice(0, 10) === entryDate;
  if (!id || !validDate || typeof value !== "number" || !Number.isFinite(number) || number < 0 || number > 99999999.99) {
    return res.status(400).json({ message: "Choose a valid date and a non-negative value up to 99999999.99." });
  }
  try {
    const [rows] = await pool.query("SELECT id FROM custom_habits WHERE id = ? AND user_id = ? AND is_active = 1", [id, req.session.userId]);
    if (!rows.length) return res.status(404).json({ message: "Habit not found." });
    await pool.query(`INSERT INTO custom_habit_entries (custom_habit_id, entry_date, value) VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE value = VALUES(value)`, [id, entryDate, number]);
    res.json({ message: "Habit entry saved." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not save habit entry." });
  }
});

// HABIT TYPES
app.get("/api/habits", requireHabitSession, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ht.id, ht.name, ht.unit, ht.description
       FROM habit_types ht
       LEFT JOIN user_hidden_habit_types hidden
         ON hidden.habit_type_id = ht.id AND hidden.user_id = ?
       WHERE hidden.user_id IS NULL
       ORDER BY ht.id`,
      [req.session.userId]
    );

    res.json(rows);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Could not load habit types",
    });
  }
});

function requireOwnHabitAccount(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ message: "Please log in." });
  const userId = parseUserId(req.params.userId);
  if (!userId) return res.status(400).json({ message: "Invalid user id." });
  if (req.session.userId !== userId) return res.status(403).json({ message: "You can only access your own habits." });
  next();
}

// HABITS FOR ONE USER
app.get(
  "/api/users/:userId/habits",
  requireOwnHabitAccount,
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
           DATE_FORMAT(he.entry_date, '%Y-%m-%d') AS entryDate,
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

      if (req.session.userId === userId) {
        const [customEntries] = await pool.query(`SELECT CONCAT('custom-', ce.id) AS id,
          ch.id AS customHabitId, ch.name AS habit, ch.unit,
          DATE_FORMAT(ce.entry_date, '%Y-%m-%d') AS entryDate, CAST(ce.value AS DOUBLE) AS value
          FROM custom_habit_entries ce JOIN custom_habits ch ON ch.id = ce.custom_habit_id
          WHERE ch.user_id = ?`, [userId]);
        rows.push(...customEntries);
        rows.sort((a, b) => String(b.entryDate).slice(0, 10).localeCompare(String(a.entryDate).slice(0, 10)) || a.habit.localeCompare(b.habit));
      }
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
  requireOwnHabitAccount,
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
      const [hidden] = await pool.query(
        "SELECT 1 FROM user_hidden_habit_types WHERE user_id = ? AND habit_type_id = ?",
        [userId, habit.id]
      );
      if (hidden.length) return res.status(409).json({ message: "Restore this habit before logging new entries." });

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
  requireOwnHabitAccount,
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
  requireOwnHabitAccount,
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

function requireSession(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Please log in." });
  }

  next();
}

function validOptionalDate(value) {
  return (
    value === null ||
    value === "" ||
    (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
  );
}

function cleanTitle(value) {
  return typeof value === "string" ? value.trim() : "";
}

// TASKS
app.get("/api/tasks", requireSession, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, DATE_FORMAT(due_date, '%Y-%m-%d') AS dueDate,
              completed
       FROM tasks
       WHERE user_id = ?
       ORDER BY completed ASC, due_date IS NULL, due_date ASC, id DESC`,
      [req.session.userId]
    );

    res.json(rows.map((row) => ({ ...row, completed: Boolean(row.completed) })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not load tasks." });
  }
});

app.post("/api/tasks", requireSession, async (req, res) => {
  const title = cleanTitle(req.body.title);
  const dueDate = req.body.dueDate || null;

  if (!title || title.length > 120 || !validOptionalDate(dueDate)) {
    return res.status(400).json({ message: "Enter a task title up to 120 characters and a valid due date." });
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO tasks (user_id, title, due_date) VALUES (?, ?, ?)",
      [req.session.userId, title, dueDate]
    );
    res.status(201).json({ id: result.insertId, title, dueDate, completed: false });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not create task." });
  }
});

app.patch("/api/tasks/:id", requireSession, async (req, res) => {
  const id = parseUserId(req.params.id);
  if (!id || typeof req.body.completed !== "boolean") {
    return res.status(400).json({ message: "Choose a valid task and completion status." });
  }

  try {
    const [result] = await pool.query(
      "UPDATE tasks SET completed = ? WHERE id = ? AND user_id = ?",
      [req.body.completed, id, req.session.userId]
    );
    if (!result.affectedRows) return res.status(404).json({ message: "Task not found." });
    res.json({ id, completed: req.body.completed });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not update task." });
  }
});

app.delete("/api/tasks/:id", requireSession, async (req, res) => {
  const id = parseUserId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid task id." });

  try {
    const [result] = await pool.query(
      "DELETE FROM tasks WHERE id = ? AND user_id = ?",
      [id, req.session.userId]
    );
    if (!result.affectedRows) return res.status(404).json({ message: "Task not found." });
    res.json({ deleted: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not delete task." });
  }
});

// GOALS
app.get("/api/goals", requireSession, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, DATE_FORMAT(target_date, '%Y-%m-%d') AS targetDate,
              completed
       FROM goals
       WHERE user_id = ?
       ORDER BY completed ASC, target_date IS NULL, target_date ASC, id DESC`,
      [req.session.userId]
    );
    res.json(rows.map((row) => ({ ...row, completed: Boolean(row.completed) })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not load goals." });
  }
});

app.post("/api/goals", requireSession, async (req, res) => {
  const title = cleanTitle(req.body.title);
  const targetDate = req.body.targetDate || null;

  if (!title || title.length > 120 || !validOptionalDate(targetDate)) {
    return res.status(400).json({ message: "Enter a goal title up to 120 characters and a valid target date." });
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO goals (user_id, title, target_date) VALUES (?, ?, ?)",
      [req.session.userId, title, targetDate]
    );
    res.status(201).json({ id: result.insertId, title, targetDate, completed: false });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not create goal." });
  }
});

app.patch("/api/goals/:id", requireSession, async (req, res) => {
  const id = parseUserId(req.params.id);
  if (!id || typeof req.body.completed !== "boolean") {
    return res.status(400).json({ message: "Choose a valid goal and completion status." });
  }

  try {
    const [result] = await pool.query(
      "UPDATE goals SET completed = ? WHERE id = ? AND user_id = ?",
      [req.body.completed, id, req.session.userId]
    );
    if (!result.affectedRows) return res.status(404).json({ message: "Goal not found." });
    res.json({ id, completed: req.body.completed });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not update goal." });
  }
});

app.delete("/api/goals/:id", requireSession, async (req, res) => {
  const id = parseUserId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid goal id." });

  try {
    const [result] = await pool.query(
      "DELETE FROM goals WHERE id = ? AND user_id = ?",
      [id, req.session.userId]
    );
    if (!result.affectedRows) return res.status(404).json({ message: "Goal not found." });
    res.json({ deleted: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not delete goal." });
  }
});

// EVENTS
app.get("/api/events", requireSession, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, DATE_FORMAT(event_date, '%Y-%m-%d') AS eventDate,
              TIME_FORMAT(event_time, '%H:%i') AS eventTime, location
       FROM events
       WHERE user_id = ?
       ORDER BY event_date ASC, event_time IS NULL, event_time ASC, id DESC`,
      [req.session.userId]
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not load events." });
  }
});

app.post("/api/events", requireSession, async (req, res) => {
  const title = cleanTitle(req.body.title);
  const eventDate = req.body.eventDate;
  const eventTime = req.body.eventTime || null;
  const location = typeof req.body.location === "string" ? req.body.location.trim() : "";

  if (
    !title || title.length > 120 ||
    !eventDate || !validOptionalDate(eventDate) ||
    (eventTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(eventTime)) ||
    location.length > 120
  ) {
    return res.status(400).json({ message: "Enter a valid event title, date, time, and location." });
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO events (user_id, title, event_date, event_time, location) VALUES (?, ?, ?, ?, ?)",
      [req.session.userId, title, eventDate, eventTime, location || null]
    );
    res.status(201).json({ id: result.insertId, title, eventDate, eventTime, location });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not create event." });
  }
});

app.delete("/api/events/:id", requireSession, async (req, res) => {
  const id = parseUserId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid event id." });

  try {
    const [result] = await pool.query(
      "DELETE FROM events WHERE id = ? AND user_id = ?",
      [id, req.session.userId]
    );
    if (!result.affectedRows) return res.status(404).json({ message: "Event not found." });
    res.json({ deleted: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not delete event." });
  }
});


app.listen(port, () => {
  console.log(
    `Server running on port ${port}`
  );
});
