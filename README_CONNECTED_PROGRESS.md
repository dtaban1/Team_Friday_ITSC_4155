# Connected habit completion

This builds on Issue #52. Dashboard completion, streaks, the Habit History
calendar, habit points, achievements and habit-based Rewards now use the same
server-side rule: **reach the quantity target for the entry's date; without a
target, a positive saved value completes the habit**. Zero never completes it.
The overall daily dashboard percentage is completed habits / active habits;
each habit's quantity bar still shows its own value/target percentage.

## Existing installation: one additive migration

Stop the API before updating code or running migrations. Back up normally.
In MySQL Workbench, in a connected query tab for the database in `server/.env`:

```sql
USE ontrack_db;
SOURCE server/migrate_connected_progress.sql;
```

`SOURCE` works in the mysql CLI from the project root. In Workbench, instead
paste `USE ontrack_db;` followed by the **contents** of that SQL file into the
connected query tab and execute all statements. Do not use a different project's
database. The previous `migrate_habit_targets.sql` must already have been applied.
New databases can use the updated full `database.sql` instead.

The script creates `habit_target_rules` and, if missing, the point/achievement
tables already required by the team's current dashboard. It installs/refreshes
the six standard achievement definitions but never deletes entries, claims,
transactions or unlocked achievements. Re-running the script is safe.

Existing targets first affect completion on the migration's `CURDATE()` in
MySQL's session timezone; run this when that date matches your local calendar
day. Before that transition, existing positive entries keep their old completion
rule. If you had an entry already saved today, re-save its target or entry once
after upgrading to reconcile today's point balance with the new rule.

Restart the API with `npm.cmd run dev --prefix server` and the frontend in a
second terminal with `npm.cmd run dev`. Keep the original private `.env` file.

## Target changes and history

Targets are dated. Creating/editing/removing a target applies from **today** in
the browser's IANA timezone, computed against the server clock. Today's rule can
be revised; earlier dates retain their last applicable requirement. The browser
does not submit an arbitrary effective date. New future-dated check-ins are
rejected to avoid earning future completion/points early.

A target edit immediately reevaluates an already saved entry for today in the
same transaction. Meeting it awards the usual 5 habit points once; falling below
it reverses that entry's award once. Repeated identical saves do not add points.
Completing again restores the net award, not multiple awards for the same active
completion. Old ledger rows remain as an audit trail.

Already claimed rewards and unlocked achievements remain earned, even when a
habit is later reduced or today's target is raised. Future/unclaimed daily,
seven-day and habit-milestone rewards require qualifying completed dates.
Tasks, goals and events keep their existing rules. Daily rewards need at least
one completed active habit; seven-day rewards need one on each of seven
consecutive dates including today, with non-overlapping claim windows.

Hide/restore still preserves entries and target history. The calendar can show
archived habit history, while current dashboard/rewards only use active habits.
Editing a custom habit's unit still does not convert saved numeric quantities.

## Verification

```powershell
npm.cmd test --prefix server
npm.cmd run build
```

Tests use real Express reward/target routes plus SQL-shaped database doubles for
rule history and points; they are **not live MySQL tests**. The old habit-group
test adapter was updated to model the already-existing calendar schedule INSERT
and its insertId, rather than skipping those tests.

Live acceptance checks before merging:

1. Set Water to 8, log 4 today. Its quantity bar is 50%, but completion is false:
   no habit points, no today's streak day, incomplete calendar entry, no habit
   reward progress from this entry. Other completed habits may still qualify a
   daily reward.
2. Change the log to 8: completion turns true everywhere, +5 points once, eligible
   daily reward / one completed habit-milestone day. Refresh Rewards if open.
3. Save 8 again, then 12: no additional points. Log out/in and verify persistence.
4. Change today's target to 16: the 12-unit entry is incomplete, its 5 points are
   reversed once, claimed rewards and unlocked achievements remain visible.
5. Lower it to 8: it completes again with a net 5-point award; yesterday's rule
   and values remain unchanged. Cancel edits must not affect the rule.
6. Remove the target: positive values complete it; zero stays incomplete.
7. Repeat with Reading (custom), target 30 and values 15 / 30.
8. Check a seven-day reward with one under-target day, and then all seven days
   completed. Check another account cannot see/update these targets/logs.
9. Check desktop/mobile layouts; do not merge until live verification and team
   review are complete.
