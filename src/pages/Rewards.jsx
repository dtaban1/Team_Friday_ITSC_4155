import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../styles/dashboard.css";
import "../styles/rewards.css";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");
const LABELS = { task: "Task", goal: "Goal", event: "Event", habit: "Habit milestone", daily: "Daily reward", seven_day: "Seven-day reward" };
const RULES = {
  task: "Claim once after you mark this task complete.",
  goal: "Claim once after you mark this goal complete.",
  event: "Claim once when the event's scheduled date and time arrive. Events without a time unlock at the start of that day.",
  habit: "Choose how many different days to log this habit. Only positive values count; the days do not need to be consecutive.",
  daily: "Log a positive value for any active habit today. You can claim this reward once each day.",
  seven_day: "Log a positive value for any active habit on seven consecutive days, including today. Claim again after another seven non-overlapping days.",
};

async function request(path = "", options = {}) {
  const response = await fetch(`${API_URL}/api/rewards${path}`, {
    credentials: "include", ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || "We could not complete that request. Please try again.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function readPhoto(file) {
  if (!file) return Promise.resolve("");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
    return Promise.reject(new Error("Choose a JPEG, PNG, or WebP photo up to 2 MB."));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("This photo could not be read. Try another file."));
    reader.readAsDataURL(file);
  });
}

function Rewards() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetType, setTargetType] = useState("daily");
  const [selectedTarget, setSelectedTarget] = useState("");
  const [milestoneDays, setMilestoneDays] = useState(7);
  const [photo, setPhoto] = useState("");
  const [photoVersion, setPhotoVersion] = useState(0);
  const [claimNotes, setClaimNotes] = useState({});
  const [pendingDelete, setPendingDelete] = useState(null);
  const photoInput = useRef(null);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const handleError = useCallback((requestError) => {
    if (requestError.status === 401) navigate("/login", { replace: true });
    else if (requestError.name !== "AbortError") setError(requestError.message);
  }, [navigate]);

  const refresh = useCallback(async (signal) => {
    const next = await request("", { signal });
    if (!signal?.aborted) setData(next);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal).catch(handleError).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [refresh, handleError]);

  // Refresh eligibility after completing dashboard items or crossing midnight.
  useEffect(() => {
    const controller = new AbortController();
    const sync = () => { if (!busy) refresh(controller.signal).catch(handleError); };
    window.addEventListener("focus", sync);
    const timer = window.setInterval(sync, 60000);
    return () => { controller.abort(); window.removeEventListener("focus", sync); window.clearInterval(timer); };
  }, [busy, refresh, handleError]);

  const runAction = async (action) => {
    setError(""); setMessage(""); setBusy(true);
    try {
      const result = await action();
      setMessage(result.message);
      await refresh();
    } catch (requestError) { handleError(requestError); }
    finally { setBusy(false); }
  };

  const handleCreate = (event) => {
    event.preventDefault();
    const [kind, id] = selectedTarget.split(":");
    runAction(async () => {
      const result = await request("", { method: "POST", body: JSON.stringify({
        title, description, targetType, timeZone,
        targetId: id ? Number(id) : null,
        habitKind: targetType === "habit" ? kind : null,
        milestoneDays: targetType === "habit" ? Number(milestoneDays) : null,
        image: photo || null,
      }) });
      setTitle(""); setDescription(""); setPhoto("");
      if (photoInput.current) photoInput.current.value = "";
      return result;
    });
  };

  const selectPhoto = async (event) => {
    const file = event.target.files?.[0];
    setReadingPhoto(true); setError("");
    try { setPhoto(await readPhoto(file)); }
    catch (photoError) { setPhoto(""); event.target.value = ""; setError(photoError.message); }
    finally { setReadingPhoto(false); }
  };

  const changePhoto = (rewardId, file) => runAction(async () => {
    const image = await readPhoto(file);
    const result = await request(`/${rewardId}/image`, { method: "PUT", body: JSON.stringify({ image: image || null }) });
    setPhotoVersion((value) => value + 1);
    return result;
  });

  const targets = data?.targets || {};
  const options = targetType === "habit" ? targets.habits || [] : targets[`${targetType}s`] || [];
  const linked = ["task", "goal", "event", "habit"].includes(targetType);
  const rewards = data?.rewards || [];
  const history = data?.history || [];
  const ready = rewards.filter((reward) => reward.status.eligible).length;

  return (
    <main className="dashboard-page rewards-page">
      <header className="dashboard-header">
        <Link className="dashboard-brand" to="/dashboard" aria-label="OnTrack dashboard"><img src="/ontrack-logo.png" alt="OnTrack" /></Link>
        <nav className="dashboard-nav" aria-label="Rewards navigation">
          <Link className="dashboard-nav-link" to="/dashboard">Dashboard</Link>
          <Link className="dashboard-nav-link" to="/habits/manage">Manage habits</Link>
          <Link className="dashboard-nav-link is-active" to="/rewards" aria-current="page">Rewards</Link>
        </nav>
      </header>
      <section className="dashboard-shell">
        <div className="rewards-hero">
          <div>
            <span className="dashboard-kicker">Small wins deserve a little celebration</span>
            <h1>Your effort. Your reward.</h1>
            <p>Pick something that makes you happy, link it to your progress, and celebrate when you get there.</p>
            <p className="rewards-disclaimer">These are personal rewards you give yourself. OnTrack records them; it does not provide prizes, money, or purchases.</p>
          </div>
          <a className="rewards-primary" href="#new-reward">＋ Plan a reward</a>
        </div>

        {error && <p className="dashboard-alert" role="alert">{error} <button type="button" onClick={() => runAction(async () => ({ message: "Rewards refreshed." }))} disabled={busy}>Retry</button></p>}
        {message && <p className="rewards-notice" role="status">{message}</p>}
        {loading ? <p role="status">Loading your rewards…</p> : data && <>
          <div className="rewards-summary" aria-label="Reward summary">
            <div><strong>{rewards.length}</strong><span>personal rewards</span></div>
            <div><strong>{ready}</strong><span>ready to claim</span></div>
            <div><strong>{history.length}{history.length === 50 ? "+" : ""}</strong><span>recent celebrations</span></div>
          </div>

          <div className="rewards-layout">
            <section className="dashboard-card rewards-create" id="new-reward" aria-labelledby="new-reward-title">
              <span className="dashboard-card-label">Something to look forward to</span>
              <h2 id="new-reward-title">Plan your reward</h2>
              <form onSubmit={handleCreate}>
                <fieldset disabled={busy || readingPhoto}>
                  <label className="rewards-field">My reward
                    <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required placeholder="A movie night, a favorite snack…" />
                  </label>
                  <label className="rewards-field">Description <span className="rewards-optional">(optional)</span>
                    <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={3} placeholder="How will you treat yourself?" />
                  </label>
                  <label className="rewards-field">Earn it through
                    <select value={targetType} onChange={(event) => { setTargetType(event.target.value); setSelectedTarget(""); }}>
                      {Object.entries(LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                    </select>
                  </label>
                  {linked && <label className="rewards-field">Choose a {targetType}
                    <select value={selectedTarget} onChange={(event) => setSelectedTarget(event.target.value)} required>
                      <option value="">Select {targetType}…</option>
                      {options.map((item) => <option value={`${item.kind || targetType}:${item.id}`} key={`${item.kind || targetType}:${item.id}`}>{item.title}{item.kind ? ` (${item.kind})` : ""}</option>)}
                    </select>
                  </label>}
                  {linked && !options.length && <p className="rewards-rule">No available {targetType}s yet. <Link to={targetType === "habit" ? "/habits/manage" : `/dashboard#${targetType}s`}>Add one first →</Link></p>}
                  {targetType === "habit" && <label className="rewards-field">Logged-day milestone
                    <input type="number" min={1} max={365} step={1} value={milestoneDays} onChange={(event) => setMilestoneDays(event.target.value)} required />
                  </label>}
                  <p className="rewards-rule">{RULES[targetType]}</p>
                  <p className="rewards-timezone">Calendar used for this reward: {timeZone}. It is saved when you create the reward.</p>
                  <label className="rewards-field">Reward photo <span className="rewards-optional">(optional)</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" ref={photoInput} onChange={selectPhoto} aria-describedby="photo-help" />
                  </label>
                  <p className="rewards-timezone" id="photo-help">JPEG, PNG, or WebP; maximum 2 MB. Photos are private to your account.</p>
                  {photo && <div className="rewards-preview"><img src={photo} alt="Selected reward preview" /><button type="button" onClick={() => { setPhoto(""); photoInput.current.value = ""; }}>Remove photo</button></div>}
                  <button className="rewards-primary" type="submit" disabled={linked && !options.length}>{busy ? "Saving…" : "Save my reward"}</button>
                </fieldset>
                {readingPhoto && <p role="status">Reading photo…</p>}
              </form>
            </section>

            <section aria-labelledby="my-rewards-title">
              <div className="rewards-section-heading"><div><span className="dashboard-card-label">Keep your momentum</span><h2 id="my-rewards-title">My rewards</h2></div>
                <button type="button" className="rewards-text-button" disabled={busy} onClick={() => runAction(async () => ({ message: "Progress refreshed." }))}>Refresh progress</button>
              </div>
              {!rewards.length && <div className="dashboard-card rewards-empty"><span aria-hidden="true">✦</span><h3>Your first reward starts here</h3><p>Plan a small treat for today's habit, or something bigger for your next milestone.</p></div>}
              <div className="rewards-card-list">
                {rewards.map((reward) => <article className={`dashboard-card reward-card ${reward.status.eligible ? "reward-ready" : ""}`} key={reward.id}>
                  {reward.hasImage && <img className="reward-photo" crossOrigin="use-credentials" src={`${API_URL}/api/rewards/${reward.id}/image?v=${photoVersion}`} alt={`Reward: ${reward.title}`} />}
                  <div className="reward-card-body">
                    <div className="reward-title-row"><span className="reward-type">{LABELS[reward.targetType]}</span><span className={`reward-status ${reward.status.eligible ? "ready" : ""}`}>{reward.status.eligible ? "Ready to claim" : reward.status.reason === "Already claimed" ? "Celebrated" : "In progress"}</span></div>
                    <h3>{reward.title}</h3>
                    {reward.description && <p>{reward.description}</p>}
                    <p className="reward-target">For: {reward.targetLabel}{reward.targetType === "habit" ? ` · ${reward.milestoneDays} logged days` : ""}</p>
                    {!reward.status.eligible && <p className="reward-reason">{reward.status.reason}</p>}
                    {["habit", "seven_day"].includes(reward.targetType) && <progress max={reward.status.total} value={reward.status.progress} aria-label={`${reward.title}: ${reward.status.progress} of ${reward.status.total} days`} />}
                    {reward.status.eligible && <form className="reward-claim-form" onSubmit={(event) => { event.preventDefault(); runAction(() => request(`/${reward.id}/claim`, { method: "POST", body: JSON.stringify({ note: claimNotes[reward.id] || "" }) })); }}>
                      <label className="rewards-field">How are you celebrating? <span className="rewards-optional">(optional)</span>
                        <input maxLength={500} value={claimNotes[reward.id] || ""} onChange={(event) => setClaimNotes((current) => ({ ...current, [reward.id]: event.target.value }))} placeholder="Write a memory for your history" disabled={busy} />
                      </label>
                      <button className="rewards-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Claim my reward ✓"}</button>
                    </form>}
                    <div className="reward-tools">
                      <label className="reward-upload-label">{reward.hasImage ? "Change photo" : "Add photo"}<input type="file" aria-label={`${reward.hasImage ? "Change" : "Add"} photo for ${reward.title}`} accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) changePhoto(reward.id, file); event.target.value = ""; }} /></label>
                      {reward.hasImage && <button type="button" disabled={busy} onClick={() => changePhoto(reward.id, null)}>Remove photo</button>}
                      <button className="reward-delete" type="button" disabled={busy} onClick={() => setPendingDelete(reward.id)}>Delete</button>
                    </div>
                    {pendingDelete === reward.id && <div className="reward-delete-confirm" role="group" aria-label={`Confirm deletion of ${reward.title}`}>
                      <p>Delete this reward, its photo, and all its claim history? This cannot be undone.</p>
                      <button type="button" disabled={busy} onClick={() => runAction(async () => { const result = await request(`/${reward.id}`, { method: "DELETE" }); setPendingDelete(null); return result; })}>Delete reward</button>
                      <button type="button" disabled={busy} onClick={() => setPendingDelete(null)}>Cancel</button>
                    </div>}
                  </div>
                </article>)}
              </div>
            </section>
          </div>

          <section className="dashboard-card rewards-history" aria-labelledby="reward-history-title">
            <span className="dashboard-card-label">You earned these moments</span><h2 id="reward-history-title">Celebration history</h2>
            <p>Your latest 50 claims. Claiming records your celebration; you arrange the reward yourself.</p>
            {!history.length ? <p>No claims yet. Your celebrations will appear here after you claim an earned reward.</p> : <ol>
              {history.map((claim) => <li key={claim.id}><span className="reward-history-check" aria-hidden="true">✓</span><div><h3>{claim.rewardTitle}</h3><p>{claim.targetLabel}</p>{claim.note && <p className="reward-history-note">{claim.note}</p>}<time dateTime={claim.claimedAt}>{new Date(claim.claimedAt).toLocaleString()}</time></div></li>)}
            </ol>}
          </section>
        </>}
      </section>
    </main>
  );
}

export default Rewards;
