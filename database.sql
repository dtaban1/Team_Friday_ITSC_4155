CREATE DATABASE IF NOT EXISTS ontrack_db;
USE ontrack_db;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS habit_types (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  unit VARCHAR(30) NOT NULL,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS habit_entries (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  habit_type_id INT UNSIGNED NOT NULL,
  entry_date DATE NOT NULL,
  value DECIMAL(10,2) NOT NULL,
  notes VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_habit_entry_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_habit_entry_type
    FOREIGN KEY (habit_type_id) REFERENCES habit_types(id)
    ON DELETE RESTRICT,
  CONSTRAINT uq_user_habit_day
    UNIQUE (user_id, habit_type_id, entry_date),
  INDEX idx_habit_entries_user_date (user_id, entry_date)
);

INSERT INTO habit_types (name, unit, description)
VALUES
  ('water', 'cups', 'Daily water consumption'),
  ('sleep', 'hours', 'Hours slept')
ON DUPLICATE KEY UPDATE
  unit = VALUES(unit),
  description = VALUES(description);
