# Team_Friday_ITSC_4155
## Team Roles
<b>Scrum Master</b> - Stephen Johnson<br>
<b>Product Owner</b> - Michael Taillon<br>
<b>Developers</b> - David Taban, Prahlad Rai

# Database Setup Guide (Local MySQL)

This project uses one local MySQL database, `ontrack_db`, for both user accounts and habit tracking. Habit entries are linked directly to the account that created them through `habit_entries.user_id -> users.id`.

## 1. Install MySQL

Install MySQL Community Server and keep the default port (`3306`) unless you need a different one.

## 2. Create the database and tables

From the project root, connect to MySQL:

```bash
mysql -u root -p
```

Then run the included schema:

```sql
SOURCE database.sql;
```

The schema creates:

- `users` for login/signup credentials
- `habit_types` for supported habits such as water and sleep
- `habit_entries` for a user's daily habit values

Each habit entry has a real foreign key to `users.id`, and deleting a user will also delete that user's habit entries.

## 3. Configure the backend

Inside the `server` folder, copy `.env.example` to `.env` and set your local MySQL password:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_own_mysql_password_here
DB_NAME=ontrack_db
API_PORT=5000
```

Never commit `server/.env`; it is ignored by Git.

## 4. Install dependencies

Frontend, from the project root:

```bash
npm install
```

Backend:

```bash
cd server
npm install
```

## 5. Run the app

Start the backend from `server`:

```bash
node index.js
```

It defaults to `http://localhost:5000`.

In a second terminal, start Vite from the project root:

```bash
npm run dev
```

Vite normally opens at `http://localhost:5173`.

## 6. Test the user/habit connection

1. Create an account at `/signup`.
2. Log in at `/login`.
3. A successful login returns that account's `users.id`; the frontend stores it for the current login and opens `/habits`.
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

## API URL override

The frontend defaults to `http://localhost:5000`. If you change `API_PORT`, create a root `.env` file with a matching URL, for example:

```env
VITE_API_URL=http://localhost:5001
```
