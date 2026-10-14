import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../styles/dashboard.css";
import "../styles/habit-management.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || "Unable to save changes. Please try again.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function HabitManagement() {
  const navigate = useNavigate();
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState(null);

  const loadHabits = async () => {
    const data = await apiRequest("/api/habit-management");
    setHabits([...data.standard, ...data.custom]);
  };

  useEffect(() => {
    const load = async () => {
      try {
        await loadHabits();
      } catch (requestError) {
        if (requestError.status === 401) {
          navigate("/login", { replace: true });
        } else {
          setError(requestError.message);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [navigate]);

  const active = useMemo(() => habits.filter((habit) => habit.isActive), [habits]);
  const removed = useMemo(() => habits.filter((habit) => !habit.isActive), [habits]);

  const resetNotice = () => {
    setMessage("");
    setError("");
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    resetNotice();
    setBusy(true);
    try {
      const created = await apiRequest("/api/custom-habits", {
        method: "POST",
        body: JSON.stringify({ name: newName, unit: newUnit }),
      });
      setHabits((current) => [...current, { ...created, kind: "custom", isActive: true }]);
      setNewName("");
      setNewUnit("");
      setMessage(`“${created.name}” has been added to your dashboard.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const beginEdit = (habit) => {
    resetNotice();
    setEditing(habit.id);
    setEditName(habit.name);
    setEditUnit(habit.unit);
  };

  const handleEdit = async (event) => {
    event.preventDefault();
    resetNotice();
    setBusy(true);
    try {
      const updated = await apiRequest(`/api/custom-habits/${editing}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editName, unit: editUnit }),
      });
      setHabits((current) => current.map((habit) =>
        habit.kind === "custom" && habit.id === editing ? { ...habit, ...updated } : habit
      ));
      setEditing(null);
      setMessage(`“${updated.name}” has been updated.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const changeVisibility = async (habit, visible) => {
    resetNotice();
    setBusy(true);
    try {
      const path = habit.kind === "standard"
        ? `/api/habit-management/standard/${habit.id}/visibility`
        : `/api/custom-habits/${habit.id}/visibility`;
      await apiRequest(path, {
        method: "PATCH",
        body: JSON.stringify({ active: visible }),
      });
      setHabits((current) => current.map((item) =>
        item.kind === habit.kind && item.id === habit.id
          ? { ...item, isActive: visible }
          : item
      ));
      setMessage(visible
        ? `“${habit.name}” is back on your dashboard.`
        : `“${habit.name}” was removed from daily tracking. Its history is saved.`);
      setPendingRemoval(null);
    } catch (requestError) {
      setError(requestError.message);
      setPendingRemoval(null); // Reveal the error notice if the server could not remove the habit.
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="dashboard-page management-page">
      <header className="dashboard-header">
        <Link className="dashboard-brand" to="/" aria-label="OnTrack home">
          <img src="/ontrack-logo.png" alt="OnTrack" />
        </Link>
        <nav className="dashboard-nav" aria-label="Habit management navigation">
          <Link className="dashboard-nav-link" to="/dashboard">Dashboard</Link>
          <Link className="dashboard-nav-link is-active" to="/habits/manage">Manage habits</Link>
        </nav>
      </header>

      <section className="dashboard-shell">
        <div className="management-intro">
          <div>
            <span className="dashboard-kicker">Make it yours</span>
            <h1>Manage your habits</h1>
            <p>Add a new habit, edit a custom habit, or remove one from daily tracking.</p>
          </div>
          <Link to="/dashboard#habits" className="management-back">← Back to dashboard</Link>
        </div>

        {message && <p className="management-success" role="status">{message}</p>}
        {error && <p className="dashboard-alert" role="alert">{error}</p>}

        {loading ? <p role="status">Loading your habits...</p> : (
          <>
            <section className="dashboard-card management-section" aria-labelledby="add-habit-title">
              <span className="dashboard-card-label">Create</span>
              <h2 id="add-habit-title">Add a custom habit</h2>
              <form className="management-form" onSubmit={handleCreate}>
                <label className="dashboard-field">
                  <span>Habit name</span>
                  <input value={newName} onChange={(event) => setNewName(event.target.value)}
                    maxLength={50} placeholder="Reading" required disabled={busy} />
                </label>
                <label className="dashboard-field">
                  <span>Unit of measurement</span>
                  <input value={newUnit} onChange={(event) => setNewUnit(event.target.value)}
                    maxLength={30} placeholder="minutes" required disabled={busy} />
                </label>
                <button className="management-primary" type="submit" disabled={busy}>Add habit</button>
              </form>
            </section>

            <section className="dashboard-card management-section" aria-labelledby="current-habits-title">
              <div className="management-list-heading">
                <div>
                  <span className="dashboard-card-label">Daily tracking</span>
                  <h2 id="current-habits-title">Current habits ({active.length})</h2>
                </div>
              </div>
              {active.length === 0 ? (
                <div className="dashboard-empty-state">
                  <span aria-hidden="true">＋</span>
                  <div><strong>No active habits.</strong><p>Add a new habit above or restore one below to get started.</p></div>
                </div>
              ) : (
                <div className="management-list">
                  {active.map((habit) => (
                    <div className="management-row" key={`${habit.kind}-${habit.id}`}>
                      <div className="management-details">
                        <strong>{habit.name}</strong>
                        <span>{habit.unit} · {habit.kind === "standard" ? "Built-in habit" : "Custom habit"}</span>
                      </div>
                      {editing === habit.id && habit.kind === "custom" ? (
                        <form className="management-edit-form" onSubmit={handleEdit}>
                          <label>Habit name<input aria-label="Edit habit name" value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={50} required disabled={busy} /></label>
                          <label>Unit<input aria-label="Edit habit unit" value={editUnit} onChange={(event) => setEditUnit(event.target.value)} maxLength={30} required disabled={busy} /></label>
                          <button className="management-primary" type="submit" disabled={busy}>Save</button>
                          <button className="management-secondary" type="button" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
                        </form>
                      ) : (
                        <div className="management-actions">
                          {habit.kind === "custom" && (
                            <button className="management-secondary" type="button" disabled={busy || editing !== null}
                              onClick={() => beginEdit(habit)}>Edit</button>
                          )}
                          <button className="management-remove" type="button" disabled={busy || editing !== null}
                            onClick={() => { resetNotice(); setPendingRemoval(habit); }}>Remove</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {removed.length > 0 && (
              <section className="dashboard-card management-section" aria-labelledby="removed-habits-title">
                <span className="dashboard-card-label">Saved for later</span>
                <h2 id="removed-habits-title">Removed habits ({removed.length})</h2>
                <p className="management-muted">Your past entries are kept. Restore a habit to track it again.</p>
                <div className="management-list">
                  {removed.map((habit) => (
                    <div className="management-row" key={`${habit.kind}-${habit.id}`}>
                      <div className="management-details">
                        <strong>{habit.name}</strong>
                        <span>{habit.unit}</span>
                      </div>
                      <button className="management-secondary" type="button" disabled={busy || editing !== null}
                        onClick={() => changeVisibility(habit, true)}>Restore</button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </section>

      {pendingRemoval && (
        <div className="management-overlay">
          <div className="management-dialog" role="alertdialog" aria-modal="true"
            aria-labelledby="management-confirm-title" aria-describedby="management-confirm-detail">
            <h2 id="management-confirm-title">Remove “{pendingRemoval.name}”?</h2>
            <p id="management-confirm-detail">This will remove the habit from your current and future daily tracking. All previously recorded entries will remain in your history, and you can restore this habit later.</p>
            <div className="management-dialog-actions">
              <button className="management-secondary" type="button" onClick={() => setPendingRemoval(null)} disabled={busy} autoFocus>Cancel</button>
              <button className="management-remove" type="button" onClick={() => changeVisibility(pendingRemoval, false)} disabled={busy}>
                {busy ? "Removing..." : "Remove habit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default HabitManagement;
