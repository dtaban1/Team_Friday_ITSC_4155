const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const bcrypt = require("bcrypt");

// Transactional database double. These tests run the real entry routes and
// express-session; they inject deadlocks, not a live MySQL lock graph.
class SaveDb {
  constructor() {
    this.state = { entries: {}, completions: [], points: [] };
    this.hash = bcrypt.hashSync("test-only-password", 4);
    this.lock = Promise.resolve();
    this.failAt = "";
    this.failCount = 0;
    this.rollbacks = 0;
    this.released = 0;
    this.borrowed = 0;
  }
  async getConnection() {
    this.borrowed++;
    let unlock;
    const wait = this.lock;
    this.lock = new Promise((resolve) => { unlock = resolve; });
    await wait;
    let staged;
    return {
      beginTransaction: async () => { staged = structuredClone(this.state); },
      query: (sql, args) => this.query(sql, args, staged),
      commit: async () => { this.state = staged; },
      rollback: async () => { staged = null; this.rollbacks++; },
      release: () => { this.released++; unlock(); },
    };
  }
  fail(stage) {
    if (this.failAt === stage && this.failCount > 0) {
      this.failCount--;
      throw Object.assign(new Error("injected test deadlock"), { code: "ER_LOCK_DEADLOCK", errno: 1213 });
    }
  }
  async query(rawSql, args = [], state = this.state) {
    const sql = rawSql.replace(/\s+/g, " ").trim();
    if (sql.startsWith("SELECT id, email, password_hash")) return [[{ id: 12, email: "qa@example.test", password_hash: this.hash }]];
    if (sql.startsWith("SELECT id FROM users")) return [[{ id: args[0] }]];
    if (sql.startsWith("SELECT id, name, unit FROM habit_types")) {
      return [[{ id: args[0] === "sleep" ? 2 : 1, name: args[0], unit: args[0] === "sleep" ? "hours" : "cups" }]];
    }
    if (sql.startsWith("SELECT 1 FROM user_hidden_habit_types")) return [[]];
    if (sql.startsWith("SELECT id FROM custom_habits")) return [args[0] === 1 && args[1] === 12 ? [{ id: 1 }] : []];
    if (sql.startsWith("SELECT value FROM habit_entries")) {
      const value = state.entries[`standard:${args[0]}:${args[1]}:${args[2]}`];
      return [value === undefined ? [] : [{ value }]];
    }
    if (sql.startsWith("SELECT value FROM custom_habit_entries")) {
      const value = state.entries[`custom:12:${args[0]}:${args[1]}`];
      return [value === undefined ? [] : [{ value }]];
    }
    if (sql.startsWith("INSERT INTO habit_entries")) {
      this.fail("insert");
      state.entries[`standard:${args[0]}:${args[1]}:${args[2]}`] = args[3];
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("INSERT INTO custom_habit_entries")) {
      this.fail("insert");
      state.entries[`custom:12:${args[0]}:${args[1]}`] = args[2];
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("SELECT COALESCE(SUM(points)")) return [[{ balance: state.points.filter((p) => p.userId === args[0]).reduce((n, p) => n + p.points, 0) }]];
    if (sql.startsWith("INSERT INTO completions")) {
      const [userId, activityType, activityId, completionDate] = args;
      state.completions.push({ id: state.completions.length + 1, userId, activityType, activityId, completionDate, reversed: false });
      return [{ insertId: state.completions.length }];
    }
    if (sql.startsWith("INSERT INTO point_transactions")) {
      state.points.push({ userId: args[0], completionId: args[1], points: args[2] });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("SELECT COUNT(*) AS totalCompletions")) {
      this.fail("metrics"); // Entry, completion AND point writes have already occurred.
      const active = state.completions.filter((c) => c.userId === args[0] && !c.reversed);
      return [[{ totalCompletions: active.length, taskCompletions: 0, habitCompletions: active.length }]];
    }
    if (sql.startsWith("SELECT id, code, name")) return [[]];
    if (sql.startsWith("SELECT id FROM completions")) {
      return [state.completions.filter((c) => c.userId === args[0] && c.activityType === args[1] &&
        c.activityId === args[2] && c.completionDate === args[3] && !c.reversed)];
    }
    if (sql.startsWith("UPDATE completions SET reversed_at")) {
      state.completions.find((c) => c.id === args[0]).reversed = true;
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }
}

test("real habit routes recover from deadlocks without duplicate committed entries or points", async (t) => {
  const reportedErrors = [];
  const originalError = console.error;
  console.error = (error) => reportedErrors.push(error);
  t.after(() => { console.error = originalError; });
  const db = new SaveDb();
  const dbPath = require.resolve("../db");
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
  // Observe the existing app's listener without adding a production test endpoint
  // or changing how index.js starts. PORT=0 allocates an ephemeral test port.
  process.env.PORT = "0";
  const originalListen = express.application.listen;
  let server;
  express.application.listen = function (...args) { server = originalListen.apply(this, args); return server; };
  try { require("../index"); } finally { express.application.listen = originalListen; }
  if (!server.listening) await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const root = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  const request = (path, method, body) => fetch(`${root}${path}`, {
    method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(body),
  });
  const login = await request("/api/login", "POST", { email: "qa@example.test", password: "test-only-password" });
  assert.equal(login.status, 200);
  cookie = login.headers.get("set-cookie").split(";")[0];
  const save = (path, value) => request(path, "PUT", { entryDate: "2026-11-11", value });

  db.failAt = "insert"; db.failCount = 1;
  const water = await save("/api/users/12/habits/water", 4);
  assert.equal(water.status, 200, await water.clone().text());
  assert.equal((await water.json()).pointsChange, 5); // Original positive-entry rule is unchanged.
  assert.equal(db.rollbacks, 1);
  assert.equal(Object.keys(db.state.entries).length, 1);
  assert.equal(db.state.points.length, 1);
  assert.equal((await (await save("/api/users/12/habits/water", 4)).json()).pointsChange, 0);

  db.failAt = "metrics"; db.failCount = 1;
  const custom = await save("/api/custom-habits/1/entries", 15);
  assert.equal(custom.status, 200, await custom.clone().text());
  assert.equal((await custom.json()).pointsChange, 5);
  assert.equal(db.rollbacks, 2);
  assert.equal(db.state.points.length, 2); // The rolled-back award was not counted twice.
  assert.equal(db.state.completions.length, 2);
  assert.equal((await (await save("/api/custom-habits/1/entries", 15)).json()).pointsChange, 0);

  const zero = await save("/api/users/12/habits/water", 0);
  assert.equal((await zero.json()).pointsChange, -5);
  assert.equal((await (await save("/api/users/12/habits/water", 0)).json()).pointsChange, 0);
  assert.equal((await save("/api/users/13/habits/water", 4)).status, 403);
  assert.equal((await save("/api/custom-habits/999/entries", 4)).status, 404);

  db.failAt = "insert"; db.failCount = 10;
  const before = structuredClone(db.state);
  assert.equal((await save("/api/users/12/habits/sleep", 8)).status, 503);
  assert.deepEqual(db.state, before);
  assert.equal(db.borrowed, db.released);
  assert.deepEqual(reportedErrors.filter((e) => e instanceof Error).map((e) => e.httpStatus || e.code), [404, "ER_LOCK_DEADLOCK"]);
});
