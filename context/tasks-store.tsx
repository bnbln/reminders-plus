import React from 'react';

import { syncTaskDueNotifications } from '@/notifications/tasks-notifications';
import {
  createOnboardingSeedData,
  hasCompletedOnboardingSeed,
  markCompletedOnboardingSeed,
} from '@/storage/tasks-onboarding-seed';
import { loadEncryptedTasksSnapshot, saveEncryptedTasksSnapshot } from '@/storage/tasks-storage';

export type SectionId = 'today' | 'upcoming' | 'completed';

export type Project = {
  id: string;
  name: string;
  color: string; // hex
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
  /** Unix ms timestamp when moved to trash. Undefined = active. */
  deletedAt?: number;
};

export const getDueAtForSection = (section: SectionId) => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (section === 'today') {
    const preferred = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      Math.min(23, Math.max(8, now.getHours() + 1)),
      0
    );
    return preferred.getTime();
  }
  if (section === 'upcoming') {
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
  return v === 'today' || v === 'upcoming' || v === 'completed';
}

function isSameLocalDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function deriveActiveSectionFromDueAt(dueAt: number): SectionId {
  if (!Number.isFinite(dueAt) || dueAt <= 0) return 'upcoming';
  const now = new Date();
  const due = new Date(dueAt);
  return isSameLocalDay(now, due) ? 'today' : 'upcoming';
}

function normalizeSnapshot(raw: any): { tasks: Task[]; projects: Project[] } {
  const rawTasks = Array.isArray(raw?.tasks) ? raw.tasks : [];
  const rawProjects = Array.isArray(raw?.projects) ? raw.projects : [];

  const tasks: Task[] = rawTasks
    .map((t: any, index: number): Task | null => {
      if (!t || typeof t !== 'object') return null;
      if (typeof t.id !== 'string' || t.id.trim().length === 0) return null;
      if (typeof t.title !== 'string') return null;

      const dueAt = typeof t.dueAt === 'number' && Number.isFinite(t.dueAt) ? t.dueAt : 0;
      const orderRank = typeof t.orderRank === 'number' && Number.isFinite(t.orderRank) ? t.orderRank : (index + 1) * 1000;
      const rawSection: SectionId = isSectionId(t.section) ? t.section : 'today';
      // Keep completed as-is. For active tasks, derive section from due date so Home grouping matches due dates.
      // - undated -> upcoming
      // - due today -> today
      // - due future -> upcoming
      const section: SectionId = rawSection === 'completed' ? 'completed' : deriveActiveSectionFromDueAt(dueAt);
      const deletedAt = typeof t.deletedAt === 'number' && Number.isFinite(t.deletedAt) ? t.deletedAt : undefined;
      const completedAt =
        typeof t.completedAt === 'number' && Number.isFinite(t.completedAt)
          ? t.completedAt
          : section === 'completed'
            ? (typeof t.dueAt === 'number' && Number.isFinite(t.dueAt) && t.dueAt > 0 ? t.dueAt : Date.now())
            : undefined;

      return {
        id: t.id,
        title: t.title,
        subtitle: typeof t.subtitle === 'string' ? t.subtitle : undefined,
        emoji: typeof t.emoji === 'string' && t.emoji.length > 0 ? t.emoji : '📝',
        projectId: typeof t.projectId === 'string' ? t.projectId : '',
        dueAt,
        dueHasTime: typeof t.dueHasTime === 'boolean' ? t.dueHasTime : undefined,
        completedAt,
        location: typeof t.location === 'string' ? t.location : undefined,
        notes: typeof t.notes === 'string' ? t.notes : undefined,
        subtasks: Array.isArray(t.subtasks) ? (t.subtasks as any) : undefined,
        section,
        orderRank,
        deletedAt,
      };
    })
    .filter((t: Task | null): t is Task => !!t);

  const projects: Project[] = rawProjects
    .map((p: any): Project | null => {
      if (!p || typeof p !== 'object') return null;
      if (typeof p.id !== 'string' || p.id.trim().length === 0) return null;
      if (typeof p.name !== 'string') return null;

      return {
        id: p.id,
        name: p.name,
        color: typeof p.color === 'string' ? p.color : '#2563EB',
        icon: typeof p.icon === 'string' ? p.icon : 'folder.fill',
        description: typeof p.description === 'string' ? p.description : undefined,
        completed: typeof p.completed === 'boolean' ? p.completed : undefined,
        deletedAt: typeof p.deletedAt === 'number' && Number.isFinite(p.deletedAt) ? p.deletedAt : undefined,
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
        const res = await loadEncryptedTasksSnapshot();
        if (cancelled) return;
        if (res.status === 'ok') {
          const next = normalizeSnapshot(res.snapshot);
          setTasks(next.tasks);
          setProjects(next.projects);
          persistEnabledRef.current = true;
          return;
        }

        if (res.status === 'missing') {
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
      void saveEncryptedTasksSnapshot({
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

  const value = React.useMemo(() => ({ tasks, setTasks, projects, setProjects }), [projects, tasks]);
  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}

export function useTasksStore() {
  const ctx = React.useContext(TasksContext);
  if (!ctx) throw new Error('useTasksStore must be used within TasksProvider');
  return ctx;
}
