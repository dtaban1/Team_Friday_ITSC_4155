const express = require("express");
const { RewardError, positiveId, validateReward, decodeImage, findTarget, rewardStatus } = require("./rewardRules");

const REWARD_COLUMNS = `id, title, description, target_type AS targetType, target_id AS targetId,
  habit_kind AS habitKind, milestone_days AS milestoneDays, target_label AS targetLabel,
  time_zone AS timeZone, (image_data IS NOT NULL) AS hasImage`;

async function loadContext(db, userId) {
  const [tasks] = await db.query("SELECT id, title, completed FROM tasks WHERE user_id = ?", [userId]);
  const [goals] = await db.query("SELECT id, title, completed FROM goals WHERE user_id = ?", [userId]);
  const [events] = await db.query(`SELECT id, title, DATE_FORMAT(event_date, '%Y-%m-%d') AS eventDate,
    TIME_FORMAT(event_time, '%H:%i') AS eventTime FROM events WHERE user_id = ?`, [userId]);
  const [habits] = await db.query(`SELECT ht.id, ht.name AS title, 'standard' AS kind FROM habit_types ht
    LEFT JOIN user_hidden_habit_types h ON h.habit_type_id = ht.id AND h.user_id = ?
    WHERE h.user_id IS NULL
    UNION ALL SELECT id, name AS title, 'custom' AS kind FROM custom_habits WHERE user_id = ? AND is_active = 1`, [userId, userId]);
  const [entries] = await db.query(`SELECT he.habit_type_id AS habitId, 'standard' AS kind,
    DATE_FORMAT(he.entry_date, '%Y-%m-%d') AS entryDate FROM habit_entries he
    LEFT JOIN user_hidden_habit_types h ON h.habit_type_id = he.habit_type_id AND h.user_id = he.user_id
    WHERE he.user_id = ? AND he.value > 0 AND h.user_id IS NULL
    UNION ALL SELECT ce.custom_habit_id AS habitId, 'custom' AS kind,
    DATE_FORMAT(ce.entry_date, '%Y-%m-%d') AS entryDate
    FROM custom_habit_entries ce JOIN custom_habits ch ON ch.id = ce.custom_habit_id
    WHERE ch.user_id = ? AND ch.is_active = 1 AND ce.value > 0`, [userId, userId]);
  return { tasks: tasks.map((item) => ({ ...item, completed: Boolean(item.completed) })),
    goals: goals.map((item) => ({ ...item, completed: Boolean(item.completed) })), events, habits, entries };
}

async function loadClaims(db, userId) {
  const [claims] = await db.query(`SELECT c.id, c.reward_id AS rewardId, c.period_key AS periodKey,
    c.reward_title AS rewardTitle, c.target_label AS targetLabel, c.note,
    DATE_FORMAT(c.claimed_at, '%Y-%m-%dT%H:%i:%sZ') AS claimedAt
    FROM reward_claims c JOIN rewards r ON r.id = c.reward_id
    WHERE r.user_id = ? ORDER BY c.claimed_at DESC, c.id DESC`, [userId]);
  return claims;
}

function createRewardsRouter(pool, { now = () => new Date() } = {}) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    if (!req.session?.userId) return res.status(401).json({ message: "Please log in." });
    // Cross-origin cookies require a separate CSRF check; CORS alone does not block writes.
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.get("Origin");
      const allowed = process.env.CLIENT_URL || "http://localhost:5173";
      if (!origin || origin !== allowed) return res.status(403).json({ message: "Please make this request from OnTrack." });
    }
    next();
  });

  router.get("/", async (req, res) => {
    const userId = req.session.userId;
    const [rows] = await pool.query(`SELECT ${REWARD_COLUMNS} FROM rewards WHERE user_id = ? ORDER BY id DESC`, [userId]);
    const context = await loadContext(pool, userId);
    const claims = await loadClaims(pool, userId);
    const timestamp = now();
    res.json({ rewards: rows.map((reward) => ({ ...reward, hasImage: Boolean(reward.hasImage),
      status: rewardStatus(reward, context, claims, timestamp) })),
      targets: { tasks: context.tasks, goals: context.goals, events: context.events, habits: context.habits },
      history: claims.slice(0, 50) });
  });

  router.post("/", async (req, res) => {
    const reward = validateReward(req.body);
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      // Serialize creation per account so the photo/storage limit cannot be raced.
      await connection.query("SELECT id FROM users WHERE id = ? FOR UPDATE", [req.session.userId]);
      const [[{ count }]] = await connection.query("SELECT COUNT(*) AS count FROM rewards WHERE user_id = ?", [req.session.userId]);
      if (count >= 100) throw new RewardError("You can keep up to 100 rewards. Delete an old reward first.", 409);
      const context = await loadContext(connection, req.session.userId);
      const target = findTarget(reward, context);
      if (reward.targetId && !target) throw new RewardError("This item is not available in your account.", 404);
      const label = target?.title || (reward.targetType === "daily" ? "Daily habit activity" : "Seven consecutive habit days");
      const [result] = await connection.query(`INSERT INTO rewards
        (user_id, title, description, target_type, target_id, habit_kind, milestone_days, target_label, time_zone, image_data, image_mime)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [req.session.userId, reward.title, reward.description,
        reward.targetType, reward.targetId, reward.habitKind, reward.milestoneDays, label, reward.timeZone,
        reward.image.bytes, reward.image.mime]);
      await connection.commit();
      res.status(201).json({ id: result.insertId, message: "Your personal reward has been added." });
    } catch (error) {
      if (connection) await connection.rollback();
      throw error;
    } finally { connection?.release(); }
  });

  router.post("/:id/claim", async (req, res) => {
    const id = positiveId(req.params.id);
    const note = req.body?.note == null ? "" : req.body.note;
    if (!id || typeof note !== "string" || note.length > 500) throw new RewardError("Choose a reward and a note up to 500 characters.");
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      const [[reward]] = await connection.query(`SELECT ${REWARD_COLUMNS} FROM rewards WHERE id = ? AND user_id = ? FOR UPDATE`, [id, req.session.userId]);
      if (!reward) throw new RewardError("Reward not found.", 404);
      const context = await loadContext(connection, req.session.userId);
      const claims = await loadClaims(connection, req.session.userId);
      const timestamp = now();
      const status = rewardStatus(reward, context, claims, timestamp);
      if (!status.eligible) throw new RewardError(status.reason, 409);
      // The unique period key is a second guard against double-clicks/concurrent requests.
      await connection.query(`INSERT INTO reward_claims (reward_id, period_key, reward_title, target_label, note, claimed_at)
        VALUES (?, ?, ?, ?, ?, ?)`, [id, status.periodKey, reward.title, reward.targetLabel, note.trim(),
        timestamp.toISOString().slice(0, 19).replace("T", " ")]);
      await connection.commit();
      res.status(201).json({ message: `“${reward.title}” claimed! Your reward is something you give yourself.` });
    } catch (error) {
      if (connection) await connection.rollback();
      if (error.code === "ER_DUP_ENTRY") throw new RewardError("This reward has already been claimed for this period.", 409);
      throw error;
    } finally { connection?.release(); }
  });

  router.get("/:id/image", async (req, res) => {
    const id = positiveId(req.params.id);
    if (!id) throw new RewardError("Invalid reward.");
    const [[row]] = await pool.query("SELECT image_data, image_mime FROM rewards WHERE id = ? AND user_id = ?", [id, req.session.userId]);
    if (!row?.image_data) throw new RewardError("Photo not found.", 404);
    res.set("X-Content-Type-Options", "nosniff");
    res.type(row.image_mime).send(row.image_data);
  });

  router.put("/:id/image", async (req, res) => {
    const id = positiveId(req.params.id);
    if (!id) throw new RewardError("Invalid reward.");
    const image = decodeImage(req.body?.image);
    const [result] = await pool.query("UPDATE rewards SET image_data = ?, image_mime = ? WHERE id = ? AND user_id = ?",
      [image.bytes, image.mime, id, req.session.userId]);
    if (!result.affectedRows) throw new RewardError("Reward not found.", 404);
    res.json({ message: image.bytes ? "Photo saved." : "Photo removed." });
  });

  router.delete("/:id", async (req, res) => {
    const id = positiveId(req.params.id);
    if (!id) throw new RewardError("Invalid reward.");
    const [result] = await pool.query("DELETE FROM rewards WHERE id = ? AND user_id = ?", [id, req.session.userId]);
    if (!result.affectedRows) throw new RewardError("Reward not found.", 404);
    res.json({ message: "Reward and its claim history deleted." });
  });

  router.use((error, _req, res, _next) => {
    if (error instanceof RewardError) return res.status(error.status).json({ message: error.message });
    console.error("Rewards request failed:", error);
    res.status(500).json({ message: "Could not load or save rewards. Make sure the rewards database migration has been applied." });
  });
  return router;
}

module.exports = { createRewardsRouter, loadContext, loadClaims };
