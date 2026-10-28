const pool = require('./db');

// Changes are applied using the same DB connection/transaction as visibility updates.
async function setSchedule(connection, userId, kind, id, active) {
  if (active) {
    await connection.query(`INSERT INTO habit_schedule_periods (user_id,habit_kind,habit_id,start_date)
      SELECT ?,?,?,CURDATE() WHERE NOT EXISTS (
        SELECT 1 FROM habit_schedule_periods WHERE user_id=? AND habit_kind=? AND habit_id=? AND end_date IS NULL)`,
      [userId, kind, id, userId, kind, id]);
  } else {
    await connection.query(`UPDATE habit_schedule_periods SET end_date=CURDATE()
      WHERE user_id=? AND habit_kind=? AND habit_id=? AND end_date IS NULL`, [userId, kind, id]);
  }
}

async function getHistory(userId, month) {
  const first = `${month}-01`;
  const [periods] = await pool.query(`
    SELECT p.habit_kind AS kind, p.habit_id AS habitId,
      DATE_FORMAT(p.start_date,'%Y-%m-%d') AS startDate,
      IFNULL(DATE_FORMAT(p.end_date,'%Y-%m-%d'),NULL) AS endDate,
      COALESCE(ht.name,ch.name) AS name, COALESCE(ht.unit,ch.unit) AS unit
    FROM habit_schedule_periods p
    LEFT JOIN habit_types ht ON p.habit_kind='standard' AND ht.id=p.habit_id
    LEFT JOIN custom_habits ch ON p.habit_kind='custom' AND ch.id=p.habit_id AND ch.user_id=p.user_id
    WHERE p.user_id=? AND p.start_date < DATE_ADD(?, INTERVAL 1 MONTH)
      AND (p.end_date IS NULL OR p.end_date >= ?)
    ORDER BY name`, [userId,first,first]);
  const [standard] = await pool.query(`SELECT 'standard' AS kind, he.habit_type_id AS habitId,
      DATE_FORMAT(he.entry_date,'%Y-%m-%d') AS entryDate, CAST(he.value AS DOUBLE) AS value
    FROM habit_entries he WHERE he.user_id=? AND he.entry_date >= ? AND he.entry_date < DATE_ADD(?, INTERVAL 1 MONTH)`,
    [userId,first,first]);
  const [custom] = await pool.query(`SELECT 'custom' AS kind, e.custom_habit_id AS habitId,
      DATE_FORMAT(e.entry_date,'%Y-%m-%d') AS entryDate, CAST(e.value AS DOUBLE) AS value
    FROM custom_habit_entries e JOIN custom_habits ch ON ch.id=e.custom_habit_id
    WHERE ch.user_id=? AND e.entry_date >= ? AND e.entry_date < DATE_ADD(?, INTERVAL 1 MONTH)`,
    [userId,first,first]);
  const [catalog] = await pool.query(`SELECT 'standard' AS kind,id AS habitId,name,unit FROM habit_types
    UNION ALL SELECT 'custom',id,name,unit FROM custom_habits WHERE user_id=?`,[userId]);
  return { month, periods, entries:[...standard,...custom], habits:catalog };
}
module.exports = {setSchedule,getHistory};
