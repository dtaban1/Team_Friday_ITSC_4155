const { setSchedule } = require("./habitHistory");
// The server owns the preset catalog: clients send IDs, never arbitrary habit names/units.
// Reusing a habit name across groups intentionally refers to the same tracked habit.
const HABIT_GROUPS = [
  {
    id: "fitness-basics",
    category: "Fitness",
    name: "Everyday Fitness",
    description: "Build an active routine with movement, flexibility, and hydration.",
    habits: [
      { id: "exercise", name: "Exercise", unit: "minutes" },
      { id: "stretching", name: "Stretching", unit: "minutes" },
      { id: "steps", name: "Steps", unit: "steps" },
      { id: "water", name: "Water", unit: "cups" },
    ],
  },
  {
    id: "fitness-recovery",
    category: "Fitness",
    name: "Recovery & Mobility",
    description: "Make time to recover after workouts and stay flexible.",
    habits: [
      { id: "stretching", name: "Stretching", unit: "minutes" },
      { id: "walk", name: "Outdoor Walk", unit: "minutes" },
      { id: "sleep", name: "Sleep", unit: "hours" },
    ],
  },
  {
    id: "study-exams",
    category: "Studying",
    name: "Exam Preparation",
    description: "Stay consistent with studying and practice problems.",
    habits: [
      { id: "study-time", name: "Study Time", unit: "minutes" },
      { id: "practice-problems", name: "Practice Problems", unit: "problems" },
      { id: "review-notes", name: "Review Notes", unit: "minutes" },
    ],
  },
  {
    id: "study-language",
    category: "Studying",
    name: "Language Learning",
    description: "Practice a little each day to build language skills.",
    habits: [
      { id: "vocabulary", name: "New Vocabulary", unit: "words" },
      { id: "language-practice", name: "Language Practice", unit: "minutes" },
      { id: "review-notes", name: "Review Notes", unit: "minutes" },
    ],
  },
  {
    id: "reading-daily",
    category: "Reading",
    name: "Daily Reader",
    description: "Read regularly and keep a record of your progress.",
    habits: [
      { id: "read-pages", name: "Read Pages", unit: "pages" },
      { id: "reading-time", name: "Reading Time", unit: "minutes" },
      { id: "reading-notes", name: "Reading Notes", unit: "notes" },
    ],
  },
  {
    id: "reading-bookclub",
    category: "Reading",
    name: "Book Club",
    description: "Keep up with your book and discuss what you've read.",
    habits: [
      { id: "read-pages", name: "Read Pages", unit: "pages" },
      { id: "reading-notes", name: "Reading Notes", unit: "notes" },
      { id: "book-discussion", name: "Book Discussion", unit: "minutes" },
    ],
  },
  {
    id: "gaming-practice",
    category: "Gaming",
    name: "Improve Your Game",
    description: "Practice skills and reflect on your gameplay.",
    habits: [
      { id: "game-practice", name: "Game Practice", unit: "minutes" },
      { id: "game-review", name: "Review Gameplay", unit: "minutes" },
      { id: "practice-matches", name: "Practice Matches", unit: "matches" },
    ],
  },
  {
    id: "gaming-balance",
    category: "Gaming",
    name: "Balanced Gaming",
    description: "Enjoy games while staying mindful of your screen time.",
    habits: [
      { id: "gaming-time", name: "Gaming Time", unit: "minutes" },
      { id: "screen-breaks", name: "Screen Breaks", unit: "breaks" },
      { id: "stretching", name: "Stretching", unit: "minutes" },
    ],
  },
  {
    id: "wellness-mindful",
    category: "Wellness",
    name: "Mindfulness",
    description: "Make room for relaxation and reflection in your day.",
    habits: [
      { id: "meditation", name: "Meditation", unit: "minutes" },
      { id: "journaling", name: "Journaling", unit: "minutes" },
      { id: "sleep", name: "Sleep", unit: "hours" },
    ],
  },
  {
    id: "creative-projects",
    category: "Creativity",
    name: "Creative Practice",
    description: "Keep making time for the hobbies you love.",
    habits: [
      { id: "creative-time", name: "Creative Time", unit: "minutes" },
      { id: "sketching", name: "Sketching", unit: "minutes" },
      { id: "journaling", name: "Journaling", unit: "minutes" },
    ],
  },
];

function findHabitGroup(id) {
  return HABIT_GROUPS.find((group) => group.id === id);
}

// Returns only known, nonduplicated habit IDs from the requested group.
function validateSelectedHabits(group, habitIds) {
  if (!Array.isArray(habitIds) || habitIds.length === 0) {
    throw new RangeError("Select at least one habit from this group.");
  }
  if (habitIds.some((id) => typeof id !== "string") || new Set(habitIds).size !== habitIds.length) {
    throw new RangeError("Choose valid, unique habits from this group.");
  }
  const byId = new Map(group.habits.map((habit) => [habit.id, habit]));
  const selected = habitIds.map((id) => byId.get(id));
  if (selected.some((habit) => !habit)) {
    throw new RangeError("This group contains an unknown habit selection.");
  }
  // Consistent lock ordering helps when groups with overlapping habits are added at once.
  return selected.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

async function addHabitsFromGroup(connection, userId, selected) {
  const added = [];
  const restored = [];
  const skipped = [];

  // Built-in habits already belong to all accounts unless intentionally hidden.
  const [builtIns] = await connection.query("SELECT id, name FROM habit_types");
  const builtInByName = new Map(builtIns.map((habit) => [habit.name.toLowerCase(), habit]));

  for (const habit of selected) {
    const builtIn = builtInByName.get(habit.name.toLowerCase());
    if (builtIn) {
      const [result] = await connection.query(
        "DELETE FROM user_hidden_habit_types WHERE user_id = ? AND habit_type_id = ?",
        [userId, builtIn.id]
      );
      if (result.affectedRows) await setSchedule(connection,userId,"standard",builtIn.id,true);
      (result.affectedRows ? restored : skipped).push(habit.name);
      continue;
    }

    const [existing] = await connection.query(
      "SELECT id, is_active FROM custom_habits WHERE user_id = ? AND name = ? LIMIT 1 FOR UPDATE",
      [userId, habit.name]
    );
    if (existing.length) {
      if (existing[0].is_active) {
        skipped.push(habit.name);
      } else {
        await connection.query("UPDATE custom_habits SET is_active = 1 WHERE id = ? AND user_id = ?", [existing[0].id, userId]);
        await setSchedule(connection,userId,"custom",existing[0].id,true);
        restored.push(habit.name);
      }
      continue;
    }

    // The unique (user_id, name) index prevents duplicate rows even across requests.
    const [result] = await connection.query(
      "INSERT IGNORE INTO custom_habits (user_id, name, unit) VALUES (?, ?, ?)",
      [userId, habit.name, habit.unit]
    );
    if (result.affectedRows) {
      await setSchedule(connection,userId,"custom",result.insertId,true);
      added.push(habit.name);
    } else {
      // Another request inserted the same habit while this one was in progress.
      const [race] = await connection.query(
        "SELECT id, is_active FROM custom_habits WHERE user_id = ? AND name = ? LIMIT 1 FOR UPDATE",
        [userId, habit.name]
      );
      if (!race.length) throw new Error("Habit could not be saved.");
      if (race[0].is_active) {
        skipped.push(habit.name);
      } else {
        await connection.query("UPDATE custom_habits SET is_active = 1 WHERE id = ? AND user_id = ?", [race[0].id, userId]);
        await setSchedule(connection,userId,"custom",race[0].id,true);
        restored.push(habit.name);
      }
    }
  }
  return { added, restored, skipped };
}

module.exports = { HABIT_GROUPS, findHabitGroup, validateSelectedHabits, addHabitsFromGroup };
