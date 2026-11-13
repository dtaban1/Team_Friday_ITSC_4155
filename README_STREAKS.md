# Habit streaks

Apply `server/migrate_habit_history.sql` if not yet applied, then apply `server/migrate_habit_streaks.sql` to an existing database. New databases use updated `database.sql`.

Run server tests with `cd server && npm test`.

Streaks are calculated from each habit's positive-value check-ins on scheduled local dates, with per-period weekday masks (Sunday=1, Monday=2, ... Saturday=64, all days=127). Today's unlogged scheduled day is pending, not overdue. Off-days do not interrupt an active streak. Historical schedule periods and old entries are retained. Switching schedule in Manage Habits is effective on the supplied local date.

`GET /api/users/:userId/habit-streaks?today=YYYY-MM-DD` returns active and archived habit streaks. `PATCH /api/users/:userId/habit-schedules/:kind/:habitId` accepts `{ "weekdaysMask": 42, "today": "YYYY-MM-DD" }`. Both routes require an authenticated matching account. Existing named streak route also returns current and longest.

For existing accounts the older history migration has incomplete pre-migration scheduling information; unknown historic schedules cannot be reconstructed accurately.

## Updated main branch integration

This version is based on `Team_Friday_ITSC_4155-main (7).zip` and preserves
its dashboard notifications, tasks, goals, events, habit targets and rewards.
The incoming main had a `require('./notifications')` import with no
`server/notifications.js` file; a notification read/mark-read router has been
supplied so the server can start. It reads existing notifications but does not
create upcoming/overdue notification records by itself.

Frontend build and full API suite require installing npm dependencies.
The seven standalone streak calculation tests passed; live MySQL API testing
was not performed.

NEW MAIN (8) NOTE: The existing server/migrate.js auto-adds weekdays_mask on startup. Profile pages, notification endpoints, and other features from main (8) remain intact. You may run migrate_habit_streaks.sql manually only if the automatic migration is not used (do not run it twice).
