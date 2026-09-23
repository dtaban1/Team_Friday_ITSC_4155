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
