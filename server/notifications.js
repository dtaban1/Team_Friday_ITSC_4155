const express = require('express');

// Notifications are generated when the authenticated dashboard requests them.
// No background job is required. Refreshing does not create duplicates.
const UPCOMING_DAYS = 1; // Notify on the due date and the day before.
const HABIT_REMINDER_HOUR = 18; // 6 PM in the browser's supplied IANA time zone.

function localClock(now, timeZone) {
  if (typeof timeZone !== 'string' || timeZone.length > 100) throw new Error('Invalid time zone');
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(now);
    const get = key => parts.find(p => p.type === key).value;
    return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
  } catch {
    throw new Error('Invalid time zone');
  }
}
function addDays(date, days) {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}
function weekdayBit(date) { return 1 << new Date(`${date}T00:00:00Z`).getUTCDay(); }
function scheduledToday(periods, date) {
  return periods.some(p => p.startDate <= date && (!p.endDate || p.endDate >= date)
    && (Number(p.weekdaysMask) & weekdayBit(date)) !== 0);
}

async function generateNotifications(pool, userId, now, timeZone) {
  const { date, hour } = localClock(now, timeZone);
  const tomorrow = addDays(date, UPCOMING_DAYS);

  const [tasks] = await pool.query(`
    SELECT id, title, DATE_FORMAT(due_date, '%Y-%m-%d') AS dueDate
    FROM tasks WHERE user_id = ? AND completed = 0 AND due_date IS NOT NULL`, [userId]);
  for (const task of tasks) {
    const overdue = task.dueDate < date;
    if (!overdue && task.dueDate > tomorrow) continue;
    const type = overdue ? 'task_overdue' : 'task_upcoming';
    const message = overdue ? `This task was due on ${task.dueDate}.`
      : task.dueDate === date ? 'This task is due today.' : 'This task is due tomorrow.';
    await pool.query(`INSERT IGNORE INTO notifications
      (user_id, notification_type, source_type, source_id, trigger_key, title, message, link)
      VALUES (?, ?, 'task', ?, ?, ?, ?, ?)`,
      [userId, type, task.id, task.dueDate,
        overdue ? `Overdue: ${task.title}` : `Upcoming: ${task.title}`, message, '/dashboard#tasks']);
  }
  // Remove reminders that are no longer relevant: completed/deleted tasks or changed dates.
  await pool.query(`DELETE n FROM notifications n
    LEFT JOIN tasks t ON t.id = n.source_id AND t.user_id = n.user_id
    WHERE n.user_id = ? AND n.source_type = 'task'
      AND (t.id IS NULL OR t.completed = 1 OR t.due_date IS NULL
        OR n.trigger_key <> DATE_FORMAT(t.due_date, '%Y-%m-%d')
        OR (n.notification_type = 'task_upcoming' AND t.due_date < ?))`, [userId, date]);

  if (hour >= HABIT_REMINDER_HOUR) {
    const [periods] = await pool.query(`SELECT habit_kind AS kind, habit_id AS habitId,
      DATE_FORMAT(start_date, '%Y-%m-%d') AS startDate,
      DATE_FORMAT(end_date, '%Y-%m-%d') AS endDate, weekdays_mask AS weekdaysMask
      FROM habit_schedule_periods WHERE user_id = ? AND start_date <= ?
        AND (end_date IS NULL OR end_date >= ?)`, [userId, date, date]);
    const scheduled = new Map();
    for (const p of periods) {
      if (scheduledToday([p], date)) scheduled.set(`${p.kind}:${p.habitId}`, p);
    }
    const [standard] = await pool.query(`SELECT ht.id, ht.name FROM habit_types ht
      LEFT JOIN user_hidden_habit_types h ON h.user_id = ? AND h.habit_type_id = ht.id
      WHERE h.user_id IS NULL`, [userId]);
    const [custom] = await pool.query(`SELECT id, name FROM custom_habits
      WHERE user_id = ? AND is_active = 1`, [userId]);
    const [completedStandard] = await pool.query(`SELECT habit_type_id AS id FROM habit_entries
      WHERE user_id = ? AND entry_date = ? AND value > 0`, [userId, date]);
    const [completedCustom] = await pool.query(`SELECT e.custom_habit_id AS id FROM custom_habit_entries e
      JOIN custom_habits h ON h.id = e.custom_habit_id
      WHERE h.user_id = ? AND e.entry_date = ? AND e.value > 0`, [userId, date]);
    const completed = new Set([
      ...completedStandard.map(r => `standard:${r.id}`),
      ...completedCustom.map(r => `custom:${r.id}`),
    ]);
    for (const [kind, rows, sourceType] of [
      ['standard', standard, 'habit'], ['custom', custom, 'custom_habit'],
    ]) {
      for (const habit of rows) {
        const key = `${kind}:${habit.id}`;
        if (!scheduled.has(key) || completed.has(key)) continue;
        await pool.query(`INSERT IGNORE INTO notifications
          (user_id, notification_type, source_type, source_id, trigger_key, title, message, link)
          VALUES (?, 'habit_unfinished', ?, ?, ?, ?, ?, ?)`,
          [userId, sourceType, habit.id, date, `Habit reminder: ${habit.name}`,
            `You haven't completed ${habit.name} today.`, '/dashboard#habits']);
      }
    }
  }
  // A late/reversed check-in or schedule change should be reflected on next refresh.
  await pool.query(`DELETE n FROM notifications n
    LEFT JOIN habit_entries e ON n.source_type = 'habit'
      AND e.user_id = n.user_id AND e.habit_type_id = n.source_id
      AND DATE_FORMAT(e.entry_date, '%Y-%m-%d') = n.trigger_key AND e.value > 0
    LEFT JOIN custom_habit_entries ce ON n.source_type = 'custom_habit'
      AND ce.custom_habit_id = n.source_id
      AND DATE_FORMAT(ce.entry_date, '%Y-%m-%d') = n.trigger_key AND ce.value > 0
    WHERE n.user_id = ? AND n.notification_type = 'habit_unfinished'
      AND (e.id IS NOT NULL OR ce.id IS NOT NULL)`, [userId]);
}

function createNotificationsRouter(pool) {
  const router = express.Router();
  router.use((req, res, next) => {
    if (!req.session?.userId) return res.status(401).json({ message: 'Please log in.' });
    next();
  });
  router.get('/', async (req, res) => {
    const timeZone = req.query.timeZone || 'UTC';
    try { localClock(new Date(), timeZone); }
    catch { return res.status(400).json({ message: 'Invalid time zone.' }); }
    try {
      const userId = req.session.userId;
      await generateNotifications(pool, userId, new Date(), timeZone);
      const [rows] = await pool.query(`SELECT id, notification_type, title, message, link,
        is_read, created_at FROM notifications WHERE user_id = ?
        ORDER BY created_at DESC, id DESC LIMIT 100`, [userId]);
      const [[count]] = await pool.query(`SELECT COUNT(*) AS unreadCount FROM notifications
        WHERE user_id = ? AND is_read = 0`, [userId]);
      res.json({ notifications: rows.map(r => ({
        id: Number(r.id), notificationType: r.notification_type,
        title: r.title, message: r.message, link: r.link,
        isRead: Boolean(r.is_read), createdAt: r.created_at,
      })), unreadCount: Number(count.unreadCount) });
    } catch (error) {
      console.error('Could not load notifications:', error);
      res.status(500).json({ message: 'Could not load notifications.' });
    }
  });
  router.patch('/read-all', async (req, res) => {
    try {
      await pool.query(`UPDATE notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND is_read = 0`, [req.session.userId]);
      res.json({ unreadCount: 0 });
    } catch (error) {
      console.error('Could not mark notifications read:', error);
      res.status(500).json({ message: 'Could not mark notifications read.' });
    }
  });
  router.patch('/:id/read', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid notification ID.' });
    try {
      const [result] = await pool.query(`UPDATE notifications SET is_read = 1,
        read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`, [id, req.session.userId]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Notification not found.' });
      const [[count]] = await pool.query(`SELECT COUNT(*) AS unreadCount FROM notifications
        WHERE user_id = ? AND is_read = 0`, [req.session.userId]);
      res.json({ unreadCount: Number(count.unreadCount) });
    } catch (error) {
      console.error('Could not mark notification read:', error);
      res.status(500).json({ message: 'Could not mark notification read.' });
    }
  });
  return router;
}
module.exports = { createNotificationsRouter, generateNotifications, localClock, scheduledToday };
