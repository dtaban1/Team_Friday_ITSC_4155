const { test } = require("node:test");
const assert = require("node:assert/strict");
const { targetOnDate, isHabitComplete, withCompletion, syncHabitPoints, recordTargetChange, localToday, completedStreak } = require("../habitCompletion");

const { CompletionDb } = require("./helpers/completionDb");

test("one completion predicate covers positive, zero, fractional and target values", () => {
  assert.equal(isHabitComplete(4, 8), false);
  assert.equal(isHabitComplete(8, 8), true);
  assert.equal(isHabitComplete(12, 8), true);
  assert.equal(isHabitComplete(0.25, null), true);
  for (const value of [0, -1, NaN, Infinity, undefined]) assert.equal(isHabitComplete(value, null), false);
  assert.equal(isHabitComplete(0.01, 0.02), false);
});

test("dated targets preserve old days and support removal without cross-habit/account leakage", async () => {
  const rules = [
    { kind: "standard", habitId: 1, effectiveDate: "2026-11-11", target: 8 },
    { kind: "standard", habitId: 1, effectiveDate: "2026-11-12", target: 10 },
    { kind: "standard", habitId: 1, effectiveDate: "2026-11-13", target: null },
    { kind: "custom", habitId: 1, effectiveDate: "2026-11-11", target: 30 },
  ];
  assert.equal(targetOnDate(rules, "standard", 1, "2026-11-10"), null);
  assert.equal(targetOnDate(rules, "standard", 1, "2026-11-11"), 8);
  assert.equal(targetOnDate(rules, "standard", 1, "2026-11-12"), 10);
  assert.equal(targetOnDate(rules, "standard", 1, "2026-11-13"), null);
  assert.equal(targetOnDate(rules, "custom", 1, "2026-11-11"), 30);
  const { targetForDay } = await import("../../src/habitTargetProgress.mjs");
  for (const date of ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]) {
    assert.equal(targetForDay(rules, "standard", 1, date), targetOnDate(rules, "standard", 1, date));
  }
  const db = new CompletionDb();
  assert.equal((await syncHabitPoints(db, { userId: 13, kind: "standard", habitId: 1, entryDate: "2026-11-11", value: 4, today: "2026-11-11" })).completed, true);
});

test("4/8 awards nothing; 8/8 awards once; below target reverses once; no duplicate save points", async () => {
  const db = new CompletionDb();
  const save = (value) => syncHabitPoints(db, { userId: 12, kind: "standard", habitId: 1, entryDate: "2026-11-11", today: "2026-11-11", value });
  assert.equal((await save(4)).pointsChange, 0);
  assert.equal((await save(8)).pointsChange, 5);
  assert.equal((await save(8)).pointsChange, 0);
  assert.equal((await save(12)).pointsChange, 0);
  assert.equal((await save(4)).pointsChange, -5);
  assert.equal((await save(4)).pointsChange, 0);
  assert.equal((await save(8)).pointsBalance, 5);
  assert.equal(db.earned.size, 1); // Previously unlocked achievements remain earned.
});

test("target changes immediately reconcile today's existing entry, not older requirements", async () => {
  const db = new CompletionDb();
  db.entries.push({ userId: 12, habitId: 1, date: "2026-11-11", value: 4 });
  db.rules.push({ userId: 12, kind: "standard", habitId: 1, effectiveDate: "2026-11-10", target: 2 });
  const change = (target) => recordTargetChange(db, { userId: 12, kind: "standard", habitId: 1, target, today: "2026-11-11" });
  assert.equal((await change(4)).pointsChange, 5);
  assert.equal((await change(8)).pointsChange, -5);
  assert.equal((await change(null)).pointsChange, 5);
  assert.equal(targetOnDate(db.rules, "standard", 1, "2026-11-10"), 2);
  assert.equal(db.entries[0].value, 4);
  assert.equal(db.earned.size, 1);
});

test("future-dated values cannot earn points; per-date history uses the same completion status", async () => {
  const db = new CompletionDb();
  assert.equal((await syncHabitPoints(db, { userId: 12, kind: "standard", habitId: 1, entryDate: "2026-11-12", today: "2026-11-11", value: 8 })).pointsChange, 0);
  const entries = withCompletion([
    { kind: "standard", habitId: 1, entryDate: "2026-11-10", value: 4 },
    { kind: "standard", habitId: 1, entryDate: "2026-11-11", value: 4 },
    { kind: "standard", habitId: 1, entryDate: "2026-11-11", value: 8 },
  ], db.rules);
  assert.deepEqual(entries.map((e) => e.completed), [true, false, true]);
  assert.equal(completedStreak(entries.slice(0, 2), "2026-11-11"), 1);
  assert.equal(completedStreak(entries, "2026-11-11"), 2);
  assert.equal(localToday("America/New_York", new Date("2026-11-12T01:00:00Z")), "2026-11-11");
});
