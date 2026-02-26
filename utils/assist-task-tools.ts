import { jsonSchema, tool } from 'ai';
import type { Dispatch, SetStateAction } from 'react';

import {
  getDueAtForSection,
  type Project,
  type RoutineInterval,
  type RoutineType,
  type SectionId,
  type Subtask,
  type Task,
} from '@/context/tasks-store';
import { deriveActiveSectionFromDueAt, hasValidDueAt } from '@/utils/task-dates';

export const ASSIST_TOOL_CALL_LIMIT_ERROR = '__assist_tool_call_limit__';

type ToolStatus = 'ok' | 'not_found' | 'ambiguous' | 'exists' | 'error';

type FindTasksToolInput = {
  query?: string;
  limit?: number;
  includeCompleted?: boolean;
  includeDeleted?: boolean;
  section?: SectionId;
  projectId?: string;
  projectQuery?: string;
  isRoutine?: boolean;
};

type FindProjectsToolInput = {
  query?: string;
  limit?: number;
  includeDeleted?: boolean;
};

type CreateProjectToolInput = {
  name: string;
  description?: string;
  color?: string;
  emoji?: string;
  icon?: string;
};

type CreateTaskToolInput = {
  title: string;
  subtitle?: string;
  emoji?: string;
  color?: string;
  notes?: string;
  location?: string;
  projectId?: string;
  projectQuery?: string;
  section?: SectionId;
  dueAtMs?: number;
  dueDateISO?: string;
  dueTime24?: string;
  dueHasTime?: boolean;
  subtasks?: { title: string; done?: boolean }[];
  isRoutine?: boolean;
  routineType?: RoutineType;
  routineWeekday?: number;
  routineNthWeek?: number;
  routineMonthDay?: number;
  routineMonth?: number;
};

type MoveTaskToolInput = {
  taskId?: string;
  taskQuery?: string;
  targetProjectId?: string;
  targetProjectQuery?: string;
  clearProject?: boolean;
  targetSection?: SectionId;
  dueAtMs?: number;
  dueDateISO?: string;
  dueTime24?: string;
  dueHasTime?: boolean;
};

export type AssistTaskCandidate = {
  id: string;
  title: string;
  subtitle?: string;
  emoji: string;
  projectId: string;
  projectName?: string;
  dueAt: number;
  dueISO?: string;
  dueHasTime?: boolean;
  completedAt?: number;
  location?: string;
  notes?: string;
  subtasks?: Subtask[];
  section: SectionId;
  orderRank: number;
  color?: string;
  deletedAt?: number;
  isRoutine?: boolean;
  routineType?: RoutineType;
  routineInterval?: RoutineInterval;
  routineWeekday?: number;
  routineNthWeek?: number;
  routineMonthDay?: number;
  routineMonth?: number;
  score?: number;
};

export type AssistProjectCandidate = {
  id: string;
  name: string;
  color: string;
  emoji?: string;
  icon: string;
  description?: string;
  completed?: boolean;
  deletedAt?: number;
  score?: number;
};

export type FindTasksToolOutput = {
  status: ToolStatus;
  query?: string;
  filters?: {
    section?: SectionId;
    projectId?: string;
    projectQuery?: string;
    includeCompleted?: boolean;
    includeDeleted?: boolean;
    isRoutine?: boolean;
  };
  results: AssistTaskCandidate[];
  message?: string;
};

export type FindProjectsToolOutput = {
  status: ToolStatus;
  query?: string;
  includeDeleted?: boolean;
  results: AssistProjectCandidate[];
  message?: string;
};

export type CreateProjectToolOutput = {
  status: ToolStatus;
  project?: AssistProjectCandidate;
  message?: string;
  similarProjects?: AssistProjectCandidate[];
};

export type CreateTaskToolOutput = {
  status: ToolStatus;
  task?: AssistTaskCandidate;
  project?: AssistProjectCandidate;
  message?: string;
  projectCandidates?: AssistProjectCandidate[];
};

export type MoveTaskToolOutput = {
  status: ToolStatus;
  task?: AssistTaskCandidate;
  project?: AssistProjectCandidate;
  message?: string;
  taskCandidates?: AssistTaskCandidate[];
  projectCandidates?: AssistProjectCandidate[];
};

type CreateAssistToolsParams = {
  getTasks: () => Task[];
  getProjects: () => Project[];
  setTasks: Dispatch<SetStateAction<Task[]>>;
  setProjects: Dispatch<SetStateAction<Project[]>>;
  onToolCall?: () => void;
  shouldAbortToolCalls?: () => boolean;
};

const DEFAULT_PROJECT_ICON = 'folder.fill';
const DEFAULT_PROJECT_COLOR = '#2563EB';
const DEFAULT_TASK_EMOJI = '📝';
const DEFAULT_PROJECT_EMOJI = '📁';

const ROUTINE_TYPES: RoutineType[] = [
  'hourly',
  'daily',
  'weekdays',
  'weekends',
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'biannually',
  'yearly',
  'custom',
];

const normalizeSearch = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[ä]/g, 'ae')
    .replace(/[ö]/g, 'oe')
    .replace(/[ü]/g, 'ue')
    .replace(/[ß]/g, 'ss');

const FIRST_EMOJI_PATTERN = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

const TASK_EMOJI_RULES: readonly { emoji: string; keywords: readonly string[] }[] = [
  { emoji: '🛒', keywords: ['einkauf', 'shopping', 'supermarkt', 'kaufen'] },
  { emoji: '💼', keywords: ['angebot', 'vertrieb', 'sales', 'kunde', 'customer'] },
  { emoji: '📞', keywords: ['anruf', 'call', 'telefon', 'meeting', 'besprechung'] },
  { emoji: '✉️', keywords: ['mail', 'email', 'e-mail', 'nachricht'] },
  { emoji: '🧾', keywords: ['rechnung', 'invoice', 'buchhaltung'] },
  { emoji: '📚', keywords: ['lernen', 'study', 'kurs', 'pruefung', 'prüfung'] },
  { emoji: '🏃', keywords: ['sport', 'training', 'lauf', 'workout', 'fitness'] },
  { emoji: '🩺', keywords: ['arzt', 'doctor', 'medizin', 'gesundheit'] },
  { emoji: '💻', keywords: ['code', 'coding', 'entwicklung', 'dev', 'programm'] },
  { emoji: '🐞', keywords: ['bug', 'fehler', 'fix', 'issue'] },
  { emoji: '🎨', keywords: ['design', 'ui', 'ux'] },
  { emoji: '📊', keywords: ['report', 'bericht', 'analyse', 'zahlen', 'kpi'] },
  { emoji: '🗂️', keywords: ['organisieren', 'ordnung', 'ablage'] },
  { emoji: '🔁', keywords: ['routine', 'wiederholung', 'repeat'] },
  { emoji: '✈️', keywords: ['reise', 'trip', 'flug', 'urlaub'] },
  { emoji: '🏠', keywords: ['zuhause', 'home', 'haus', 'wohnung'] },
];

const PROJECT_EMOJI_RULES: readonly { emoji: string; keywords: readonly string[] }[] = [
  { emoji: '🤝', keywords: ['vertrieb', 'sales', 'kunden', 'kunde', 'crm'] },
  { emoji: '📣', keywords: ['marketing', 'kampagne', 'campaign', 'brand'] },
  { emoji: '💻', keywords: ['entwicklung', 'engineering', 'dev', 'software', 'code'] },
  { emoji: '🎨', keywords: ['design', 'branding', 'kreativ'] },
  { emoji: '📦', keywords: ['produkt', 'product', 'lieferung', 'logistik'] },
  { emoji: '💰', keywords: ['finanz', 'finance', 'budget', 'buchhaltung', 'controlling'] },
  { emoji: '👥', keywords: ['hr', 'personal', 'team', 'people'] },
  { emoji: '🏠', keywords: ['privat', 'home', 'familie'] },
  { emoji: '🩺', keywords: ['gesundheit', 'medizin', 'klinik'] },
  { emoji: '🧪', keywords: ['research', 'forschung', 'labor'] },
];

function extractFirstEmoji(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.trim().match(FIRST_EMOJI_PATTERN);
  return match?.[0];
}

function emojiFromKeywords(
  value: string,
  rules: readonly { emoji: string; keywords: readonly string[] }[],
  fallback: string,
): string {
  const normalized = normalizeSearch(value);
  if (!normalized) return fallback;

  for (const rule of rules) {
    for (const keyword of rule.keywords) {
      if (normalized.includes(normalizeSearch(keyword))) {
        return rule.emoji;
      }
    }
  }

  return fallback;
}

export function inferTaskEmojiFromTitle(value: string): string {
  const explicit = extractFirstEmoji(value);
  if (explicit) return explicit;
  return emojiFromKeywords(value, TASK_EMOJI_RULES, DEFAULT_TASK_EMOJI);
}

export function inferProjectEmojiFromName(value: string): string {
  const explicit = extractFirstEmoji(value);
  if (explicit) return explicit;
  return emojiFromKeywords(value, PROJECT_EMOJI_RULES, DEFAULT_PROJECT_EMOJI);
}

const splitSearchTokens = (query: string): string[] =>
  normalizeSearch(query)
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter(Boolean);

const limitValue = (value: number | undefined, fallback: number, max: number): number => {
  if (!Number.isFinite(value)) return fallback;
  const normalized = Math.trunc(value as number);
  if (normalized <= 0) return fallback;
  return Math.min(normalized, max);
};

const normalizeHexColor = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const withPrefix = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(withPrefix)) return undefined;
  return withPrefix.toUpperCase();
};

const normalizeRoutineType = (value: string | undefined): RoutineType | undefined => {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  return ROUTINE_TYPES.find((type) => type === normalized);
};

const routineIntervalFromType = (routineType: RoutineType | undefined): RoutineInterval | undefined => {
  if (!routineType) return undefined;
  if (routineType === 'daily') return 'daily';
  if (routineType === 'weekly') return 'weekly';
  if (routineType === 'monthly') return 'monthly';
  if (routineType === 'yearly') return 'yearly';
  return undefined;
};

const taskId = () => `t-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const projectId = () => `p-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const subtaskId = () => `st-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function scoreFromQuery(query: string, title: string, haystack: string): number {
  const tokens = splitSearchTokens(query);
  if (tokens.length === 0) return 1;

  const normalizedTitle = normalizeSearch(title);
  const normalizedHaystack = normalizeSearch(haystack);

  let score = 0;
  for (const token of tokens) {
    if (normalizedTitle === token) {
      score += 1;
      continue;
    }
    if (normalizedTitle.startsWith(token)) {
      score += 0.92;
      continue;
    }
    if (normalizedTitle.includes(token)) {
      score += 0.78;
      continue;
    }
    if (normalizedHaystack.includes(token)) {
      score += 0.48;
      continue;
    }
    score += 0;
  }

  return score / tokens.length;
}

function isAmbiguousByScore<T extends { score?: number }>(values: T[], gap: number = 0.02): boolean {
  if (values.length <= 1) return false;
  const first = values[0]?.score ?? 0;
  const second = values[1]?.score ?? 0;
  return first - second <= gap;
}

function buildTaskCandidate(
  task: Task,
  projectsById: Map<string, Project>,
  score?: number,
): AssistTaskCandidate {
  const project = task.projectId ? projectsById.get(task.projectId) : undefined;
  const dueISO = task.dueAt > 0 ? new Date(task.dueAt).toISOString() : undefined;

  return {
    id: task.id,
    title: task.title,
    subtitle: task.subtitle,
    emoji: task.emoji,
    projectId: task.projectId,
    projectName: project?.name,
    dueAt: task.dueAt,
    dueISO,
    dueHasTime: task.dueHasTime,
    completedAt: task.completedAt,
    location: task.location,
    notes: task.notes,
    subtasks: task.subtasks?.map((entry) => ({ ...entry })),
    section: task.section,
    orderRank: task.orderRank,
    color: task.color,
    deletedAt: task.deletedAt,
    isRoutine: task.isRoutine,
    routineType: task.routineType,
    routineInterval: task.routineInterval,
    routineWeekday: task.routineWeekday,
    routineNthWeek: task.routineNthWeek,
    routineMonthDay: task.routineMonthDay,
    routineMonth: task.routineMonth,
    ...(typeof score === 'number' ? { score } : {}),
  };
}

function buildProjectCandidate(project: Project, score?: number): AssistProjectCandidate {
  return {
    id: project.id,
    name: project.name,
    color: project.color,
    emoji: project.emoji,
    icon: project.icon,
    description: project.description,
    completed: project.completed,
    deletedAt: project.deletedAt,
    ...(typeof score === 'number' ? { score } : {}),
  };
}

export function findProjectsLocally(
  projects: Project[],
  query: string,
  options?: { limit?: number; includeDeleted?: boolean },
): AssistProjectCandidate[] {
  const includeDeleted = options?.includeDeleted ?? false;
  const limit = limitValue(options?.limit, 20, 20);
  const trimmedQuery = query.trim();

  const filtered = projects.filter((project) => includeDeleted || !project.deletedAt);
  if (!trimmedQuery) {
    return filtered.slice(0, limit).map((project) => buildProjectCandidate(project, 1));
  }

  const scored = filtered
    .map((project) => {
      const haystack = `${project.name} ${project.description ?? ''} ${project.emoji ?? ''} ${project.icon}`;
      const score = scoreFromQuery(trimmedQuery, project.name, haystack);
      return { project, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);

  return scored.map((entry) => buildProjectCandidate(entry.project, entry.score));
}

export function findTasksLocally(
  tasks: Task[],
  projects: Project[],
  input: FindTasksToolInput,
): AssistTaskCandidate[] {
  const {
    query = '',
    includeCompleted = true,
    includeDeleted = false,
    section,
    projectId: projectIdFilter,
    projectQuery,
    isRoutine,
  } = input;
  const limit = limitValue(input.limit, 20, 20);

  const projectsById = new Map(projects.map((project) => [project.id, project] as const));
  const queryText = query.trim();
  const projectQueryText = projectQuery?.trim() ?? '';

  const results: AssistTaskCandidate[] = [];
  for (const task of tasks) {
    if (!includeDeleted && task.deletedAt) continue;
    if (!includeCompleted && task.section === 'completed') continue;
    if (section && task.section !== section) continue;
    if (typeof isRoutine === 'boolean' && Boolean(task.isRoutine) !== isRoutine) continue;
    if (projectIdFilter && task.projectId !== projectIdFilter) continue;

    const projectName = task.projectId ? projectsById.get(task.projectId)?.name ?? '' : '';
    const subtasksText = (task.subtasks ?? []).map((entry) => entry.title).join(' ');
    const haystack = [
      task.title,
      task.subtitle ?? '',
      task.notes ?? '',
      task.location ?? '',
      task.emoji,
      task.color ?? '',
      projectName,
      subtasksText,
      task.routineType ?? '',
      task.routineInterval ?? '',
      String(task.dueAt),
    ].join(' ');

    let score = queryText ? scoreFromQuery(queryText, task.title, haystack) : 1;
    if (projectQueryText) {
      const projectScore = scoreFromQuery(projectQueryText, projectName, `${projectName} ${task.projectId}`);
      if (projectScore <= 0) continue;
      score = score * 0.75 + projectScore * 0.25;
    }

    if (queryText && score <= 0) continue;
    results.push(buildTaskCandidate(task, projectsById, score));
  }

  return results
    .sort((left, right) => {
      const scoreDelta = (right.score ?? 0) - (left.score ?? 0);
      if (scoreDelta !== 0) return scoreDelta;
      return left.orderRank - right.orderRank;
    })
    .slice(0, limit);
}

function resolveProjectFromInput(
  projects: Project[],
  input: { projectId?: string; projectQuery?: string },
): {
  status: ToolStatus;
  project?: Project;
  projectCandidates?: AssistProjectCandidate[];
  message?: string;
} {
  const requestedProjectId = input.projectId?.trim() ?? '';
  const requestedProjectQuery = input.projectQuery?.trim() ?? '';

  if (requestedProjectId) {
    const project = projects.find((entry) => entry.id === requestedProjectId && !entry.deletedAt);
    if (!project) {
      return {
        status: 'not_found',
        message: `Kein aktives Projekt mit ID "${requestedProjectId}" gefunden.`,
      };
    }
    return { status: 'ok', project };
  }

  if (!requestedProjectQuery) {
    return { status: 'ok' };
  }

  const candidates = findProjectsLocally(projects, requestedProjectQuery, { limit: 3, includeDeleted: false });
  if (candidates.length === 0) {
    return {
      status: 'not_found',
      message: `Kein Projekt fuer "${requestedProjectQuery}" gefunden.`,
    };
  }

  const top = candidates[0];
  if (!top) {
    return {
      status: 'not_found',
      message: `Kein Projekt fuer "${requestedProjectQuery}" gefunden.`,
    };
  }

  if (isAmbiguousByScore(candidates) || (top.score ?? 0) < 0.55) {
    return {
      status: 'ambiguous',
      message: `Projektzuordnung fuer "${requestedProjectQuery}" ist mehrdeutig.`,
      projectCandidates: candidates,
    };
  }

  const project = projects.find((entry) => entry.id === top.id && !entry.deletedAt);
  if (!project) {
    return {
      status: 'not_found',
      message: `Kein Projekt fuer "${requestedProjectQuery}" gefunden.`,
    };
  }

  return { status: 'ok', project };
}

function parseDueInput(input: {
  dueAtMs?: number;
  dueDateISO?: string;
  dueTime24?: string;
  dueHasTime?: boolean;
}): { dueAt: number; dueHasTime?: boolean } {
  if (typeof input.dueAtMs === 'number' && Number.isFinite(input.dueAtMs) && input.dueAtMs > 0) {
    return {
      dueAt: Math.trunc(input.dueAtMs),
      dueHasTime: typeof input.dueHasTime === 'boolean' ? input.dueHasTime : true,
    };
  }

  const dueDate = input.dueDateISO?.trim() ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return { dueAt: 0, dueHasTime: false };
  }

  const [yearRaw, monthRaw, dayRaw] = dueDate.split('-');
  const year = Number.parseInt(yearRaw, 10);
  const monthIndex = Number.parseInt(monthRaw, 10) - 1;
  const day = Number.parseInt(dayRaw, 10);
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || !Number.isFinite(day)) {
    return { dueAt: 0, dueHasTime: false };
  }

  const timeRaw = input.dueTime24?.trim() ?? '';
  const timeMatch = timeRaw.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  const hasTime = Boolean(timeMatch);
  const hours = hasTime ? Number.parseInt(timeMatch?.[1] ?? '0', 10) : 11;
  const minutes = hasTime ? Number.parseInt(timeMatch?.[2] ?? '0', 10) : 0;

  const dueAt = new Date(year, monthIndex, day, hours, minutes, 0, 0).getTime();
  if (!Number.isFinite(dueAt)) {
    return { dueAt: 0, dueHasTime: false };
  }

  return {
    dueAt,
    dueHasTime: typeof input.dueHasTime === 'boolean' ? input.dueHasTime : hasTime,
  };
}

function normalizeSubtasks(input: { title: string; done?: boolean }[] | undefined): Subtask[] | undefined {
  if (!Array.isArray(input)) return undefined;

  const next = input
    .map((entry) => {
      const title = entry?.title?.trim();
      if (!title) return null;
      return {
        id: subtaskId(),
        title,
        done: Boolean(entry.done),
      };
    })
    .filter((entry): entry is Subtask => Boolean(entry));

  return next.length > 0 ? next : undefined;
}

function topOrderRankForSection(tasks: Task[], section: SectionId, excludeTaskId?: string): number {
  const minRank = tasks
    .filter((task) => !task.deletedAt && task.section === section && task.id !== excludeTaskId)
    .reduce<number | null>(
      (acc, task) => (acc === null ? task.orderRank : Math.min(acc, task.orderRank)),
      null,
    );

  return (minRank ?? 1000) - 1000;
}

function ensureToolBudget(params: Pick<CreateAssistToolsParams, 'onToolCall' | 'shouldAbortToolCalls'>): void {
  params.onToolCall?.();
  if (params.shouldAbortToolCalls?.()) {
    throw new Error(ASSIST_TOOL_CALL_LIMIT_ERROR);
  }
}

export function createAssistTools(params: CreateAssistToolsParams) {
  const {
    getTasks,
    getProjects,
    setTasks,
    setProjects,
    onToolCall,
    shouldAbortToolCalls,
  } = params;

  const guarded = () => ensureToolBudget({ onToolCall, shouldAbortToolCalls });

  return {
    findTasks: tool({
      description:
        'Finde Tasks in den Nutzerdaten. Liefert fuer jeden Treffer alle Task-Felder inklusive Projektbezug.',
      inputSchema: jsonSchema<FindTasksToolInput>({
        type: 'object',
        additionalProperties: true,
        properties: {
          query: { type: 'string' },
          limit: { type: 'number' },
          includeCompleted: { type: 'boolean' },
          includeDeleted: { type: 'boolean' },
          section: { type: 'string', enum: ['today', 'upcoming', 'completed'] },
          projectId: { type: 'string' },
          projectQuery: { type: 'string' },
          isRoutine: { type: 'boolean' },
        },
      }),
      execute: async (input): Promise<FindTasksToolOutput> => {
        guarded();
        const tasks = getTasks();
        const projects = getProjects();
        const query = input.query?.trim();
        const results = findTasksLocally(tasks, projects, input);
        return {
          status: 'ok',
          query,
          filters: {
            section: input.section,
            projectId: input.projectId,
            projectQuery: input.projectQuery?.trim() || undefined,
            includeCompleted: input.includeCompleted,
            includeDeleted: input.includeDeleted,
            isRoutine: input.isRoutine,
          },
          results,
        };
      },
    }),

    findProjects: tool({
      description: 'Finde Projekte in den Nutzerdaten. Liefert alle Projektfelder je Treffer.',
      inputSchema: jsonSchema<FindProjectsToolInput>({
        type: 'object',
        additionalProperties: true,
        properties: {
          query: { type: 'string' },
          limit: { type: 'number' },
          includeDeleted: { type: 'boolean' },
        },
      }),
      execute: async (input): Promise<FindProjectsToolOutput> => {
        guarded();
        const projects = getProjects();
        const query = input.query?.trim();
        const results = findProjectsLocally(projects, query ?? '', {
          limit: input.limit,
          includeDeleted: input.includeDeleted,
        });
        return {
          status: 'ok',
          query,
          includeDeleted: input.includeDeleted,
          results,
        };
      },
    }),

    createProject: tool({
      description:
        'Erstelle ein neues Projekt. Felder: name, description, color (hex), emoji und icon.',
      inputSchema: jsonSchema<CreateProjectToolInput>({
        type: 'object',
        additionalProperties: true,
        required: ['name'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          color: { type: 'string' },
          emoji: { type: 'string' },
          icon: { type: 'string' },
        },
      }),
      execute: async (input): Promise<CreateProjectToolOutput> => {
        guarded();
        const name = input.name.trim();
        if (!name) {
          return { status: 'error', message: 'Projektname fehlt.' };
        }

        const projects = getProjects();
        const exactMatch = projects.find(
          (entry) => !entry.deletedAt && normalizeSearch(entry.name) === normalizeSearch(name),
        );
        if (exactMatch) {
          return {
            status: 'exists',
            message: `Projekt "${name}" existiert bereits.`,
            project: buildProjectCandidate(exactMatch, 1),
          };
        }

        const explicitEmoji = extractFirstEmoji(input.emoji);
        const inferredEmoji = inferProjectEmojiFromName(`${name} ${input.description ?? ''}`);

        const nextProject: Project = {
          id: projectId(),
          name,
          color: normalizeHexColor(input.color) ?? DEFAULT_PROJECT_COLOR,
          emoji: explicitEmoji ?? inferredEmoji,
          icon: input.icon?.trim() || DEFAULT_PROJECT_ICON,
          description: input.description?.trim() || undefined,
          completed: false,
          deletedAt: undefined,
        };

        setProjects((prev) => [nextProject, ...prev]);
        return {
          status: 'ok',
          project: buildProjectCandidate(nextProject, 1),
          message: `Projekt "${name}" wurde erstellt.`,
        };
      },
    }),

    createTask: tool({
      description:
        'Erstelle einen Task inklusive optionaler Felder wie Projekt, Standort, Notizen, Subtasks, Deadline und Routine.',
      inputSchema: jsonSchema<CreateTaskToolInput>({
        type: 'object',
        additionalProperties: true,
        required: ['title'],
        properties: {
          title: { type: 'string' },
          subtitle: { type: 'string' },
          emoji: { type: 'string' },
          color: { type: 'string' },
          notes: { type: 'string' },
          location: { type: 'string' },
          projectId: { type: 'string' },
          projectQuery: { type: 'string' },
          section: { type: 'string', enum: ['today', 'upcoming', 'completed'] },
          dueAtMs: { type: 'number' },
          dueDateISO: { type: 'string' },
          dueTime24: { type: 'string' },
          dueHasTime: { type: 'boolean' },
          subtasks: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: true,
              required: ['title'],
              properties: {
                title: { type: 'string' },
                done: { type: 'boolean' },
              },
            },
          },
          isRoutine: { type: 'boolean' },
          routineType: { type: 'string' },
          routineWeekday: { type: 'number' },
          routineNthWeek: { type: 'number' },
          routineMonthDay: { type: 'number' },
          routineMonth: { type: 'number' },
        },
      }),
      execute: async (input): Promise<CreateTaskToolOutput> => {
        guarded();
        const title = input.title.trim();
        if (!title) {
          return { status: 'error', message: 'Task-Titel fehlt.' };
        }

        const projects = getProjects();
        const projectResolution = resolveProjectFromInput(projects, {
          projectId: input.projectId,
          projectQuery: input.projectQuery,
        });

        if (projectResolution.status === 'not_found' || projectResolution.status === 'ambiguous') {
          return {
            status: projectResolution.status,
            message: projectResolution.message,
            projectCandidates: projectResolution.projectCandidates,
          };
        }

        const dueInfo = parseDueInput({
          dueAtMs: input.dueAtMs,
          dueDateISO: input.dueDateISO,
          dueTime24: input.dueTime24,
          dueHasTime: input.dueHasTime,
        });

        let section: SectionId =
          input.section ??
          (dueInfo.dueAt > 0 ? deriveActiveSectionFromDueAt(dueInfo.dueAt) : 'upcoming');
        let dueAt = dueInfo.dueAt;
        let dueHasTime = dueInfo.dueHasTime;

        if (section === 'today' && !hasValidDueAt(dueAt)) {
          dueAt = getDueAtForSection('today');
          dueHasTime = true;
        }
        if (section === 'completed' && !hasValidDueAt(dueAt)) {
          dueAt = Date.now();
          dueHasTime = true;
        }
        if (section === 'upcoming' && !hasValidDueAt(dueAt)) {
          dueAt = 0;
          dueHasTime = false;
        }

        const explicitRoutineType = normalizeRoutineType(input.routineType);
        const isRoutine = input.isRoutine ?? Boolean(explicitRoutineType);
        const routineType = isRoutine ? explicitRoutineType ?? 'daily' : undefined;
        const routineInterval = isRoutine ? routineIntervalFromType(routineType) : undefined;
        const explicitEmoji = extractFirstEmoji(input.emoji);
        const inferredEmoji = inferTaskEmojiFromTitle(
          [title, input.subtitle ?? '', input.location ?? '', input.notes ?? ''].join(' '),
        );

        const nextTask: Task = {
          id: taskId(),
          title,
          subtitle: input.subtitle?.trim() || undefined,
          emoji: explicitEmoji ?? inferredEmoji,
          projectId: projectResolution.project?.id ?? '',
          dueAt,
          dueHasTime,
          completedAt: section === 'completed' ? Date.now() : undefined,
          location: input.location?.trim() || undefined,
          notes: input.notes?.trim() || undefined,
          subtasks: normalizeSubtasks(input.subtasks),
          section,
          orderRank: topOrderRankForSection(getTasks(), section),
          color: normalizeHexColor(input.color),
          deletedAt: undefined,
          isRoutine: isRoutine || undefined,
          routineType,
          routineInterval,
          routineWeekday:
            typeof input.routineWeekday === 'number' && input.routineWeekday >= 0 && input.routineWeekday <= 6
              ? input.routineWeekday
              : undefined,
          routineNthWeek:
            typeof input.routineNthWeek === 'number' && input.routineNthWeek >= 1 && input.routineNthWeek <= 4
              ? input.routineNthWeek
              : undefined,
          routineMonthDay:
            typeof input.routineMonthDay === 'number' && input.routineMonthDay >= 1 && input.routineMonthDay <= 31
              ? input.routineMonthDay
              : undefined,
          routineMonth:
            typeof input.routineMonth === 'number' && input.routineMonth >= 0 && input.routineMonth <= 11
              ? input.routineMonth
              : undefined,
        };

        setTasks((prev) => [nextTask, ...prev]);
        const projectsById = new Map(getProjects().map((entry) => [entry.id, entry] as const));

        return {
          status: 'ok',
          task: buildTaskCandidate(nextTask, projectsById, 1),
          project: projectResolution.project ? buildProjectCandidate(projectResolution.project, 1) : undefined,
          message: `Task "${title}" wurde erstellt.`,
        };
      },
    }),

    moveTask: tool({
      description:
        'Verschiebe oder aktualisiere einen existierenden Task, inkl. Zielprojekt, Zielsektion und Deadline.',
      inputSchema: jsonSchema<MoveTaskToolInput>({
        type: 'object',
        additionalProperties: true,
        properties: {
          taskId: { type: 'string' },
          taskQuery: { type: 'string' },
          targetProjectId: { type: 'string' },
          targetProjectQuery: { type: 'string' },
          clearProject: { type: 'boolean' },
          targetSection: { type: 'string', enum: ['today', 'upcoming', 'completed'] },
          dueAtMs: { type: 'number' },
          dueDateISO: { type: 'string' },
          dueTime24: { type: 'string' },
          dueHasTime: { type: 'boolean' },
        },
      }),
      execute: async (input): Promise<MoveTaskToolOutput> => {
        guarded();

        const tasks = getTasks();
        const projects = getProjects();
        const projectsById = new Map(projects.map((entry) => [entry.id, entry] as const));

        let taskToMove: Task | undefined;
        if (input.taskId?.trim()) {
          taskToMove = tasks.find((entry) => entry.id === input.taskId?.trim() && !entry.deletedAt);
        } else if (input.taskQuery?.trim()) {
          const matches = findTasksLocally(tasks, projects, {
            query: input.taskQuery.trim(),
            includeDeleted: false,
            includeCompleted: true,
            limit: 5,
          });
          if (matches.length === 0) {
            return {
              status: 'not_found',
              message: `Kein Task fuer "${input.taskQuery.trim()}" gefunden.`,
            };
          }
          if (isAmbiguousByScore(matches) || (matches[0]?.score ?? 0) < 0.55) {
            return {
              status: 'ambiguous',
              message: `Taskzuordnung fuer "${input.taskQuery.trim()}" ist mehrdeutig.`,
              taskCandidates: matches.slice(0, 3),
            };
          }
          taskToMove = tasks.find((entry) => entry.id === matches[0]?.id && !entry.deletedAt);
        }

        if (!taskToMove) {
          return {
            status: 'not_found',
            message: 'Task wurde nicht gefunden.',
          };
        }

        let targetProject: Project | undefined;
        if (!input.clearProject && (input.targetProjectId?.trim() || input.targetProjectQuery?.trim())) {
          const projectResolution = resolveProjectFromInput(projects, {
            projectId: input.targetProjectId,
            projectQuery: input.targetProjectQuery,
          });
          if (projectResolution.status === 'not_found' || projectResolution.status === 'ambiguous') {
            return {
              status: projectResolution.status,
              message: projectResolution.message,
              projectCandidates: projectResolution.projectCandidates,
            };
          }
          targetProject = projectResolution.project;
        }

        const dueInputProvided =
          typeof input.dueAtMs === 'number' ||
          Boolean(input.dueDateISO?.trim()) ||
          Boolean(input.dueTime24?.trim());

        const dueInfo = parseDueInput({
          dueAtMs: input.dueAtMs,
          dueDateISO: input.dueDateISO,
          dueTime24: input.dueTime24,
          dueHasTime: input.dueHasTime,
        });

        const nextSection = input.targetSection ?? taskToMove.section;
        let updatedTask: Task | undefined;

        setTasks((prev) =>
          prev.map((entry) => {
            if (entry.id !== taskToMove?.id) return entry;

            let dueAt = entry.dueAt;
            let dueHasTime = entry.dueHasTime;
            if (dueInputProvided) {
              dueAt = dueInfo.dueAt;
              dueHasTime = dueInfo.dueHasTime;
            }

            if (nextSection === 'today' && !hasValidDueAt(dueAt)) {
              dueAt = getDueAtForSection('today');
              dueHasTime = true;
            }
            if (nextSection === 'completed' && !hasValidDueAt(dueAt)) {
              dueAt = Date.now();
              dueHasTime = true;
            }
            if (nextSection === 'upcoming' && !hasValidDueAt(dueAt)) {
              dueAt = 0;
              dueHasTime = false;
            }

            const patch: Task = {
              ...entry,
              section: nextSection,
              projectId: input.clearProject ? '' : (targetProject?.id ?? entry.projectId),
              dueAt,
              dueHasTime,
              completedAt: nextSection === 'completed' ? Date.now() : undefined,
              orderRank:
                nextSection === entry.section
                  ? entry.orderRank
                  : topOrderRankForSection(prev, nextSection, entry.id),
            };
            updatedTask = patch;
            return patch;
          }),
        );

        if (!updatedTask) {
          return {
            status: 'error',
            message: 'Task konnte nicht aktualisiert werden.',
          };
        }

        return {
          status: 'ok',
          task: buildTaskCandidate(updatedTask, projectsById, 1),
          project: targetProject ? buildProjectCandidate(targetProject, 1) : undefined,
          message: `Task "${updatedTask.title}" wurde aktualisiert.`,
        };
      },
    }),
  };
}
