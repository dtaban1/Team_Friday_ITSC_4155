class CompletionDb {
  constructor() {
    this.rules = [{ userId: 12, kind: "standard", habitId: 1, effectiveDate: "2026-11-11", target: 8 }];
    this.entries = [];
    this.completions = [];
    this.transactions = [];
    this.earned = new Set();
  }
  async query(raw, args = []) {
    const sql = raw.replace(/\s+/g, " ").trim();
    if (sql.startsWith("SELECT habit_kind AS kind")) return [this.rules.filter((r) => r.userId === args[0])];
    if (sql.startsWith("SELECT COALESCE(SUM(points)")) return [[{ balance: this.transactions.filter((t) => t.userId === args[0]).reduce((n, t) => n + t.points, 0) }]];
    if (sql.startsWith("SELECT id FROM completions")) {
      return [this.completions.filter((c) => c.userId === args[0] && c.type === args[1] && c.habitId === args[2] && c.date === args[3] && !c.reversed)];
    }
    if (sql.startsWith("INSERT INTO completions")) {
      const [userId, type, habitId, date] = args;
      this.completions.push({ id: this.completions.length + 1, userId, type, habitId, date, reversed: false });
      return [{ insertId: this.completions.length }];
    }
    if (sql.startsWith("INSERT INTO point_transactions")) {
      const [userId, completionId, points] = args;
      this.transactions.push({ userId, completionId, points });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("UPDATE completions SET reversed_at")) {
      this.completions.find((c) => c.id === args[0]).reversed = true;
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("SELECT COUNT(*) AS totalCompletions")) {
      const active = this.completions.filter((c) => c.userId === args[0] && !c.reversed);
      return [[{ totalCompletions: active.length, taskCompletions: active.filter((c) => c.type === "task").length,
        habitCompletions: active.filter((c) => c.type !== "task").length }]];
    }
    if (sql.startsWith("SELECT id, code, name")) return [[{ id: 1, code: "first", name: "First", milestoneType: "total_completions", threshold: 1 }]];
    if (sql.startsWith("INSERT IGNORE INTO user_achievements")) {
      const key = `${args[0]}:${args[1]}`;
      const existed = this.earned.has(key); this.earned.add(key);
      return [{ affectedRows: existed ? 0 : 1 }];
    }
    if (sql.startsWith("INSERT INTO habit_target_rules")) {
      const [userId, kind, habitId, effectiveDate, target] = args;
      this.rules = this.rules.filter((r) => !(r.userId === userId && r.kind === kind && r.habitId === habitId && r.effectiveDate === effectiveDate));
      this.rules.push({ userId, kind, habitId, effectiveDate, target });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("SELECT value FROM habit_entries")) return [this.entries.filter((e) => e.userId === args[0] && e.habitId === args[1] && e.date === args[2])];
    if (sql.startsWith("SELECT value FROM custom_habit_entries")) return [this.entries.filter((e) => e.habitId === args[0] && e.date === args[1])];
    throw new Error(`Unexpected SQL: ${sql}`);
  }
}

module.exports = { CompletionDb };
