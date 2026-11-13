-- Select the database configured in server/.env before running this script.
-- Additive and repeatable: no saved habit values are changed or removed.
CREATE TABLE IF NOT EXISTS habit_targets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  standard_habit_id INT UNSIGNED NULL,
  custom_habit_id INT UNSIGNED NULL,
  target_value DECIMAL(10,2) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (standard_habit_id) REFERENCES habit_types(id) ON DELETE CASCADE,
  FOREIGN KEY (custom_habit_id) REFERENCES custom_habits(id) ON DELETE CASCADE,
  UNIQUE KEY uq_standard_habit_target (user_id, standard_habit_id),
  UNIQUE KEY uq_custom_habit_target (user_id, custom_habit_id),
  CHECK ((standard_habit_id IS NULL) <> (custom_habit_id IS NULL)),
  CHECK (target_value > 0)
);
