import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
// Temporary demo user. Replace this with the logged-in user's id when auth is connected.
const DEMO_USER_ID = 1;

function localDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function Habits() {
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
    try {
      const response = await fetch(`${API_URL}/api/users/${DEMO_USER_ID}/habits`);
      if (!response.ok) throw new Error();
      setEntries(await response.json());
      setMessage("");
    } catch {
      setMessage("Could not reach the habit API. Make sure MySQL and the server are running.");
    }
  };

  useEffect(() => {
    loadEntries();
  }, []);

  useEffect(() => {
    const waterEntry = todaysEntries.find((entry) => entry.habit === "water");
    const sleepEntry = todaysEntries.find((entry) => entry.habit === "sleep");
    setWater(waterEntry ? String(waterEntry.value) : "");
    setSleep(sleepEntry ? String(sleepEntry.value) : "");
  }, [todaysEntries]);

  const saveHabit = async (habit, value) => {
    if (value === "") return;

    const response = await fetch(
      `${API_URL}/api/users/${DEMO_USER_ID}/habits/${habit}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryDate: date, value: Number(value) }),
      }
    );

    if (!response.ok) throw new Error();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      await Promise.all([
        saveHabit("water", water),
        saveHabit("sleep", sleep),
      ]);
      setMessage("Habits saved.");
      await loadEntries();
    } catch {
      setMessage("Could not save habits. Check the API and database connection.");
    }
  };

  return (
    <main className="habit-page">
      <section className="habit-shell">
        <header className="habit-header">
          <Link className="auth-logo" to="/">
            <img src="/ontrack-logo.png" alt="OnTrack" />
          </Link>
          <div>
            <span className="auth-kicker">Daily tracking</span>
            <h1>Water & Sleep</h1>
            <p>Demo user #{DEMO_USER_ID}. Replace this ID with your logged-in user later.</p>
          </div>
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
