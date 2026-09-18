# Team_Friday_ITSC_4155
## Team Roles
<b>Scrum Master</b> - Stephen Johnson<br>
<b>Product Owner</b> - Michael Taillon<br>
<b>Developers</b> - David Taban, Prahlad Rai


# Database Setup Guide (Local MySQL)

This project uses a local MySQL database for storing login/signup credentials. Each teammate runs their **own** MySQL server locally — we don't share one central database (yet).

## 1. Install MySQL

Download **MySQL Community Server** from:
https://dev.mysql.com/downloads/installer/

- Choose the **web installer** (smaller download).
- Setup type: **Developer Default** if available, otherwise **Server only** (you can add MySQL Workbench separately later if you want a GUI).
- Config type: **Development Computer**.
- Leave the default port (**3306**) unless something else is already using it.
- You'll be asked to set a **root password** — choose your own, remember it. This is *your* local password only — you do **not** need to share it with anyone, and no one else's password needs to match yours.

## 2. Verify the install

Open a terminal and run:
```bash
mysql --version
```
If you get "not recognized," MySQL's `bin` folder needs to be added to your system PATH:

C:\Program Files\MySQL\MySQL Server 8.0\bin

(Windows → search "Environment Variables" → Edit the system environment variables → Environment Variables → Path → Edit → New → paste that path → OK everywhere → restart your terminal.)

## 3. Create your local database

Connect to MySQL:
```bash
mysql -u root -p
```
Enter your root password when prompted. Then run:
```sql
CREATE DATABASE ontrack_db;
USE ontrack_db;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```
Confirm it worked:
```sql
SHOW TABLES;
```
You should see `users` listed.

## 4. Set up your `.env` file

Inside the `server` folder, create a file named exactly `.env` (copy `.env.example` if one exists, or create it fresh):

DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_own_mysql_password_here
DB_NAME=ontrack_db

Replace `your_own_mysql_password_here` with **your own** local MySQL root password.

⚠️ **Never commit `.env` to GitHub.** It's already listed in `.gitignore` — don't remove it from there, and don't push your `.env` file manually.

## 5. Install backend dependencies

```bash
cd server
npm install
```

## 6. Run the backend

```bash
node index.js
```
You should see:

Server running on port 5000

## 7. Run the frontend (separate terminal)

```bash
npm run dev
```
Opens the site at `http://localhost:5173`.

## 8. Test it

- Go to `http://localhost:5173/signup`, create an account through the real UI.
- Check it landed in your database:
```sql
SELECT * FROM users;
```
- Go to `http://localhost:5173/login` and log in with those same credentials.

## Notes

- Everyone's local database is separate — signing up on your machine won't show up on a teammate's machine. This is expected for now.
- If we later move to a shared/cloud database (e.g. Railway, PlanetScale), this guide will be updated with new `DB_HOST` values, and local setup won't be needed anymore.
- Passwords are hashed with `bcrypt` before storage — never stored as plain text.