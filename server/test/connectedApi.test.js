const { test } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const { CompletionDb } = require("./helpers/completionDb");
const { previousDay } = require("../rewardRules");

class AppDb extends CompletionDb {
  constructor() { super(); this.rules = []; this.targets = []; this.lock = Promise.resolve(); this.hash = bcrypt.hashSync("test-only-password", 4); }
  async getConnection() {
    let unlock;
    const waiting = this.lock;
    this.lock = new Promise((resolve) => { unlock = resolve; });
    await waiting;
    return { query: this.query.bind(this), beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: unlock };
  }
  async query(raw, args = []) {
    const sql = raw.replace(/\s+/g, " ").trim();
    if (sql.startsWith("SELECT id, email, password_hash")) return [[{ id: 12, email: "qa@example.test", password_hash: this.hash }]];
    if (sql.startsWith("SELECT id FROM users")) return [[{ id: args[0] }]];
    if (sql.startsWith("SELECT pt.id,")) return [this.transactions.filter((t) => t.userId === args[0])];
    if (sql.startsWith("SELECT id, name, unit FROM habit_types")) return [[{ id: 1, name: "water", unit: "cups" }]];
    if (sql.startsWith("SELECT id FROM habit_types")) return [[{ id: 1 }]];
    if (sql.startsWith("SELECT 1 FROM user_hidden_habit_types")) return [[]];
    if (sql.startsWith("INSERT INTO habit_targets")) {
      this.targets = [{ userId: args[0], habitId: args[1], target: args[3] }]; return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("INSERT INTO habit_entries")) {
      const [userId, habitId, date, value] = args;
      this.entries = [...this.entries.filter((e) => !(e.userId === userId && e.habitId === habitId && e.date === date)), { userId, habitId, date, value }];
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("SELECT he.id,") || sql.startsWith("SELECT 'standard' AS kind, he.habit_type_id")) {
      return [this.entries.filter((e) => e.userId === args[0]).map((e) => ({ id: 1, habitId: e.habitId, kind: "standard", habit: "water", entryDate: e.date, value: e.value, unit: "cups" }))];
    }
    if (sql.startsWith("SELECT CONCAT('custom-'") || sql.startsWith("SELECT 'custom' AS kind, e.custom_habit_id")) return [[]];
    if (sql.startsWith("SELECT p.habit_kind AS kind")) return [[]];
    if (sql.startsWith("SELECT 'standard' AS kind,id AS habitId")) return [[{ kind: "standard", habitId: 1, name: "water", unit: "cups" }]];
    return super.query(raw, args);
  }
}

test("real login/session, target, entry, points and calendar routes agree end-to-end (database double)", async (t) => {
  const db = new AppDb();
  const dbPath = require.resolve("../db");
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
  const app = require("../index");
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const root = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  const request = (path, method = "GET", body) => fetch(`${root}${path}`, {
    method, headers: { "Content-Type": "application/json", Origin: process.env.CLIENT_URL || "http://localhost:5173", Cookie: cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert.equal((await request("/api/habit-targets/rules")).status, 401);
  const login = await request("/api/login", "POST", { email: "qa@example.test", password: "test-only-password" });
  assert.equal(login.status, 200);
  cookie = login.headers.get("set-cookie").split(";")[0];
  const today = new Date().toISOString().slice(0, 10);
  const save = async (value, entryDate = today) => {
    const response = await request("/api/users/12/habits/water", "PUT", { entryDate, value, timeZone: "UTC" });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  assert.equal((await request("/api/habit-targets/standard/1", "PUT", { target: 8, timeZone: "UTC" })).status, 200);
  assert.equal((await save(4)).completed, false);
  assert.equal((await save(4)).pointsBalance, 0);
  const entryList = await (await request("/api/users/12/habits")).json();
  assert.equal(entryList[0].completed, false);
  assert.equal(entryList[0].completionTarget, 8);
  const history = await (await request(`/api/habit-history?month=${today.slice(0, 7)}`)).json();
  assert.equal(history.entries[0].completed, false);
  assert.equal((await save(8)).pointsChange, 5);
  const simultaneous = await Promise.all([save(8), save(12)]);
  assert.deepEqual(simultaneous.map((r) => r.pointsChange), [0, 0]);
  assert.equal((await (await request("/api/points")).json()).balance, 5);
  const changed = await (await request("/api/habit-targets/standard/1", "PUT", { target: 16, timeZone: "UTC" })).json();
  assert.equal(changed.pointsChange, -5);
  assert.equal(changed.completed, false);
  assert.equal(db.entries[0].value, 12);
  assert.equal(db.earned.size, 1);
  const old = await save(1, previousDay(today));
  assert.equal(old.completed, true);
  assert.equal(old.completionTarget, null); // Earlier dates retain the earlier rule.
  const future = await request("/api/users/12/habits/water", "PUT", { entryDate: previousDay(today, -1), value: 8, timeZone: "UTC" });
  assert.equal(future.status, 400);
  const invalidDate = await request("/api/users/12/habits/water", "PUT", { entryDate: "2026-02-30", value: 8 });
  assert.equal(invalidDate.status, 400);
  assert.equal((await request("/api/users/12/habits/water", "PUT", { entryDate: today, value: 0.001 })).status, 400);
  const streak = await (await request("/api/users/12/habits/water/streak?timeZone=UTC")).json();
  assert.equal(streak.streak, 1);
});
