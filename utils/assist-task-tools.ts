import type { Dispatch, SetStateAction } from 'react';

import type {
  AssistObjectSchema,
  AssistSchemaNode,
  AssistSchemaProperty,
  AssistToolDefinition,
} from '@/modules/assist-llm';

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

const SECTION_VALUES = ['today', 'upcoming', 'completed'] as const;

function prop(
  name: string,
  schema: AssistSchemaNode,
  description: string,
  optional: boolean = true,
): AssistSchemaProperty {
  return { name, schema, description, optional };
}

function objectSchema(properties: AssistSchemaProperty[]): AssistObjectSchema {
  return { type: 'object', properties };
}

const STRING = { type: 'string' } as const;
const BOOLEAN = { type: 'boolean' } as const;
const SECTION = { type: 'string', enum: SECTION_VALUES } as const;
const DUE_DATE = prop('dueDate', STRING, 'Due date in local time as YYYY-MM-DD.');
const DUE_TIME = prop('dueTime', STRING, 'Due time as 24-hour HH:mm. Omit for an all-day task.');

function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

/** Local `YYYY-MM-DD` or `YYYY-MM-DD HH:mm`, the format the model is told to use. */
function formatLocalDue(dueAt: number, dueHasTime?: boolean): string | undefined {
  if (!hasValidDueAt(dueAt)) return undefined;
  const date = new Date(dueAt);
  const day = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  return dueHasTime ? `${day} ${pad2(date.getHours())}:${pad2(date.getMinutes())}` : day;
}

/** The few task fields the model needs; the full candidate stays in JS for the UI. */
function taskForModel(task: AssistTaskCandidate) {
  return {
    id: task.id,
    title: task.title,
    project: task.projectName,
    due: formatLocalDue(task.dueAt, task.dueHasTime),
    done: task.section === 'completed' ? true : undefined,
    routine: task.isRoutine ? task.routineType : undefined,
  };
}

function projectForModel(project: AssistProjectCandidate) {
  return { id: project.id, name: project.name };
}

function withoutCandidates<T extends { status: ToolStatus; message?: string }>(output: T) {
  return { status: output.status, message: output.message };
}

type AssistToolSet = Record<string, AssistToolDefinition>;

export function createAssistTools(params: CreateAssistToolsParams): AssistToolSet {
  const {
    getTasks,
    getProjects,
    setTasks,
    setProjects,
    onToolCall,
    shouldAbortToolCalls,
  } = params;

  const guarded = () => ensureToolBudget({ onToolCall, shouldAbortToolCalls });

  const findTasks: AssistToolDefinition<FindTasksToolInput, FindTasksToolOutput> = {
    name: 'findTasks',
    description: "Search the user's tasks. Returns id, title, project and due date per match.",
    parameters: objectSchema([
      prop('query', STRING, 'Words from the task title, notes or location. Omit to list by filters only.'),
      prop('section', SECTION, 'today, upcoming (later or no date) or completed.'),
      prop('projectQuery', STRING, 'Name of the project the tasks belong to.'),
      prop('includeCompleted', BOOLEAN, 'Also return completed tasks.'),
      prop('isRoutine', BOOLEAN, 'Only repeating tasks (true) or only one-off tasks (false).'),
      prop('limit', { type: 'integer', minimum: 1, maximum: 10 }, 'Maximum number of results, default 8.'),
    ]),
    execute: (input) => {
      guarded();
      const tasks = getTasks();
      const projects = getProjects();
      const query = input.query?.trim();
      const results = findTasksLocally(tasks, projects, {
        ...input,
        includeDeleted: false,
        limit: input.limit ?? 8,
      });
      return {
        status: 'ok',
        query,
        filters: {
          section: input.section,
          projectId: input.projectId,
          projectQuery: input.projectQuery?.trim() || undefined,
          includeCompleted: input.includeCompleted,
          includeDeleted: false,
          isRoutine: input.isRoutine,
        },
        results,
      };
    },
    toModelOutput: (output) => ({
      status: output.status,
      results: output.results.map(taskForModel),
    }),
  };

  const findProjects: AssistToolDefinition<FindProjectsToolInput, FindProjectsToolOutput> = {
    name: 'findProjects',
    description: "Search the user's projects by name. Returns id and name per match.",
    parameters: objectSchema([
      prop('query', STRING, 'Words from the project name. Omit to list all projects.'),
      prop('limit', { type: 'integer', minimum: 1, maximum: 10 }, 'Maximum number of results, default 8.'),
    ]),
    execute: (input) => {
      guarded();
      const projects = getProjects();
      const query = input.query?.trim();
      const results = findProjectsLocally(projects, query ?? '', {
        limit: input.limit ?? 8,
        includeDeleted: false,
      });
      return {
        status: 'ok',
        query,
        includeDeleted: false,
        results,
      };
    },
    toModelOutput: (output) => ({
      status: output.status,
      results: output.results.map(projectForModel),
    }),
  };

  const createProject: AssistToolDefinition<CreateProjectToolInput, CreateProjectToolOutput> = {
    name: 'createProject',
    description: 'Create a new project.',
    parameters: objectSchema([
      prop('name', STRING, 'Project name.', false),
      prop('description', STRING, 'Short description.'),
      prop('emoji', STRING, 'One emoji that fits the project.'),
    ]),
    execute: (input) => {
      guarded();
      const name = input.name.trim();
      if (!name) {
        return { status: 'error', message: 'Project name is missing.' };
      }

      const projects = getProjects();
      const exactMatch = projects.find(
        (entry) => !entry.deletedAt && normalizeSearch(entry.name) === normalizeSearch(name),
      );
      if (exactMatch) {
        return {
          status: 'exists',
          message: `Project "${name}" already exists.`,
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
        message: `Project "${name}" was created.`,
      };
    },
    toModelOutput: (output) => ({
      ...withoutCandidates(output),
      project: output.project ? projectForModel(output.project) : undefined,
    }),
  };

  const createTask: AssistToolDefinition<CreateTaskToolInput, CreateTaskToolOutput> = {
    name: 'createTask',
    description:
      'Create a task. Set a project, due date, notes, subtasks or a repeat rule only when the user asked for them.',
    parameters: objectSchema([
      prop('title', STRING, 'Short task title without date or project.', false),
      prop('projectQuery', STRING, 'Name of an existing project to put the task in.'),
      DUE_DATE,
      DUE_TIME,
      prop('notes', STRING, 'Extra details.'),
      prop('location', STRING, 'Place where the task happens.'),
      prop(
        'subtasks',
        { type: 'array', items: STRING, maxItems: 10 },
        'Checklist items, one short phrase each.',
      ),
      prop('emoji', STRING, 'One emoji that fits the task.'),
      prop(
        'routineType',
        { type: 'string', enum: ROUTINE_TYPES.filter((type) => type !== 'custom') },
        'Repeat rule, only for recurring tasks.',
      ),
      prop(
        'routineWeekday',
        { type: 'integer', minimum: 0, maximum: 6 },
        'Weekday for weekly routines, 0 = Sunday … 6 = Saturday.',
      ),
      prop(
        'routineMonthDay',
        { type: 'integer', minimum: 1, maximum: 31 },
        'Day of the month for monthly routines.',
      ),
    ]),
    execute: (rawInput) => {
      guarded();
      const input: CreateTaskToolInput = {
        ...rawInput,
        dueDateISO: rawInput.dueDateISO ?? (rawInput as { dueDate?: string }).dueDate,
        dueTime24: rawInput.dueTime24 ?? (rawInput as { dueTime?: string }).dueTime,
        subtasks: normalizeSubtaskInput((rawInput as { subtasks?: unknown }).subtasks),
      };
      const title = input.title.trim();
      if (!title) {
        return { status: 'error', message: 'Task title is missing.' };
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
        message: `Task "${title}" was created.`,
      };
    },
    toModelOutput: (output) => ({
      ...withoutCandidates(output),
      task: output.task ? taskForModel(output.task) : undefined,
      projectCandidates: output.projectCandidates?.map(projectForModel),
    }),
  };

  const moveTask: AssistToolDefinition<MoveTaskToolInput, MoveTaskToolOutput> = {
    name: 'moveTask',
    description:
      'Change an existing task: move it to another project or section, or change its due date.',
    parameters: objectSchema([
      prop('taskId', STRING, 'Id from a previous findTasks result. Preferred over taskQuery.'),
      prop('taskQuery', STRING, 'Words from the task title when the id is unknown.'),
      prop('targetProjectQuery', STRING, 'Name of the project to move the task to.'),
      prop('clearProject', BOOLEAN, 'Remove the task from its project.'),
      prop('targetSection', SECTION, 'today, upcoming or completed (marks it done).'),
      DUE_DATE,
      DUE_TIME,
    ]),
    execute: (rawInput) => {
      guarded();
      const input: MoveTaskToolInput = {
        ...rawInput,
        dueDateISO: rawInput.dueDateISO ?? (rawInput as { dueDate?: string }).dueDate,
        dueTime24: rawInput.dueTime24 ?? (rawInput as { dueTime?: string }).dueTime,
      };

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
            message: `No task found for "${input.taskQuery.trim()}".`,
          };
        }
        if (isAmbiguousByScore(matches) || (matches[0]?.score ?? 0) < 0.55) {
          return {
            status: 'ambiguous',
            message: `Several tasks match "${input.taskQuery.trim()}".`,
            taskCandidates: matches.slice(0, 3),
          };
        }
        taskToMove = tasks.find((entry) => entry.id === matches[0]?.id && !entry.deletedAt);
      }

      if (!taskToMove) {
        return {
          status: 'not_found',
          message: 'Task not found.',
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
      const entry = taskToMove;

      // Computed up front: the store applies updaters lazily, so a value set
      // inside one is not reliably there when this tool returns.
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

      const updatedTask: Task = {
        ...entry,
        section: nextSection,
        projectId: input.clearProject ? '' : (targetProject?.id ?? entry.projectId),
        dueAt,
        dueHasTime,
        completedAt: nextSection === 'completed' ? Date.now() : undefined,
        orderRank:
          nextSection === entry.section
            ? entry.orderRank
            : topOrderRankForSection(tasks, nextSection, entry.id),
      };

      setTasks((prev) => prev.map((candidate) => (candidate.id === entry.id ? updatedTask : candidate)));

      return {
        status: 'ok',
        task: buildTaskCandidate(updatedTask, projectsById, 1),
        project: targetProject ? buildProjectCandidate(targetProject, 1) : undefined,
        message: `Task "${updatedTask.title}" was updated.`,
      };
    },
    toModelOutput: (output) => ({
      ...withoutCandidates(output),
      task: output.task ? taskForModel(output.task) : undefined,
      taskCandidates: output.taskCandidates?.map(taskForModel),
      projectCandidates: output.projectCandidates?.map(projectForModel),
    }),
  };

  return { findTasks, findProjects, createTask, moveTask, createProject };
}

/** The schema asks for plain strings; older callers may still pass `{ title, done }`. */
function normalizeSubtaskInput(value: unknown): { title: string; done?: boolean }[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((entry) =>
      typeof entry === 'string'
        ? { title: entry }
        : entry && typeof entry === 'object' && typeof (entry as { title?: unknown }).title === 'string'
          ? (entry as { title: string; done?: boolean })
          : null,
    )
    .filter((entry): entry is { title: string; done?: boolean } => Boolean(entry));
}
