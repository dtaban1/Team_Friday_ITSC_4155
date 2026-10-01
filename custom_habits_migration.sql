USE ontrack_db;

-- Custom habits belong to one account; existing water/sleep tables stay unchanged.
CREATE TABLE IF NOT EXISTS custom_habits (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(50) NOT NULL,
  unit VARCHAR(30) NOT NULL,
  UNIQUE (user_id, name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS custom_habit_entries (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  custom_habit_id INT UNSIGNED NOT NULL,
  entry_date DATE NOT NULL,
  value DECIMAL(10,2) NOT NULL,
  UNIQUE (custom_habit_id, entry_date),
  FOREIGN KEY (custom_habit_id) REFERENCES custom_habits(id) ON DELETE CASCADE
);
