// Reusable, timezone-independent calculation over YYYY-MM-DD local calendar dates.
// Sunday = bit 0; Saturday = bit 6. All historic periods retain their own mask.
const DAY = 86400000;
function dayNumber(value) {
  const str = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) throw new Error('Invalid local date');
  const [y, m, d] = str.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d);
  if (new Date(ms).toISOString().slice(0, 10) !== str) throw new Error('Invalid local date');
  return ms / DAY;
}
function dateString(day) { return new Date(day * DAY).toISOString().slice(0, 10); }
function calculateStreaks(periods, entries, today) {
  const todayDay = dayNumber(today);
  const completed = new Set(entries.filter(e => Number(e.value) > 0)
    .map(e => dayNumber(e.entryDate)).filter(day => day <= todayDay));
  const scheduled = new Set();
  for (const period of periods) {
    const start = dayNumber(period.startDate);
    const end = period.endDate ? Math.min(dayNumber(period.endDate), todayDay) : todayDay;
    const mask = Number(period.weekdaysMask ?? 127);
    if (!Number.isInteger(mask) || mask < 1 || mask > 127) throw new Error('Invalid schedule');
    for (let day = start; day <= end; day++) {
      const weekday = new Date(day * DAY).getUTCDay();
      if ((mask & (1 << weekday)) !== 0) scheduled.add(day);
    }
  }
  const days = [...scheduled].sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  for (const day of days) {
    run = completed.has(day) ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  // Today's pending check-in is not overdue; a missed earlier scheduled day is.
  let index = days.length - 1;
  if (index >= 0 && days[index] === todayDay && !completed.has(todayDay)) index--;
  let current = 0;
  for (; index >= 0 && completed.has(days[index]); index--) current++;
  // If the last due day was missed, the active streak is zero.
  return { currentStreak: current, longestStreak: longest };
}

async function getUserStreaks(pool, userId, today) {
  dayNumber(today);
  const [habits] = await pool.query(`
    SELECT 'standard' AS kind, ht.id AS habitId, ht.name,
      (hidden.user_id IS NULL) AS isActive
    FROM habit_types ht LEFT JOIN user_hidden_habit_types hidden
      ON hidden.user_id=? AND hidden.habit_type_id=ht.id
    UNION ALL
    SELECT 'custom', id, name, is_active FROM custom_habits WHERE user_id=?`, [userId,userId]);
  const [periods] = await pool.query(`
    SELECT habit_kind AS kind, habit_id AS habitId,
      DATE_FORMAT(start_date, '%Y-%m-%d') AS startDate,
      DATE_FORMAT(end_date, '%Y-%m-%d') AS endDate, weekdays_mask AS weekdaysMask
    FROM habit_schedule_periods WHERE user_id=? AND start_date<=?`, [userId,today]);
  const [standard] = await pool.query(`SELECT 'standard' AS kind, habit_type_id AS habitId,
    DATE_FORMAT(entry_date,'%Y-%m-%d') AS entryDate, value
    FROM habit_entries WHERE user_id=? AND entry_date<=?`, [userId,today]);
  const [custom] = await pool.query(`SELECT 'custom' AS kind, e.custom_habit_id AS habitId,
    DATE_FORMAT(e.entry_date,'%Y-%m-%d') AS entryDate, e.value
    FROM custom_habit_entries e JOIN custom_habits c ON c.id=e.custom_habit_id
    WHERE c.user_id=? AND e.entry_date<=?`, [userId,today]);
  const keyed = (kind, id) => `${kind}:${id}`;
  const periodsByHabit = new Map(), entriesByHabit = new Map();
  for (const period of periods) {
    const key = keyed(period.kind, period.habitId);
    if (!periodsByHabit.has(key)) periodsByHabit.set(key, []);
    periodsByHabit.get(key).push(period);
  }
  for (const entry of [...standard, ...custom]) {
    const key = keyed(entry.kind, entry.habitId);
    if (!entriesByHabit.has(key)) entriesByHabit.set(key, []);
    entriesByHabit.get(key).push(entry);
  }
  return habits.map(habit => ({
    kind: habit.kind, habitId: Number(habit.habitId), name: habit.name,
    isActive: Boolean(habit.isActive),
    weekdaysMask: Number((periodsByHabit.get(keyed(habit.kind,habit.habitId)) || []).find(p => !p.endDate)?.weekdaysMask ?? 127),
    ...calculateStreaks(periodsByHabit.get(keyed(habit.kind,habit.habitId)) || [],
      entriesByHabit.get(keyed(habit.kind,habit.habitId)) || [],today)
  }));
}
module.exports = { calculateStreaks, getUserStreaks, dayNumber, dateString };
