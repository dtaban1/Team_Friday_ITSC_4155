import express from "express";
import cors from "cors";
import "dotenv/config";
import pool from "./db.js";

const app = express();
const port = Number(process.env.API_PORT || 3001);

app.use(cors());
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "Database connection failed." });
  }
});

app.get("/api/habits", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, name, unit, description FROM habit_types ORDER BY id"
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load habit types." });
  }
});

app.get("/api/users/:userId/habits", async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "Invalid user id." });
  }

  try {
    const [rows] = await pool.query(
      `SELECT
         he.id,
         he.external_user_id AS userId,
         ht.name AS habit,
         ht.unit,
         he.entry_date AS entryDate,
         CAST(he.value AS DOUBLE) AS value,
         he.notes
       FROM habit_entries he
       JOIN habit_types ht ON ht.id = he.habit_type_id
       WHERE he.external_user_id = ?
       ORDER BY he.entry_date DESC, ht.name ASC`,
      [userId]
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load habit entries." });
  }
});

app.put("/api/users/:userId/habits/:habitName", async (req, res) => {
  const userId = Number(req.params.userId);
  const habitName = String(req.params.habitName).toLowerCase();
  const { entryDate, value, notes = null } = req.body;
  const numericValue = Number(value);

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "Invalid user id." });
  }
  if (!entryDate || Number.isNaN(numericValue) || numericValue < 0) {
    return res.status(400).json({ error: "entryDate and a non-negative value are required." });
  }

  try {
    const [habitRows] = await pool.query(
      "SELECT id, name, unit FROM habit_types WHERE name = ? LIMIT 1",
      [habitName]
    );

    if (habitRows.length === 0) {
      return res.status(404).json({ error: "Unknown habit type." });
    }

    const habit = habitRows[0];

    await pool.query(
      `INSERT INTO habit_entries
         (external_user_id, habit_type_id, entry_date, value, notes)
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
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not save habit entry." });
  }
});

app.delete("/api/users/:userId/habits/:habitName/:entryDate", async (req, res) => {
  const userId = Number(req.params.userId);
  const habitName = String(req.params.habitName).toLowerCase();
  const { entryDate } = req.params;

  try {
    const [result] = await pool.query(
      `DELETE he FROM habit_entries he
       JOIN habit_types ht ON ht.id = he.habit_type_id
       WHERE he.external_user_id = ? AND ht.name = ? AND he.entry_date = ?`,
      [userId, habitName, entryDate]
    );
    res.json({ deleted: result.affectedRows > 0 });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not delete habit entry." });
  }
});

app.listen(port, () => {
  console.log(`OnTrack habit API running on http://localhost:${port}`);
});
