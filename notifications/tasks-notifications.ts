import { Platform } from 'react-native';

import * as Notifications from 'expo-notifications';

import type { Project, Task } from '@/context/tasks-store';

type TaskNotificationMapEntry = {
  notificationId: string;
  dueAt: number;
};

type TaskNotificationMap = Record<string, TaskNotificationMapEntry>;

const STORAGE_KEYS = {
  map: 'reminds.tasks.notificationMap.v1',
} as const;

async function getSecureStore() {
  try {
    const mod = await import('expo-secure-store');
    if (typeof mod?.getItemAsync === 'function' && typeof mod?.setItemAsync === 'function') return mod;
  } catch {
    // ignore
  }
  return null;
}

async function readMap(): Promise<TaskNotificationMap> {
  const SecureStore = await getSecureStore();
  if (!SecureStore) return {};
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEYS.map);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as TaskNotificationMap;
  } catch {
    return {};
  }
}

async function writeMap(map: TaskNotificationMap): Promise<void> {
  const SecureStore = await getSecureStore();
  if (!SecureStore) return;
  try {
    await SecureStore.setItemAsync(STORAGE_KEYS.map, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export async function initTaskNotifications(): Promise<void> {
  if (Platform.OS !== 'ios') return;

  // Ensure notifications can show while the app is open.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;

  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted || existing.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return true;

    const requested = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowSound: true,
        allowBadge: false,
      },
    });

    return requested.granted || requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  } catch {
    return false;
  }
}

function shouldHaveDueNotification(task: Task): boolean {
  if (task.deletedAt) return false;
  if (task.section === 'completed') return false;
  if (!Number.isFinite(task.dueAt) || task.dueAt <= 0) return false;
  return true;
}

export async function syncTaskDueNotifications(args: { tasks: Task[]; projects: Project[] }): Promise<void> {
  if (Platform.OS !== 'ios') return;

  const hasPermission = await ensureNotificationPermission();
  if (!hasPermission) {
    if (__DEV__) console.warn('[tasks-notifications] Notifications permission not granted');
    return;
  }

  const { tasks, projects } = args;
  const now = Date.now();

  const projectNameById = new Map(
    projects.filter((p) => !p.deletedAt).map((p) => [p.id, p.name] as const)
  );

  const currentMap = await readMap();
  const nextMap: TaskNotificationMap = { ...currentMap };

  // Cancel notifications for tasks that no longer should have one.
  for (const [taskId, entry] of Object.entries(currentMap)) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !shouldHaveDueNotification(task)) {
      await Notifications.cancelScheduledNotificationAsync(entry.notificationId).catch(() => undefined);
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
        await Notifications.cancelScheduledNotificationAsync(existing.notificationId).catch(() => undefined);
        delete nextMap[task.id];
      }
      continue;
    }

    const existing = nextMap[task.id];
    if (existing && existing.dueAt === task.dueAt) continue;

    if (existing) {
      await Notifications.cancelScheduledNotificationAsync(existing.notificationId).catch(() => undefined);
      delete nextMap[task.id];
    }

    const projectName = task.projectId ? projectNameById.get(task.projectId) : undefined;
    const bodyParts = [projectName, task.subtitle].filter((x): x is string => !!x && x.trim().length > 0);

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: task.title,
        body: bodyParts.length ? bodyParts.join(' · ') : 'Fällig',
        sound: true,
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
