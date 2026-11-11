const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const TYPES = new Set(["task", "goal", "event", "habit", "daily", "seven_day"]);

class RewardError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function calendar(timeZone, now = new Date()) {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now).map(({ type, value }) => [type, value]));
    return { today: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
  } catch {
    throw new RewardError("Choose a valid time zone.");
  }
}

function previousDay(day, count = 1) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - count);
  return date.toISOString().slice(0, 10);
}

function decodeImage(image) {
  if (image == null || image === "") return { bytes: null, mime: null };
  if (typeof image !== "string" || image.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 50) {
    throw new RewardError("Choose a JPEG, PNG, or WebP photo up to 2 MB.");
  }
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
  if (!match || match[2].length % 4 !== 0) throw new RewardError("Choose a valid JPEG, PNG, or WebP photo.");
  const bytes = Buffer.from(match[2], "base64");
  const mime = match[1];
  const valid = (mime === "image/png" && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (mime === "image/jpeg" && bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
    (mime === "image/webp" && bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP");
  if (!valid || !bytes.length || bytes.length > MAX_IMAGE_BYTES || bytes.toString("base64") !== match[2]) {
    throw new RewardError("Choose a valid JPEG, PNG, or WebP photo up to 2 MB.");
  }
  return { bytes, mime };
}

function validateReward(body = {}) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!title || title.length > 120 || description.length > 500 || !TYPES.has(body.targetType)) {
    throw new RewardError("Enter a reward name (up to 120 characters), a valid link, and a description up to 500 characters.");
  }
  const timeZone = body.timeZone;
  if (typeof timeZone !== "string" || !timeZone || timeZone.length > 64) throw new RewardError("Choose a valid time zone.");
  calendar(timeZone);
  const linked = ["task", "goal", "event", "habit"].includes(body.targetType);
  const targetId = linked ? positiveId(body.targetId) : null;
  const habitKind = body.targetType === "habit" ? body.habitKind : null;
  const milestoneDays = body.targetType === "habit" ? body.milestoneDays : null;
  if (linked && !targetId) throw new RewardError("Select the item this reward belongs to.");
  if (body.targetType === "habit" && (!["standard", "custom"].includes(habitKind) ||
      !Number.isInteger(milestoneDays) || milestoneDays < 1 || milestoneDays > 365)) {
    throw new RewardError("Choose a habit and a milestone between 1 and 365 logged days.");
  }
  return { title, description, targetType: body.targetType, targetId, habitKind, milestoneDays, timeZone,
    image: decodeImage(body.image) };
}

function findTarget(reward, context) {
  const collection = { task: context.tasks, goal: context.goals, event: context.events, habit: context.habits }[reward.targetType];
  return collection?.find((item) => Number(item.id) === Number(reward.targetId) &&
    (reward.targetType !== "habit" || item.kind === reward.habitKind));
}

function rewardStatus(reward, context, claims = [], now = new Date()) {
  const { today, time } = calendar(reward.timeZone, now);
  const ownClaims = claims.filter((claim) => Number(claim.rewardId) === Number(reward.id));
  const recurring = ["daily", "seven_day"].includes(reward.targetType);
  if (!recurring && ownClaims.length) return { eligible: false, reason: "Already claimed", progress: 1, total: 1, periodKey: "once" };
  const target = findTarget(reward, context);
  let eligible = false;
  let reason = "";
  let progress = 0;
  let total = 1;
  let periodKey = "once";
  if (["task", "goal"].includes(reward.targetType)) {
    eligible = Boolean(target?.completed);
    progress = Number(eligible);
    reason = !target ? "Linked item is no longer available" : `Complete the linked ${reward.targetType}`;
  } else if (reward.targetType === "event") {
    eligible = Boolean(target && (target.eventDate < today ||
      (target.eventDate === today && (!target.eventTime || target.eventTime <= time))));
    progress = Number(eligible);
    reason = !target ? "Linked event is no longer available" : "Available when the event starts";
  } else if (reward.targetType === "habit") {
    total = reward.milestoneDays;
    progress = target ? new Set(context.entries.filter((entry) => entry.kind === reward.habitKind &&
      Number(entry.habitId) === Number(reward.targetId) && entry.entryDate <= today).map((entry) => entry.entryDate)).size : 0;
    eligible = Boolean(target && progress >= total);
    reason = !target ? "Restore the linked habit to continue" : `${Math.min(progress, total)} of ${total} logged days`;
  } else {
    // One or more positive entries in an active habit counts as one activity day.
    const dates = new Set(context.entries.filter((entry) => entry.entryDate <= today).map((entry) => entry.entryDate));
    periodKey = today;
    if (reward.targetType === "daily") {
      eligible = dates.has(today);
      progress = Number(eligible);
      reason = "Log a positive habit value today";
      if (ownClaims.some((claim) => claim.periodKey === today)) return { eligible: false, reason: "Claimed today", progress: 1, total: 1, periodKey };
    } else {
      total = 7;
      let cursor = dates.has(today) ? today : previousDay(today);
      while (dates.has(cursor)) { progress++; cursor = previousDay(cursor); }
      // Claim windows must not overlap. A seven-day reward can be earned again.
      const recent = ownClaims.filter((claim) => claim.periodKey >= previousDay(today, 6))
        .sort((a, b) => b.periodKey.localeCompare(a.periodKey))[0];
      if (recent) {
        return { eligible: false, reason: `Next seven-day claim on or after ${previousDay(recent.periodKey, -7)}`,
          progress: Math.min(progress, total), total, periodKey };
      }
      eligible = dates.has(today) && progress >= 7;
      reason = `${Math.min(progress, 7)} of 7 consecutive days; log today to claim`;
    }
  }
  return { eligible, reason: eligible ? "Ready to claim" : reason, progress: Math.min(progress, total), total, periodKey };
}

module.exports = { MAX_IMAGE_BYTES, RewardError, positiveId, calendar, previousDay, decodeImage,
  validateReward, findTarget, rewardStatus };
