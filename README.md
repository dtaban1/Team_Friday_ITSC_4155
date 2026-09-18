# Team_Friday_ITSC_4155
## Team Roles
<b>Scrum Master</b> - Stephen Johnson<br>
<b>Product Owner</b> - Michael Taillon<br>
<b>Developers</b> - David Taban, Prahlad Rai

<br>
This guide explains how to get the OnTrack React page running locally.

## 1. Install Node.js

Download and install the current LTS version of Node.js from:

https://nodejs.org/

After installation, verify Node.js and npm are available:

```bash
node -v
npm -v
```

## 2. Open the Project Folder

If the project is zipped, extract it first.

Then open the project folder in VS Code.

Example project structure:

```text
ontrack-react-app/
├── public/
│   └── ontrack-logo.png
├── src/
│   ├── pages/
│   │   ├── Home.jsx
│   ├── styles/
│   │   └── global.css
│   ├── App.jsx
│   └── main.jsx
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

## 3. Open a Terminal

In VS Code, open:

```text
Terminal > New Terminal
```

Make sure the terminal is inside the project folder.

Example:

```bash
cd ontrack-react-app
```

## 4. Install Dependencies

Run:

```bash
npm install
```

This installs React, Vite, React Router, and the other packages listed in `package.json`.

## 5. Start the Development Server

Run:

```bash
npm run dev
```

Vite should display a local address similar to:

```text
http://localhost:5173/
```

Open that address in your browser.

## Habit Tracking Database (MySQL)

This part of the guide explains how to enable the mysql database.

### 1. Install MySQL and create the database

Open MySQL Workbench (or the MySQL command line) and run the full contents of `database.sql`.

From a terminal, the equivalent command is:

```bash
mysql -u root -p < database.sql
```

### 2. Configure the connection

Copy `.env.example` to a file named `.env` in the project root and enter your local MySQL password:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=ontrack_habits
API_PORT=3001
```

Do not commit your real `.env` file or password.

### 3. Install dependencies

```bash
npm install
```

### 4. Run the frontend and API together

```bash
npm run dev:all
```

Then open:

```text
http://localhost:5173/habits
```

The API runs at `http://localhost:3001`.

### Database design

`habit_types` stores the available habits. It starts with:

- `water` measured in cups
- `sleep` measured in hours

`habit_entries` stores one value per user, habit, and day. The `external_user_id` column is the future link to the separate users database.

For now the React page uses `DEMO_USER_ID = 1` in `src/pages/Habits.jsx`. When the login/user database is connected it will link to the current user's ID.

To add another habit later, you only need to add a row to `habit_types`, for example:

```sql
INSERT INTO habit_types (name, unit, description)
VALUES ('steps', 'steps', 'Daily step count');
```

No new habit-entry table is required.

### API routes

```text
GET    /api/health
GET    /api/habits
GET    /api/users/:userId/habits
PUT    /api/users/:userId/habits/:habitName
DELETE /api/users/:userId/habits/:habitName/:entryDate
```

Example save request body:

```json
{
  "entryDate": "2026-09-17",
  "value": 8
}
```
