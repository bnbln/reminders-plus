import React from 'react';

export type SectionId = 'today' | 'upcoming' | 'completed';

export type Project = {
  id: string;
  name: string;
  color: string; // hex
  icon: string; // emoji
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
  dueAt: number;
  dueHasTime?: boolean;
  location?: string;
  notes?: string;
  subtasks?: Subtask[];
  section: SectionId;
  orderRank: number;
  /** Unix ms timestamp when moved to trash. Undefined = active. */
  deletedAt?: number;
};

const BASE_TASKS = [
  {
    title: 'Design sync',
    subtitle: 'Gradient, motion, microcopy prüfen',
    emoji: '🎛️',
    project: { id: 'p-design', name: 'Design', color: '#7C3AED', icon: '🎨' },
    location: 'Studio · Raum 3',
    notes: 'Achte auf Reduced Motion, Haptics und Text-Kontrast.\n\n• iOS-native feel\n• Klare Informationshierarchie',
  },
  {
    title: 'Kunden-Call',
    subtitle: 'Scope für Q2 finalisieren',
    emoji: '📞',
    project: { id: 'p-clients', name: 'Clients', color: '#2563EB', icon: '🤝' },
    location: 'Zoom',
    notes: 'Agenda: Ziele, Scope, Risiken, nächste Schritte.\n\nBeispiele sammeln und priorisieren.',
  },
  {
    title: 'Moodboard export',
    subtitle: 'Konzeptvarianten markieren',
    emoji: '🖼️',
    project: { id: 'p-brand', name: 'Brand', color: '#F97316', icon: '✨' },
    location: 'Figma',
    notes: 'Export in 2 Größen: 1080px & 2048px.\n\nLinks in Notion ergänzen.',
  },
  {
    title: 'Spaziergang',
    subtitle: 'Headspace für neue Idee',
    emoji: '🚶‍♂️',
    project: { id: 'p-self', name: 'Self', color: '#10B981', icon: '🧘‍♂️' },
    location: 'Park',
    notes: 'Ohne Musik. 20 Minuten.\n\nDanach 3 Bullet-Insights notieren.',
  },
  {
    title: 'Briefing sortiert',
    subtitle: 'Stakeholder-Feedback eingearbeitet',
    emoji: '🗂️',
    project: { id: 'p-planning', name: 'Planning', color: '#EF4444', icon: '🧭' },
    location: 'Notion',
    notes: 'Widersprüche auflösen, offene Punkte markieren, Abhängigkeiten klären.',
  },
] as const;

export const createSeedProjects = (): Project[] => {
  const map = new Map<string, Project>();
  for (const t of BASE_TASKS) {
    map.set(t.project.id, {
      id: t.project.id,
      name: t.project.name,
      color: t.project.color,
      icon: t.project.icon,
    });
  }
  return Array.from(map.values());
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

export const createSeedTasks = (): Task[] => {
  return Array.from({ length: 80 }).map((_, index) => {
    const template = BASE_TASKS[index % BASE_TASKS.length];
    const section: SectionId = index < 28 ? 'today' : index < 56 ? 'upcoming' : 'completed';
    const sectionIndex = section === 'today' ? index : section === 'upcoming' ? index - 28 : index - 56;

    const subtasks: Subtask[] | undefined = index % 3 === 0
      ? [
          { id: `st-${index + 1}-1`, title: 'Kurz prüfen', done: section === 'completed' },
          { id: `st-${index + 1}-2`, title: 'Nächsten Schritt festlegen', done: section === 'completed' },
        ]
      : index % 5 === 0
        ? [{ id: `st-${index + 1}-1`, title: 'Erledigen', done: section === 'completed' }]
        : undefined;

    return {
      id: `t-${index + 1}`,
      title: `${template.title} #${index + 1}`,
      subtitle: template.subtitle,
      emoji: template.emoji,
      projectId: template.project.id,
      location: template.location,
      notes: template.notes,
      section,
      dueAt: getDueAtForSection(section),
      dueHasTime: true,
      orderRank: (sectionIndex + 1) * 1000,
      subtasks,
      deletedAt: undefined,
    };
  });
};

type TasksContextValue = {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
};

const TasksContext = React.createContext<TasksContextValue | null>(null);

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = React.useState<Task[]>(() => createSeedTasks());
  const [projects, setProjects] = React.useState<Project[]>(() => createSeedProjects());
  const value = React.useMemo(() => ({ tasks, setTasks, projects, setProjects }), [projects, tasks]);
  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}

export function useTasksStore() {
  const ctx = React.useContext(TasksContext);
  if (!ctx) throw new Error('useTasksStore must be used within TasksProvider');
  return ctx;
}
