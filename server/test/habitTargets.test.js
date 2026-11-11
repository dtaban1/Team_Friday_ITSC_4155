const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createHabitTargetsRouter, validTarget } = require("../habitTargets");

// Exercises real HTTP routes with a SQL-shaped database double. Live MySQL
// persistence/schema verification is separately documented in README_TARGETS.md.
class TargetDb {
  constructor() {
    this.targets = [];
    this.custom = [{ id: 1, userId: 12 }, { id: 2, userId: 13 }];
    this.entries = [{ userId: 12, kind: "standard", habitId: 1, value: 4, entryDate: "2026-11-10" }];
    this.log = [];
    this.released = 0;
    this.rollbacks = 0;
  }
  async getConnection() {
    return { query: this.query.bind(this), beginTransaction: async () => {}, commit: async () => {},
      rollback: async () => { this.rollbacks++; }, release: () => { this.released++; } };
  }
  async query(raw, args) {
    const sql = raw.replace(/\s+/g, " ").trim();
    this.log.push({ sql, args });
    if (sql.startsWith("SELECT id FROM habit_types")) return [args[0] === 1 ? [{ id: 1 }] : []];
    if (sql.startsWith("SELECT id FROM custom_habits")) return [this.custom.filter((h) => h.id === args[0] && h.userId === args[1])];
    if (sql.startsWith("SELECT IF(")) return [this.targets.filter((t) => t.userId === args[0])
      .map(({ kind, habitId, target }) => ({ kind, habitId, target }))];
    if (sql.startsWith("INSERT INTO habit_targets")) {
      const [userId, standardId, customId, target] = args;
      const kind = standardId === null ? "custom" : "standard";
      const habitId = standardId ?? customId;
      const row = this.targets.find((t) => t.userId === userId && t.kind === kind && t.habitId === habitId);
      if (row) row.target = target;
      else this.targets.push({ userId, kind, habitId, target });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("DELETE FROM habit_targets")) {
      const kind = sql.includes("standard_habit_id") ? "standard" : "custom";
      this.targets = this.targets.filter((t) => !(t.userId === args[0] && t.kind === kind && t.habitId === args[1]));
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }
}

async function setup(t) {
  const db = new TargetDb();
  const app = express();
  app.use(express.json());
  // Test-only identity stub; the production mount uses express-session.
  app.use((req, _res, next) => { req.session = { userId: Number(req.get("X-Test-User")) || null }; next(); });
  app.use("/api/habit-targets", createHabitTargetsRouter(db, { clientUrl: "http://localhost:5173" }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const call = (path = "", { method = "GET", user = 12, origin = "http://localhost:5173", body } = {}) =>
    fetch(`http://127.0.0.1:${server.address().port}/api/habit-targets${path}`, {
      method, headers: { "Content-Type": "application/json", "X-Test-User": String(user), ...(origin ? { Origin: origin } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return { db, call, put: (path, target, options = {}) => call(path, { method: "PUT", body: { target }, ...options }) };
}

test("targets accept positive quantities with two decimal places and reject coercible/unsafe values", () => {
  for (const value of [0.01, 0.25, 8, 30, 99999999.99]) assert.equal(validTarget(value), true, String(value));
  for (const value of [0, -1, 0.001, 0.000000001, 1.005, 100000000, Infinity, NaN, null, true, "8", "", {}, []]) {
    assert.equal(validTarget(value), false, String(value));
  }
});

test("all target endpoints require a session", async (t) => {
  const { call } = await setup(t);
  for (const [path, method] of [["", "GET"], ["/standard/1", "PUT"], ["/custom/1", "DELETE"]]) {
    assert.equal((await call(path, { user: 0, method, ...(method === "PUT" ? { body: { target: 8 } } : {}) })).status, 401);
  }
});

test("writes reject missing/untrusted origins", async (t) => {
  const { call, put } = await setup(t);
  for (const origin of [null, "https://evil.example"]) {
    assert.equal((await put("/standard/1", 8, { origin })).status, 403);
    assert.equal((await call("/standard/1", { method: "DELETE", origin })).status, 403);
  }
});

test("targets create, reload, edit and remove without touching saved entries", async (t) => {
  const { call, put, db } = await setup(t);
  const before = structuredClone(db.entries);
  assert.equal((await put("/standard/1", 8)).status, 200);
  const response = await call();
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), [{ kind: "standard", habitId: 1, target: 8 }]);
  await put("/standard/1", 10);
  assert.equal(db.targets.length, 1);
  assert.equal((await (await call()).json())[0].target, 10);
  assert.equal((await call("/standard/1", { method: "DELETE" })).status, 200);
  assert.deepEqual(await (await call()).json(), []);
  assert.deepEqual(db.entries, before);
  assert.equal(db.log.some(({ sql }) => /UPDATE habit_entries|DELETE FROM habit_entries|custom_habit_entries/.test(sql)), false);
  assert.equal(db.released, 3);
});

test("standard and custom IDs never collide, and custom targets are editable", async (t) => {
  const { call, put } = await setup(t);
  await put("/standard/1", 8);
  await put("/custom/1", 30);
  await put("/custom/1", 45);
  assert.deepEqual(await (await call()).json(), [
    { kind: "standard", habitId: 1, target: 8 }, { kind: "custom", habitId: 1, target: 45 },
  ]);
  await call("/custom/1", { method: "DELETE" });
  assert.deepEqual(await (await call()).json(), [{ kind: "standard", habitId: 1, target: 8 }]);
});

test("built-in targets belong to each user, not the shared catalog", async (t) => {
  const { call, put } = await setup(t);
  await put("/standard/1", 8);
  await put("/standard/1", 12, { user: 13 });
  assert.deepEqual(await (await call()).json(), [{ kind: "standard", habitId: 1, target: 8 }]);
  assert.deepEqual(await (await call("", { user: 13 })).json(), [{ kind: "standard", habitId: 1, target: 12 }]);
});

test("another user cannot set or remove an owned custom habit target", async (t) => {
  const { call, put, db } = await setup(t);
  await put("/custom/1", 30);
  assert.deepEqual(await (await call("", { user: 13 })).json(), []);
  assert.equal((await put("/custom/1", 60, { user: 13 })).status, 404);
  assert.equal((await call("/custom/1", { method: "DELETE", user: 13 })).status, 404);
  assert.equal(db.targets[0].target, 30);
  assert.equal(db.rollbacks, 2);
});

test("invalid target payloads do not change an existing target", async (t) => {
  const { call, put, db } = await setup(t);
  await put("/standard/1", 8);
  for (const target of [0, -8, null, true, "8", 0.001, 100000000]) assert.equal((await put("/standard/1", target)).status, 400);
  assert.equal((await call("/standard/1", { method: "PUT", body: {} })).status, 400);
  assert.equal(db.targets[0].target, 8);
});

test("malformed IDs, unknown kinds and nonexistent habits are rejected", async (t) => {
  const { put, call } = await setup(t);
  for (const path of ["/standard/0", "/standard/-1", "/standard/1.5", "/standard/1e0", "/standard/4294967296", "/unknown/1"]) {
    assert.equal((await put(path, 8)).status, 400, path);
    assert.equal((await call(path, { method: "DELETE" })).status, 400, path);
  }
  assert.equal((await put("/standard/999", 8)).status, 404);
  assert.equal((await put("/custom/999", 8)).status, 404);
});

test("database failures return a controlled error and release connections", async (t) => {
  const { put, db } = await setup(t);
  db.query = async () => { throw Object.assign(new Error("test database failure"), { code: "TEST_DB_ERROR" }); };
  assert.equal((await put("/standard/1", 8)).status, 500);
  assert.equal(db.released, 1);
  assert.equal(db.rollbacks, 1);
});

test("quantity progress handles missing, partial, reached, exceeded and changed targets", async () => {
  const { targetProgress, habitTargetKey } = await import("../../src/habitTargetProgress.mjs");
  assert.equal(targetProgress(4, null), null);
  assert.equal(targetProgress(4, 0), null);
  assert.deepEqual(targetProgress(0, 8), { value: 0, target: 8, percent: 0, reached: false });
  assert.deepEqual(targetProgress(4, 8), { value: 4, target: 8, percent: 50, reached: false });
  assert.deepEqual(targetProgress(8, 8), { value: 8, target: 8, percent: 100, reached: true });
  assert.deepEqual(targetProgress(12, 8), { value: 12, target: 8, percent: 100, reached: true });
  assert.equal(targetProgress(4, 10).percent, 40);
  assert.equal(targetProgress(0.01, 0.02).percent, 50);
  assert.equal(targetProgress(99.99, 100).percent, 99);
  assert.equal(targetProgress(99.99, 100).reached, false);
  assert.equal(targetProgress(undefined, 30).value, 0);
  assert.notEqual(habitTargetKey("standard", 1), habitTargetKey("custom", 1));
});
