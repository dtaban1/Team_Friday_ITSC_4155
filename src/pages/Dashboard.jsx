//Dashboard.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../styles/dashboard.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";


function localDateString(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function formatShortDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function PlanningSection({
  kind,
  title,
  icon,
  items,
  dateField,
  dateLabel,
  onCreate,
  onToggle,
  onDelete,
  includeTime = false,
  includeLocation = false,
}) {
  const [itemTitle, setItemTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");
    setIsSaving(true);

    try {
      await onCreate({
        title: itemTitle,
        [dateField]: date,
        ...(includeTime ? { eventTime: time } : {}),
        ...(includeLocation ? { location } : {}),
      });
      setItemTitle("");
      setDate("");
      setTime("");
      setLocation("");
      setMessage(`${kind} added.`);
    } catch (saveError) {
      setMessage(saveError.message || `Could not add ${kind.toLowerCase()}.`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <article className="dashboard-card dashboard-planning-card" id={`${kind.toLowerCase()}s`}>
      <div className="dashboard-card-heading">
        <div>
          <span className="dashboard-card-label">{kind}s</span>
          <h2>{title}</h2>
        </div>
        <span className="dashboard-item-count">{items.length}</span>
      </div>

      <form className="dashboard-planning-form" onSubmit={handleSubmit}>
        <label className="dashboard-field">
          <span>{kind} title</span>
          <input
            value={itemTitle}
            onChange={(event) => setItemTitle(event.target.value)}
            maxLength={120}
            placeholder={`Add a ${kind.toLowerCase()}`}
            required
          />
        </label>

        <label className="dashboard-field">
          <span>{dateLabel}</span>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required={kind === "Event"}
          />
        </label>

        {includeTime && (
          <label className="dashboard-field">
            <span>Time</span>
            <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          </label>
        )}

        {includeLocation && (
          <label className="dashboard-field">
            <span>Location</span>
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              maxLength={120}
              placeholder="Optional location"
            />
          </label>
        )}

        <button className="dashboard-add-item" type="submit" disabled={isSaving}>
          {isSaving ? "Adding..." : `Add ${kind.toLowerCase()}`}
        </button>
        {message && <p className="dashboard-planning-message" role="status">{message}</p>}
      </form>

      {items.length === 0 ? (
        <div className="dashboard-empty-state compact">
          <span aria-hidden="true">{icon}</span>
          <div>
            <strong>No {kind.toLowerCase()}s yet.</strong>
            <p>Add your first {kind.toLowerCase()} above.</p>
          </div>
        </div>
      ) : (
        <div className="dashboard-planning-list">
          {items.map((item) => (
            <div className={`dashboard-planning-row ${item.completed ? "is-complete" : ""}`} key={item.id}>
              {onToggle && (
                <input
                  className="dashboard-complete-checkbox"
                  type="checkbox"
                  checked={Boolean(item.completed)}
                  onChange={() => onToggle(item)}
                  aria-label={`${item.completed ? "Reopen" : "Complete"} ${item.title}`}
                />
              )}
              <div className="dashboard-planning-copy">
                <strong>{item.title}</strong>
                <span>
                  {item[dateField]
                    ? `${dateLabel}: ${formatShortDate(item[dateField])}`
                    : `No ${dateLabel.toLowerCase()}`}
                  {item.eventTime ? ` at ${item.eventTime}` : ""}
                  {item.location ? ` · ${item.location}` : ""}
                </span>
              </div>
              <button className="dashboard-delete-item" type="button" onClick={() => onDelete(item.id)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [habits, setHabits] = useState([]);
  const [habitTypes, setHabitTypes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isSavingHabits, setIsSavingHabits] = useState(false);
  const [error, setError] = useState("");
  const [habitMessage, setHabitMessage] = useState("");
  

  const [today, setToday] = useState(() => localDateString());
  const [selectedDate, setSelectedDate] = useState(today);
  const [water, setWater] = useState("");
  const [sleep, setSleep] = useState("");
  const [customHabits, setCustomHabits] = useState([]);
  const [customValues, setCustomValues] = useState({});
  const [tasks, setTasks] = useState([]);
  const [goals, setGoals] = useState([]);
  const [events, setEvents] = useState([]);
  const [pointsBalance, setPointsBalance] = useState(0);
  const [achievements, setAchievements] = useState([]);
  const [achievementNotice, setAchievementNotice] = useState("");

  // Keep the dashboard's definition of "today" aligned with the user's local
  // calendar date even if the page stays open across midnight.
  useEffect(() => {
    const syncToday = () => setToday(localDateString());
    const timer = window.setInterval(syncToday, 60 * 1000);

    return () => window.clearInterval(timer);
  }, []);

  const loadHabitEntries = async (userId, signal) => {
    const response = await fetch(`${API_URL}/api/users/${userId}/habits`, {
      credentials: "include",
      signal,
    });
  
  

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Could not load habit entries.");
    }

    const entries = Array.isArray(data) ? data : [];
    setHabits(entries);
    return entries;
  };

  useEffect(() => {
    const controller = new AbortController();

    const loadDashboard = async () => {
      setIsLoading(true);
      setError("");

      try {
        const sessionResponse = await fetch(`${API_URL}/api/session`, {
          credentials: "include",
          signal: controller.signal,
        });

        if (sessionResponse.status === 401) {
          navigate("/login", { replace: true });
          return;
        }

        if (!sessionResponse.ok) {
          throw new Error("Could not verify your login session.");
        }

        const sessionData = await sessionResponse.json();
        const currentUser = sessionData.user;
        setUser(currentUser);

        const [habitResponse, typeResponse, customResponse, taskResponse, goalResponse, eventResponse, pointResponse, achievementResponse] = await Promise.all([
          fetch(`${API_URL}/api/users/${currentUser.id}/habits`, {
            credentials: "include",
            signal: controller.signal,
          }),
          fetch(`${API_URL}/api/habits`, {
            credentials: "include",
            signal: controller.signal,
          }),
          fetch(`${API_URL}/api/custom-habits`, {
            credentials: "include",
            signal: controller.signal,
          }),
          fetch(`${API_URL}/api/tasks`, { credentials: "include", signal: controller.signal }),
          fetch(`${API_URL}/api/goals`, { credentials: "include", signal: controller.signal }),
          fetch(`${API_URL}/api/events`, { credentials: "include", signal: controller.signal }),
          fetch(`${API_URL}/api/points`, { credentials: "include", signal: controller.signal }),
          fetch(`${API_URL}/api/achievements`, { credentials: "include", signal: controller.signal }),
        ]);

        if (!habitResponse.ok || !typeResponse.ok || !customResponse.ok || !taskResponse.ok || !goalResponse.ok || !eventResponse.ok || !pointResponse.ok || !achievementResponse.ok) {
          throw new Error("Some dashboard information could not be loaded.");
        }

        const [habitData, typeData] = await Promise.all([
          habitResponse.json(),
          typeResponse.json(),
        ]);

        setHabits(Array.isArray(habitData) ? habitData : []);
        setHabitTypes(Array.isArray(typeData) ? typeData : []);
        setCustomHabits(await customResponse.json());
        setTasks(await taskResponse.json());
        setGoals(await goalResponse.json());
        setEvents(await eventResponse.json());
        const pointData = await pointResponse.json();
        setPointsBalance(Number(pointData.balance || 0));
        const achievementData = await achievementResponse.json();
        setAchievements(Array.isArray(achievementData.achievements) ? achievementData.achievements : []);
        

      } catch (loadError) {
        if (loadError.name !== "AbortError") {
          setError(
            "We could not load all of your dashboard information. Make sure the server and database are running."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    loadDashboard();

    return () => controller.abort();
  }, [navigate]);

  // Archived habits remain in `habits` for history, but are excluded from daily tracking.
  const activeStandardNames = useMemo(
    () => new Set(habitTypes.map((type) => type.name.toLowerCase())), [habitTypes]
  );
  const activeCustomIds = useMemo(
    () => new Set(customHabits.map((habit) => Number(habit.id))), [customHabits]
  );
  const isActiveEntry = (entry) => entry.customHabitId != null
    ? activeCustomIds.has(Number(entry.customHabitId))
    : activeStandardNames.has(String(entry.habit).toLowerCase());

  const todaysHabits = useMemo(
    () => habits.filter((entry) => String(entry.entryDate).slice(0, 10) === today && isActiveEntry(entry)),
    [habits, today, activeStandardNames, activeCustomIds]
  );

  const selectedDateEntries = useMemo(
    () =>
      habits.filter(
        (entry) => String(entry.entryDate).slice(0, 10) === selectedDate && isActiveEntry(entry)
      ),
    [habits, selectedDate, activeStandardNames, activeCustomIds]
  );

  useEffect(() => {
    const waterEntry = selectedDateEntries.find((entry) => entry.habit === "water");
    const sleepEntry = selectedDateEntries.find((entry) => entry.habit === "sleep");

    setWater(waterEntry ? String(waterEntry.value) : "");
    setSleep(sleepEntry ? String(sleepEntry.value) : "");
    setCustomValues(Object.fromEntries(selectedDateEntries
      .filter((entry) => entry.customHabitId)
      .map((entry) => [entry.customHabitId, String(entry.value)])));
  }, [selectedDateEntries]);

  const lastSevenDays = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - 6);
    const startDate = localDateString(start);

    return habits.filter((entry) => {
      const entryDate = String(entry.entryDate).slice(0, 10);
      return entryDate >= startDate && entryDate <= today && isActiveEntry(entry);
    });
  }, [habits, today, activeStandardNames, activeCustomIds]);

  const streakSummary = useMemo(() => {
    const prevDay = (dateStr) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    return localDateString(new Date(y, m - 1, d - 1));
  };
  // Today doesn't have to be logged yet; yesterday keeps the streak alive.
  const countStreak = (dates) => {
    let cursor = dates.has(today) ? today : prevDay(today);
    let streak = 0;
    while (dates.has(cursor)) {
      streak++;
      cursor = prevDay(cursor);
    }
    return streak;
  };
  const allDates = new Set();
  const byHabit = new Map();

  for (const entry of habits) {
    if (!isActiveEntry(entry)) continue;

      const date = String(entry.entryDate).slice(0, 10);
    if (date > today) continue;

    const key = entry.customHabitId != null
      ? `custom:${entry.customHabitId}`
      : `standard:${String(entry.habit).toLowerCase()}`;

    allDates.add(date);
    if (!byHabit.has(key)) byHabit.set(key, { name: entry.habit, dates: new Set() });
    byHabit.get(key).dates.add(date);
  }
  const topHabits = [...byHabit.values()]
    .map(({ name, dates }) => ({
      name,
      streak: countStreak(dates),
      entries: dates.size,
    }))
    .sort((a, b) => b.streak - a.streak || b.entries - a.entries || a.name.localeCompare(b.name))
    .slice(0, 2);

  return { overall: countStreak(allDates), topHabits };
}, [habits, today, activeStandardNames, activeCustomIds]);

  const completedHabitNames = useMemo(
    () => new Set(todaysHabits.map((entry) => entry.customHabitId != null
      ? `custom:${entry.customHabitId}` : `standard:${String(entry.habit).toLowerCase()}`)),
    [todaysHabits]
  );

  const totalTrackedHabits = habitTypes.length + customHabits.length;
  const completedToday = completedHabitNames.size;
  const progressPercent = totalTrackedHabits
    ? Math.min(100, Math.round((completedToday / totalTrackedHabits) * 100))
    : 0;

  const saveHabit = async (habit, value) => {
    if (value === "" || !user?.id) {
      return false;
    }

    const response = await fetch(
      `${API_URL}/api/users/${user.id}/habits/${habit}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          entryDate: selectedDate,
          value: Number(value),
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `Could not save ${habit}.`);
    }

    return data;
  };

  const refreshAchievements = async (unlocked = []) => {
    const response = await fetch(`${API_URL}/api/achievements`, { credentials: "include" });
    if (response.ok) {
      const data = await response.json();
      setAchievements(Array.isArray(data.achievements) ? data.achievements : []);
    }

    if (unlocked.length > 0) {
      setAchievementNotice(`Achievement unlocked: ${unlocked.map((item) => item.name).join(", ")}!`);
    }
  };

  const handleHabitSubmit = async (event) => {
    event.preventDefault();
    setHabitMessage("");
    setError("");

    if ((!activeStandardNames.has("water") || water === "") &&
        (!activeStandardNames.has("sleep") || sleep === "") &&
        !customHabits.some((habit) => customValues[habit.id] !== undefined && customValues[habit.id] !== "")) {
      setHabitMessage("Enter at least one habit value before saving.");
      return;
    }

    setIsSavingHabits(true);

    try {
      const habitResults = await Promise.all([
        ...(activeStandardNames.has("water") ? [saveHabit("water", water)] : []),
        ...(activeStandardNames.has("sleep") ? [saveHabit("sleep", sleep)] : []),
        ...customHabits.filter((habit) => customValues[habit.id] !== undefined && customValues[habit.id] !== "")
          .map(async (habit) => {
            const response = await fetch(`${API_URL}/api/custom-habits/${habit.id}/entries`, {
              method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ entryDate: selectedDate, value: Number(customValues[habit.id]) }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "Could not save habit.");
            return data;
          }),
      ]);

      await loadHabitEntries(user.id);
      const pointResponse = await fetch(`${API_URL}/api/points`, { credentials: "include" });
      if (pointResponse.ok) {
        const pointData = await pointResponse.json();
        setPointsBalance(Number(pointData.balance || 0));
      }
      const unlocked = habitResults.flatMap((result) =>
        Array.isArray(result?.achievementsUnlocked) ? result.achievementsUnlocked : []
      );
      await refreshAchievements(unlocked);
      setHabitMessage(`Habits saved for ${formatShortDate(selectedDate)}.`);
    } catch (saveError) {
      setHabitMessage(saveError.message || "Could not save habits.");
    } finally {
      setIsSavingHabits(false);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/logout`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Logout failed");
      }

      navigate("/", { replace: true });
    } catch {
      setError("We could not log you out. Please try again.");
    } finally {
      setIsLoggingOut(false);
    }
  };

  const createPlanningItem = async (endpoint, payload, setter) => {
    const response = await fetch(`${API_URL}/api/${endpoint}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || `Could not create ${endpoint.slice(0, -1)}.`);
    setter((current) => [...current, data]);
  };

  const togglePlanningItem = async (endpoint, item, setter) => {
    const completed = !item.completed;
    const response = await fetch(`${API_URL}/api/${endpoint}/${item.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.message || `Could not update ${endpoint.slice(0, -1)}.`);
      return;
    }
    setter((current) => current.map((entry) => entry.id === item.id ? { ...entry, completed } : entry));
    if (typeof data.pointsBalance === "number") {
      setPointsBalance(data.pointsBalance);
    }
    if (Array.isArray(data.achievementsUnlocked) && data.achievementsUnlocked.length > 0) {
      await refreshAchievements(data.achievementsUnlocked);
    } else if (endpoint === "tasks") {
      await refreshAchievements();
    }
  };

  const deletePlanningItem = async (endpoint, id, setter) => {
    const response = await fetch(`${API_URL}/api/${endpoint}/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.message || `Could not delete ${endpoint.slice(0, -1)}.`);
      return;
    }
    setter((current) => current.filter((entry) => entry.id !== id));
    if (typeof data.pointsBalance === "number") {
      setPointsBalance(data.pointsBalance);
    }
    if (endpoint === "tasks") {
      await refreshAchievements();
    }
  };

  if (isLoading) {
    return (
      <main className="dashboard-page dashboard-loading-page">
        <div className="dashboard-loading-card" role="status" aria-live="polite">
          <img src="/ontrack-logo.png" alt="OnTrack" />
          <p>Loading your dashboard...</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <Link className="dashboard-brand" to="/" aria-label="OnTrack home">
          <img src="/ontrack-logo.png" alt="OnTrack" />
        </Link>

        <nav className="dashboard-nav" aria-label="Dashboard navigation">
          <a className="dashboard-nav-link is-active" href="#dashboard-top">
            Dashboard
          </a>
          <a className="dashboard-nav-link" href="#habits">
            Habits
          </a>
          <a className="dashboard-nav-link" href="#tasks">Tasks</a>
          <a className="dashboard-nav-link" href="#goals">Goals</a>
          <a className="dashboard-nav-link" href="#events">Events</a>
          <a className="dashboard-nav-link" href="#achievements">Achievements</a>
          <a className="dashboard-nav-link" href="#progress">
            Progress
          </a>
          <Link className="dashboard-nav-link" to="/habits/manage">Manage habits</Link>
          <Link className="dashboard-nav-link" to="/habits/history">Habit History</Link>
          <button
            className="dashboard-logout"
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? "Logging out..." : "Log out"}
          </button>
        </nav>
      </header>

      <section className="dashboard-shell" id="dashboard-top">
        <div className="dashboard-welcome-row">
          <div>
            <span className="dashboard-kicker">Your personal dashboard</span>
               <h1>Welcome back, {user.firstName || user.email}!</h1>
            <p>
              Manage your habits and keep an eye on your tasks, goals, events,
              and progress from one place.
            </p>
          </div>

          <div className="dashboard-date-card">
            <span>Today</span>
            <strong>{formatShortDate(today)}</strong>
          </div>
        </div>

        {error && (
          <p className="dashboard-alert" role="alert">
            {error}
          </p>
        )}

        {achievementNotice && (
          <p className="dashboard-achievement-notice" role="status">
            {achievementNotice}
          </p>
        )}

        <article
          className="dashboard-card dashboard-card-progress dashboard-today-progress"
          id="progress"
        >
          <div className="dashboard-card-heading">
            <div>
              <span className="dashboard-card-label">Progress</span>
              <h2>Today&apos;s progress</h2>
            </div>
            <div className="dashboard-progress-heading">
              <span className="dashboard-date-badge">{formatShortDate(today)}</span>
              <strong className="dashboard-progress-value">{progressPercent}%</strong>
            </div>
          </div>

          <div
            className="dashboard-progress-track"
            role="progressbar"
            aria-label="Today's habit progress"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={progressPercent}
          >
            <div
              className="dashboard-progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <p className="dashboard-progress-copy">
            {totalTrackedHabits === 0
              ? "No active habits. Add or restore a habit to start tracking."
              : `${completedToday} of ${totalTrackedHabits} tracked habits logged today.`}
          </p>

          {totalTrackedHabits === 0 ? (
            <div className="dashboard-empty-state compact">
              <span aria-hidden="true">＋</span>
              <div>
                <strong>No active habits yet.</strong>
                <p>Add or restore a habit to begin tracking today&apos;s progress.</p>
              </div>
            </div>
          ) : todaysHabits.length === 0 ? (
            <div className="dashboard-empty-state compact">
              <span aria-hidden="true">○</span>
              <div>
                <strong>No habits logged today.</strong>
                <p>Today&apos;s progress only includes entries from the current calendar day.</p>
              </div>
            </div>
          ) : (
            <div className="dashboard-recent-list" aria-label="Habits logged today">
              {todaysHabits.map((entry) => (
                <div key={entry.id} className="dashboard-recent-row">
                  <span>{formatShortDate(today)}</span>
                  <strong>{entry.habit}</strong>
                  <b>{entry.value} {entry.unit}</b>
                </div>
              ))}
            </div>
          )}
        </article>

        <section className="dashboard-stats" aria-label="Progress summary">
          <article className="dashboard-stat-card dashboard-points-card">
            <span className="dashboard-stat-icon points" aria-hidden="true">★</span>
            <div>
              <strong>{pointsBalance}</strong>
              <span>points earned</span>
            </div>
          </article>

          <article className="dashboard-stat-card">
            <span className="dashboard-stat-icon" aria-hidden="true">✓</span>
            <div>
              <strong>{completedToday}</strong>
              <span>habits logged today</span>
            </div>
          </article>

          <article className="dashboard-stat-card">
            <span className="dashboard-stat-icon teal" aria-hidden="true">↗</span>
            <div>
              <strong>{lastSevenDays.length}</strong>
              <span>habit entries this week</span>
            </div>
          </article>

          <article className="dashboard-stat-card">
            <span className="dashboard-stat-icon green" aria-hidden="true">◎</span>
            <div>
              <strong>{progressPercent}%</strong>
              <span>today&apos;s habit progress</span>
            </div>
          </article>

        <article className="dashboard-stat-card">
          <span className="dashboard-stat-icon amber" aria-hidden="true">▲</span>
          <div>
            <strong>{streakSummary.overall}</strong>
            <span>day overall streak</span>
          </div>
        </article>

        {streakSummary.topHabits.map((item) => (
          <article className="dashboard-stat-card" key={item.name}>
           <span className="dashboard-stat-icon amber" aria-hidden="true">▲</span>
           <div>
             <strong>{item.streak}</strong>
             <span>{item.name} streak</span>
           </div>
          </article>
        ))}

        </section>

        <article className="dashboard-card dashboard-achievements-card" id="achievements">
          <div className="dashboard-card-heading">
            <div>
              <span className="dashboard-card-label">Milestones</span>
              <h2>Achievements</h2>
              <p className="dashboard-card-description">
                Complete activities and earn points to unlock permanent milestones.
              </p>
            </div>
            <strong className="dashboard-achievement-count">
              {achievements.filter((achievement) => achievement.earned).length}/{achievements.length}
            </strong>
          </div>

          {achievements.length === 0 ? (
            <div className="dashboard-empty-state compact">
              <span aria-hidden="true">★</span>
              <div>
                <strong>No achievement data yet.</strong>
                <p>Your milestone achievements will appear here.</p>
              </div>
            </div>
          ) : (
            <div className="dashboard-achievement-grid">
              {achievements.map((achievement) => (
                <div
                  className={`dashboard-achievement ${achievement.earned ? "is-earned" : "is-locked"}`}
                  key={achievement.code}
                >
                  <span className="dashboard-achievement-badge" aria-hidden="true">
                    {achievement.badge}
                  </span>
                  <div className="dashboard-achievement-copy">
                    <div className="dashboard-achievement-title-row">
                      <strong>{achievement.name}</strong>
                      <span>{achievement.earned ? "Unlocked" : "Locked"}</span>
                    </div>
                    <p>{achievement.description}</p>
                    {!achievement.earned && (
                      <>
                        <div
                          className="dashboard-achievement-track"
                          role="progressbar"
                          aria-label={`${achievement.name} progress`}
                          aria-valuemin="0"
                          aria-valuemax="100"
                          aria-valuenow={achievement.progressPercent}
                        >
                          <div style={{ width: `${achievement.progressPercent}%` }} />
                        </div>
                        <small>
                          {Math.min(achievement.currentValue, achievement.threshold)} / {achievement.threshold}
                        </small>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <section className="dashboard-grid" aria-label="Dashboard sections">
          <article
            className="dashboard-card dashboard-card-habits dashboard-card-wide"
            id="habits"
          >
            <div className="dashboard-card-heading">
              <div>
                <span className="dashboard-card-label">Habits</span>
                <h2>Daily habit tracking</h2>
                <p className="dashboard-card-description">
                  Log your daily habits.
                </p>
              </div>
              <span className="dashboard-date-badge">
                {selectedDate === today ? "Today" : formatShortDate(selectedDate)}
              </span>
            </div>

            <div className="dashboard-manage-row">
              <p>Add, edit, or remove habits.</p>
              <Link className="dashboard-manage-link" to="/habits/manage">Manage habits →</Link>
            </div>

            {totalTrackedHabits === 0 ? (
              <div className="dashboard-empty-state" role="status">
                <span aria-hidden="true">＋</span>
                <div>
                  <strong>You don't have any active habits yet.</strong>
                  <p><Link to="/habits/manage">Add a habit</Link> or restore a removed one to start tracking.</p>
                </div>
              </div>
            ) : (
            <div className="dashboard-habit-layout">
              <form className="dashboard-habit-form" onSubmit={handleHabitSubmit}>
                <label className="dashboard-field dashboard-field-date">
                  <span>Date</span>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => {
                      setSelectedDate(event.target.value);
                      setHabitMessage("");
                    }}
                    required
                  />
                </label>

                {activeStandardNames.has("water") && (
                <label className="dashboard-field">
                  <span>Water</span>
                  <div className="dashboard-input-with-unit">
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      value={water}
                      onChange={(event) => setWater(event.target.value)}
                      placeholder="8"
                      inputMode="decimal"
                    />
                    <b>cups</b>
                  </div>
                </label>

                )}

                {activeStandardNames.has("sleep") && (
                <label className="dashboard-field">
                  <span>Sleep</span>
                  <div className="dashboard-input-with-unit">
                    <input
                      type="number"
                      min="0"
                      max="24"
                      step="0.25"
                      value={sleep}
                      onChange={(event) => setSleep(event.target.value)}
                      placeholder="8"
                      inputMode="decimal"
                    />
                    <b>hours</b>
                  </div>
                </label>

                )}

                {customHabits.map((habit) => (
                  <label className="dashboard-field" key={habit.id}>
                    <span>{habit.name}</span>
                    <div className="dashboard-input-with-unit">
                      <input type="number" min="0" max="99999999.99" step="0.01" inputMode="decimal"
                        value={customValues[habit.id] ?? ""}
                        onChange={(event) => setCustomValues((current) => ({ ...current, [habit.id]: event.target.value }))} />
                      <b>{habit.unit}</b>
                    </div>
                  </label>
                ))}

                <button
                  className="dashboard-save-habits"
                  type="submit"
                  disabled={isSavingHabits}
                >
                  {isSavingHabits ? "Saving..." : "Save habits"}
                  <span aria-hidden="true">→</span>
                </button>

                {habitMessage && (
                  <p className="dashboard-habit-message" role="status">
                    {habitMessage}
                  </p>
                )}
              </form>

              <div className="dashboard-habit-summary">
                <div className="dashboard-subheading-row">
                  <div>
                    <span className="dashboard-card-label">Selected day</span>
                    <h3>{formatShortDate(selectedDate)}</h3>
                  </div>
                  <strong>
                    {selectedDateEntries.length}/{totalTrackedHabits} logged
                  </strong>
                </div>

                {selectedDateEntries.length === 0 ? (
                  <div className="dashboard-empty-state">
                    <span aria-hidden="true">○</span>
                    <div>
                      <strong>No habits logged for this date.</strong>
                      <p>Enter your habit values and save them here.</p>
                    </div>
                  </div>
                ) : (
                  <div className="dashboard-habit-list">
                    {selectedDateEntries.map((entry) => (
                      <div className="dashboard-habit-row" key={entry.id}>
                        <div>
                          <strong>{entry.habit}</strong>
                          <span>{formatShortDate(String(entry.entryDate).slice(0, 10))}</span>
                        </div>
                        <b>{entry.value} {entry.unit}</b>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            )}

            <div className="dashboard-calendar-link-row">
              <Link className="dashboard-calendar-link" to="/habits/history">
                View Habit History Calendar →
              </Link>
            </div>

            <div className="dashboard-history-section">
              <div className="dashboard-subheading-row">
                <div>
                  <span className="dashboard-card-label">History</span>
                  <h3>Recent habit entries</h3>
                </div>
              </div>

              {habits.length === 0 ? (
                <div className="dashboard-empty-state compact">
                  <span aria-hidden="true">↗</span>
                  <div>
                    <strong>No habit history yet.</strong>
                    <p>Your recent habit entries will appear here.</p>
                  </div>
                </div>
              ) : (
                <div className="dashboard-history-table-wrap">
                  <table className="dashboard-history-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Habit</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {habits.slice(0, 10).map((entry) => (
                        <tr key={entry.id}>
                          <td>{String(entry.entryDate).slice(0, 10)}</td>
                          <td>{entry.habit}{!isActiveEntry(entry) ? " (removed)" : ""}</td>
                          <td>{entry.value} {entry.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </article>

          <PlanningSection
            kind="Task" title="Your tasks" icon="✓" items={tasks}
            dateField="dueDate" dateLabel="Due date"
            onCreate={(payload) => createPlanningItem("tasks", payload, setTasks)}
            onToggle={(item) => togglePlanningItem("tasks", item, setTasks)}
            onDelete={(id) => deletePlanningItem("tasks", id, setTasks)}
          />

          <PlanningSection
            kind="Goal" title="Your goals" icon="◎" items={goals}
            dateField="targetDate" dateLabel="Target date"
            onCreate={(payload) => createPlanningItem("goals", payload, setGoals)}
            onToggle={(item) => togglePlanningItem("goals", item, setGoals)}
            onDelete={(id) => deletePlanningItem("goals", id, setGoals)}
          />

          <PlanningSection
            kind="Event" title="Upcoming events" icon="◇" items={events}
            dateField="eventDate" dateLabel="Event date" includeTime includeLocation
            onCreate={(payload) => createPlanningItem("events", payload, setEvents)}
            onDelete={(id) => deletePlanningItem("events", id, setEvents)}
          />

        </section>
      </section>
    </main>
  );
}

export default Dashboard;
