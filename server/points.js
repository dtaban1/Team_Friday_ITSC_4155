// Server-owned point rules. The browser never submits a point total.
const POINT_RULES = Object.freeze({
  task: 10,
  habit: 5,
  custom_habit: 5,
});

async function getPointBalance(db, userId) {
  const [rows] = await db.query(
    `SELECT COALESCE(SUM(points), 0) AS balance
     FROM point_transactions
     WHERE user_id = ?`,
    [userId]
  );

  return Math.max(0, Number(rows[0]?.balance || 0));
}

async function getAchievementMetrics(db, userId) {
  const balance = await getPointBalance(db, userId);
  const [rows] = await db.query(
    `SELECT
       COUNT(*) AS totalCompletions,
       SUM(CASE WHEN activity_type = 'task' THEN 1 ELSE 0 END) AS taskCompletions,
       SUM(CASE WHEN activity_type IN ('habit', 'custom_habit') THEN 1 ELSE 0 END) AS habitCompletions
     FROM completions
     WHERE user_id = ? AND reversed_at IS NULL`,
    [userId]
  );

  return {
    points: balance,
    total_completions: Number(rows[0]?.totalCompletions || 0),
    task_completions: Number(rows[0]?.taskCompletions || 0),
    habit_completions: Number(rows[0]?.habitCompletions || 0),
  };
}

async function syncAchievements(db, userId, triggerCompletionId = null) {
  const metrics = await getAchievementMetrics(db, userId);
  const [definitions] = await db.query(
    `SELECT id, code, name, description, badge, milestone_type AS milestoneType,
            threshold, sort_order AS sortOrder
     FROM achievements
     ORDER BY sort_order, id`
  );

  const unlocked = [];
  for (const achievement of definitions) {
    const currentValue = Number(metrics[achievement.milestoneType] || 0);
    if (currentValue < Number(achievement.threshold)) continue;

    const [result] = await db.query(
      `INSERT IGNORE INTO user_achievements
         (user_id, achievement_id, trigger_completion_id)
       VALUES (?, ?, ?)`,
      [userId, achievement.id, triggerCompletionId]
    );

    if (result.affectedRows > 0) {
      unlocked.push({
        id: achievement.id,
        code: achievement.code,
        name: achievement.name,
        description: achievement.description,
        badge: achievement.badge,
        milestoneType: achievement.milestoneType,
        threshold: Number(achievement.threshold),
      });
    }
  }

  return unlocked;
}

async function getAchievementState(db, userId) {
  await syncAchievements(db, userId);
  const metrics = await getAchievementMetrics(db, userId);
  const [rows] = await db.query(
    `SELECT a.id, a.code, a.name, a.description, a.badge,
            a.milestone_type AS milestoneType, a.threshold,
            ua.earned_at AS earnedAt
     FROM achievements a
     LEFT JOIN user_achievements ua
       ON ua.achievement_id = a.id AND ua.user_id = ?
     ORDER BY a.sort_order, a.id`,
    [userId]
  );

  return rows.map((achievement) => {
    const currentValue = Number(metrics[achievement.milestoneType] || 0);
    const threshold = Number(achievement.threshold);
    return {
      id: achievement.id,
      code: achievement.code,
      name: achievement.name,
      description: achievement.description,
      badge: achievement.badge,
      milestoneType: achievement.milestoneType,
      threshold,
      currentValue,
      progressPercent: Math.min(100, Math.round((currentValue / threshold) * 100)),
      earned: Boolean(achievement.earnedAt),
      earnedAt: achievement.earnedAt,
    };
  });
}

async function awardCompletion(db, { userId, activityType, activityId, completionDate }) {
  const points = POINT_RULES[activityType];
  if (!points) return { pointsChange: 0, pointsBalance: await getPointBalance(db, userId), achievementsUnlocked: [] };

  const [completion] = await db.query(
    `INSERT INTO completions
       (user_id, activity_type, activity_id, completion_date)
     VALUES (?, ?, ?, ?)`,
    [userId, activityType, activityId, completionDate]
  );

  await db.query(
    `INSERT INTO point_transactions
       (user_id, completion_id, transaction_type, points, reason)
     VALUES (?, ?, 'award', ?, ?)`,
    [userId, completion.insertId, points, `${activityType} completion`]
  );

  const pointsBalance = await getPointBalance(db, userId);
  const achievementsUnlocked = await syncAchievements(db, userId, completion.insertId);

  return {
    completionId: completion.insertId,
    pointsChange: points,
    pointsBalance,
    achievementsUnlocked,
  };
}

async function reverseCompletion(db, { userId, activityType, activityId, completionDate = null }) {
  const points = POINT_RULES[activityType];
  if (!points) return { pointsChange: 0, pointsBalance: await getPointBalance(db, userId), achievementsUnlocked: [] };

  const params = [userId, activityType, activityId];
  let dateClause = "";
  if (completionDate) {
    dateClause = " AND completion_date = ?";
    params.push(completionDate);
  }

  const [rows] = await db.query(
    `SELECT id
     FROM completions
     WHERE user_id = ?
       AND activity_type = ?
       AND activity_id = ?
       ${dateClause}
       AND reversed_at IS NULL
     ORDER BY id DESC
     LIMIT 1
     FOR UPDATE`,
    params
  );

  if (!rows.length) {
    return { pointsChange: 0, pointsBalance: await getPointBalance(db, userId), achievementsUnlocked: [] };
  }

  const balance = await getPointBalance(db, userId);
  if (balance < points) {
    throw new Error("Point balance is inconsistent and cannot be reversed safely.");
  }

  const completionId = rows[0].id;
  await db.query(
    "UPDATE completions SET reversed_at = NOW() WHERE id = ? AND reversed_at IS NULL",
    [completionId]
  );
  await db.query(
    `INSERT INTO point_transactions
       (user_id, completion_id, transaction_type, points, reason)
     VALUES (?, ?, 'reversal', ?, ?)`,
    [userId, completionId, -points, `${activityType} completion reversed`]
  );

  return {
    completionId,
    pointsChange: -points,
    pointsBalance: await getPointBalance(db, userId),
    achievementsUnlocked: [],
  };
}

module.exports = { getPointBalance, getAchievementState, awardCompletion, reverseCompletion };
