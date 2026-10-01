# Custom habits update

For an existing database, run `custom_habits_migration.sql` once in MySQL Workbench, or from the MySQL prompt:

```sql
SOURCE custom_habits_migration.sql;
```

For a fresh database, run `database.sql` as usual. Restart the backend and frontend. On the dashboard, enter a new habit name and unit, click Create habit, then select a date and enter a daily value. Existing water and sleep inputs remain available.
