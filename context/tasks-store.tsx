import React from "react";

import { syncTaskDueNotifications } from "@/notifications/tasks-notifications";
import {
    createOnboardingSeedData,
    hasCompletedOnboardingSeed,
    markCompletedOnboardingSeed,
} from "@/storage/tasks-onboarding-seed";
import { loadTasksSnapshot, saveTasksSnapshot } from "@/storage/tasks-storage";

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

function isSectionId(v: unknown): v is SectionId {
  return v === "today" || v === "upcoming" || v === "completed";
}

function isSameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function deriveActiveSectionFromDueAt(dueAt: number): SectionId {
  if (!Number.isFinite(dueAt) || dueAt <= 0) return "upcoming";
  const now = new Date();
  const due = new Date(dueAt);
  return isSameLocalDay(now, due) ? "today" : "upcoming";
}

function isRoutineInterval(v: unknown): v is RoutineInterval {
  return v === "daily" || v === "weekly" || v === "monthly" || v === "yearly";
}

function isRoutineType(v: unknown): v is RoutineType {
  return (
    v === "daily" ||
    v === "weekly" ||
    v === "monthly" ||
    v === "yearly" ||
    v === "weekday" ||
    v === "nth-weekday" ||
    v === "first-of-month" ||
    v === "last-of-month" ||
    v === "yearly-date"
  );
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
): number {
  const now = new Date();
  const base = currentDueAt > 0 ? new Date(currentDueAt) : now;
  let next = new Date(base);
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
      next.setMonth(next.getMonth() + 1);
      if (typeof options.monthDay === "number" && options.monthDay >= 1) {
        const maxDay = getLastDayOfMonth(
          next.getFullYear(),
          next.getMonth(),
        ).getDate();
        next.setDate(Math.min(options.monthDay, maxDay));
      }
      break;

    case "quarterly":
      next.setMonth(next.getMonth() + 3);
      if (typeof options.monthDay === "number" && options.monthDay >= 1) {
        const maxDay = getLastDayOfMonth(
          next.getFullYear(),
          next.getMonth(),
        ).getDate();
        next.setDate(Math.min(options.monthDay, maxDay));
      }
      break;

    case "biannually":
      next.setMonth(next.getMonth() + 6);
      if (typeof options.monthDay === "number" && options.monthDay >= 1) {
        const maxDay = getLastDayOfMonth(
          next.getFullYear(),
          next.getMonth(),
        ).getDate();
        next.setDate(Math.min(options.monthDay, maxDay));
      }
      break;

    case "yearly":
      next.setFullYear(next.getFullYear() + 1);
      if (
        typeof options.month === "number" &&
        typeof options.monthDay === "number"
      ) {
        const targetMonth = options.month;
        const targetDay = options.monthDay;
        next.setMonth(targetMonth);
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

  // If next date is still in the past, recursively advance
  if (next.getTime() <= now.getTime()) {
    return getNextRoutineDate(next.getTime(), routineType, options);
  }

  return next.getTime();
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
      // Keep completed as-is. For active tasks, derive section from due date so Home grouping matches due dates.
      // - undated -> upcoming
      // - due today -> today
      // - due future -> upcoming
      const section: SectionId =
        rawSection === "completed"
          ? "completed"
          : deriveActiveSectionFromDueAt(dueAt);
      const deletedAt =
        typeof t.deletedAt === "number" && Number.isFinite(t.deletedAt)
          ? t.deletedAt
          : undefined;
      const completedAt =
        typeof t.completedAt === "number" && Number.isFinite(t.completedAt)
          ? t.completedAt
          : section === "completed"
            ? typeof t.dueAt === "number" &&
              Number.isFinite(t.dueAt) &&
              t.dueAt > 0
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
        routineType: isRoutineType(t.routineType) ? t.routineType : undefined,
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

type TasksContextValue = {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
};

const TasksContext = React.createContext<TasksContextValue | null>(null);

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const hydratedRef = React.useRef(false);
  const persistEnabledRef = React.useRef(false);

  // Hydrate from local encrypted snapshot once.
  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const res = await loadTasksSnapshot();
        if (cancelled) return;
        if (res.status === "ok") {
          const next = normalizeSnapshot(res.snapshot);
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
        if (!cancelled) hydratedRef.current = true;
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist on change (after hydration). Debounced to avoid excessive writes on drag/reorder.
  React.useEffect(() => {
    if (!hydratedRef.current) return;
    if (!persistEnabledRef.current) return;

    const handle = setTimeout(() => {
      void saveTasksSnapshot({
        schemaVersion: SNAPSHOT_VERSION,
        savedAt: Date.now(),
        tasks,
        projects,
      });
    }, 250);

    return () => {
      clearTimeout(handle);
    };
  }, [projects, tasks]);

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
