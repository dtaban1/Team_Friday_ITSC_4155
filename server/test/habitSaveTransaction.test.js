const { test } = require("node:test");
const assert = require("node:assert/strict");
const { habitSaveTransaction, isDeadlock } = require("../habitSaveTransaction");

const deadlock = () => Object.assign(new Error("simulated deadlock"), { code: "ER_LOCK_DEADLOCK", errno: 1213 });

function fakePool(options = {}) {
  const events = [];
  const committed = [];
  const connections = [];
  const pool = {
    async getConnection() {
      if (options.acquireError) throw options.acquireError;
      const id = connections.length + 1;
      let staged = [];
      const connection = {
        async beginTransaction() { events.push([id, "begin"]); if (options.beginError) throw options.beginError; },
        async query(sql, args) {
          events.push([id, "lock", args[0]]);
          assert.equal(sql, "SELECT id FROM users WHERE id = ? FOR UPDATE");
          return [options.missingUser ? [] : [{ id: args[0] }]];
        },
        write(value) { events.push([id, "write"]); staged.push(value); },
        async commit() {
          events.push([id, "commit"]);
          if (options.commitError) throw options.commitError;
          committed.push(...staged); staged = [];
        },
        async rollback() { events.push([id, "rollback"]); staged = []; if (options.rollbackError) throw options.rollbackError; },
        release() { events.push([id, "release"]); },
      };
      connections.push(connection);
      return connection;
    },
  };
  return { pool, events, committed, connections };
}

test("classifies only explicit MySQL deadlocks as retryable", () => {
  assert.equal(isDeadlock(deadlock()), true);
  assert.equal(isDeadlock({ errno: 1213 }), true);
  for (const error of [null, {}, { code: "ER_LOCK_WAIT_TIMEOUT", errno: 1205 }, { sqlState: "40001" }, { code: "ECONNRESET" }]) {
    assert.equal(isDeadlock(error), false);
  }
});

test("locks the account before work, commits once, and releases once", async () => {
  const { pool, events, committed } = fakePool();
  const result = await habitSaveTransaction(pool, 12, async (connection) => { connection.write("entry"); return { saved: true }; });
  assert.deepEqual(result, { saved: true });
  assert.deepEqual(committed, ["entry"]);
  assert.deepEqual(events, [[1, "begin"], [1, "lock", 12], [1, "write"], [1, "commit"], [1, "release"]]);
});

test("retries the whole rolled-back save without duplicate entry/point writes", async () => {
  const { pool, events, committed, connections } = fakePool();
  let calls = 0;
  const waits = [];
  await habitSaveTransaction(pool, 12, async (connection) => {
    calls++;
    connection.write("entry"); connection.write("point-award");
    if (calls < 3) throw deadlock();
  }, { pause: async (ms) => { assert.equal(events.at(-1)[1], "release"); waits.push(ms); } });
  assert.equal(calls, 3);
  assert.equal(connections.length, 3);
  assert.deepEqual(committed, ["entry", "point-award"]);
  assert.deepEqual(waits, [20, 40]);
  assert.equal(events.filter((e) => e[1] === "rollback").length, 2);
  assert.equal(events.filter((e) => e[1] === "release").length, 3);
});

test("stops after three deadlocks and leaves no committed writes", async () => {
  const { pool, events, committed } = fakePool();
  await assert.rejects(habitSaveTransaction(pool, 12, async (connection) => {
    connection.write("entry"); throw deadlock();
  }, { pause: async () => {} }), { code: "ER_LOCK_DEADLOCK" });
  assert.deepEqual(committed, []);
  assert.equal(events.filter((e) => e[1] === "begin").length, 3);
  assert.equal(events.filter((e) => e[1] === "release").length, 3);
});

test("validation/missing habit errors roll back once, without retry", async () => {
  const { pool, events } = fakePool();
  const error = Object.assign(new Error("Habit not found"), { httpStatus: 404 });
  await assert.rejects(habitSaveTransaction(pool, 12, async () => { throw error; }), (e) => e === error);
  assert.deepEqual(events.map((e) => e[1]), ["begin", "lock", "rollback", "release"]);
});

test("missing account does not enter the save callback", async () => {
  const { pool, events } = fakePool({ missingUser: true });
  await assert.rejects(habitSaveTransaction(pool, 12, async () => assert.fail("save must not run")), { httpStatus: 404 });
  assert.equal(events.filter((e) => e[1] === "release").length, 1);
});

test("connection acquisition and BEGIN errors do not leak connections", async () => {
  const error = Object.assign(new Error("connection lost"), { code: "ECONNRESET" });
  const acquire = fakePool({ acquireError: error });
  await assert.rejects(habitSaveTransaction(acquire.pool, 12, async () => assert.fail()), (e) => e === error);
  assert.deepEqual(acquire.events, []);
  const begin = fakePool({ beginError: error });
  await assert.rejects(habitSaveTransaction(begin.pool, 12, async () => assert.fail()), (e) => e === error);
  assert.deepEqual(begin.events.map((e) => e[1]), ["begin", "release"]);
});

test("ambiguous COMMIT failures are not replayed", async () => {
  const error = Object.assign(new Error("lost commit acknowledgement"), { code: "ECONNRESET" });
  const { pool, connections, events } = fakePool({ commitError: error });
  await assert.rejects(habitSaveTransaction(pool, 12, async (connection) => connection.write("entry")), (e) => e === error);
  assert.equal(connections.length, 1);
  assert.deepEqual(events.map((e) => e[1]), ["begin", "lock", "write", "commit", "rollback", "release"]);
});

test("rollback failure stops retries and still releases the connection", async () => {
  const error = deadlock();
  const { pool, connections, events } = fakePool({ rollbackError: new Error("cleanup failed") });
  await assert.rejects(habitSaveTransaction(pool, 12, async () => { throw error; }), (e) => e === error);
  assert.equal(connections.length, 1);
  assert.equal(events.at(-1)[1], "release");
});

test("frontend batch starts Water, Sleep and custom saves one at a time", async () => {
  const { saveHabitsInOrder } = await import("../../src/saveHabitsInOrder.mjs");
  const events = [];
  let active = 0;
  let maxActive = 0;
  const jobs = ["water", "sleep", "reading"].map((name) => async () => {
    active++; maxActive = Math.max(maxActive, active); events.push(`start ${name}`);
    await new Promise((resolve) => setImmediate(resolve));
    events.push(`end ${name}`); active--; return name;
  });
  assert.deepEqual(await saveHabitsInOrder(jobs), ["water", "sleep", "reading"]);
  assert.equal(maxActive, 1);
  assert.deepEqual(events, ["start water", "end water", "start sleep", "end sleep", "start reading", "end reading"]);
});

test("frontend batch stops on an error; later jobs are not started", async () => {
  const { saveHabitsInOrder } = await import("../../src/saveHabitsInOrder.mjs");
  const events = [];
  await assert.rejects(saveHabitsInOrder([
    async () => events.push("water saved"),
    async () => { events.push("sleep failed"); throw new Error("save failed"); },
    async () => events.push("reading saved"),
  ]), /save failed/);
  assert.deepEqual(events, ["water saved", "sleep failed"]);
});
