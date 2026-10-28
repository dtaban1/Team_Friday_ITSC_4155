const { test } = require("node:test");
const assert = require("node:assert/strict");
const { calendar, previousDay, decodeImage, validateReward, rewardStatus, MAX_IMAGE_BYTES } = require("../rewardRules");

const NOW = new Date("2026-10-28T16:00:00Z");
const base = { id: 1, title: "Movie night", targetType: "task", targetId: 10, timeZone: "America/New_York" };
const context = (overrides = {}) => ({ tasks: [], goals: [], events: [], habits: [], entries: [], ...overrides });
const entries = (days, overrides = {}) => days.map((entryDate) => ({ habitId: 10, kind: "standard", entryDate, ...overrides }));
const status = (reward, ctx, claims = []) => rewardStatus({ ...base, ...reward }, context(ctx), claims, NOW);

test("calendar uses the reward's saved time zone and crosses DST/month/year correctly", () => {
  assert.deepEqual(calendar("America/New_York", new Date("2026-10-29T01:00:00Z")), { today: "2026-10-28", time: "21:00" });
  assert.equal(calendar("Asia/Kathmandu", new Date("2026-10-29T01:00:00Z")).today, "2026-10-29");
  assert.equal(previousDay("2026-01-01"), "2025-12-31");
  assert.equal(previousDay("2026-11-02"), "2026-11-01");
  assert.equal(previousDay("2028-03-01"), "2028-02-29");
  assert.throws(() => calendar("not/a/zone"));
});

test("reward validation covers supported types, titles, IDs, time zones, and milestones", () => {
  const valid = { title: "  My treat  ", targetType: "habit", targetId: 5, habitKind: "custom", milestoneDays: 7, timeZone: "UTC" };
  assert.equal(validateReward(valid).title, "My treat");
  for (const change of [{ title: " " }, { title: "a".repeat(121) }, { description: "a".repeat(501) },
    { targetType: "users; DROP TABLE users" }, { targetId: -1 }, { targetId: 2.5 }, { targetId: Number.MAX_SAFE_INTEGER + 1 },
    { habitKind: "other" }, { milestoneDays: 0 }, { milestoneDays: 366 }, { milestoneDays: 1.5 },
    { timeZone: null }, { timeZone: "not-a-time-zone" }]) assert.throws(() => validateReward({ ...valid, ...change }));
  const daily = validateReward({ title: "Snack", targetType: "daily", timeZone: "UTC", targetId: 200 });
  assert.equal(daily.targetId, null);
});

test("photos accept actual supported signatures and reject MIME spoofing, SVG, malformed and oversized data", () => {
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5ioAAAAASUVORK5CYII=";
  assert.equal(decodeImage(png).mime, "image/png");
  assert.equal(decodeImage(null).bytes, null);
  for (const image of [png.replace("image/png", "image/jpeg"), "data:image/svg+xml;base64,PHN2Zz4=", "data:image/png;base64,AAAA",
    "data:image/png;base64,@@@@", 23, `data:image/png;base64,${Buffer.alloc(MAX_IMAGE_BYTES + 1).toString("base64")}`]) {
    assert.throws(() => decodeImage(image));
  }
});

test("tasks and goals require completion; deleted/missing links are locked", () => {
  for (const targetType of ["task", "goal"]) {
    const key = `${targetType}s`;
    assert.equal(status({ targetType }, { [key]: [{ id: 10, completed: false }] }).eligible, false);
    assert.equal(status({ targetType }, { [key]: [{ id: 10, completed: true }] }).eligible, true);
    assert.equal(status({ targetType }, { [key]: [{ id: 11, completed: true }] }).eligible, false);
    assert.equal(status({ targetType }, { [key]: [] }).eligible, false);
  }
});

test("one-time rewards cannot be claimed twice even if a task is reopened and completed again", () => {
  assert.equal(status({}, { tasks: [{ id: 10, completed: true }] }, [{ rewardId: 1, periodKey: "once" }]).reason, "Already claimed");
  assert.equal(status({}, { tasks: [{ id: 10, completed: true }] }, [{ rewardId: 2, periodKey: "once" }]).eligible, true);
});

test("events unlock at the scheduled local time, not before; untimed events unlock that day", () => {
  const check = (eventDate, eventTime) => status({ targetType: "event" }, { events: [{ id: 10, eventDate, eventTime }] }).eligible;
  assert.equal(check("2026-10-28", "12:01"), false);
  assert.equal(check("2026-10-28", "12:00"), true);
  assert.equal(check("2026-10-28", null), true);
  assert.equal(check("2026-10-29", null), false);
  assert.equal(check("2026-10-27", "23:59"), true);
});

test("habit milestones count distinct days for exactly one habit kind and ignore future logs", () => {
  const reward = { targetType: "habit", habitKind: "custom", milestoneDays: 2 };
  const ctx = { habits: [{ id: 10, kind: "custom" }], entries: [
    ...entries(["2026-10-26", "2026-10-26", "2026-10-29"], { kind: "custom" }),
    ...entries(["2026-10-27"]), // Same numeric ID, different habit kind.
  ] };
  assert.equal(status(reward, ctx).progress, 1);
  assert.equal(status(reward, ctx).eligible, false);
  ctx.entries.push(...entries(["2026-10-28"], { kind: "custom" }));
  assert.equal(status(reward, ctx).eligible, true);
  assert.equal(status(reward, { ...ctx, habits: [] }).eligible, false);
});

test("daily rewards require activity today and are once per reward per local date", () => {
  const ctx = { entries: entries(["2026-10-27", "2026-10-29"]) };
  assert.equal(status({ targetType: "daily" }, ctx).eligible, false);
  ctx.entries.push(...entries(["2026-10-28"]));
  assert.equal(status({ targetType: "daily" }, ctx).eligible, true);
  assert.equal(status({ targetType: "daily" }, ctx, [{ rewardId: 1, periodKey: "2026-10-28" }]).reason, "Claimed today");
  assert.equal(status({ targetType: "daily" }, ctx, [{ rewardId: 1, periodKey: "2026-10-27" }]).eligible, true);
});

test("seven-day rewards require seven consecutive dates including today; duplicates don't inflate", () => {
  const dates = Array.from({ length: 7 }, (_, index) => previousDay("2026-10-28", index));
  assert.equal(status({ targetType: "seven_day" }, { entries: entries(dates) }).eligible, true);
  assert.equal(status({ targetType: "seven_day" }, { entries: entries(dates.slice(1)) }).eligible, false);
  assert.equal(status({ targetType: "seven_day" }, { entries: entries(dates.filter((day) => day !== "2026-10-25")) }).eligible, false);
  assert.equal(status({ targetType: "seven_day" }, { entries: entries(Array(7).fill("2026-10-28")) }).eligible, false);
});

test("seven-day claims never reuse an overlapping seven-day window", () => {
  const ctx = { entries: entries(Array.from({ length: 14 }, (_, i) => previousDay("2026-10-28", i))) };
  for (const daysAgo of [0, 1, 6]) assert.equal(status({ targetType: "seven_day" }, ctx,
    [{ rewardId: 1, periodKey: previousDay("2026-10-28", daysAgo) }]).eligible, false);
  assert.equal(status({ targetType: "seven_day" }, ctx, [{ rewardId: 1, periodKey: "2026-10-21" }]).eligible, true);
});
