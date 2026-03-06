import React from "react";
import { AppState, Platform } from "react-native";

import { usePremium } from "@/context/premium-store";
import { useAppSettings } from "@/context/settings-store";
import {
  syncAppBadgeCount,
  syncDailySummaryNotification,
  syncTaskDueNotifications,
} from "@/notifications/tasks-notifications";
import {
  createOnboardingSeedData,
  hasCompletedOnboardingSeed,
  markCompletedOnboardingSeed,
} from "@/storage/tasks-onboarding-seed";
import { loadTasksSnapshot, saveTasksSnapshot } from "@/storage/tasks-storage";
import {
  setNativeCloudSyncEnabled,
  subscribeToCloudSyncRemoteApplies,
  syncCloudNow,
} from "@/services/cloud-sync";
import {
  deriveActiveSectionFromDueAt,
  getStartOfLocalDayMs,
  hasValidDueAt,
} from "@/utils/task-dates";

export type SectionId = "today" | "upcoming" | "completed";

export type Project = {
  id: string;
  name: string;
  color: string; // hex
  emoji?: string;
  icon: string; // sf symbol name
  description?: string;
  completed?: boolean;
  deletedAt?: number;
};

export type Subtask = {
  id: string;
  title: string;
  done: boolean;
};

export type RoutineType =
  | "hourly" // Stündlich
  | "daily" // Täglich
  | "weekdays" // An Wochentagen (Mo-Fr)
  | "weekends" // An Wochenenden (Sa-So)
  | "weekly" // Wöchentlich
  | "biweekly" // Alle 2 Wochen
  | "monthly" // Monatlich
  | "quarterly" // Alle 3 Monate
  | "biannually" // Alle 6 Monate
  | "yearly" // Jährlich
  | "custom"; // Eigene

// Keep for backward compatibility
export type RoutineInterval = "daily" | "weekly" | "monthly" | "yearly";

export type Task = {
  id: string;
  title: string;
  subtitle?: string;
  emoji: string;
  projectId: string;
  /** Unix ms. `0` bedeutet: kein Datum gesetzt. */
  dueAt: number;
  dueHasTime?: boolean;
  /** Unix ms timestamp when marked completed. Undefined = not completed. */
  completedAt?: number;
  location?: string;
  notes?: string;
  subtasks?: Subtask[];
  section: SectionId;
  orderRank: number;
  /** Optional task color (hex), independent of project */
  color?: string;
  /** Unix ms timestamp when moved to trash. Undefined = active. */
  deletedAt?: number;
  /** Whether this task repeats */
  isRoutine?: boolean;
  /** Routine type (extended) */
  routineType?: RoutineType;
  /** Legacy: Repeat interval for routines */
  routineInterval?: RoutineInterval;
  /** Which day of the week (0-6, Sunday=0) */
  routineWeekday?: number;
  /** Which week of the month for nth-weekday (1-4) */
  routineNthWeek?: number;
  /** Which day of the month (1-31) */
  routineMonthDay?: number;
  /** Which month (0-11) for yearly-date */
  routineMonth?: number;
};

export const getDueAtForSection = (section: SectionId) => {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  if (section === "today") {
    const preferred = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      Math.min(23, Math.max(8, now.getHours() + 1)),
      0,
    );
    return preferred.getTime();
  }
  if (section === "upcoming") {
    const tomorrow = new Date(startOfToday);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(11, 0, 0, 0);
    return tomorrow.getTime();
  }
  // completed
  const completedAt = new Date(now);
  completedAt.setMinutes(completedAt.getMinutes() - 5);
  return completedAt.getTime();
};

const SNAPSHOT_VERSION = 1 as const;

function getTasksContentSignature(tasks: Task[], projects: Project[]): string {
  return JSON.stringify({ tasks, projects });
}

function getSnapshotSavedAt(raw: any): number {
  const savedAt = raw?.savedAt;
  return typeof savedAt === "number" && Number.isFinite(savedAt) ? savedAt : 0;
}

function isSectionId(v: unknown): v is SectionId {
  return v === "today" || v === "upcoming" || v === "completed";
}

function isRoutineInterval(v: unknown): v is RoutineInterval {
  return v === "daily" || v === "weekly" || v === "monthly" || v === "yearly";
}

function normalizeRoutineType(v: unknown): RoutineType | undefined {
  switch (v) {
    case "hourly":
    case "daily":
    case "weekdays":
    case "weekends":
    case "weekly":
    case "biweekly":
    case "monthly":
    case "quarterly":
    case "biannually":
    case "yearly":
    case "custom":
      return v;
    // Legacy aliases from older snapshots.
    case "weekday":
      return "weekdays";
    case "nth-weekday":
    case "first-of-month":
    case "last-of-month":
    case "yearly-date":
      return "custom";
    default:
      return undefined;
  }
}

/** Get the nth occurrence of a weekday in a given month */
function getNthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  nth: number,
): Date {
  const first = new Date(year, month, 1);
  const firstWeekday = first.getDay();
  let dayOffset = weekday - firstWeekday;
  if (dayOffset < 0) dayOffset += 7;
  const day = 1 + dayOffset + (nth - 1) * 7;
  return new Date(year, month, day);
}

/** Get the last day of a month */
function getLastDayOfMonth(year: number, month: number): Date {
  return new Date(year, month + 1, 0);
}

function advanceRoutineDate(
  next: Date,
  routineType: RoutineType,
  options: {
    weekday?: number;
    nthWeek?: number;
    monthDay?: number;
    month?: number;
  },
) {
  switch (routineType) {
    case "hourly":
      next.setHours(next.getHours() + 1);
      break;

    case "daily":
      next.setDate(next.getDate() + 1);
      break;

    case "weekdays":
      // Move to next day until it's Mon-Fri (1-5)
      do {
        next.setDate(next.getDate() + 1);
      } while (next.getDay() === 0 || next.getDay() === 6);
      break;

    case "weekends":
      // Move to next day until it's Sat-Sun (6, 0)
      do {
        next.setDate(next.getDate() + 1);
      } while (next.getDay() !== 0 && next.getDay() !== 6);
      break;

    case "weekly":
      next.setDate(next.getDate() + 7);
      break;

    case "biweekly":
      next.setDate(next.getDate() + 14);
      break;

    case "monthly":
      {
        const currentDay = next.getDate();
        const targetDay =
          typeof options.monthDay === "number" && options.monthDay >= 1
            ? options.monthDay
            : currentDay;
        next.setDate(1);
        next.setMonth(next.getMonth() + 1);
        const maxDay = getLastDayOfMonth(
          next.getFullYear(),
          next.getMonth(),
        ).getDate();
        next.setDate(Math.min(targetDay, maxDay));
      }
      break;

    case "quarterly":
      {
        const currentDay = next.getDate();
        const targetDay =
          typeof options.monthDay === "number" && options.monthDay >= 1
            ? options.monthDay
            : currentDay;
        next.setDate(1);
        next.setMonth(next.getMonth() + 3);
        const maxDay = getLastDayOfMonth(
          next.getFullYear(),
          next.getMonth(),
        ).getDate();
        next.setDate(Math.min(targetDay, maxDay));
      }
      break;

    case "biannually":
      {
        const currentDay = next.getDate();
        const targetDay =
          typeof options.monthDay === "number" && options.monthDay >= 1
            ? options.monthDay
            : currentDay;
        next.setDate(1);
        next.setMonth(next.getMonth() + 6);
        const maxDay = getLastDayOfMonth(
          next.getFullYear(),
          next.getMonth(),
        ).getDate();
        next.setDate(Math.min(targetDay, maxDay));
      }
      break;

    case "yearly":
      {
        const targetMonth =
          typeof options.month === "number" ? options.month : next.getMonth();
        const targetDay =
          typeof options.monthDay === "number" && options.monthDay >= 1
            ? options.monthDay
            : next.getDate();
        next.setFullYear(next.getFullYear() + 1, targetMonth, 1);
        const maxDay = getLastDayOfMonth(
          next.getFullYear(),
          targetMonth,
        ).getDate();
        next.setDate(Math.min(targetDay, maxDay));
      }
      break;

    case "custom":
      // Fallback for custom: daily for now, can be sophisticated later
      next.setDate(next.getDate() + 1);
      break;
  }
}

/** Calculate the next due date for a routine task based on the type. */
export function getNextRoutineDate(
  currentDueAt: number,
  routineType: RoutineType,
  options: {
    weekday?: number;
    nthWeek?: number;
    monthDay?: number;
    month?: number;
  } = {},
  minExclusiveMs: number = Date.now(),
): number {
  const thresholdMs = Number.isFinite(minExclusiveMs)
    ? minExclusiveMs
    : Date.now();
  let next = new Date(currentDueAt > 0 ? currentDueAt : thresholdMs);
  const maxIterations = 4096;

  for (let i = 0; i < maxIterations; i += 1) {
    const beforeMs = next.getTime();
    advanceRoutineDate(next, routineType, options);
    const nextMs = next.getTime();

    if (!Number.isFinite(nextMs)) break;

    // Defensive: avoid non-advancing loops from invalid/stale input values.
    if (nextMs <= beforeMs) {
      next = new Date(beforeMs + 60_000);
    }

    if (next.getTime() > thresholdMs) {
      return next.getTime();
    }
  }

  // Last-resort fallback in case we cannot compute a stable progression.
  const fallback = new Date(thresholdMs);
  fallback.setDate(fallback.getDate() + 1);
  return fallback.getTime();
}

function resolveRoutineTypeForTask(task: Task): RoutineType | undefined {
  if (task.isRoutine === false) return undefined;
  return normalizeRoutineType(task.routineType ?? task.routineInterval);
}

function getDefaultRoutineDueAt(referenceMs: number, dueHasTime?: boolean): number {
  const next = new Date(referenceMs);

  if (dueHasTime === false) {
    next.setHours(12, 0, 0, 0);
    if (next.getTime() <= referenceMs) {
      next.setDate(next.getDate() + 1);
    }
    return next.getTime();
  }

  next.setHours(Math.min(23, Math.max(8, next.getHours() + 1)), 0, 0, 0);
  if (next.getTime() <= referenceMs) {
    next.setDate(next.getDate() + 1);
    next.setHours(8, 0, 0, 0);
  }
  return next.getTime();
}

function reconcileRoutineDueAt(task: Task, referenceMs: number): Task {
  if (task.deletedAt) return task;
  if (task.section === "completed" || hasValidDueAt(task.completedAt)) return task;

  const routineType = resolveRoutineTypeForTask(task);
  if (!routineType) return task;

  const todayStartMs = getStartOfLocalDayMs(referenceMs);
  const staleThresholdMs =
    routineType === "hourly" ? referenceMs : todayStartMs - 1;
  const routineOptions = {
    weekday: task.routineWeekday,
    nthWeek: task.routineNthWeek,
    monthDay: task.routineMonthDay,
    month: task.routineMonth,
  };

  let nextDueAt = hasValidDueAt(task.dueAt)
    ? task.dueAt
    : getDefaultRoutineDueAt(referenceMs, task.dueHasTime);

  if (nextDueAt <= staleThresholdMs) {
    nextDueAt = getNextRoutineDate(
      nextDueAt,
      routineType,
      routineOptions,
      staleThresholdMs,
    );
  }

  if (nextDueAt === task.dueAt) return task;
  return { ...task, dueAt: nextDueAt };
}

function normalizeSnapshot(raw: any): { tasks: Task[]; projects: Project[] } {
  const rawTasks = Array.isArray(raw?.tasks) ? raw.tasks : [];
  const rawProjects = Array.isArray(raw?.projects) ? raw.projects : [];

  const tasks: Task[] = rawTasks
    .map((t: any, index: number): Task | null => {
      if (!t || typeof t !== "object") return null;
      if (typeof t.id !== "string" || t.id.trim().length === 0) return null;
      if (typeof t.title !== "string") return null;

      const dueAt =
        typeof t.dueAt === "number" && Number.isFinite(t.dueAt) ? t.dueAt : 0;
      const orderRank =
        typeof t.orderRank === "number" && Number.isFinite(t.orderRank)
          ? t.orderRank
          : (index + 1) * 1000;
      const rawSection: SectionId = isSectionId(t.section)
        ? t.section
        : "today";
      const hasCompletedAt = hasValidDueAt(t.completedAt);
      const isCompleted = rawSection === "completed" || hasCompletedAt;
      const section: SectionId =
        isCompleted ? "completed" : deriveActiveSectionFromDueAt(dueAt);
      const deletedAt =
        typeof t.deletedAt === "number" && Number.isFinite(t.deletedAt)
          ? t.deletedAt
          : undefined;
      const completedAt =
        hasCompletedAt
          ? t.completedAt
          : section === "completed"
            ? typeof t.dueAt === "number" && Number.isFinite(t.dueAt) && t.dueAt > 0
              ? t.dueAt
              : Date.now()
            : undefined;

      return {
        id: t.id,
        title: t.title,
        subtitle: typeof t.subtitle === "string" ? t.subtitle : undefined,
        emoji:
          typeof t.emoji === "string" && t.emoji.length > 0 ? t.emoji : "📝",
        projectId: typeof t.projectId === "string" ? t.projectId : "",
        dueAt,
        dueHasTime:
          typeof t.dueHasTime === "boolean" ? t.dueHasTime : undefined,
        completedAt,
        location: typeof t.location === "string" ? t.location : undefined,
        notes: typeof t.notes === "string" ? t.notes : undefined,
        subtasks: Array.isArray(t.subtasks) ? (t.subtasks as any) : undefined,
        section,
        orderRank,
        deletedAt,
        isRoutine: typeof t.isRoutine === "boolean" ? t.isRoutine : undefined,
        routineType: normalizeRoutineType(t.routineType),
        routineInterval: isRoutineInterval(t.routineInterval)
          ? t.routineInterval
          : undefined,
        routineWeekday:
          typeof t.routineWeekday === "number" &&
          t.routineWeekday >= 0 &&
          t.routineWeekday <= 6
            ? t.routineWeekday
            : undefined,
        routineNthWeek:
          typeof t.routineNthWeek === "number" &&
          t.routineNthWeek >= 1 &&
          t.routineNthWeek <= 4
            ? t.routineNthWeek
            : undefined,
        routineMonthDay:
          typeof t.routineMonthDay === "number" &&
          t.routineMonthDay >= 1 &&
          t.routineMonthDay <= 31
            ? t.routineMonthDay
            : undefined,
        routineMonth:
          typeof t.routineMonth === "number" &&
          t.routineMonth >= 0 &&
          t.routineMonth <= 11
            ? t.routineMonth
            : undefined,
      };
    })
    .filter((t: Task | null): t is Task => !!t);

  const projects: Project[] = rawProjects
    .map((p: any): Project | null => {
      if (!p || typeof p !== "object") return null;
      if (typeof p.id !== "string" || p.id.trim().length === 0) return null;
      if (typeof p.name !== "string") return null;

      return {
        id: p.id,
        name: p.name,
        color: typeof p.color === "string" ? p.color : "#2563EB",
        emoji:
          typeof p.emoji === "string" && p.emoji.trim().length > 0
            ? p.emoji
            : undefined,
        icon: typeof p.icon === "string" ? p.icon : "folder.fill",
        description:
          typeof p.description === "string" ? p.description : undefined,
        completed: typeof p.completed === "boolean" ? p.completed : undefined,
        deletedAt:
          typeof p.deletedAt === "number" && Number.isFinite(p.deletedAt)
            ? p.deletedAt
            : undefined,
      };
    })
    .filter((p: Project | null): p is Project => !!p);

  return { tasks, projects };
}

function reconcileTaskSection(task: Task, referenceMs: number): Task {
  if (task.deletedAt) return task;

  if (task.section === "completed" || hasValidDueAt(task.completedAt)) {
    const normalizedCompletedAt =
      task.completedAt ??
      (hasValidDueAt(task.dueAt) ? task.dueAt : referenceMs);
    if (
      task.section === "completed" &&
      task.completedAt === normalizedCompletedAt
    ) {
      return task;
    }
    return {
      ...task,
      section: "completed",
      completedAt: normalizedCompletedAt,
    };
  }

  const normalizedSection = deriveActiveSectionFromDueAt(
    task.dueAt,
    referenceMs,
  );
  if (task.section === normalizedSection && task.completedAt === undefined) {
    return task;
  }

  return {
    ...task,
    section: normalizedSection,
    completedAt: undefined,
  };
}

function reconcileTaskSections(
  tasks: Task[],
  referenceMs: number = Date.now(),
): Task[] {
  let changed = false;
  const next = tasks.map((task) => {
    const withRoutineDueAt = reconcileRoutineDueAt(task, referenceMs);
    const normalized = reconcileTaskSection(withRoutineDueAt, referenceMs);
    if (normalized !== task) changed = true;
    return normalized;
  });
  return changed ? next : tasks;
}

type TasksContextValue = {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
};

const TasksContext = React.createContext<TasksContextValue | null>(null);

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const {
    hasHydrated: hasSettingsHydrated,
    appBadgeMode,
    dailySummaryEnabled,
    dailySummaryMinutes,
    cloudSyncEnabled,
  } = useAppSettings();
  const { hasPremiumAccess } = usePremium();
  const [tasks, setTasksState] = React.useState<Task[]>([]);
  const setTasks = React.useCallback<React.Dispatch<React.SetStateAction<Task[]>>>(
    (value) => {
      setTasksState((prev) => {
        const next =
          typeof value === "function"
            ? (value as (prevState: Task[]) => Task[])(prev)
            : value;
        return reconcileTaskSections(next, Date.now());
      });
    },
    [],
  );
  const [projects, setProjects] = React.useState<Project[]>([]);
  const hydratedRef = React.useRef(false);
  const persistEnabledRef = React.useRef(false);
  const dayAnchorRef = React.useRef(getStartOfLocalDayMs());
  const tasksRef = React.useRef<Task[]>([]);
  const projectsRef = React.useRef<Project[]>([]);
  const lastPersistedContentSignatureRef = React.useRef("");
  const lastKnownLocalSavedAtRef = React.useRef(0);
  const effectiveCloudSyncEnabled =
    Platform.OS === "ios" && cloudSyncEnabled && hasPremiumAccess;

  React.useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  React.useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  const persistSnapshotIfNeeded = React.useCallback(async (): Promise<boolean> => {
    if (!hydratedRef.current) return false;
    if (!persistEnabledRef.current) return false;

    const nextTasks = tasksRef.current;
    const nextProjects = projectsRef.current;
    const nextSignature = getTasksContentSignature(nextTasks, nextProjects);
    if (nextSignature === lastPersistedContentSignatureRef.current) {
      return false;
    }

    const savedAt = Date.now();
    await saveTasksSnapshot({
      schemaVersion: SNAPSHOT_VERSION,
      savedAt,
      tasks: nextTasks,
      projects: nextProjects,
    });
    lastPersistedContentSignatureRef.current = nextSignature;
    lastKnownLocalSavedAtRef.current = savedAt;
    return true;
  }, []);

  const reloadSnapshotFromDiskIfNeeded = React.useCallback(async () => {
    if (!hydratedRef.current) return false;
    if (!persistEnabledRef.current) return false;

    const res = await loadTasksSnapshot();
    if (res.status !== "ok") return false;

    const next = normalizeSnapshot(res.snapshot);
    const nextSignature = getTasksContentSignature(next.tasks, next.projects);
    const nextSavedAt = getSnapshotSavedAt(res.snapshot);
    const currentSignature = getTasksContentSignature(
      tasksRef.current,
      projectsRef.current,
    );

    if (nextSignature === currentSignature) {
      lastPersistedContentSignatureRef.current = nextSignature;
      if (nextSavedAt > 0) {
        lastKnownLocalSavedAtRef.current = nextSavedAt;
      }
      return false;
    }

    if (
      nextSavedAt > 0 &&
      lastKnownLocalSavedAtRef.current > 0 &&
      nextSavedAt < lastKnownLocalSavedAtRef.current
    ) {
      return false;
    }

    lastPersistedContentSignatureRef.current = nextSignature;
    if (nextSavedAt > 0) {
      lastKnownLocalSavedAtRef.current = nextSavedAt;
    }
    setProjects(next.projects);
    setTasks(next.tasks);
    return true;
  }, [setTasks]);

  // Hydrate from local encrypted snapshot once.
  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const res = await loadTasksSnapshot();
        if (cancelled) return;
        if (res.status === "ok") {
          const next = normalizeSnapshot(res.snapshot);
          lastPersistedContentSignatureRef.current = getTasksContentSignature(
            next.tasks,
            next.projects,
          );
          lastKnownLocalSavedAtRef.current = getSnapshotSavedAt(res.snapshot);
          setTasks(next.tasks);
          setProjects(next.projects);
          persistEnabledRef.current = true;
          return;
        }

        if (res.status === "missing") {
          // No snapshot yet: first launch. Seed once during onboarding.
          const alreadySeeded = await hasCompletedOnboardingSeed();
          if (cancelled) return;

          if (!alreadySeeded) {
            const seed = createOnboardingSeedData();
            setTasks(seed.tasks);
            setProjects(seed.projects);
            persistEnabledRef.current = true;
            // Mark as seeded (best-effort). Persistence will write the snapshot via effect.
            void markCompletedOnboardingSeed();
            return;
          }

          // Missing snapshot but seed already ran before: allow persistence to create one.
          persistEnabledRef.current = true;
          return;
        }

        // 'unavailable' or 'error': keep in-memory state but DO NOT persist (prevents overwriting existing snapshot).
        persistEnabledRef.current = false;
      } finally {
        if (!cancelled) {
          hydratedRef.current = true;
          const nowMs = Date.now();
          dayAnchorRef.current = getStartOfLocalDayMs(nowMs);
          setTasks((prev) => prev);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep time-sensitive fields (section + routine due dates) in sync over time.
  React.useEffect(() => {
    const reconcileTimeDependentTasks = () => {
      if (!hydratedRef.current) return;
      const nowMs = Date.now();
      const todayStart = getStartOfLocalDayMs(nowMs);
      if (todayStart !== dayAnchorRef.current) {
        dayAnchorRef.current = todayStart;
      }
      setTasks((prev) => prev);
    };

    const appStateSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        reconcileTimeDependentTasks();
        void (async () => {
          await reloadSnapshotFromDiskIfNeeded();
          if (!effectiveCloudSyncEnabled) return;
          const result = await syncCloudNow();
          if (result.didPullRemote) {
            await reloadSnapshotFromDiskIfNeeded();
          }
        })();
      }

      if (nextState === "background") {
        void (async () => {
          const didPersist = await persistSnapshotIfNeeded();
          if (!effectiveCloudSyncEnabled) return;
          if (!didPersist && !persistEnabledRef.current) return;
          const result = await syncCloudNow();
          if (result.didPullRemote) {
            await reloadSnapshotFromDiskIfNeeded();
          }
        })();
      }
    });
    const timer = setInterval(reconcileTimeDependentTasks, 60_000);

    return () => {
      appStateSub.remove();
      clearInterval(timer);
    };
  }, [
    effectiveCloudSyncEnabled,
    persistSnapshotIfNeeded,
    reloadSnapshotFromDiskIfNeeded,
    setTasks,
  ]);

  // Persist on change (after hydration). Debounced to avoid excessive writes on drag/reorder.
  React.useEffect(() => {
    if (!hydratedRef.current) return;
    if (!persistEnabledRef.current) return;

    const handle = setTimeout(() => {
      void (async () => {
        const didPersist = await persistSnapshotIfNeeded();
        if (!effectiveCloudSyncEnabled || !didPersist) return;
        const result = await syncCloudNow();
        if (result.didPullRemote) {
          await reloadSnapshotFromDiskIfNeeded();
        }
      })();
    }, 250);

    return () => {
      clearTimeout(handle);
    };
  }, [
    effectiveCloudSyncEnabled,
    persistSnapshotIfNeeded,
    projects,
    reloadSnapshotFromDiskIfNeeded,
    tasks,
  ]);

  React.useEffect(() => {
    if (!hasSettingsHydrated) return;
    void setNativeCloudSyncEnabled(effectiveCloudSyncEnabled);
  }, [effectiveCloudSyncEnabled, hasSettingsHydrated]);

  React.useEffect(() => {
    if (!effectiveCloudSyncEnabled) return;
    const subscription = subscribeToCloudSyncRemoteApplies(() => {
      void reloadSnapshotFromDiskIfNeeded();
    });

    return () => {
      subscription?.remove();
    };
  }, [effectiveCloudSyncEnabled, reloadSnapshotFromDiskIfNeeded]);

  // Keep iOS scheduled notifications in sync with tasks.
  React.useEffect(() => {
    if (!hydratedRef.current) return;
    if (!persistEnabledRef.current) return;

    const handle = setTimeout(() => {
      void syncTaskDueNotifications({ tasks, projects });
    }, 750);

    return () => {
      clearTimeout(handle);
    };
  }, [projects, tasks]);

  // Keep iOS app badge and daily summary in sync with tasks + settings.
  React.useEffect(() => {
    if (!hydratedRef.current) return;
    if (!persistEnabledRef.current) return;
    if (!hasSettingsHydrated) return;

    const handle = setTimeout(() => {
      void syncAppBadgeCount({ tasks, appBadgeMode });
      void syncDailySummaryNotification({
        tasks,
        enabled: dailySummaryEnabled,
        minutesOfDay: dailySummaryMinutes,
      });
    }, 750);

    return () => {
      clearTimeout(handle);
    };
  }, [
    appBadgeMode,
    dailySummaryEnabled,
    dailySummaryMinutes,
    hasSettingsHydrated,
    tasks,
  ]);

  // Re-apply badge + summary when the app becomes active again.
  React.useEffect(() => {
    if (!hydratedRef.current) return;
    if (!persistEnabledRef.current) return;
    if (!hasSettingsHydrated) return;

    const run = () => {
      void syncAppBadgeCount({ tasks, appBadgeMode });
      void syncDailySummaryNotification({
        tasks,
        enabled: dailySummaryEnabled,
        minutesOfDay: dailySummaryMinutes,
      });
    };

    const appStateSub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") return;
      run();
    });

    return () => {
      appStateSub.remove();
    };
  }, [
    appBadgeMode,
    dailySummaryEnabled,
    dailySummaryMinutes,
    hasSettingsHydrated,
    tasks,
  ]);

  const value = React.useMemo(
    () => ({ tasks, setTasks, projects, setProjects }),
    [projects, tasks],
  );
  return (
    <TasksContext.Provider value={value}>{children}</TasksContext.Provider>
  );
}

export function useTasksStore() {
  const ctx = React.useContext(TasksContext);
  if (!ctx) throw new Error("useTasksStore must be used within TasksProvider");
  return ctx;
}
