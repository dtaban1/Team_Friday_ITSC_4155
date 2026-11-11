export const habitTargetKey = (kind, id) => `${kind}:${id}`;

// Mirrors the server's date lookup for displaying requirements on unlogged days.
// Completion itself is always supplied by the server, never trusted from the UI.
export function targetForDay(rules, kind, habitId, date) {
  let latest = null;
  for (const rule of rules) {
    if (rule.kind === kind && Number(rule.habitId) === Number(habitId) && rule.effectiveDate <= date &&
        (!latest || rule.effectiveDate > latest.effectiveDate)) latest = rule;
  }
  return latest?.target == null ? null : Number(latest.target);
}

export function targetProgress(value, target) {
  const quantity = Number(value);
  const goal = Number(target);
  if (!Number.isFinite(goal) || goal <= 0) return null;
  const logged = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  const reached = logged >= goal;
  return { value: logged, target: goal, percent: reached ? 100 : Math.min(99, Math.round(logged / goal * 100)), reached };
}
