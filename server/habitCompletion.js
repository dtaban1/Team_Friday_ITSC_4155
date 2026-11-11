const { calendar, previousDay } = require("./rewardRules");
const { awardCompletion, reverseCompletion, getPointBalance } = require("./points");

function localToday(timeZone = "UTC", now = new Date()) {
  if (typeof timeZone !== "string" || timeZone.length > 64) throw new Error("Invalid time zone.");
  return calendar(timeZone, now).today;
}

function targetOnDate(rules, kind, habitId, date) {
  let latest = null;
  for (const rule of rules) {
    if (rule.kind === kind && Number(rule.habitId) === Number(habitId) && rule.effectiveDate <= date &&
        (!latest || rule.effectiveDate > latest.effectiveDate)) latest = rule;
  }
  return latest?.target == null ? null : Number(latest.target);
}

function isHabitComplete(value, target) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return false;
  return target == null || (Number.isFinite(Number(target)) && number >= Number(target));
}

function completedStreak(entries, today) {
  const dates = new Set(entries.filter((e) => e.completed && e.entryDate <= today).map((e) => e.entryDate));
  let cursor = dates.has(today) ? today : previousDay(today);
  let count = 0;
  while (dates.has(cursor)) { count++; cursor = previousDay(cursor); }
  return count;
}

async function loadTargetRules(db, userId) {
  const [rows] = await db.query(`SELECT habit_kind AS kind, habit_id AS habitId,
      DATE_FORMAT(effective_date, '%Y-%m-%d') AS effectiveDate,
      CAST(target_value AS DOUBLE) AS target
    FROM habit_target_rules WHERE user_id = ? ORDER BY effective_date`, [userId]);
  return rows;
}

function withCompletion(entries, rules) {
  return entries.map((entry) => {
    const completionTarget = targetOnDate(rules, entry.kind, entry.habitId, entry.entryDate);
    return { ...entry, completionTarget, completed: isHabitComplete(entry.value, completionTarget) };
  });
}

async function lockHabitAccount(db, userId) {
  await db.query("SELECT id FROM users WHERE id = ? FOR UPDATE", [userId]);
}

async function syncHabitPoints(db, { userId, kind, habitId, entryDate, value, today }) {
  const rules = await loadTargetRules(db, userId);
  const completionTarget = targetOnDate(rules, kind, habitId, entryDate);
  const completed = entryDate <= today && isHabitComplete(value, completionTarget);
  const activityType = kind === "standard" ? "habit" : "custom_habit";
  const [active] = await db.query(`SELECT id FROM completions WHERE user_id = ?
    AND activity_type = ? AND activity_id = ? AND completion_date = ?
    AND reversed_at IS NULL FOR UPDATE`, [userId, activityType, habitId, entryDate]);
  let result;
  if (completed && active.length === 0) {
    result = await awardCompletion(db, { userId, activityType, activityId: habitId, completionDate: entryDate });
  } else if (!completed && active.length > 0) {
    result = await reverseCompletion(db, { userId, activityType, activityId: habitId, completionDate: entryDate });
  } else result = { pointsChange: 0, pointsBalance: await getPointBalance(db, userId), achievementsUnlocked: [] };
  return { ...result, completed, completionTarget };
}

async function recordTargetChange(db, { userId, kind, habitId, target, today }) {
  // Replace only today's version; previous requirements remain immutable.
  await db.query(`INSERT INTO habit_target_rules (user_id, habit_kind, habit_id, effective_date, target_value)
    VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE target_value = VALUES(target_value)`,
  [userId, kind, habitId, today, target]);
  const [entries] = kind === "standard"
    ? await db.query("SELECT value FROM habit_entries WHERE user_id = ? AND habit_type_id = ? AND entry_date = ? FOR UPDATE", [userId, habitId, today])
    : await db.query("SELECT value FROM custom_habit_entries WHERE custom_habit_id = ? AND entry_date = ? FOR UPDATE", [habitId, today]);
  if (!entries.length) return { pointsChange: 0, pointsBalance: await getPointBalance(db, userId), achievementsUnlocked: [] };
  return syncHabitPoints(db, { userId, kind, habitId, entryDate: today, value: entries[0].value, today });
}

module.exports = { localToday, targetOnDate, isHabitComplete, loadTargetRules, withCompletion,
  lockHabitAccount, syncHabitPoints, recordTargetChange, completedStreak };
