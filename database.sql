CREATE DATABASE IF NOT EXISTS ontrack_habits;
USE ontrack_habits;

--Allows for easy additions to the tracked habits.
CREATE TABLE IF NOT EXISTS habit_types (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  unit VARCHAR(30) NOT NULL,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- External_user_id points to the user in the future users database.
-- Need to add the forign key when abvailible.
CREATE TABLE IF NOT EXISTS habit_entries (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  external_user_id BIGINT UNSIGNED NOT NULL,
  habit_type_id INT UNSIGNED NOT NULL,
  entry_date DATE NOT NULL,
  value DECIMAL(10,2) NOT NULL,
  notes VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_habit_entry_type
    FOREIGN KEY (habit_type_id) REFERENCES habit_types(id)
    ON DELETE RESTRICT,
  CONSTRAINT uq_user_habit_day
    UNIQUE (external_user_id, habit_type_id, entry_date),
  INDEX idx_habit_entries_user_date (external_user_id, entry_date)
);

-- Add aditional habits here.
INSERT INTO habit_types (name, unit, description)
VALUES
  ('water', 'cups', 'Daily water consumption'),
  ('sleep', 'hours', 'Hours slept')
ON DUPLICATE KEY UPDATE
  unit = VALUES(unit),
  description = VALUES(description);