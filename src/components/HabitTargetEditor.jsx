import { useState } from "react";

export default function HabitTargetEditor({ habit, target, busy, onSave, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const startEdit = () => { setValue(target == null ? "" : String(target)); setEditing(true); };
  const save = async (event) => {
    event.preventDefault();
    if (await onSave(habit, Number(value))) setEditing(false);
  };
  return (
    <div className="habit-target-editor">
      <span>Daily target: <strong>{target == null ? "Not set" : `${target} ${habit.unit}`}</strong></span>
      {editing ? (
        <form className="habit-target-form" onSubmit={save}>
          <label htmlFor={`target-${habit.kind}-${habit.id}`}>Daily target ({habit.unit})</label>
          <input id={`target-${habit.kind}-${habit.id}`} type="number" min="0.01" max="99999999.99" step="0.01"
            value={value} onChange={(event) => setValue(event.target.value)} required disabled={busy} autoFocus />
          <button className="management-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save target"}</button>
          <button className="management-secondary" type="button" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
        </form>
      ) : (
        <div className="habit-target-actions">
          <button className="management-secondary" type="button" disabled={busy} onClick={startEdit}
            aria-label={`${target == null ? "Set" : "Edit"} daily target for ${habit.name}`}>{target == null ? "Set target" : "Edit target"}</button>
          {target != null && <button className="management-secondary" type="button" disabled={busy}
            onClick={() => onRemove(habit)} aria-label={`Remove daily target for ${habit.name}`}>Remove target</button>}
        </div>
      )}
    </div>
  );
}
