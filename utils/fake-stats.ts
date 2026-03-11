import type { CompletionHistory } from "@/context/tasks-store";

export type FakeStatusDay = {
  completedCount: number;
  totalCount: number;
};

export type FakeStatsDataset = {
  completionHistory: CompletionHistory;
  statusByDate: Record<string, FakeStatusDay>;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_TO_GENERATE = 620;
const CURRENT_STREAK_COMPLETIONS = [5, 4, 6, 3, 5, 4, 3, 2] as const;

let cachedDayKey: string | null = null;
let cachedDataset: FakeStatsDataset | null = null;

function getStartOfLocalDay(value: Date = new Date()): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
}

function toLocalISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCompletionCountForDaysAgo(daysAgo: number): number {
  if (daysAgo >= 0 && daysAgo < CURRENT_STREAK_COMPLETIONS.length) {
    return CURRENT_STREAK_COMPLETIONS[daysAgo] ?? 0;
  }

  // Explicit streak break: one day before the 8-day streak.
  if (daysAgo === CURRENT_STREAK_COMPLETIONS.length) {
    return 0;
  }

  // Last few weeks: fuller activity with regular breaks.
  if (daysAgo <= 45) {
    if (daysAgo % 5 === 0) return 0;
    return 1 + ((daysAgo + 2) % 4);
  }

  // Last months: stable activity pattern with no long consecutive streaks.
  if (daysAgo <= 180) {
    if (daysAgo % 4 === 0) return 0;
    return 1 + ((daysAgo + 1) % 3);
  }

  // Older history: lighter but still populated to keep 1y/max charts meaningful.
  if (daysAgo <= DAYS_TO_GENERATE) {
    if (daysAgo % 3 === 0) return 0;
    return 1 + ((daysAgo + 3) % 2);
  }

  return 0;
}

function getTotalCountForDay(daysAgo: number, completedCount: number): number {
  if (daysAgo === CURRENT_STREAK_COMPLETIONS.length) {
    return 4;
  }

  if (completedCount <= 0) {
    if (daysAgo % 2 === 0) {
      return 1 + ((daysAgo + 1) % 3);
    }
    return daysAgo % 7 === 0 ? 1 : 0;
  }

  if (daysAgo <= 7) {
    return completedCount + 2 + (daysAgo % 2);
  }

  if (daysAgo <= 45) {
    return completedCount + 1 + ((daysAgo + 1) % 3);
  }

  if (daysAgo <= 180) {
    return completedCount + 1 + (daysAgo % 2);
  }

  return completedCount + 1 + ((daysAgo + 2) % 2);
}

export function getFakeStatsDataset(referenceDate: Date = new Date()): FakeStatsDataset {
  const today = getStartOfLocalDay(referenceDate);
  const dayKey = toLocalISODate(today);

  if (cachedDataset && cachedDayKey === dayKey) {
    return cachedDataset;
  }

  const completionHistory: CompletionHistory = {};
  const statusByDate: Record<string, FakeStatusDay> = {};

  for (let daysAgo = DAYS_TO_GENERATE; daysAgo >= 0; daysAgo -= 1) {
    const day = new Date(today.getTime() - daysAgo * DAY_MS);
    const dateStr = toLocalISODate(day);
    const completedCount = getCompletionCountForDaysAgo(daysAgo);
    const totalCount = Math.max(
      completedCount,
      getTotalCountForDay(daysAgo, completedCount),
    );

    if (completedCount > 0) {
      completionHistory[dateStr] = completedCount;
    }

    if (totalCount > 0) {
      statusByDate[dateStr] = { completedCount, totalCount };
    }
  }

  cachedDayKey = dayKey;
  cachedDataset = { completionHistory, statusByDate };
  return cachedDataset;
}
