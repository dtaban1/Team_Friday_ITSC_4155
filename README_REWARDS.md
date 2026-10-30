# Personal rewards — Issue #44

Open **Dashboard → Rewards** (`/rewards`) after logging in.
Rewards are user-chosen treats, not prizes, purchases, money or gifts supplied by
OnTrack. Create a reward, optionally upload a photo, and link it to your progress.
Claiming creates a dated history entry with an optional celebration note. A photo
can also be added or changed after a claim.

## Database setup

For a **new database**, run the normal `database.sql` setup; it includes both new
tables. For an **existing database**, back up as usual, then select the database
configured in `server/.env` and run the additive migration in MySQL Workbench:

```sql
USE ontrack_db;
SOURCE server/migrate_rewards.sql;
```

`SOURCE` is for the MySQL command-line client, run from the project root. In
Workbench, open `server/migrate_rewards.sql` as a SQL script, choose your database
from the schema selector, and execute the script instead. If your database has a
different name, select that name rather than `ontrack_db`.

This migration only creates `rewards` and `reward_claims`. It does not alter or
delete existing accounts, tasks, goals, events, or habit entries. It is safe to
run again. The existing habit-management migration is still a prerequisite on
older installations; see `README_DATABASE.md`.

Install/run as before:

```sh
npm ci
npm ci --prefix server
npm run dev --prefix server
```

In a separate terminal:

```sh
npm run dev
```

No new npm dependencies are required. Keep `CLIENT_URL` set to the exact frontend
origin (local default `http://localhost:5173`, no trailing slash), and use the
existing `VITE_API_URL` override if needed.

## Claim rules (explicit product assumptions for team review)

| Link | When it unlocks | Repeat behavior |
| --- | --- | --- |
| Task | The user's linked task is marked complete | One claim per reward |
| Goal | The user's linked goal is marked complete | One claim per reward |
| Event | Its scheduled start date/time has arrived | One claim per reward |
| Habit milestone | The selected active habit has a positive value on N distinct days (1–365) | One claim per reward; dates need not be consecutive |
| Daily | Any active habit has a positive entry dated today | Once per reward per calendar day |
| Seven-day | Positive activity in any active habit on each of seven consecutive days, including today | Once per reward per non-overlapping seven-day window |

For untimed events, the start of the scheduled day unlocks the reward; this does
**not** assert the user attended the event. Daily/seven-day activity follows the
app's habit-activity concept, not login visits or task completions. Entries dated
in the future, zero-value entries, hidden built-in habits and inactive custom
habits do not count. Habit milestones count only the selected habit, distinguishing
custom and built-in IDs. Previously logged positive dates can count; backfilled
entries are allowed just as they are in the existing habit tracker.

Each reward saves the browser's IANA time zone at creation. The server calculates
today and event timing from its own clock in that saved zone; clients cannot
submit an arbitrary claim date. Claim history timestamps are stored in UTC and
displayed in the viewer's local zone. Changing the device zone later does not
change an existing reward's day boundary. A seven-day reward claimed on October
28 can next be claimed on November 4 if the seven new days meet the rule.

Tasks/goals reopened after claiming do not remove history or allow another claim.
Deleting a linked task/goal/event blocks an unclaimed reward but preserves existing
claims and their original label. Removing a habit blocks an unclaimed milestone
until it is restored. Deleted rewards remove their photos and their own claim
history only, after an explicit UI confirmation; linked planning items are not
deleted. The history panel shows the latest 50 claims; older claims are retained
and continue to prevent duplicate claims.

## Storage and access

- Session-protected endpoints always scope reads/writes by the session's user ID;
  request bodies cannot choose an account. All user SQL values are parameterized.
- Writes also require an `Origin` matching `CLIENT_URL` to protect the cross-site
  session cookie. CORS alone is not used as a write authorization mechanism.
- Photos accept base64 JPEG/PNG/WebP with matching file signatures, at most 2 MiB
  after decoding. SVG and arbitrary MIME types are rejected. JSON has a 3 MiB cap.
- Photos live in MySQL `MEDIUMBLOB`, not in Git, a public upload directory, or an
  ephemeral server disk. `GET /api/rewards/:id/image` requires the owner's session
  and returns `private, no-store` and `nosniff` headers. Reward list queries do not
  include photo bytes. Photos are not malware-scanned or re-encoded.
- Up to 100 saved rewards per account bounds photo storage (at most 200 MiB per
  account). This remains a small-project approach; object storage and quotas by
  byte count would be better for a larger deployment.
- Claims lock the reward row in a transaction; a unique `(reward_id, period_key)`
  constraint provides an additional duplicate guard. The claim button is disabled
  while saving.

## API

All routes are under `/api/rewards` and require the existing login session.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/` | Personal rewards, server-calculated eligibility, owned link options and latest history |
| POST | `/` | Create a reward, optionally including a photo data URL |
| POST | `/:id/claim` | Validate progress and record a claim with optional `note` |
| GET | `/:id/image` | Read a private photo |
| PUT | `/:id/image` | Upload/replace a photo; `image: null` removes it |
| DELETE | `/:id` | Delete this reward, photo and its claim history |

Create payload: `title`, optional `description`, `targetType`, `timeZone`, optional
`image`; linked types also require `targetId`; habit milestones require
`habitKind` (`standard`/`custom`) and integer `milestoneDays`.

## Automated checks

```sh
npm test --prefix server
npm run build
git diff --check
```

`rewardRules.test.js` checks validation, image bounds/signatures, local dates,
task/goal/event eligibility, milestones, daily duplicates and seven-day gaps and
overlapping windows. `rewardsApi.test.js` exercises real Express HTTP routes
against a SQL-shaped test double: sessions, untrusted origins, account isolation,
photo round-trips, claims, duplicates/concurrent claims and delete behavior.
The test double is not a replacement for checking real MySQL behavior.

## Manual acceptance check (real MySQL)

1. Apply the migration; restart the backend, log in, and follow **Rewards** from
   the dashboard. Confirm the empty state and navigation work on mobile/desktop.
2. Create a task-linked reward with a JPEG/PNG/WebP photo. It should be locked
   while the task is incomplete. Complete the task on the dashboard and refresh
   reward progress. Claim with a note, refresh, and confirm the history persists.
3. Repeat for a goal. Reopen/recomplete it: its claimed reward must remain claimed.
4. Link a future event: it must stay locked before the scheduled local start.
5. Create built-in and custom habit milestones; log positive entries on distinct
   dates and verify each milestone only counts its selected habit.
6. Create a daily reward: zero/future-only values must not unlock it. Log a
   positive value today; claim once. A second claim must fail, including from a
   second browser tab.
7. Log a positive active habit on seven consecutive dates ending today. A
   seven-day reward should unlock; a gap, duplicate date or missing today should
   prevent claiming. After claiming, it stays locked until a fresh seven-day
   window. Check dates near midnight and across a DST boundary.
8. Upload an invalid file or photo over 2 MB: show an error without losing the
   form. Add/change/remove a photo on an existing claimed reward.
9. Log in as a second account: the first account's reward, claim history, photo
   URLs and linked targets must not be accessible. Log out: APIs return 401.
10. Cancel reward deletion: nothing changes. Confirm deletion: only the reward,
    its photo and claim history disappear, not the linked task/goal/event/habit.

Production note: the app still uses its pre-existing `express-session` default
MemoryStore. This feature does not change that deployment limitation. Cross-site
cookie blocking can affect the existing login as well as private images; prefer
same-site deployment and a production session store before a public launch.
