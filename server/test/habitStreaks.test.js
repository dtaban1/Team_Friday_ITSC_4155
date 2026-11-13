const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateStreaks } = require('../habitStreaks');
const period = (startDate,endDate=null,weekdaysMask=127) => ({startDate,endDate,weekdaysMask});
const entry = (entryDate,value=1) => ({entryDate,value});

test("daily habit: today's missing check-in is not overdue", () => {
  assert.deepEqual(calculateStreaks([period('2026-11-09')],[entry('2026-11-09'),entry('2026-11-10'),entry('2026-11-11')],'2026-11-12'),{currentStreak:3,longestStreak:3});
});
test('missed scheduled day breaks current but preserves best', () => {
  assert.deepEqual(calculateStreaks([period('2026-11-08')],[entry('2026-11-08'),entry('2026-11-09'),entry('2026-11-11')],'2026-11-12'),{currentStreak:1,longestStreak:2});
});
test('non-daily habit skips off-days without breaking streak', () => {
  const monWedFri = (1<<1)|(1<<3)|(1<<5);
  assert.deepEqual(calculateStreaks([period('2026-11-02',null,monWedFri)],
    [entry('2026-11-02'),entry('2026-11-04'),entry('2026-11-06'),entry('2026-11-09'),entry('2026-11-11')], '2026-11-12'),{currentStreak:5,longestStreak:5});
});
test('historical schedule changes use each period schedule', () => {
  const mon = 1<<1, thu = 1<<4;
  assert.deepEqual(calculateStreaks([period('2026-11-02','2026-11-04',mon),period('2026-11-05',null,thu)],
    [entry('2026-11-02'),entry('2026-11-05'),entry('2026-11-12')], '2026-11-12'),{currentStreak:3,longestStreak:3});
});
test('reversals/zero check-ins recalculate streaks', () => {
  const periods = [period('2026-11-09')];
  const entries = [entry('2026-11-09'),entry('2026-11-10'),entry('2026-11-11')];
  assert.equal(calculateStreaks(periods,entries,'2026-11-12').currentStreak,3);
  assert.deepEqual(calculateStreaks(periods,[entry('2026-11-09'),entry('2026-11-10',0),entry('2026-11-11')],'2026-11-12'),{currentStreak:1,longestStreak:1});
});
test('future check-ins do not count and unscheduled entries do not count', () => {
  assert.deepEqual(calculateStreaks([period('2026-11-09','2026-11-09',1<<1)],
    [entry('2026-11-09'),entry('2026-11-10'),entry('2026-11-13')],'2026-11-12'),{currentStreak:1,longestStreak:1});
});
test('no schedule returns zero streaks', () => {
  assert.deepEqual(calculateStreaks([], [entry('2026-11-11')],'2026-11-12'),{currentStreak:0,longestStreak:0});
});
