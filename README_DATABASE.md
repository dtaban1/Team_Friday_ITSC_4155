# Team_Friday_ITSC_4155

## Team Roles

<b>Scrum Master</b> - Stephen Johnson<br> <b>Product Owner</b> - Michael Taillon<br> <b>Developers</b> - David Taban, Prahlad Rai

# Database Setup Guide (Local MySQL)

This project uses a local MySQL database, `ontrack_db`, for both user accounts and habit tracking.

Each teammate runs their **own MySQL server locally** — we do not share one central database yet.

Habit entries are linked directly to the account that created them through:

`habit_entries.user_id -> users.id`

## 1. Install MySQL

Download **MySQL Community Server** from:

https://dev.mysql.com/downloads/installer/

* Choose the **web installer** if available.
* Setup type: **Developer Default** if available, otherwise **Server only**.
* Config type: **Development Computer**.
* Leave the default port (**3306**) unless something else is already using it.
* Set your own **root password** and remember it. Your teammates' passwords do not need to match yours.

## 2. Verify the install

Open a terminal and run:

```bash
mysql --version
```

If you get `"not recognized"` on Windows, add MySQL's `bin` folder to your system PATH:

```text
C:\Program Files\MySQL\MySQL Server 8.0\bin
```

Then restart your terminal.

## 3. Create the database and tables

From the project root, connect to MySQL:

```bash
mysql -u root -p
```

Enter your root password when prompted.

Then run the included database schema:

```sql
SOURCE database.sql;
```

The schema creates:

* `users` for login/signup credentials
* `habit_types` for supported habits such as water and sleep
* `habit_entries` for each user's daily habit values

Each habit entry has a foreign key to `users.id`. Deleting a user will also delete that user's habit entries.

To verify the tables were created:

```sql
USE ontrack_db;
SHOW TABLES;
```

## Existing database: one-time habit management migration

**Important:** If you already created `ontrack_db` before this feature, run the
migration **once** before starting the updated app. Re-running `database.sql`
alone will *not* add new columns to existing tables, because it uses
`CREATE TABLE IF NOT EXISTS`.

Open the MySQL prompt from the project root (`mysql -u root -p`) and run:

```sql
SOURCE server/migrate_habit_management.sql;
```

This adds `custom_habits.is_active` (default 1 for all existing habits) and
`user_hidden_habit_types`. Existing accounts, custom habits and entries remain
intact. **Do not run the migration twice**; MySQL will reject a duplicate column.
For a brand-new database, simply use `SOURCE database.sql;` as in step 3.

## 4. Configure the backend

Inside the `server` folder, copy `.env.example` to `.env` and set your local MySQL password:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_own_mysql_password_here
DB_NAME=ontrack_db
API_PORT=5000
```

Replace `your_own_mysql_password_here` with your own local MySQL root password.

**Never commit `server/.env` to GitHub.** It should remain listed in `.gitignore`.

## 5. Install dependencies

From the project root, install frontend dependencies:

```bash
npm install
```

Then install backend dependencies:

```bash
cd server
npm install
```

## 6. Run the backend

From the `server` folder:

```bash
node index.js
```

The backend defaults to:

```text
http://localhost:5000
```

You should see something similar to:

```text
Server running on port 5000
```

## 7. Run the frontend

In a separate terminal, from the project root:

```bash
npm run dev
```

Vite normally opens the site at:

```text
http://localhost:5173
```

## 8. Test the user and habit connection

1. Go to `http://localhost:5173/signup` and create an account.
2. Log in at `http://localhost:5173/login`.
3. A successful login returns that account's `users.id`. The frontend stores it for the current login and opens `/habits`.
4. Save water or sleep values on `/habits`.
5. Verify the relationship in MySQL:

```sql
SELECT
  he.id,
  he.user_id,
  u.email,
  ht.name AS habit,
  he.entry_date,
  he.value
FROM habit_entries he
JOIN users u ON u.id = he.user_id
JOIN habit_types ht ON ht.id = he.habit_type_id
ORDER BY he.entry_date DESC, he.id DESC;
```

## API URL Override

The frontend defaults to:

```text
http://localhost:5000
```

If you change `API_PORT`, create a root `.env` file with a matching frontend API URL.

For example:

```env
VITE_API_URL=http://localhost:5001
```

## Notes

* Everyone's local database is separate. Signing up on your machine will not create an account in a teammate's database.
* Passwords are hashed with `bcrypt` before storage and should never be stored as plain text.
* If the project later moves to a shared/cloud database, this guide should be updated with the new database configuration.

## Habit management (new)

After logging in, open **Dashboard → Manage habits** (`/habits/manage`). The
page supports creating habits, editing custom names/units, removing any active
habit after confirmation, cancelling removal, and restoring removed habits.
Built-in water/sleep labels and units are fixed; you can hide/restore them per
account. The dashboard only offers active habits for current and future daily
tracking, and preserves older entries in the history section.

Changes are persisted in MySQL. Removing a custom habit sets `is_active = 0`
instead of deleting its row, so related `custom_habit_entries` are retained.
Built-in habits are hidden per account in `user_hidden_habit_types`, leaving
`habit_entries` unchanged. Both visibility APIs require a login; custom-habit
updates additionally check `user_id = req.session.userId`.

### Suggested acceptance checks

1. Sign in and create a custom habit on `/habits/manage`.
2. Save an entry, then use **Remove → Cancel**. Confirm the habit remains.
3. Use **Remove → Remove habit**. Confirm the habit is missing from the daily
   form today and on another date, but its entry is still in **History**.
4. Refresh, log out/in, and confirm the habit remains removed.
5. Use **Restore** and check the daily form returns with its existing entries.
6. Remove water, sleep, and all custom habits; confirm the empty-state prompt.
7. Log in as a different user and confirm neither user can manage the other's
   custom habits (the server returns 404 for an unowned habit id).


## Preset habit groups

The **Manage habits** page now includes a **Add habit groups** section for Fitness,
Studying, Reading, Gaming, Wellness, and Creativity. Select a category, preview a
preset, check/uncheck the habits you want, and click **Add Group**. The page
immediately refreshes the habit list, and newly selected habits will be available
on the dashboard. You can edit/remove newly created habits with the existing
management controls.

This feature reuses `custom_habits` and `user_hidden_habit_types` so **no additional
SQL migration is needed** beyond the existing habit-management migration described
above. The selected habits are saved against your logged-in account in MySQL,
not browser-only storage. Re-adding an already tracked habit skips the duplicate;
re-adding a previously removed habit restores the original record and its history.
The built-in Water/Sleep habits remain built-in (they are restored if hidden).

The server defines preset group names, habit names and units in
`server/habitGroups.js`; changing these definitions changes what future additions
will offer, not any users' existing habit entries.

API endpoints (session required):

- `GET /api/habit-groups` - get categories/groups and each group's selectable habits.
- `POST /api/habit-groups/:groupId` with JSON `{ "habitIds": ["study-time", "review-notes"] }` - add only the selected preset habits. Returns arrays `added`, `restored`, `skipped`, plus `message` and `alreadyAdded`. Unknown group/IDs or empty selections are rejected.

Run `cd server && npm test` to run catalog/selection/duplicate/restoration tests
without requiring a live MySQL connection. To use the application itself you still
need the existing MySQL server running and both frontend/backend dependencies installed.

## Habit History calendar database migration

After running `database.sql` on a new installation, or before running the updated
server on an existing installation, execute this migration **once**:

```bash
mysql -u root -p ontrack_db < server/migrate_habit_history.sql
```

Alternatively, in the MySQL terminal, enter `USE ontrack_db;` and
`SOURCE server/migrate_habit_history.sql;` from the project root.

This migration preserves existing logs and creates `habit_schedule_periods`,
tracking activations, removals, and restorations going forward. Existing users'
active built-in habits are assumed scheduled since account creation. Existing
custom habits with logs begin at the first known log; otherwise they begin on
the migration date. Previously removed habits have their logged dates preserved.
The old schema did not record historical activation/removal dates, so unlogged
past scheduled days for those habits cannot be reconstructed. New changes are
tracked precisely from the migration onward.

Visit `/habits/history` from the dashboard after restarting the API server and
frontend. All habit-history requests use the authenticated session account.
A saved numeric entry greater than zero counts as completed; zero counts as
incomplete. Logging and history are stored in MySQL, not browser storage.
