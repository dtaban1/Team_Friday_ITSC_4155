# Custom habits update

For an existing database, run `custom_habits_migration.sql` once in MySQL Workbench, or from the MySQL prompt:

```sql
SOURCE custom_habits_migration.sql;
```

For a fresh database, run `database.sql` as usual. Restart the backend and frontend. On the dashboard, enter a new habit name and unit, click Create habit, then select a date and enter a daily value. Existing water and sleep inputs remain available.

Changed existing files: database.sql, server/index.js, src/pages/Dashboard.jsx, src/styles/dashboard.css.
Added files: custom_habits_migration.sql and this setup guide.

Custom habits are private to the signed-in account. Saving an existing habit/date replaces its value. Recent history and progress include custom habits. Blank daily inputs are skipped; they do not delete existing entries.
