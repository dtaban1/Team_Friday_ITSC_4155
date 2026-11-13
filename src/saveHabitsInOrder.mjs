// Jobs must be functions, not already-started promises. Stop on the first error.
export async function saveHabitsInOrder(jobs) {
  const results = [];
  for (const job of jobs) results.push(await job());
  return results;
}
