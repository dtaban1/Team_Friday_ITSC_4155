-- Run once after migrate_habit_history.sql on existing installations.
-- Bit 0=Sunday, bit 1=Monday, ... bit 6=Saturday. 127 means every day.
ALTER TABLE habit_schedule_periods ADD COLUMN weekdays_mask TINYINT UNSIGNED NOT NULL DEFAULT 127;
