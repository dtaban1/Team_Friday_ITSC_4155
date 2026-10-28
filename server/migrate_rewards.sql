-- Select your configured OnTrack database before running this migration.
-- Additive and safe to run again; no existing app data is changed.
CREATE TABLE IF NOT EXISTS rewards (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  target_type ENUM('task', 'goal', 'event', 'habit', 'daily', 'seven_day') NOT NULL,
  target_id BIGINT UNSIGNED NULL,
  habit_kind ENUM('standard', 'custom') NULL,
  milestone_days SMALLINT UNSIGNED NULL,
  target_label VARCHAR(120) NOT NULL,
  time_zone VARCHAR(64) NOT NULL,
  image_data MEDIUMBLOB NULL,
  image_mime VARCHAR(20) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_rewards_user (user_id)
);

CREATE TABLE IF NOT EXISTS reward_claims (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reward_id BIGINT UNSIGNED NOT NULL,
  period_key VARCHAR(20) NOT NULL,
  reward_title VARCHAR(120) NOT NULL,
  target_label VARCHAR(120) NOT NULL,
  note VARCHAR(500) NOT NULL DEFAULT '',
  claimed_at DATETIME NOT NULL,
  FOREIGN KEY (reward_id) REFERENCES rewards(id) ON DELETE CASCADE,
  UNIQUE KEY uq_reward_claim_period (reward_id, period_key)
);
