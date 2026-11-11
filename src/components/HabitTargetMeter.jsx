import { targetProgress } from "../habitTargetProgress.mjs";

export default function HabitTargetMeter({ name, unit, value, target }) {
  const progress = targetProgress(value, target);
  if (!progress) return null;
  const { percent, reached } = progress;
  return (
    <div className={`habit-target-meter ${reached ? "is-reached" : ""}`}>
      <span>{progress.value} of {progress.target} {unit} · {percent}%{reached ? " · Target reached!" : ""}</span>
      <progress max={progress.target} value={Math.min(progress.target, progress.value)}
        aria-label={`${name}: ${progress.value} of ${progress.target} ${unit}`} />
    </div>
  );
}
