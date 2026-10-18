import { Platform } from "react-native";

import * as Notifications from "expo-notifications";

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { AppBadgeMode } from "@/context/settings-store";
import type {
  CompletionHistory,
  Project,
  Task,
} from "@/context/tasks-store";
import { getLocale, t } from "@/i18n";
import {
  getStartOfLocalDayMs,
  hasValidDueAt,
  isSameLocalDay,
} from "@/utils/task-dates";

type TaskNotificationMapEntry = {
  notificationId: string;
  dueAt: number;
  /** Fingerprint of the scheduled content; missing on entries from older builds. */
  signature?: string;
};

type TaskNotificationMap = Record<string, TaskNotificationMapEntry>;

type DailySummaryScheduleState = {
  notificationId: string;
  signature: string;
  minutesOfDay: number;
};

type StreakMotivationScheduleState = {
  dayKey: string;
  firstScheduledAt: number;
  /** Legacy evening follow-up; no longer scheduled, only cancelled. */
  secondScheduledAt: number;
  firstNotificationId?: string;
  secondNotificationId?: string;
  /** Fingerprint of the scheduled content. */
  signature?: string;
};

type TaskCounters = {
  dueToday: number;
  overdue: number;
  open: number;
  completedToday: number;
};

const STORAGE_KEYS = {
  map: "reminds.tasks.notificationMap.v1",
  dailySummary: "reminds.notifications.dailySummary.v1",
  streakMotivation: "reminds.notifications.streakMotivation.v1",
} as const;

// Stable identifiers: scheduling again with the same id replaces the pending
// notification instead of adding a second one.
const NOTIFICATION_IDS = {
  dailySummary: "reminds.dailySummary",
  streakNudge: "reminds.streakNudge",
} as const;
const TASK_DUE_ID_PREFIX = "reminds.taskDue.";

function getTaskDueNotificationId(taskId: string): string {
  return `${TASK_DUE_ID_PREFIX}${taskId}`;
}

// Every sync reads stored state, awaits several native calls and writes the
// state back. Running two at once schedules duplicates, so they share a queue.
let notificationQueue: Promise<void> = Promise.resolve();

function runSerialized(job: () => Promise<void>): Promise<void> {
  const run = notificationQueue.then(job, job);
  notificationQueue = run.catch(() => undefined);
  return run;
}

let didPruneOrphanedNotifications = false;

async function readMap(): Promise<TaskNotificationMap> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.map);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as TaskNotificationMap;
  } catch {
    return {};
  }
}

async function writeMap(map: TaskNotificationMap): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.map, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function normalizeMinutesOfDay(value: number): number {
  if (!Number.isFinite(value)) return 20 * 60;
  const rounded = Math.round(value);
  return ((rounded % 1440) + 1440) % 1440;
}

const STREAK_PRIMARY_START_MINUTES = 17 * 60 + 30; // 17:30
const STREAK_PRIMARY_END_MINUTES = 18 * 60 + 30; // 18:30

function getLocalDayKey(timestampMs: number): string {
  const date = new Date(timestampMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayReminderTimestamp(
  minutesOfDay: number,
  referenceMs: number,
): number {
  const normalized = normalizeMinutesOfDay(minutesOfDay);
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const now = new Date(referenceMs);
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour,
    minute,
    0,
    0,
  ).getTime();
}

function getRandomReminderTimestampInWindow(
  referenceMs: number,
  startMinutes: number,
  endMinutes: number,
): number {
  const startAt = getTodayReminderTimestamp(startMinutes, referenceMs);
  const endAt = getTodayReminderTimestamp(endMinutes, referenceMs);
  const minuteSpan = Math.max(0, Math.floor((endAt - startAt) / 60_000));
  const randomMinuteOffset = Math.floor(Math.random() * (minuteSpan + 1));
  return startAt + randomMinuteOffset * 60_000;
}

async function readDailySummaryState(): Promise<DailySummaryScheduleState | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.dailySummary);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.notificationId !== "string") return null;
    if (typeof parsed.signature !== "string") return null;
    if (typeof parsed.minutesOfDay !== "number") return null;
    return {
      notificationId: parsed.notificationId,
      signature: parsed.signature,
      minutesOfDay: normalizeMinutesOfDay(parsed.minutesOfDay),
    };
  } catch {
    return null;
  }
}

async function writeDailySummaryState(
  value: DailySummaryScheduleState | null,
): Promise<void> {
  try {
    if (!value) {
      await AsyncStorage.removeItem(STORAGE_KEYS.dailySummary);
      return;
    }
    await AsyncStorage.setItem(STORAGE_KEYS.dailySummary, JSON.stringify(value));
  } catch {
    // ignore
  }
}

async function readStreakMotivationState(): Promise<StreakMotivationScheduleState | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.streakMotivation);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    // Current shape
    if (
      typeof parsed.dayKey === "string" &&
      typeof parsed.firstScheduledAt === "number" &&
      typeof parsed.secondScheduledAt === "number"
    ) {
      return {
        dayKey: parsed.dayKey,
        firstScheduledAt: parsed.firstScheduledAt,
        secondScheduledAt: parsed.secondScheduledAt,
        firstNotificationId:
          typeof parsed.firstNotificationId === "string"
            ? parsed.firstNotificationId
            : undefined,
        secondNotificationId:
          typeof parsed.secondNotificationId === "string"
            ? parsed.secondNotificationId
            : undefined,
        signature:
          typeof parsed.signature === "string" ? parsed.signature : undefined,
      };
    }

    // Legacy shape migration (single reminder)
    if (
      typeof parsed.notificationId === "string" &&
      typeof parsed.scheduledAt === "number"
    ) {
      return {
        dayKey: getLocalDayKey(parsed.scheduledAt),
        firstScheduledAt: parsed.scheduledAt,
        secondScheduledAt: 0,
        firstNotificationId: parsed.notificationId,
      };
    }

    return null;
  } catch {
    return null;
  }
}

async function writeStreakMotivationState(
  value: StreakMotivationScheduleState | null,
): Promise<void> {
  try {
    if (!value) {
      await AsyncStorage.removeItem(STORAGE_KEYS.streakMotivation);
      return;
    }
    await AsyncStorage.setItem(
      STORAGE_KEYS.streakMotivation,
      JSON.stringify(value),
    );
  } catch {
    // ignore
  }
}

function isCompletedTask(task: Task): boolean {
  return task.section === "completed" || hasValidDueAt(task.completedAt);
}

function getActiveTaskCount(tasks: Task[]): number {
  let count = 0;
  for (const task of tasks) {
    if (task.deletedAt) continue;
    if (isCompletedTask(task)) continue;
    count += 1;
  }
  return count;
}

function hasRoutineDueByToday(tasks: Task[]): boolean {
  const tomorrowStart = getStartOfLocalDayMs() + 24 * 60 * 60 * 1000;
  return tasks.some(
    (task) =>
      !task.deletedAt &&
      !isCompletedTask(task) &&
      task.isRoutine === true &&
      hasValidDueAt(task.dueAt) &&
      task.dueAt < tomorrowStart,
  );
}

/** Whether yesterday had a completion, i.e. a streak is running into today. */
function hasStreakIntoToday(completionHistory: CompletionHistory): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return (completionHistory[getLocalDayKey(yesterday.getTime())] ?? 0) > 0;
}

async function cancelScheduledNotificationIfPresent(
  notificationId?: string,
): Promise<void> {
  if (!notificationId) return;
  await Notifications.cancelScheduledNotificationAsync(notificationId).catch(
    () => undefined,
  );
}

async function clearStreakMotivationState(
  state: StreakMotivationScheduleState | null,
): Promise<void> {
  if (state) {
    await cancelScheduledNotificationIfPresent(state.firstNotificationId);
    await cancelScheduledNotificationIfPresent(state.secondNotificationId);
  }
  await writeStreakMotivationState(null);
}

function getTaskCounters(tasks: Task[]): TaskCounters {
  const todayStart = getStartOfLocalDayMs();
  let dueToday = 0;
  let overdue = 0;
  let open = 0;
  let completedToday = 0;

  for (const task of tasks) {
    if (task.deletedAt) continue;

    const completed = isCompletedTask(task);
    if (completed) {
      const completedAt = hasValidDueAt(task.completedAt)
        ? task.completedAt
        : hasValidDueAt(task.dueAt)
          ? task.dueAt
          : undefined;
      if (completedAt && isSameLocalDay(completedAt, todayStart)) {
        completedToday += 1;
      }
      continue;
    }

    open += 1;

    if (!hasValidDueAt(task.dueAt)) continue;
    if (isSameLocalDay(task.dueAt, todayStart)) {
      dueToday += 1;
      continue;
    }
    if (task.dueAt < todayStart) {
      overdue += 1;
    }
  }

  return { dueToday, overdue, open, completedToday };
}

function getBadgeCountForMode(
  appBadgeMode: AppBadgeMode,
  counters: TaskCounters,
): number {
  switch (appBadgeMode) {
    case "dueToday":
      return counters.dueToday;
    case "overdueOnly":
      return counters.overdue;
    case "allOpenTasks":
      return counters.open;
    case "completedToday":
      return counters.completedToday;
    case "hidden":
      return 0;
    default:
      return counters.dueToday;
  }
}

export async function initTaskNotifications(): Promise<void> {
  if (Platform.OS !== "ios") return;

  // Ensure notifications can show while the app is open.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function ensureNotificationPermission(options?: {
  requireBadge?: boolean;
}): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  const requireBadge = options?.requireBadge === true;

  try {
    const existing = await Notifications.getPermissionsAsync();
    const existingGranted =
      existing.granted ||
      existing.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    const existingAllowsBadge =
      typeof existing.ios?.allowsBadge === "boolean"
        ? existing.ios.allowsBadge
        : existingGranted;

    if (existingGranted && (!requireBadge || existingAllowsBadge)) return true;

    const requested = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowSound: true,
        allowBadge: true,
      },
    });

    const requestedGranted =
      requested.granted ||
      requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    const requestedAllowsBadge =
      typeof requested.ios?.allowsBadge === "boolean"
        ? requested.ios.allowsBadge
        : requestedGranted;
    return requestedGranted && (!requireBadge || requestedAllowsBadge);
  } catch {
    return false;
  }
}

function shouldHaveDueNotification(task: Task): boolean {
  if (task.deletedAt) return false;
  if (task.section === "completed") return false;
  if (!Number.isFinite(task.dueAt) || task.dueAt <= 0) return false;
  return true;
}

function isImportedTask(task: Task): boolean {
  return (
    task.id.startsWith("apple-event-") || task.id.startsWith("apple-reminder-")
  );
}

// Time Sensitive ("Dringlich") breaks through Focus, so it is kept for tasks
// the user scheduled to the minute. Imported events already alert from
// Calendar, and an hourly routine would interrupt every hour.
function shouldBeTimeSensitive(task: Task): boolean {
  if (!task.dueHasTime) return false;
  if (isImportedTask(task)) return false;
  if (task.isRoutine !== false && task.routineType === "hourly") return false;
  return true;
}

function buildTaskDueContent(
  task: Task,
  projectName: string | undefined,
): Notifications.NotificationContentInput {
  const dueLabel = t(
    task.dueHasTime ? "notification.due.now" : "notification.due.today",
  );
  const taskTitle = task.title.trim();
  const emoji = task.emoji?.trim();
  const title = taskTitle
    ? emoji
      ? `${emoji} ${taskTitle}`
      : taskTitle
    : dueLabel;
  const trimmedProjectName = projectName?.trim();

  return {
    title,
    body: trimmedProjectName ? `${dueLabel} · ${trimmedProjectName}` : dueLabel,
    sound: true,
    interruptionLevel: shouldBeTimeSensitive(task) ? "timeSensitive" : "active",
    threadIdentifier: task.projectId || undefined,
    data: { taskId: task.id },
  };
}

async function pruneOrphanedNotifications(knownIds: Set<string>): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(
    () => [],
  );
  for (const request of scheduled) {
    if (knownIds.has(request.identifier)) continue;
    await cancelScheduledNotificationIfPresent(request.identifier);
  }
}

export function syncTaskDueNotifications(args: {
  tasks: Task[];
  projects: Project[];
}): Promise<void> {
  return runSerialized(() => syncTaskDueNotificationsNow(args));
}

async function syncTaskDueNotificationsNow(args: {
  tasks: Task[];
  projects: Project[];
}): Promise<void> {
  if (Platform.OS !== "ios") return;

  const hasPermission = await ensureNotificationPermission();
  if (!hasPermission) {
    if (__DEV__)
      console.warn(
        "[tasks-notifications] Notifications permission not granted",
      );
    return;
  }

  const { tasks, projects } = args;
  const now = Date.now();

  const projectNameById = new Map(
    projects.filter((p) => !p.deletedAt).map((p) => [p.id, p.name] as const),
  );

  const currentMap = await readMap();
  const nextMap: TaskNotificationMap = { ...currentMap };

  // Cancel notifications for tasks that no longer should have one.
  for (const [taskId, entry] of Object.entries(currentMap)) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !shouldHaveDueNotification(task)) {
      await Notifications.cancelScheduledNotificationAsync(
        entry.notificationId,
      ).catch(() => undefined);
      delete nextMap[taskId];
    }
  }

  // Schedule/update notifications for active due tasks.
  for (const task of tasks) {
    if (!shouldHaveDueNotification(task)) continue;

    // Ignore past due dates (or extremely near-future) to avoid immediate spam on sync.
    if (task.dueAt <= now + 5_000) {
      const existing = nextMap[task.id];
      if (existing) {
        await Notifications.cancelScheduledNotificationAsync(
          existing.notificationId,
        ).catch(() => undefined);
        delete nextMap[task.id];
      }
      continue;
    }

    const projectName = task.projectId
      ? projectNameById.get(task.projectId)
      : undefined;
    const content = buildTaskDueContent(task, projectName);
    // Renaming a task, moving it or switching the language must update the
    // pending notification too, not only a changed due date.
    const signature = JSON.stringify([task.dueAt, getLocale(), content]);

    const existing = nextMap[task.id];
    if (existing && existing.signature === signature) continue;

    const identifier = getTaskDueNotificationId(task.id);
    if (existing && existing.notificationId !== identifier) {
      await cancelScheduledNotificationIfPresent(existing.notificationId);
    }
    delete nextMap[task.id];

    const notificationId = await Notifications.scheduleNotificationAsync({
      identifier,
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(task.dueAt),
      },
    });

    nextMap[task.id] = { notificationId, dueAt: task.dueAt, signature };
  }

  await writeMap(nextMap);

  // Older builds scheduled with random ids and could lose track of some
  // (duplicates from overlapping syncs). Drop everything we no longer know.
  if (!didPruneOrphanedNotifications) {
    didPruneOrphanedNotifications = true;
    const knownIds = new Set(
      Object.values(nextMap).map((entry) => entry.notificationId),
    );
    const dailySummaryState = await readDailySummaryState();
    if (dailySummaryState) knownIds.add(dailySummaryState.notificationId);
    const streakState = await readStreakMotivationState();
    if (streakState?.firstNotificationId) {
      knownIds.add(streakState.firstNotificationId);
    }
    await pruneOrphanedNotifications(knownIds);
  }
}

export async function syncAppBadgeCount(args: {
  tasks: Task[];
  appBadgeMode: AppBadgeMode;
}): Promise<void> {
  if (Platform.OS !== "ios") return;

  const counters = getTaskCounters(args.tasks);
  const nextCount = getBadgeCountForMode(args.appBadgeMode, counters);

  // Hidden mode (or an empty count) should always clear the icon badge.
  if (nextCount <= 0) {
    await Notifications.setBadgeCountAsync(0).catch(() => undefined);
    return;
  }

  const hasPermission = await ensureNotificationPermission({
    requireBadge: true,
  });
  if (!hasPermission) return;

  const applied = await Notifications.setBadgeCountAsync(nextCount).catch(
    () => false,
  );

  if (applied) return;

  // Retry once after a fresh permission check in case iOS settings changed
  // while the app was running.
  const refreshedPermission = await ensureNotificationPermission({
    requireBadge: true,
  });
  if (!refreshedPermission) return;

  await Notifications.setBadgeCountAsync(nextCount).catch(() => undefined);
}

export function syncDailySummaryNotification(args: {
  tasks: Task[];
  enabled: boolean;
  minutesOfDay: number;
}): Promise<void> {
  return runSerialized(() => syncDailySummaryNotificationNow(args));
}

async function syncDailySummaryNotificationNow(args: {
  tasks: Task[];
  enabled: boolean;
  minutesOfDay: number;
}): Promise<void> {
  if (Platform.OS !== "ios") return;

  const existingState = await readDailySummaryState();
  if (!args.enabled) {
    if (existingState?.notificationId) {
      await Notifications.cancelScheduledNotificationAsync(
        existingState.notificationId,
      ).catch(() => undefined);
    }
    await writeDailySummaryState(null);
    return;
  }

  const hasPermission = await ensureNotificationPermission();
  if (!hasPermission) return;

  const normalizedMinutes = normalizeMinutesOfDay(args.minutesOfDay);
  const hour = Math.floor(normalizedMinutes / 60);
  const minute = normalizedMinutes % 60;
  const counters = getTaskCounters(args.tasks);
  const signature = [
    getLocale(),
    normalizedMinutes,
    counters.dueToday,
    counters.overdue,
    counters.open,
    counters.completedToday,
  ].join(":");

  if (
    existingState &&
    existingState.signature === signature &&
    existingState.minutesOfDay === normalizedMinutes
  ) {
    return;
  }

  if (
    existingState?.notificationId &&
    existingState.notificationId !== NOTIFICATION_IDS.dailySummary
  ) {
    await cancelScheduledNotificationIfPresent(existingState.notificationId);
  }

  const notificationId = await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_IDS.dailySummary,
    content: {
      title: t("notification.dailySummary.title"),
      body: t("notification.dailySummary.body", {
        dueToday: counters.dueToday,
        overdue: counters.overdue,
        open: counters.open,
        completedToday: counters.completedToday,
      }),
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });

  await writeDailySummaryState({
    notificationId,
    signature,
    minutesOfDay: normalizedMinutes,
  });
}

export function syncStreakMotivationNotification(args: {
  tasks: Task[];
  completionHistory: CompletionHistory;
  enabled: boolean;
}): Promise<void> {
  return runSerialized(() => syncStreakMotivationNotificationNow(args));
}

async function syncStreakMotivationNotificationNow(args: {
  tasks: Task[];
  completionHistory: CompletionHistory;
  enabled: boolean;
}): Promise<void> {
  if (Platform.OS !== "ios") return;

  const existingState = await readStreakMotivationState();

  // Only nudge people who use streaks and have one running into today.
  if (!args.enabled || !hasStreakIntoToday(args.completionHistory)) {
    await clearStreakMotivationState(existingState);
    return;
  }

  const counters = getTaskCounters(args.tasks);
  if (counters.completedToday > 0) {
    await clearStreakMotivationState(existingState);
    return;
  }

  const activeTaskCount = getActiveTaskCount(args.tasks);
  if (activeTaskCount <= 0) {
    await clearStreakMotivationState(existingState);
    return;
  }

  const now = Date.now();
  const dayKey = getLocalDayKey(now);
  const sameDayState =
    existingState && existingState.dayKey === dayKey ? existingState : null;

  if (!sameDayState && existingState) {
    await clearStreakMotivationState(existingState);
  }

  // Builds before this one also scheduled an evening follow-up.
  if (sameDayState?.secondNotificationId) {
    await cancelScheduledNotificationIfPresent(sameDayState.secondNotificationId);
  }

  const scheduledAt =
    sameDayState?.firstScheduledAt && sameDayState.firstScheduledAt > 0
      ? sameDayState.firstScheduledAt
      : getRandomReminderTimestampInWindow(
          now,
          STREAK_PRIMARY_START_MINUTES,
          STREAK_PRIMARY_END_MINUTES,
        );

  if (scheduledAt <= now + 5_000) {
    // Today's slot has passed (delivered or missed). Remember it so the
    // window is not rolled again for a second nudge.
    await writeStreakMotivationState({
      dayKey,
      firstScheduledAt: scheduledAt,
      secondScheduledAt: 0,
    });
    return;
  }

  const hasPermission = await ensureNotificationPermission();
  if (!hasPermission) return;

  const body = hasRoutineDueByToday(args.tasks)
    ? t("notification.streakNudge.bodyWithRoutines")
    : t("notification.streakNudge.body");
  const signature = JSON.stringify([getLocale(), body]);
  const notificationId =
    sameDayState?.firstNotificationId === NOTIFICATION_IDS.streakNudge &&
    sameDayState.signature === signature
      ? sameDayState.firstNotificationId
      : await (async () => {
          if (sameDayState?.firstNotificationId) {
            await cancelScheduledNotificationIfPresent(
              sameDayState.firstNotificationId,
            );
          }
          return Notifications.scheduleNotificationAsync({
            identifier: NOTIFICATION_IDS.streakNudge,
            content: {
              title: t("notification.streakNudge.title"),
              body,
              sound: true,
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: new Date(scheduledAt),
            },
          });
        })();

  await writeStreakMotivationState({
    dayKey,
    firstScheduledAt: scheduledAt,
    secondScheduledAt: 0,
    firstNotificationId: notificationId,
    signature,
  });
}
