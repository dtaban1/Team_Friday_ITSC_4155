import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function localDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function getLoggedInUserId() {
  const storedId = sessionStorage.getItem("ontrackUserId") || localStorage.getItem("ontrackUserId");
  const userId = Number(storedId);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

function Habits() {
  const navigate = useNavigate();
  const userId = getLoggedInUserId();
  const [date, setDate] = useState(localDate());
  const [water, setWater] = useState("");
  const [sleep, setSleep] = useState("");
  const [entries, setEntries] = useState([]);
  const [message, setMessage] = useState("");

  const todaysEntries = useMemo(
    () => entries.filter((entry) => String(entry.entryDate).slice(0, 10) === date),
    [entries, date]
  );

  const loadEntries = async () => {
    if (!userId) return;

    try {
      const response = await fetch(`${API_URL}/api/users/${userId}/habits`);
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 404) {
          localStorage.removeItem("ontrackUserId");
          sessionStorage.removeItem("ontrackUserId");
          navigate("/login", { replace: true });
          return;
        }
        throw new Error(data.message || "Could not load habits.");
      }

      setEntries(data);
    } catch (error) {
      console.error(error);
      setMessage("Could not reach the habit API. Make sure MySQL and the server are running.");
    }
  };

  useEffect(() => {
    if (!userId) {
      navigate("/login", { replace: true });
      return;
    }

    loadEntries();
  }, [userId]);

  useEffect(() => {
    const waterEntry = todaysEntries.find((entry) => entry.habit === "water");
    const sleepEntry = todaysEntries.find((entry) => entry.habit === "sleep");
    setWater(waterEntry ? String(waterEntry.value) : "");
    setSleep(sleepEntry ? String(sleepEntry.value) : "");
  }, [todaysEntries]);

  const saveHabit = async (habit, value) => {
    if (value === "" || !userId) return;

    const response = await fetch(
      `${API_URL}/api/users/${userId}/habits/${habit}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryDate: date, value: Number(value) }),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Could not save habit.");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");

    try {
      await Promise.all([
        saveHabit("water", water),
        saveHabit("sleep", sleep),
      ]);
      await loadEntries();
      setMessage("Habits saved.");
    } catch (error) {
      console.error(error);
      setMessage("Could not save habits. Check the API and database connection.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("ontrackUserId");
    sessionStorage.removeItem("ontrackUserId");
    navigate("/login");
  };

  if (!userId) {
    return null;
  }

  return (
    <main className="habit-page">
      <section className="habit-shell">
        <header className="habit-header">
          <Link className="auth-logo" to="/">
            <img src="/ontrack-logo.png" alt="OnTrack" />
          </Link>
          <div className="habit-header-copy">
            <span className="auth-kicker">Daily tracking</span>
            <h1>Water & Sleep</h1>
            <p>Your habit entries are saved to your signed-in account.</p>
          </div>
          <button className="habit-logout" type="button" onClick={handleLogout}>
            Log out
          </button>
        </header>

        <form className="habit-form" onSubmit={handleSubmit}>
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>

          <label>
            Water (cups)
            <input
              type="number"
              min="0"
              step="0.25"
              value={water}
              onChange={(e) => setWater(e.target.value)}
              placeholder="8"
            />
          </label>

          <label>
            Sleep (hours)
            <input
              type="number"
              min="0"
              max="24"
              step="0.25"
              value={sleep}
              onChange={(e) => setSleep(e.target.value)}
              placeholder="8"
            />
          </label>

          <button className="auth-submit" type="submit">Save habits <span>→</span></button>
          {message && <p className="habit-message">{message}</p>}
        </form>

        <section className="habit-history">
          <h2>Recent entries</h2>
          {entries.length === 0 ? (
            <p>No entries yet.</p>
          ) : (
            <div className="habit-table-wrap">
              <table className="habit-table">
                <thead>
                  <tr><th>Date</th><th>Habit</th><th>Value</th></tr>
                </thead>
                <tbody>
                  {entries.slice(0, 14).map((entry) => (
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
        </section>
      </section>
    </main>
  );
}

export default Habits;
