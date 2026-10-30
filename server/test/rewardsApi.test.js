const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createRewardsRouter } = require("../rewards");

// SQL-shaped test double: HTTP, middleware and real route code are exercised;
// the separate manual checklist covers live MySQL schema/persistence.
class RewardDb {
  constructor() {
    this.rewards = [];
    this.claims = [];
    this.log = [];
    this.tasks = [{ id: 10, title: "Homework", completed: 1 }];
    this.entries = [{ habitId: 1, kind: "standard", entryDate: "2026-10-28" }];
    this.released = 0;
    this.lock = Promise.resolve();
  }
  async getConnection() {
    let unlock;
    const wait = this.lock;
    this.lock = new Promise((resolve) => { unlock = resolve; });
    await wait;
    return { query: this.query.bind(this), beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {},
      release: () => { this.released++; unlock(); } };
  }
  async query(rawSql, args = []) {
    const sql = rawSql.replace(/\s+/g, " ").trim();
    this.log.push({ sql, args });
    if (sql.startsWith("SELECT id FROM users")) return [[{ id: args[0] }]];
    if (sql.startsWith("SELECT COUNT(*)")) return [[{ count: this.rewards.filter((r) => r.userId === args[0]).length }]];
    if (sql.startsWith("SELECT id, title, completed FROM tasks")) return [args[0] === 12 ? this.tasks : []];
    if (sql.startsWith("SELECT id, title, completed FROM goals")) return [[]];
    if (sql.startsWith("SELECT id, title, DATE_FORMAT")) return [[]];
    if (sql.startsWith("SELECT ht.id")) return [[{ id: 1, title: "water", kind: "standard" }]];
    if (sql.startsWith("SELECT he.habit_type_id")) return [args[0] === 12 ? this.entries : []];
    if (sql.startsWith("SELECT c.id")) return [this.claims.filter((claim) => this.rewards.some((r) => r.id === claim.rewardId && r.userId === args[0]))];
    if (sql.startsWith("SELECT id, title, description")) {
      return [this.rewards.filter((r) => sql.includes("WHERE id = ?") ? r.id === args[0] && r.userId === args[1] : r.userId === args[0])];
    }
    if (sql.startsWith("INSERT INTO rewards")) {
      const [userId, title, description, targetType, targetId, habitKind, milestoneDays, targetLabel, timeZone, image_data, image_mime] = args;
      const id = this.rewards.length + 1;
      this.rewards.push({ id, userId, title, description, targetType, targetId, habitKind, milestoneDays, targetLabel, timeZone,
        hasImage: Boolean(image_data), image_data, image_mime });
      return [{ insertId: id }];
    }
    if (sql.startsWith("INSERT INTO reward_claims")) {
      const [rewardId, periodKey, rewardTitle, targetLabel, note, claimed_at] = args;
      if (this.claims.some((c) => c.rewardId === rewardId && c.periodKey === periodKey)) throw Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" });
      this.claims.push({ id: this.claims.length + 1, rewardId, periodKey, rewardTitle, targetLabel, note,
        claimedAt: `${claimed_at.replace(" ", "T")}Z` });
      return [{ insertId: this.claims.length }];
    }
    if (sql.startsWith("SELECT image_data")) return [this.rewards.filter((r) => r.id === args[0] && r.userId === args[1])];
    if (sql.startsWith("UPDATE rewards SET image_data")) {
      const row = this.rewards.find((r) => r.id === args[2] && r.userId === args[3]);
      if (row) Object.assign(row, { image_data: args[0], image_mime: args[1], hasImage: Boolean(args[0]) });
      return [{ affectedRows: Number(Boolean(row)) }];
    }
    if (sql.startsWith("DELETE FROM rewards")) {
      const row = this.rewards.find((r) => r.id === args[0] && r.userId === args[1]);
      if (row) { this.rewards = this.rewards.filter((r) => r !== row); this.claims = this.claims.filter((c) => c.rewardId !== row.id); }
      return [{ affectedRows: Number(Boolean(row)) }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }
}

async function setup(t) {
  const db = new RewardDb();
  const app = express();
  app.use(express.json({ limit: "3mb" }));
  // Only this test harness trusts this header; the real app uses express-session.
  app.use((req, _res, next) => { req.session = { userId: Number(req.get("X-Test-User")) || null }; next(); });
  app.use("/api/rewards", createRewardsRouter(db, { now: () => new Date("2026-10-28T16:00:00Z") }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/rewards`;
  const call = (path = "", { user = 12, origin = process.env.CLIENT_URL || "http://localhost:5173", method = "GET", body } = {}) => fetch(`${url}${path}`, {
    method, headers: { "Content-Type": "application/json", "X-Test-User": String(user), ...(origin ? { Origin: origin } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const create = (overrides = {}) => call("", { method: "POST", body: { title: "Movie night", targetType: "task", targetId: 10, timeZone: "UTC", ...overrides } });
  return { db, call, create };
}

test("every rewards endpoint and private photo requires a session", async (t) => {
  const { call } = await setup(t);
  for (const [path, method] of [["", "GET"], ["", "POST"], ["/1/claim", "POST"], ["/1/image", "GET"], ["/1/image", "PUT"], ["/1", "DELETE"]]) {
    assert.equal((await call(path, { user: 0, method, body: method === "GET" ? undefined : {} })).status, 401);
  }
});

test("reward writes reject missing/untrusted origins even with a session", async (t) => {
  const { call } = await setup(t);
  for (const origin of [null, "https://evil.example"]) assert.equal((await call("", { origin, method: "POST", body: {} })).status, 403);
});

test("full flow creates a linked reward, claims it, saves history, and rejects duplicates", async (t) => {
  const { call, create, db } = await setup(t);
  assert.equal((await create()).status, 201);
  const response = await call();
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  let data = await response.json();
  assert.equal(data.rewards[0].status.eligible, true);
  assert.equal((await call("/1/claim", { method: "POST", body: { note: "Watched a movie" } })).status, 201);
  assert.equal((await call("/1/claim", { method: "POST", body: {} })).status, 409);
  data = await (await call()).json();
  assert.equal(data.rewards[0].status.reason, "Already claimed");
  assert.equal(data.history[0].note, "Watched a movie");
  assert.equal(db.claims.length, 1);
});

test("simultaneous claim attempts produce one record", async (t) => {
  const { create, call, db } = await setup(t);
  await create();
  const results = await Promise.all([call("/1/claim", { method: "POST", body: {} }), call("/1/claim", { method: "POST", body: {} })]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(db.claims.length, 1);
});

test("another account cannot link, list, claim, change, delete, or view someone else's photo", async (t) => {
  const { create, call } = await setup(t);
  await create();
  assert.equal((await call("", { user: 13, method: "POST", body: { title: "Other task", targetType: "task", targetId: 10, timeZone: "UTC" } })).status, 404);
  assert.deepEqual((await (await call("", { user: 13 })).json()).rewards, []);
  for (const [path, method, body] of [["/1/claim", "POST", {}], ["/1/image", "PUT", { image: null }], ["/1", "DELETE", undefined], ["/1/image", "GET", undefined]]) {
    assert.equal((await call(path, { user: 13, method, body })).status, 404);
  }
});

test("ineligible source, unsafe IDs and long claim notes are rejected", async (t) => {
  const { create, call, db } = await setup(t);
  db.tasks[0].completed = 0;
  await create();
  assert.equal((await call("/1/claim", { method: "POST", body: {} })).status, 409);
  assert.equal((await call("/bad/claim", { method: "POST", body: {} })).status, 400);
  assert.equal((await call("/1/claim", { method: "POST", body: { note: "x".repeat(501) } })).status, 400);
  assert.equal((await create({ targetId: 999 })).status, 404);
});

test("private photos round-trip, reject invalid payloads, and can be removed", async (t) => {
  const { create, call } = await setup(t);
  const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5ioAAAAASUVORK5CYII=";
  await create({ image });
  const response = await call("/1/image");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /image\/png/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(Buffer.from(await response.arrayBuffer()).toString("base64"), image.split(",")[1]);
  assert.equal((await call("/1/image", { method: "PUT", body: { image: "data:image/png;base64,AAAA" } })).status, 400);
  assert.equal((await call("/1/image", { method: "PUT", body: { image: null } })).status, 200);
  assert.equal((await call("/1/image")).status, 404);
});

test("deleting a reward also deletes its history in the schema's cascade model", async (t) => {
  const { create, call } = await setup(t);
  await create();
  await call("/1/claim", { method: "POST", body: {} });
  assert.equal((await call("/1", { method: "DELETE" })).status, 200);
  const data = await (await call()).json();
  assert.equal(data.rewards.length, 0);
  assert.equal(data.history.length, 0);
});
