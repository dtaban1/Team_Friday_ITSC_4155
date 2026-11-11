-- Run in the same database as server/.env (normally ontrack_db).
-- Additive/repeatable. No habit entries, claims, points or achievements are deleted.
-- Also installs the point tables required by the already-merged team dashboard.
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

-- Milestone achievements are server-owned and earned once per user.
CREATE TABLE IF NOT EXISTS achievements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(255) NOT NULL,
  badge VARCHAR(8) NOT NULL,
  milestone_type ENUM('total_completions', 'task_completions', 'habit_completions', 'points') NOT NULL,
  threshold INT UNSIGNED NOT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id INT NOT NULL,
  achievement_id INT UNSIGNED NOT NULL,
  trigger_completion_id BIGINT UNSIGNED NULL,
  earned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, achievement_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE,
  FOREIGN KEY (trigger_completion_id) REFERENCES completions(id) ON DELETE SET NULL,
  INDEX idx_user_achievements_earned (user_id, earned_at)
);

INSERT INTO achievements
  (code, name, description, badge, milestone_type, threshold, sort_order)
VALUES
  ('first_step', 'First Step', 'Complete your first eligible OnTrack activity.', '1', 'total_completions', 1, 10),
  ('task_tackler', 'Task Tackler', 'Complete 5 tasks.', 'T5', 'task_completions', 5, 20),
  ('habit_builder', 'Habit Builder', 'Complete 5 habit check-ins.', 'H5', 'habit_completions', 5, 30),
  ('momentum', 'Momentum', 'Complete 10 eligible activities.', '10', 'total_completions', 10, 40),
  ('century_club', 'Century Club', 'Reach a 100-point balance.', '100', 'points', 100, 50),
  ('ontrack_champion', 'OnTrack Champion', 'Complete 25 eligible activities.', '25', 'total_completions', 25, 60)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  badge = VALUES(badge),
  milestone_type = VALUES(milestone_type),
  threshold = VALUES(threshold),
  sort_order = VALUES(sort_order);

CREATE TABLE IF NOT EXISTS habit_target_rules (
  user_id INT NOT NULL,
  habit_kind ENUM('standard', 'custom') NOT NULL,
  habit_id INT UNSIGNED NOT NULL,
  effective_date DATE NOT NULL,
  target_value DECIMAL(10,2) NULL,
  PRIMARY KEY (user_id, habit_kind, habit_id, effective_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (target_value IS NULL OR target_value > 0)
);

-- Preserve older completion results. Existing targets start affecting completion
-- today; older dates remain under the previous positive-entry rule.
-- NOT EXISTS prevents repeat migrations from resurrecting removed targets or
-- overwriting the original transition date.
INSERT INTO habit_target_rules (user_id, habit_kind, habit_id, effective_date, target_value)
SELECT t.user_id, IF(t.standard_habit_id IS NULL, 'custom', 'standard'),
       COALESCE(t.standard_habit_id, t.custom_habit_id), CURDATE(), t.target_value
FROM habit_targets t
WHERE NOT EXISTS (SELECT 1 FROM habit_target_rules r WHERE r.user_id = t.user_id
  AND r.habit_kind = IF(t.standard_habit_id IS NULL, 'custom', 'standard')
  AND r.habit_id = COALESCE(t.standard_habit_id, t.custom_habit_id));
