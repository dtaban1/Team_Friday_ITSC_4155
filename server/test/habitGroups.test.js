const { test } = require("node:test");
const assert = require("node:assert/strict");
const { HABIT_GROUPS, findHabitGroup, validateSelectedHabits, addHabitsFromGroup } = require("../habitGroups");

// Small SQL adapter to exercise the import/skip/restore behavior without a live MySQL server.
class FakeConnection {
  constructor() {
    this.custom = [];
    this.hidden = new Set();
    this.nextId = 1;
    this.queries = [];
  }
  async query(sql, args = []) {
    this.queries.push([sql, args]);
    if (sql === "SELECT id, name FROM habit_types") {
      return [[{ id: 1, name: "water" }, { id: 2, name: "sleep" }]];
    }
    if (sql.startsWith("DELETE FROM user_hidden_habit_types")) {
      const key = `${args[0]}-${args[1]}`;
      const existed = this.hidden.delete(key);
      return [{ affectedRows: Number(existed) }];
    }
    if (sql.startsWith("SELECT id, is_active FROM custom_habits")) {
      return [this.custom.filter((row) => row.user_id === args[0] && row.name.toLowerCase() === args[1].toLowerCase())];
    }
    if (sql.startsWith("INSERT IGNORE INTO custom_habits")) {
      const [user_id, name, unit] = args;
      const duplicate = this.custom.some((row) => row.user_id === user_id && row.name.toLowerCase() === name.toLowerCase());
      if (duplicate) return [{ affectedRows: 0 }];
      this.custom.push({ id: this.nextId++, user_id, name, unit, is_active: 1 });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith("UPDATE custom_habits SET is_active")) {
      const row = this.custom.find((item) => item.id === args[0] && item.user_id === args[1]);
      row.is_active = 1;
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }
}

test("catalog IDs, categories, and units are valid and names are consistent", () => {
  assert.ok(HABIT_GROUPS.length >= 8);
  assert.deepEqual(new Set(HABIT_GROUPS.map((group) => group.category)),
    new Set(["Fitness", "Studying", "Reading", "Gaming", "Wellness", "Creativity"]));
  assert.equal(new Set(HABIT_GROUPS.map((group) => group.id)).size, HABIT_GROUPS.length);
  const units = new Map();
  for (const group of HABIT_GROUPS) {
    assert.equal(new Set(group.habits.map((habit) => habit.id)).size, group.habits.length);
    for (const habit of group.habits) {
      assert.ok(habit.name.length <= 50 && habit.unit.length <= 30);
      const old = units.get(habit.name.toLowerCase());
      if (old) assert.equal(old, habit.unit, `Inconsistent unit for ${habit.name}`);
      units.set(habit.name.toLowerCase(), habit.unit);
    }
  }
});

test("selection validation rejects empty, duplicate, or unknown IDs", () => {
  const group = findHabitGroup("study-exams");
  assert.equal(findHabitGroup("not-a-real-group"), undefined);
  for (const selection of [[], ["fake"], ["study-time", "study-time"], [99], "study-time", null]) {
    assert.throws(() => validateSelectedHabits(group, selection), RangeError);
  }
  assert.deepEqual(validateSelectedHabits(group, ["study-time"]).map((item) => item.name), ["Study Time"]);
});

test("selective group adds persist account-specific rows and second add skips duplicates", async () => {
  const db = new FakeConnection();
  const group = findHabitGroup("study-exams");
  const selection = validateSelectedHabits(group, ["study-time", "practice-problems"]);
  assert.deepEqual(await addHabitsFromGroup(db, 12, selection), {
    added: ["Practice Problems", "Study Time"], restored: [], skipped: [],
  });
  assert.equal(db.custom.length, 2);
  assert.deepEqual(await addHabitsFromGroup(db, 12, selection), {
    added: [], restored: [], skipped: ["Practice Problems", "Study Time"],
  });
  assert.equal(db.custom.length, 2);
  assert.deepEqual((await addHabitsFromGroup(db, 13, selection)).added,
    ["Practice Problems", "Study Time"]);
  assert.equal(db.custom.length, 4);
});

test("removed habits are restored, preserving identity, and other group overlap is skipped", async () => {
  const db = new FakeConnection();
  db.custom = [{ id: 7, user_id: 12, name: "Read Pages", unit: "pages", is_active: 0 }];
  db.nextId = 8;
  const reading = findHabitGroup("reading-daily");
  const selected = validateSelectedHabits(reading, ["read-pages", "reading-time"]);
  assert.deepEqual(await addHabitsFromGroup(db, 12, selected), {
    added: ["Reading Time"], restored: ["Read Pages"], skipped: [],
  });
  assert.equal(db.custom.find((item) => item.name === "Read Pages").id, 7);
  const club = findHabitGroup("reading-bookclub");
  const second = await addHabitsFromGroup(db, 12, validateSelectedHabits(club, club.habits.map((habit) => habit.id)));
  assert.ok(second.skipped.includes("Read Pages"));
  assert.ok(second.added.includes("Book Discussion"));
  assert.equal(db.custom.filter((item) => item.name === "Read Pages").length, 1);
});

test("built-in Water and Sleep never create duplicate custom habits and restore if hidden", async () => {
  const db = new FakeConnection();
  db.hidden.add("12-1");
  const group = findHabitGroup("fitness-basics");
  const selection = validateSelectedHabits(group, ["water"]);
  assert.deepEqual(await addHabitsFromGroup(db, 12, selection), {
    added: [], restored: ["Water"], skipped: [],
  });
  assert.deepEqual(await addHabitsFromGroup(db, 12, selection), {
    added: [], restored: [], skipped: ["Water"],
  });
  assert.equal(db.custom.length, 0);
});
