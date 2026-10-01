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

  const today = localDateString();
  const [selectedDate, setSelectedDate] = useState(today);
  const [water, setWater] = useState("");
  const [sleep, setSleep] = useState("");

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

        const [habitResponse, typeResponse] = await Promise.all([
          fetch(`${API_URL}/api/users/${currentUser.id}/habits`, {
            credentials: "include",
            signal: controller.signal,
          }),
          fetch(`${API_URL}/api/habits`, {
            credentials: "include",
            signal: controller.signal,
          }),
        ]);

        if (!habitResponse.ok || !typeResponse.ok) {
          throw new Error("Some dashboard information could not be loaded.");
        }

        const [habitData, typeData] = await Promise.all([
          habitResponse.json(),
          typeResponse.json(),
        ]);

        setHabits(Array.isArray(habitData) ? habitData : []);
        setHabitTypes(Array.isArray(typeData) ? typeData : []);
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

  const todaysHabits = useMemo(
    () => habits.filter((entry) => String(entry.entryDate).slice(0, 10) === today),
    [habits, today]
  );

  const selectedDateEntries = useMemo(
    () =>
      habits.filter(
        (entry) => String(entry.entryDate).slice(0, 10) === selectedDate
      ),
    [habits, selectedDate]
  );

  useEffect(() => {
    const waterEntry = selectedDateEntries.find((entry) => entry.habit === "water");
    const sleepEntry = selectedDateEntries.find((entry) => entry.habit === "sleep");

    setWater(waterEntry ? String(waterEntry.value) : "");
    setSleep(sleepEntry ? String(sleepEntry.value) : "");
  }, [selectedDateEntries]);

  const lastSevenDays = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - 6);
    const startDate = localDateString(start);

    return habits.filter((entry) => {
      const entryDate = String(entry.entryDate).slice(0, 10);
      return entryDate >= startDate && entryDate <= today;
    });
  }, [habits, today]);

  const completedHabitNames = useMemo(
    () => new Set(todaysHabits.map((entry) => entry.habit)),
    [todaysHabits]
  );

  const totalTrackedHabits = habitTypes.length;
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

    return true;
  };

  const handleHabitSubmit = async (event) => {
    event.preventDefault();
    setHabitMessage("");
    setError("");

    if (water === "" && sleep === "") {
      setHabitMessage("Enter a water or sleep value before saving.");
      return;
    }

    setIsSavingHabits(true);

    try {
      await Promise.all([
        saveHabit("water", water),
        saveHabit("sleep", sleep),
      ]);

      await loadHabitEntries(user.id);
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
          <a className="dashboard-nav-link" href="#progress">
            Progress
          </a>
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
            <h1>Welcome back, {user.email}!</h1>
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

        <section className="dashboard-stats" aria-label="Progress summary">
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
        </section>

        <section className="dashboard-grid" aria-label="Dashboard sections">
          <article
            className="dashboard-card dashboard-card-habits dashboard-card-wide"
            id="habits"
          >
            <div className="dashboard-card-heading">
              <div>
                <span className="dashboard-card-label">Habits</span>
                <h2>Water &amp; sleep tracking</h2>
                <p className="dashboard-card-description">
                  Log your daily habits without leaving the dashboard.
                </p>
              </div>
              <span className="dashboard-date-badge">
                {selectedDate === today ? "Today" : formatShortDate(selectedDate)}
              </span>
            </div>

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
                    {selectedDateEntries.length}/{Math.max(habitTypes.length, 2)} logged
                  </strong>
                </div>

                {selectedDateEntries.length === 0 ? (
                  <div className="dashboard-empty-state">
                    <span aria-hidden="true">○</span>
                    <div>
                      <strong>No habits logged for this date.</strong>
                      <p>Enter your water or sleep values and save them here.</p>
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
                    <p>Your recent water and sleep entries will appear here.</p>
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
                          <td>{entry.habit}</td>
                          <td>{entry.value} {entry.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </article>

          <article className="dashboard-card">
            <div className="dashboard-card-heading">
              <div>
                <span className="dashboard-card-label">Tasks</span>
                <h2>Your tasks</h2>
              </div>
              <span className="dashboard-coming-soon">Coming soon</span>
            </div>
            <div className="dashboard-empty-state">
              <span aria-hidden="true">✓</span>
              <div>
                <strong>No tasks yet.</strong>
                <p>Your daily responsibilities will appear here once you add them.</p>
              </div>
            </div>
          </article>

          <article className="dashboard-card">
            <div className="dashboard-card-heading">
              <div>
                <span className="dashboard-card-label">Goals</span>
                <h2>Your goals</h2>
              </div>
              <span className="dashboard-coming-soon">Coming soon</span>
            </div>
            <div className="dashboard-empty-state">
              <span aria-hidden="true">◎</span>
              <div>
                <strong>No goals yet.</strong>
                <p>Your active goals and milestones will appear here.</p>
              </div>
            </div>
          </article>

          <article className="dashboard-card">
            <div className="dashboard-card-heading">
              <div>
                <span className="dashboard-card-label">Events</span>
                <h2>Upcoming events</h2>
              </div>
              <span className="dashboard-coming-soon">Coming soon</span>
            </div>
            <div className="dashboard-empty-state">
              <span aria-hidden="true">◇</span>
              <div>
                <strong>No events scheduled.</strong>
                <p>Important dates and upcoming events will appear here.</p>
              </div>
            </div>
          </article>

          <article className="dashboard-card dashboard-card-progress" id="progress">
            <div className="dashboard-card-heading">
              <div>
                <span className="dashboard-card-label">Progress</span>
                <h2>Today&apos;s progress</h2>
              </div>
              <strong className="dashboard-progress-value">{progressPercent}%</strong>
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
                ? "No habit types are available yet."
                : `${completedToday} of ${totalTrackedHabits} tracked habits logged today.`}
            </p>

            {habits.length === 0 ? (
              <div className="dashboard-empty-state compact">
                <span aria-hidden="true">↗</span>
                <div>
                  <strong>No progress history yet.</strong>
                  <p>Your recent habit activity will appear here as you log entries.</p>
                </div>
              </div>
            ) : (
              <div className="dashboard-recent-list">
                {habits.slice(0, 4).map((entry) => (
                  <div key={entry.id} className="dashboard-recent-row">
                    <span>{String(entry.entryDate).slice(0, 10)}</span>
                    <strong>{entry.habit}</strong>
                    <b>{entry.value} {entry.unit}</b>
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>
      </section>
    </main>
  );
}

export default Dashboard;
