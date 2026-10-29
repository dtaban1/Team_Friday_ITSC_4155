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

-- Custom habits belong to one account.
CREATE TABLE IF NOT EXISTS custom_habits (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(50) NOT NULL,
  unit VARCHAR(30) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (user_id, name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Hiding a built-in habit is user-specific and never deletes its history.
CREATE TABLE IF NOT EXISTS user_hidden_habit_types (
  user_id INT NOT NULL,
  habit_type_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id, habit_type_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (habit_type_id) REFERENCES habit_types(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS custom_habit_entries (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  custom_habit_id INT UNSIGNED NOT NULL,
  entry_date DATE NOT NULL,
  value DECIMAL(10,2) NOT NULL,
  UNIQUE (custom_habit_id, entry_date),
  FOREIGN KEY (custom_habit_id) REFERENCES custom_habits(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(120) NOT NULL,
  due_date DATE NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_tasks_user_due_date (user_id, due_date)
);

CREATE TABLE IF NOT EXISTS goals (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(120) NOT NULL,
  target_date DATE NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_goals_user_target_date (user_id, target_date)
);

CREATE TABLE IF NOT EXISTS events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(120) NOT NULL,
  event_date DATE NOT NULL,
  event_time TIME NULL,
  location VARCHAR(120) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_events_user_date (user_id, event_date, event_time)
);

-- Gamification: each eligible completion creates one server-side completion record.
CREATE TABLE IF NOT EXISTS completions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  activity_type ENUM('task', 'habit', 'custom_habit') NOT NULL,
  activity_id BIGINT UNSIGNED NOT NULL,
  completion_date DATE NOT NULL,
  completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reversed_at TIMESTAMP NULL DEFAULT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_completions_user_activity (user_id, activity_type, activity_id),
  INDEX idx_completions_user_date (user_id, completion_date)
);

CREATE TABLE IF NOT EXISTS point_transactions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  completion_id BIGINT UNSIGNED NOT NULL,
  transaction_type ENUM('award', 'reversal') NOT NULL,
  points INT NOT NULL,
  reason VARCHAR(120) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (completion_id) REFERENCES completions(id) ON DELETE RESTRICT,
  UNIQUE (completion_id, transaction_type),
  INDEX idx_point_transactions_user (user_id, id)
);
