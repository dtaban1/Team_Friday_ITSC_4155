const express = require("express");

// Session-scoped notification API. The original main branch referenced this
// module but did not include it in the repository.
function createNotificationsRouter(pool) {
  const router = express.Router();
  router.use((req, res, next) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Please log in." });
    next();
  });

  router.get("/", async (req, res) => {
    try {
      const userId = req.session.userId;
      const [rows] = await pool.query(
        `SELECT id, notification_type, title, message, link, is_read, created_at
         FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
        [userId]
      );
      const [[count]] = await pool.query(
        "SELECT COUNT(*) AS unreadCount FROM notifications WHERE user_id = ? AND is_read = 0",
        [userId]
      );
      res.json({ notifications: rows.map(row => ({
        id: Number(row.id), notificationType: row.notification_type, title: row.title,
        message: row.message, link: row.link, isRead: Boolean(row.is_read), createdAt: row.created_at,
      })), unreadCount: Number(count.unreadCount) });
    } catch (error) {
      console.error("Could not load notifications:", error);
      res.status(500).json({ message: "Could not load notifications." });
    }
  });

  router.patch("/read-all", async (req, res) => {
    try {
      await pool.query(
        "UPDATE notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND is_read = 0",
        [req.session.userId]
      );
      res.json({ unreadCount: 0 });
    } catch (error) {
      console.error("Could not mark notifications read:", error);
      res.status(500).json({ message: "Could not mark notifications read." });
    }
  });

  router.patch("/:id/read", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: "Invalid notification ID." });
    try {
      const [result] = await pool.query(
        "UPDATE notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
        [id, req.session.userId]
      );
      if (!result.affectedRows) return res.status(404).json({ message: "Notification not found." });
      const [[count]] = await pool.query(
        "SELECT COUNT(*) AS unreadCount FROM notifications WHERE user_id = ? AND is_read = 0",
        [req.session.userId]
      );
      res.json({ unreadCount: Number(count.unreadCount) });
    } catch (error) {
      console.error("Could not mark notification read:", error);
      res.status(500).json({ message: "Could not mark notification read." });
    }
  });

  return router;
}

module.exports = { createNotificationsRouter };
