export type ActiveSectionId = "today" | "upcoming";
export type AnySectionId = ActiveSectionId | "completed";

const DEFAULT_DUE_HOUR_WITH_TIME = 9;
const DEFAULT_DUE_MINUTE_WITH_TIME = 0;
const DEFAULT_DUE_HOUR_WITHOUT_TIME = 12;

export function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function hasValidDueAt(value: unknown): value is number {
  return isFiniteTimestamp(value) && value > 0;
}

export function getStartOfLocalDayMs(value: number | Date = Date.now()) {
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  ).getTime();
}

export function getStartOfNextLocalDayMs(value: number | Date = Date.now()) {
  const start = new Date(getStartOfLocalDayMs(value));
  start.setDate(start.getDate() + 1);
  return start.getTime();
}

export function isSameLocalDay(
  left: number | Date,
  right: number | Date,
): boolean {
  const a = typeof left === "number" ? new Date(left) : new Date(left);
  const b = typeof right === "number" ? new Date(right) : new Date(right);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function deriveActiveSectionFromDueAt(
  dueAt: number,
  referenceMs: number = Date.now(),
): ActiveSectionId {
  if (!hasValidDueAt(dueAt)) return "upcoming";
  return isSameLocalDay(dueAt, referenceMs) ? "today" : "upcoming";
}

export function deriveSectionForTask(task: {
  section: AnySectionId;
  dueAt: number;
  completedAt?: number;
}): AnySectionId {
  if (task.section === "completed" || hasValidDueAt(task.completedAt)) {
    return "completed";
  }
  return deriveActiveSectionFromDueAt(task.dueAt);
}

export function alignDueAtToLocalDay(
  targetDayStartMs: number,
  options: {
    sourceDueAt?: number;
    keepTime?: boolean;
    fallbackHour?: number;
    fallbackMinute?: number;
  } = {},
): number {
  const day = new Date(getStartOfLocalDayMs(targetDayStartMs));
  const source = hasValidDueAt(options.sourceDueAt)
    ? new Date(options.sourceDueAt)
    : null;

  if (options.keepTime) {
    const hour =
      source?.getHours() ??
      (options.fallbackHour ?? DEFAULT_DUE_HOUR_WITH_TIME);
    const minute =
      source?.getMinutes() ??
      (options.fallbackMinute ?? DEFAULT_DUE_MINUTE_WITH_TIME);
    day.setHours(hour, minute, 0, 0);
    return day.getTime();
  }

  day.setHours(options.fallbackHour ?? DEFAULT_DUE_HOUR_WITHOUT_TIME, 0, 0, 0);
  return day.getTime();
}
