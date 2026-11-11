# Custom Habit Targets — Issue #52

After logging in, open **Dashboard → Manage habits**. Under any current built-in
or custom habit, choose **Set target**, enter a positive daily quantity, and save.
For example, Water → 8 cups or Reading → 30 minutes. Use **Edit target** to change
it, **Cancel** to discard an edit, or **Remove target** to stop the comparison.
Targets persist in MySQL and are private to the logged-in account.

The dashboard's Daily targets panel compares **saved** values for the selected
date against the current target. Save habits before expecting the bar to change.
Four of eight cups is 50%; eight or more reaches the target. The bar stops at
100%, while the actual logged quantity remains visible. Missing/zero logs show 0%.
Habit and target values are never added to another account's progress.

## Safe database setup

For a new installation, `database.sql` includes `habit_targets`. For an existing
installation, back up as usual, then open `server/migrate_habit_targets.sql` in
MySQL Workbench, select **the same database configured in `server/.env`** and
execute the script. The normal team database is `ontrack_db`.

In the MySQL command-line client, from the project root:

```sql
USE ontrack_db;
SOURCE server/migrate_habit_targets.sql;
```

The migration is additive and safe to repeat; no existing table/column is altered
or deleted. It uses foreign keys matching the existing schema and CHECK
constraints (enforced on MySQL 8.0.16+). The API also validates every write.

Restart the API and frontend as usual. On Windows PowerShell, from the project
root, run `npm.cmd ci` and `npm.cmd ci --prefix server`, then
`npm.cmd run dev --prefix server`. In a second terminal run `npm.cmd run dev`.
Do not upload `.env` or share database passwords.

## Behavior and scope

- A target is optional, personal, daily, and uses the habit's current unit.
- Accept numeric quantities from 0.01 through 99999999.99, with at most two decimal
  places. Empty, zero, negative, nonnumeric, nonfinite, overprecise and larger
  values are rejected on the server (and normal form constraints guide users).
- The same built-in habit may have different targets for different accounts.
- Editing/removing a target never changes or deletes entries. Historical dates
  are compared against **the current target**; this feature does not store a
  timeline of previous target settings. The calendar retains its existing
  positive-entry completion rule, rather than rewriting past completion results.
- Hiding/restoring habits preserves their target. Current progress only includes
  active habits. Editing a custom habit's unit does not convert numeric values
  or targets automatically; review the target when changing units.
- Existing logged-day summaries, streaks, points, achievements and Rewards keep
  their existing behavior. Reaching a quantity target is a separate indicator;
  it does not grant extra points or change reward eligibility.
- No new dependencies. Keep `CLIENT_URL` equal to the frontend origin, without a
  trailing slash; target writes require that origin and an authenticated session.

## API

All endpoints require the existing login session; no client user ID is trusted.

- `GET /api/habit-targets` returns `{kind, habitId, target}[]` for the account.
- `PUT /api/habit-targets/:kind/:id`, JSON `{ "target": 8 }`, saves/replaces a
  target. `kind` is `standard` or `custom`; unowned/missing habits return 404.
- `DELETE /api/habit-targets/:kind/:id` removes only that account's target.

The table has distinct standard/custom foreign keys and per-account unique keys.
Writes use a transaction and lock the source habit, preventing duplicate target
rows. No target route writes to habit entry tables.

## Verification

Run `npm.cmd test --prefix server` and `npm.cmd run build`. New tests cover real
HTTP routes with a SQL-shaped test double, not a live database. They verify
create/reload/edit/remove, account isolation, colliding standard/custom IDs,
validation, origin/session checks, error handling and quantity percentages.

Live MySQL/browser acceptance checklist:

1. Apply the migration twice; verify neither run deletes existing data.
2. Set Water to 8 cups, save 4 cups today, verify 50% after saving/reloading.
3. Save 8 cups, then 12 cups: both reach 100%, actual values remain visible.
4. Create Reading in minutes; set 30, log 15, verify 50%.
5. Edit Water to 10, reload: saved 4 cups still exists and compares as 40%.
6. Try zero, negative, empty and overprecise targets; the old setting must remain.
7. Cancel editing, then remove a target. Entries and calendar history must remain.
8. Hide/restore a habit; its target should return unchanged.
9. Log out/in and restart the API; targets must persist in MySQL.
10. Log into another account: no custom habit/target leakage; that account may
    independently set its own Water target.
11. Check the editor and progress panel at desktop and mobile widths.

Do not merge until live checks and a teammate review are complete.

### Implementation verification

Based on `main` commit `bc05884` (rewards already merged). The 11 new target
tests pass, and the Vite production build succeeds. The full backend suite has
31 passing tests and 3 failing habit-group tests. Those same three failures were
reproduced on unchanged `main`: its old FakeConnection does not recognize the
calendar's `habit_schedule_periods` INSERT. This change does not modify those
tests or the habit-group implementation.

Browser automation could not launch because the environment denied Chromium's
socket operation. No live MySQL server was available for this implementation
check. The browser and live database checklist above still needs completion.
