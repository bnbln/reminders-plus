/**
 * Builds the props the iOS widgets render from.
 *
 * Everything here runs in the app (not in the widget runtime), so it may use
 * the store, `Intl` and the app's translations. The result has to stay plain
 * JSON: it is written to the shared app group container and read back by the
 * WidgetKit extension.
 */
import type { CompletionHistory, Project, Task } from '@/context/tasks-store';
import { countLabel, getIntlLocale, t } from '@/i18n';
import {
  getStartOfLocalDayMs,
  getStartOfNextLocalDayMs,
  hasValidDueAt,
} from '@/utils/task-dates';

import type { StreakWidgetDay, StreakWidgetProps, TasksWidgetProps } from './types';

export type WidgetSource = {
  tasks: Task[];
  projects: Project[];
  completionHistory: CompletionHistory;
  /** Accent color (hex) resolved from the app's appearance settings. */
  accent: string;
};

/** Days of history the activity strip shows. */
const WEEK_LENGTH = 7;
/** Upper bound for the task list; every family slices what it can show. */
const MAX_TASKS = 8;
/** WidgetKit only keeps a handful of entries around — stay well below that. */
const MAX_TIMELINE_ENTRIES = 12;

const STREAK_URL = 'reminds:///home/streaks';
const TODAY_URL = 'reminds:///home/today';

function toLocalISODate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseHex(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized.slice(0, 6);
  const value = Number.parseInt(expanded, 16);
  if (!Number.isFinite(value)) return [255, 149, 0];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Mixes `color` towards `target`; `amount` is how much of `target` wins. */
function mixHex(color: string, target: string, amount: number): string {
  const [r1, g1, b1] = parseHex(color);
  const [r2, g2, b2] = parseHex(target);
  const mix = (a: number, b: number) => clampChannel(a + (b - a) * amount);
  const toHex = (channel: number) => channel.toString(16).padStart(2, '0');
  return `#${toHex(mix(r1, r2))}${toHex(mix(g1, g2))}${toHex(mix(b1, b2))}`;
}

/**
 * A barely-there wash of the accent color, so the widget reads as part of the
 * app without fighting the Home Screen wallpaper.
 */
function backgroundStops(accent: string) {
  return {
    backgroundLight: [mixHex(accent, '#FFFFFF', 0.86), '#FFFFFF'],
    backgroundDark: [mixHex(accent, '#151718', 0.8), '#151718'],
  };
}

export type StreakStatsSnapshot = {
  current: number;
  best: number;
  todayCount: number;
  days: StreakWidgetDay[];
  maxCount: number;
};

/**
 * Same rules as the in-app streak screen: a streak survives as long as today or
 * yesterday has at least one completion.
 */
export function computeStreakSnapshot(
  completionHistory: CompletionHistory,
  nowMs: number,
): StreakStatsSnapshot {
  const counts = new Map<string, number>();
  for (const [dateStr, count] of Object.entries(completionHistory ?? {})) {
    if (typeof count === 'number' && Number.isFinite(count) && count > 0) {
      counts.set(dateStr, count);
    }
  }

  const todayKey = toLocalISODate(nowMs);
  const yesterday = new Date(nowMs);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = toLocalISODate(yesterday.getTime());

  let current = 0;
  if (counts.has(todayKey) || counts.has(yesterdayKey)) {
    const cursor = new Date(counts.has(todayKey) ? nowMs : yesterday.getTime());
    while (counts.has(toLocalISODate(cursor.getTime()))) {
      current += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
  }

  let best = 0;
  let run = 0;
  let previous: number | null = null;
  for (const dateStr of Array.from(counts.keys()).sort()) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const time = new Date(year, (month ?? 1) - 1, day ?? 1).getTime();
    const dayDiff = previous == null ? null : Math.round((time - previous) / 86_400_000);
    run = dayDiff === 1 ? run + 1 : 1;
    if (run > best) best = run;
    previous = time;
  }

  const weekdayFormatter = new Intl.DateTimeFormat(getIntlLocale(), { weekday: 'short' });
  const days: StreakWidgetDay[] = [];
  for (let offset = WEEK_LENGTH - 1; offset >= 0; offset -= 1) {
    const date = new Date(nowMs);
    date.setDate(date.getDate() - offset);
    const key = toLocalISODate(date.getTime());
    days.push({
      key,
      label: weekdayFormatter.format(date).replace(/\.$/u, '').slice(0, 2),
      count: counts.get(key) ?? 0,
      isToday: offset === 0,
    });
  }

  return {
    current,
    best: Math.max(best, current),
    todayCount: counts.get(todayKey) ?? 0,
    days,
    maxCount: Math.max(1, ...days.map((day) => day.count)),
  };
}

/** Open tasks that are due today or already overdue, earliest first. */
export function selectTodayTasks(tasks: Task[], nowMs: number): Task[] {
  const endOfToday = getStartOfNextLocalDayMs(nowMs);
  return tasks
    .filter(
      (task) =>
        !task.deletedAt &&
        task.section !== 'completed' &&
        !task.completedAt &&
        hasValidDueAt(task.dueAt) &&
        task.dueAt < endOfToday,
    )
    .sort((a, b) => a.dueAt - b.dueAt || a.orderRank - b.orderRank);
}

function countCompletedToday(tasks: Task[], nowMs: number): number {
  const startOfToday = getStartOfLocalDayMs(nowMs);
  const endOfToday = getStartOfNextLocalDayMs(nowMs);
  return tasks.filter(
    (task) =>
      !task.deletedAt &&
      typeof task.completedAt === 'number' &&
      task.completedAt >= startOfToday &&
      task.completedAt < endOfToday,
  ).length;
}

export function buildStreakWidgetProps(source: WidgetSource, nowMs: number): StreakWidgetProps {
  const snapshot = computeStreakSnapshot(source.completionHistory, nowMs);
  const openCount = selectTodayTasks(source.tasks, nowMs).length;

  return {
    streak: snapshot.current,
    best: snapshot.best,
    todayCount: snapshot.todayCount,
    goal: Math.max(1, snapshot.todayCount + openCount),
    days: snapshot.days,
    maxCount: snapshot.maxCount,
    accent: source.accent,
    ...backgroundStops(source.accent),
    streakLabel: t(snapshot.current === 1 ? 'streaks.hero.one' : 'streaks.hero.other'),
    todayLabel: t('streaks.stats.today'),
    bestLabel: t('streaks.stats.longest'),
    todayValueLabel: countLabel(
      snapshot.todayCount,
      'streaks.count.tasks.one',
      'streaks.count.tasks.other',
    ),
    bestValueLabel: countLabel(
      snapshot.best,
      'streaks.count.days.one',
      'streaks.count.days.other',
    ),
    startLabel: t('widgets.streak.start'),
    inlineLabel: `${snapshot.current} ${t(
      snapshot.current === 1 ? 'streaks.hero.one' : 'streaks.hero.other',
    )}`,
    url: STREAK_URL,
  };
}

export function buildTasksWidgetProps(source: WidgetSource, nowMs: number): TasksWidgetProps {
  const locale = getIntlLocale();
  const timeFormatter = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
  // Tasks left over from earlier days show their date instead of a time that
  // would read as if they were due today.
  const overdueDateFormatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric' });
  const startOfToday = getStartOfLocalDayMs(nowMs);
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const projectColors = new Map(source.projects.map((project) => [project.id, project.color]));
  const openTasks = selectTodayTasks(source.tasks, nowMs);
  const doneCount = countCompletedToday(source.tasks, nowMs);
  const total = doneCount + openTasks.length;

  return {
    title: t('common.today'),
    dateLabel: dateFormatter.format(new Date(nowMs)),
    progressLabel:
      total > 0
        ? t('status.hero.withTasks', { done: doneCount, total })
        : t('status.hero.empty'),
    progress: total > 0 ? doneCount / total : 0,
    openCount: openTasks.length,
    openLabel: countLabel(
      openTasks.length,
      'streaks.count.tasks.one',
      'streaks.count.tasks.other',
    ),
    tasks: openTasks.slice(0, MAX_TASKS).map((task) => ({
      id: task.id,
      title: task.title,
      emoji: task.emoji ?? '',
      time:
        task.dueAt < startOfToday
          ? overdueDateFormatter.format(new Date(task.dueAt))
          : task.dueHasTime === false
            ? ''
            : timeFormatter.format(new Date(task.dueAt)),
      color: task.color ?? projectColors.get(task.projectId) ?? source.accent,
      overdue: task.dueAt < nowMs,
      url: `reminds:///task/${encodeURIComponent(task.id)}`,
    })),
    doneIds: [],
    emptyLabel: t('widgets.tasks.allDone'),
    emptySubtitle: t('today.empty'),
    moreTemplate: t('widgets.tasks.more', { count: '{count}' }),
    accent: source.accent,
    ...backgroundStops(source.accent),
    url: TODAY_URL,
  };
}

/**
 * Times at which the widgets have to re-render on their own: when the next task
 * turns overdue, and at midnight when "today" moves on.
 */
export function buildTimelineDates(tasks: Task[], nowMs: number): number[] {
  const endOfToday = getStartOfNextLocalDayMs(nowMs);
  const dates = new Set<number>([nowMs, endOfToday]);
  for (const task of selectTodayTasks(tasks, nowMs)) {
    if (task.dueAt > nowMs && task.dueAt < endOfToday) {
      dates.add(task.dueAt);
    }
  }
  return Array.from(dates)
    .sort((a, b) => a - b)
    .slice(0, MAX_TIMELINE_ENTRIES);
}
