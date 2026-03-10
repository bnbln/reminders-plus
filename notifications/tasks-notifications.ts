import { Platform } from "react-native";

import * as Notifications from "expo-notifications";

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { AppBadgeMode } from "@/context/settings-store";
import type { Project, Task } from "@/context/tasks-store";
import { t } from "@/i18n";
import {
  getStartOfLocalDayMs,
  hasValidDueAt,
  isSameLocalDay,
} from "@/utils/task-dates";

type TaskNotificationMapEntry = {
  notificationId: string;
  dueAt: number;
};

type TaskNotificationMap = Record<string, TaskNotificationMapEntry>;

type DailySummaryScheduleState = {
  notificationId: string;
  signature: string;
  minutesOfDay: number;
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
} as const;

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

function isCompletedTask(task: Task): boolean {
  return task.section === "completed" || hasValidDueAt(task.completedAt);
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

export async function syncTaskDueNotifications(args: {
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

    const existing = nextMap[task.id];
    if (existing && existing.dueAt === task.dueAt) continue;

    if (existing) {
      await Notifications.cancelScheduledNotificationAsync(
        existing.notificationId,
      ).catch(() => undefined);
      delete nextMap[task.id];
    }

    const projectName = task.projectId
      ? projectNameById.get(task.projectId)
      : undefined;
    const bodyParts = [projectName, task.subtitle].filter(
      (x): x is string => !!x && x.trim().length > 0,
    );
    const interruptionLevel = task.dueHasTime ? "timeSensitive" : undefined;

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: task.title,
        body: bodyParts.length ? bodyParts.join(" · ") : t("notification.due"),
        sound: true,
        interruptionLevel,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(task.dueAt),
      },
    });

    nextMap[task.id] = { notificationId, dueAt: task.dueAt };
  }

  await writeMap(nextMap);
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

export async function syncDailySummaryNotification(args: {
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

  if (existingState?.notificationId) {
    await Notifications.cancelScheduledNotificationAsync(
      existingState.notificationId,
    ).catch(() => undefined);
  }

  const notificationId = await Notifications.scheduleNotificationAsync({
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
