# Habit save stability fix (original Issue #52 scope)

Fixes the reported `ER_LOCK_DEADLOCK` / MySQL 1213 during **Save habits**. It does
not reconnect quantity targets to completion, points, streaks, calendar or reward
rules. The original target feature and the team's existing point rules stay as
they were after reverting `60d4664`.

Changes:

- The dashboard sends filled Water, Sleep and custom habit saves sequentially,
  not all at once. A failed save stops the remaining batch and keeps form values
  intact for retry. The warning explains earlier saves may already have succeeded.
  A batch is not all-or-nothing.
- Both standard and custom entry endpoints lock the existing account row before
  accessing entries/points. Habit saves for the same account are serialized even
  across browser tabs. The lock lasts only for that transaction.
- A confirmed MySQL deadlock rolls back the **whole** transaction and retries on
  a fresh connection, at most three attempts (short 20/40 ms pauses). This also
  rolls back point/achievement writes before a retry. Exhaustion returns 503.
- Other errors, including ambiguous connection/commit failures, are not retried.
  Connections are released on success, error and failed cleanup.

No new packages, database tables, migrations or configuration are required.
Do not delete any tables created earlier. Keep `server/.env` private.

## Apply the patch on Windows

Stop both local servers (Ctrl+C in their terminals). In your existing project
folder, make sure you are on `feature/52-custom-habit-targets` and have a clean
working tree. The patch is based on the original target implementation
`77f0551`; the reverted `9ad5727` working tree has the same source files.

First check without applying:

```powershell
git apply --check "C:\Users\catma\Downloads\issue-52-habit-save-fix.patch"
```

If it succeeds silently, apply:

```powershell
git apply "C:\Users\catma\Downloads\issue-52-habit-save-fix.patch"
```

Stop if either command reports a conflict; do not force the patch or overwrite
other changes. The patch changes only the save flow, adds its small helper/test
files and this guide. It does not include the reverted integration.

## Verification

```powershell
node --test server/test/habitSaveApi.test.js server/test/habitSaveTransaction.test.js server/test/habitTargets.test.js
npm.cmd run build
```

All 23 targeted tests pass. Tests exercise real login/session and habit-save
routes with a transactional database double, retry/rollback cleanup and the actual
frontend queue helper; they do not reproduce a deadlock in a live MySQL server.
The full old backend suite still has the three previously documented habit-group
test-double failures on unchanged original code; this small fix does not alter
those tests. Full-suite result: 43 passed, 3 failed (46 total); targeted result:
23 passed, 0 failed. The Vite production build succeeds.

Restart the backend and frontend. In the browser, enter Water and Sleep for one
date and click Save habits once. Both values must persist after refresh, without
a deadlock error. Save them unchanged again: the point balance must not increase
again. Try a custom habit alongside them, then two tabs saving the same account.
Check that the original target meter (4/8 cups = 50%) still works independently.
Do not claim live verification or merge the PR until those checks are complete.
