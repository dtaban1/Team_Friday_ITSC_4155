const express = require("express");
const { localToday, loadTargetRules, lockHabitAccount, recordTargetChange } = require("./habitCompletion");

const MAX_TARGET = 99999999.99;

function validTarget(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0.01 &&
    value <= MAX_TARGET && /^\d+(\.\d{1,2})?$/.test(String(value));
}

function createHabitTargetsRouter(db, { clientUrl = process.env.CLIENT_URL || "http://localhost:5173", now = () => new Date() } = {}) {
  const router = express.Router();
  router.use((req, res, next) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Please log in." });
    res.set("Cache-Control", "private, no-store");
    if (req.method !== "GET" && req.method !== "HEAD" && req.get("Origin") !== clientUrl) {
      return res.status(403).json({ message: "Please use the OnTrack website to change targets." });
    }
    next();
  });

  router.get("/", async (req, res) => {
    try {
      const [rows] = await db.query(`SELECT
          IF(standard_habit_id IS NULL, 'custom', 'standard') AS kind,
          COALESCE(standard_habit_id, custom_habit_id) AS habitId,
          CAST(target_value AS DOUBLE) AS target
        FROM habit_targets WHERE user_id = ? ORDER BY id`, [req.session.userId]);
      res.json(rows);
    } catch (error) {
      console.error("Could not load habit targets:", error.code || error.message);
      res.status(500).json({ message: "Could not load targets. Check the habit-targets database migration." });
    }
  });

  router.get("/rules", async (req, res) => {
    try { res.json(await loadTargetRules(db, req.session.userId)); }
    catch (error) { console.error(error); res.status(500).json({ message: "Could not load completion rules. Run the connected-progress migration." }); }
  });

  router.use("/:kind/:id", (req, res, next) => {
    const { kind, id } = req.params;
    if (!["standard", "custom"].includes(kind) || !/^[1-9]\d*$/.test(id) ||
        !Number.isSafeInteger(Number(id)) || Number(id) > 4294967295) {
      return res.status(400).json({ message: "Choose a valid habit." });
    }
    req.targetHabit = { kind, id: Number(id) };
    next();
  });

  async function findOwnedHabit(connection, userId, { kind, id }) {
    // Table/column choices are fixed server strings, never supplied SQL fragments.
    const [rows] = kind === "standard"
      ? await connection.query("SELECT id FROM habit_types WHERE id = ? FOR UPDATE", [id])
      : await connection.query("SELECT id FROM custom_habits WHERE id = ? AND user_id = ? FOR UPDATE", [id, userId]);
    return rows.length > 0;
  }

  router.put("/:kind/:id", async (req, res) => {
    const target = req.body?.target;
    if (!validTarget(target)) {
      return res.status(400).json({ message: "Enter a target from 0.01 to 99999999.99 with at most two decimal places." });
    }
    const { kind, id } = req.targetHabit;
    const userId = req.session.userId;
    let today;
    try { today = localToday(req.body?.timeZone || "UTC", now()); }
    catch { return res.status(400).json({ message: "Choose a valid time zone." }); }
    let connection;
    try {
      connection = await db.getConnection();
      await connection.beginTransaction();
      await lockHabitAccount(connection, userId);
      if (!(await findOwnedHabit(connection, userId, req.targetHabit))) {
        await connection.rollback();
        return res.status(404).json({ message: "Habit not found." });
      }
      await connection.query(`INSERT INTO habit_targets
          (user_id, standard_habit_id, custom_habit_id, target_value)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE target_value = VALUES(target_value)`,
      [userId, kind === "standard" ? id : null, kind === "custom" ? id : null, target]);
      const pointResult = await recordTargetChange(connection, { userId, kind, habitId: id, target, today });
      await connection.commit();
      res.json({ kind, habitId: id, target, effectiveDate: today, ...pointResult });
    } catch (error) {
      if (connection) await connection.rollback();
      console.error("Could not save habit target:", error.code || error.message);
      res.status(500).json({ message: "Could not save this target. Please try again." });
    } finally { if (connection) connection.release(); }
  });

  router.delete("/:kind/:id", async (req, res) => {
    const { kind, id } = req.targetHabit;
    const userId = req.session.userId;
    let today;
    try { today = localToday(req.body?.timeZone || "UTC", now()); }
    catch { return res.status(400).json({ message: "Choose a valid time zone." }); }
    let connection;
    try {
      connection = await db.getConnection();
      await connection.beginTransaction();
      await lockHabitAccount(connection, userId);
      if (!(await findOwnedHabit(connection, userId, req.targetHabit))) {
        await connection.rollback();
        return res.status(404).json({ message: "Habit not found." });
      }
      const column = kind === "standard" ? "standard_habit_id" : "custom_habit_id";
      await connection.query(`DELETE FROM habit_targets WHERE user_id = ? AND ${column} = ?`, [userId, id]);
      const pointResult = await recordTargetChange(connection, { userId, kind, habitId: id, target: null, today });
      await connection.commit();
      res.json({ kind, habitId: id, target: null, effectiveDate: today, ...pointResult });
    } catch (error) {
      if (connection) await connection.rollback();
      console.error("Could not remove habit target:", error.code || error.message);
      res.status(500).json({ message: "Could not remove this target. Please try again." });
    } finally { if (connection) connection.release(); }
  });
  return router;
}

module.exports = { createHabitTargetsRouter, validTarget };
