-- Run once AFTER database.sql (mysql -u USER -p ontrack_db < server/migrate_habit_history.sql).
-- Periods store when a habit was scheduled; old logged values stay in the original entry tables.
CREATE TABLE IF NOT EXISTS habit_schedule_periods (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  habit_kind ENUM('standard','custom') NOT NULL,
  habit_id INT UNSIGNED NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_history_user (user_id, start_date, end_date),
  INDEX idx_history_habit (user_id, habit_kind, habit_id, end_date)
);
-- Existing active default habits have been available since signup.
INSERT INTO habit_schedule_periods (user_id, habit_kind, habit_id, start_date)
SELECT u.id, 'standard', h.id, DATE(u.created_at)
FROM users u CROSS JOIN habit_types h
LEFT JOIN user_hidden_habit_types x ON x.user_id=u.id AND x.habit_type_id=h.id
WHERE x.user_id IS NULL AND NOT EXISTS (
 SELECT 1 FROM habit_schedule_periods p WHERE p.user_id=u.id AND p.habit_kind='standard' AND p.habit_id=h.id);
-- Existing inactive standard habits: at least their logged historical days are known.
INSERT INTO habit_schedule_periods (user_id, habit_kind, habit_id, start_date, end_date)
SELECT he.user_id, 'standard', he.habit_type_id, he.entry_date, he.entry_date
FROM habit_entries he JOIN user_hidden_habit_types hidden
ON hidden.user_id=he.user_id AND hidden.habit_type_id=he.habit_type_id
WHERE NOT EXISTS (SELECT 1 FROM habit_schedule_periods p WHERE p.user_id=he.user_id AND p.habit_kind='standard' AND p.habit_id=he.habit_type_id AND he.entry_date BETWEEN p.start_date AND COALESCE(p.end_date, '9999-12-31'));
-- Existing active custom habits: earliest known entry, otherwise today. Earlier unlogged
-- schedule days cannot be accurately recovered from the previous schema.
INSERT INTO habit_schedule_periods (user_id, habit_kind, habit_id, start_date)
SELECT c.user_id, 'custom', c.id, COALESCE(MIN(e.entry_date), CURDATE())
FROM custom_habits c LEFT JOIN custom_habit_entries e ON e.custom_habit_id=c.id
WHERE c.is_active=1 AND NOT EXISTS (
 SELECT 1 FROM habit_schedule_periods p WHERE p.user_id=c.user_id AND p.habit_kind='custom' AND p.habit_id=c.id)
GROUP BY c.user_id,c.id;
-- Previously removed custom habits: preserve the logged days without scheduling future days.
INSERT INTO habit_schedule_periods (user_id, habit_kind, habit_id, start_date, end_date)
SELECT c.user_id, 'custom', c.id, e.entry_date, e.entry_date
FROM custom_habits c JOIN custom_habit_entries e ON e.custom_habit_id=c.id
WHERE c.is_active=0 AND NOT EXISTS (
 SELECT 1 FROM habit_schedule_periods p WHERE p.user_id=c.user_id AND p.habit_kind='custom' AND p.habit_id=c.id AND e.entry_date BETWEEN p.start_date AND COALESCE(p.end_date, '9999-12-31'));
