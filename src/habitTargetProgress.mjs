export const habitTargetKey = (kind, id) => `${kind}:${id}`;

export function targetProgress(value, target) {
  const quantity = Number(value);
  const goal = Number(target);
  if (!Number.isFinite(goal) || goal <= 0) return null;
  const logged = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  const reached = logged >= goal;
  return { value: logged, target: goal, percent: reached ? 100 : Math.min(99, Math.round(logged / goal * 100)), reached };
}
