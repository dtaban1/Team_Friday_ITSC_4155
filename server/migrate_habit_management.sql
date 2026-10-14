-- Run ONCE for an EXISTING ontrack_db created before habit management.
-- For new installations, SOURCE database.sql instead.
USE ontrack_db;

ALTER TABLE custom_habits
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS user_hidden_habit_types (
  user_id INT NOT NULL,
  habit_type_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id, habit_type_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (habit_type_id) REFERENCES habit_types(id) ON DELETE CASCADE
);
