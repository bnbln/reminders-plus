import AsyncStorage from "@react-native-async-storage/async-storage";
import { generateText } from "ai";
import { Redirect, Stack, useFocusEffect, useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useVerticalBarActive } from "@/components/navigation/vertical-bar-safe-area";
import { ThemedView } from "@/components/themed-view";
import { withAlpha } from "@/components/ui/glass-surface";
import { Colors, contrastAlpha } from "@/constants/theme";
import { usePremium } from "@/context/premium-store";
import { getAccentColorValue, useAppSettings } from "@/context/settings-store";
import {
  type Project,
  type SectionId,
  type Task,
  useTasksStore,
} from "@/context/tasks-store";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { apple, createAppleProvider } from "@/utils/apple-llm";
import { IS_ASSIST_SUPPORTED } from "@/utils/assist-availability";
import {
  ASSIST_TOOL_CALL_LIMIT_ERROR,
  type AssistProjectCandidate,
  type AssistTaskCandidate,
  type CreateProjectToolOutput,
  type CreateTaskToolOutput,
  type FindProjectsToolOutput,
  type FindTasksToolOutput,
  type MoveTaskToolOutput,
  createAssistTools,
  findProjectsLocally,
  findTasksLocally,
  inferProjectEmojiFromName,
  inferTaskEmojiFromTitle,
} from "@/utils/assist-task-tools";
import {
  countLabel,
  getIntlLocale,
  getLocale,
  t,
  type AppLocale,
} from "@/i18n";
import { isIOS26OrNewer } from "@/utils/ios-version";
import { deriveActiveSectionFromDueAt } from "@/utils/task-dates";
import { useHighContrast } from "@/context/high-contrast-store";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: AssistAction[];
};

type AssistIntent =
  | "create_task"
  | "find_task"
  | "move_task"
  | "create_project"
  | "find_project"
  | "general"
  | "clarify";

type AssistModelResponse = {
  intent: AssistIntent;
  answer: string;
  openTaskId?: string;
  openProjectId?: string;
  suggestTaskIds?: string[];
  suggestProjectIds?: string[];
};

type AssistCandidate = {
  kind: "task" | "project";
  id: string;
  title: string;
  subtitle?: string;
  score?: number;
};

type AssistTaskDraft = {
  title: string;
  subtitle?: string;
  emoji?: string;
  projectId?: string;
  projectName?: string;
  dueAt: number;
  dueHasTime?: boolean;
  location?: string;
  notes?: string;
  color?: string;
  isRoutine?: boolean;
  routineType?: Task["routineType"];
  routineWeekday?: number;
  routineNthWeek?: number;
  routineMonthDay?: number;
  routineMonth?: number;
};

type AssistProjectDraft = {
  name: string;
  description?: string;
  color?: string;
  emoji?: string;
  icon?: string;
};

type AssistAction = {
  type:
    | "open-task"
    | "open-project"
    | "suggest-task"
    | "suggest-project"
    | "create-task"
    | "create-project"
    | "show-more-tasks";
  candidate: AssistCandidate;
  taskDraft?: AssistTaskDraft;
  projectDraft?: AssistProjectDraft;
  taskIdsToShow?: string[];
};

type ToolResultEntry = {
  toolName?: string;
  output?: unknown;
  result?: unknown;
};

type DirectAssistResolution = {
  content: string;
  actions?: AssistAction[];
};

type CollectedToolCandidates = {
  tasks: AssistTaskCandidate[];
  projects: AssistProjectCandidate[];
  taskToolWasCalled: boolean;
  projectToolWasCalled: boolean;
  taskQuery?: string;
  projectQuery?: string;
  createdTask?: AssistTaskCandidate;
  movedTask?: AssistTaskCandidate;
  createdProject?: AssistProjectCandidate;
};

const ASSIST_STORAGE_KEY = "@reminds/assist_messages";
const MAX_ASSIST_TOOL_CALLS = 10;
const ASSIST_RESPONSE_INTENTS = [
  "create_task",
  "find_task",
  "move_task",
  "create_project",
  "find_project",
  "general",
  "clarify",
] as const;
const ASSIST_RESPONSE_INTENT_LIST = ASSIST_RESPONSE_INTENTS.map(
  (intent) => `"${intent}"`,
).join(" | ");

const ASSIST_LANGUAGE_NAME_BY_LOCALE: Record<AppLocale, string> = {
  de: "German",
  en: "English",
  es: "Spanish",
  fr: "French",
  pt: "Portuguese",
  hi: "Hindi",
  zh: "Chinese",
  ja: "Japanese",
  it: "Italian",
  sv: "Swedish",
  da: "Danish",
  fi: "Finnish",
  pl: "Polish",
  nl: "Dutch",
  tr: "Turkish",
  cs: "Czech",
  hu: "Hungarian",
  ro: "Romanian",
  el: "Greek",
  id: "Indonesian",
  vi: "Vietnamese",
  ko: "Korean",
  uk: "Ukrainian",
  ru: "Russian",
  ar: "Arabic",
};

function supportsRuleBasedAssistantParsing(locale: AppLocale): boolean {
  return locale === "de" || locale === "en";
}

function buildSystemPrompt(locale: AppLocale): string {
  const outputLanguage = ASSIST_LANGUAGE_NAME_BY_LOCALE[locale] ?? "English";
  const intlLocale = getIntlLocale(locale);
  return `You are the task and project assistant for the app "Reminds".
User locale: ${locale} (${intlLocale}).

Return exactly one valid JSON object with this shape:
{
  "intent": "${ASSIST_RESPONSE_INTENTS[0]}" | "${ASSIST_RESPONSE_INTENTS[1]}" | "${ASSIST_RESPONSE_INTENTS[2]}" | "${ASSIST_RESPONSE_INTENTS[3]}" | "${ASSIST_RESPONSE_INTENTS[4]}" | "${ASSIST_RESPONSE_INTENTS[5]}" | "${ASSIST_RESPONSE_INTENTS[6]}",
  "answer": "<one short user-facing sentence in ${outputLanguage}>",
  "openTaskId": "<task id or null>",
  "openProjectId": "<project id or null>",
  "suggestTaskIds": ["<task ids>"],
  "suggestProjectIds": ["<project ids>"]
}

Strict JSON rules:
- Output must start with "{" and end with "}".
- Output must be valid JSON (double quotes, no trailing commas, no comments).
- Output must contain only the JSON object (no markdown, no code fences, no preface, no list).
- If unsure, missing data, or tool result is ambiguous, return intent="clarify" with one short follow-up sentence in ${outputLanguage}.
- If no concrete task/project operation is needed, return intent="general".
- Use tools for all concrete task/project operations.
- Never invent IDs or values. Unknown IDs must be null, unknown suggestions must be [].

Task model fields:
id, title, subtitle, emoji, projectId, dueAt, dueHasTime, completedAt, location, notes, subtasks[{id,title,done}], section, orderRank, color, deletedAt, isRoutine, routineType, routineInterval, routineWeekday, routineNthWeek, routineMonthDay, routineMonth

Project model fields:
id, name, color, emoji, icon, description, completed, deletedAt`;
}

function buildCompactSystemPrompt(locale: AppLocale): string {
  const outputLanguage = ASSIST_LANGUAGE_NAME_BY_LOCALE[locale] ?? "English";
  const intlLocale = getIntlLocale(locale);
  return `You are the task/project assistant for "Reminds". User locale: ${locale} (${intlLocale}).
Return exactly one valid JSON object only.
Keys: intent, answer, openTaskId, openProjectId, suggestTaskIds, suggestProjectIds.
intent must be one of: ${ASSIST_RESPONSE_INTENT_LIST}.
answer must be one short sentence in ${outputLanguage}.
Never invent IDs. Use null for unknown open IDs and [] for unknown suggestion lists.
If data is ambiguous or missing, return intent="clarify".`;
}

function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[ä]/g, "ae")
    .replace(/[ö]/g, "oe")
    .replace(/[ü]/g, "ue")
    .replace(/[ß]/g, "ss");
}

function cleanExtractedText(value: string): string {
  return value
    .trim()
    .replace(/^[*\-•]+\s*/g, "")
    .replace(/^\s*[_*`~]+|[_*`~]+\s*$/g, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/^['"„“`]+|['"”`]+$/g, "")
    .replace(/\s+/g, " ");
}

function normalizeHexColorSafe(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const withPrefix = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(withPrefix)) return undefined;
  return withPrefix.toUpperCase();
}

function extractFirstEmojiSafe(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  return match?.[0];
}

function parseDueFromText(input: string): {
  dueAt: number;
  dueHasTime: boolean;
} {
  const normalized = normalizeSearchText(input);
  const now = new Date();
  const base = new Date(now);
  base.setSeconds(0, 0);

  const timeColonMatch = input.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  const timeUhrMatch = input.match(/\b([01]?\d|2[0-3])\s*uhr\b/i);
  const hours = Number.parseInt(
    (timeColonMatch?.[1] ?? timeUhrMatch?.[1] ?? "11") as string,
    10,
  );
  const minutes = Number.parseInt((timeColonMatch?.[2] ?? "0") as string, 10);
  const hasTime = Boolean(timeColonMatch || timeUhrMatch);

  const isoDateMatch = input.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoDateMatch) {
    const year = Number.parseInt(isoDateMatch[1] as string, 10);
    const month = Number.parseInt(isoDateMatch[2] as string, 10) - 1;
    const day = Number.parseInt(isoDateMatch[3] as string, 10);
    const resolved = new Date(
      year,
      month,
      day,
      hasTime ? hours : 11,
      hasTime ? minutes : 0,
      0,
      0,
    );
    return { dueAt: resolved.getTime(), dueHasTime: hasTime };
  }

  const dotDateMatch = input.match(/\b(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\b/);
  if (dotDateMatch) {
    const day = Number.parseInt(dotDateMatch[1] as string, 10);
    const month = Number.parseInt(dotDateMatch[2] as string, 10) - 1;
    const yearRaw = dotDateMatch[3]
      ? Number.parseInt(dotDateMatch[3], 10)
      : now.getFullYear();
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    const resolved = new Date(
      year,
      month,
      day,
      hasTime ? hours : 11,
      hasTime ? minutes : 0,
      0,
      0,
    );
    return { dueAt: resolved.getTime(), dueHasTime: hasTime };
  }

  const weekdayMap: Record<string, number> = {
    montag: 1,
    dienstag: 2,
    mittwoch: 3,
    donnerstag: 4,
    freitag: 5,
    samstag: 6,
    sonntag: 0,
  };
  for (const [weekdayName, weekdayIndex] of Object.entries(weekdayMap)) {
    if (!new RegExp(`\\b${weekdayName}\\b`, "i").test(normalized)) continue;
    const resolved = new Date(base);
    const current = resolved.getDay();
    let delta = (weekdayIndex - current + 7) % 7;
    if (delta === 0) delta = 7;
    resolved.setDate(resolved.getDate() + delta);
    resolved.setHours(hasTime ? hours : 11, hasTime ? minutes : 0, 0, 0);
    return { dueAt: resolved.getTime(), dueHasTime: hasTime };
  }

  if (/\buebermorgen\b/i.test(normalized)) {
    base.setDate(base.getDate() + 2);
    base.setHours(hasTime ? hours : 11, hasTime ? minutes : 0, 0, 0);
    return { dueAt: base.getTime(), dueHasTime: hasTime };
  }
  if (/\bmorgen\b/i.test(normalized)) {
    base.setDate(base.getDate() + 1);
    base.setHours(hasTime ? hours : 11, hasTime ? minutes : 0, 0, 0);
    return { dueAt: base.getTime(), dueHasTime: hasTime };
  }
  if (/\bheute\b/i.test(normalized)) {
    base.setHours(hasTime ? hours : 11, hasTime ? minutes : 0, 0, 0);
    return { dueAt: base.getTime(), dueHasTime: hasTime };
  }

  if (hasTime) {
    base.setHours(hours, minutes, 0, 0);
    return { dueAt: base.getTime(), dueHasTime: true };
  }

  return { dueAt: 0, dueHasTime: false };
}

function resolveProjectFromDraftName(
  projects: Project[],
  projectName: string | undefined,
): { projectId?: string; projectName?: string } {
  const cleanProjectName = cleanExtractedText(projectName ?? "");
  if (!cleanProjectName) return {};

  const matches = findProjectsLocally(projects, cleanProjectName, {
    includeDeleted: false,
    limit: 3,
  });

  if (matches.length === 0) {
    return { projectName: cleanProjectName };
  }

  const first = matches[0];
  const second = matches[1];
  const ambiguous =
    Boolean(second) && (first?.score ?? 0) - (second?.score ?? 0) <= 0.02;
  if (!first || ambiguous || (first.score ?? 0) < 0.85) {
    return { projectName: cleanProjectName };
  }

  return {
    projectId: first.id,
    projectName: first.name,
  };
}

function extractFieldByAliases(
  text: string,
  aliases: readonly string[],
): string | undefined {
  for (const alias of aliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match =
      text.match(
        new RegExp(`\\*\\*\\s*${escaped}\\s*\\*\\*\\s*:\\s*([^\\n\\r]+)`, "i"),
      ) ?? text.match(new RegExp(`\\b${escaped}\\b\\s*:\\s*([^\\n\\r]+)`, "i"));
    const value = cleanExtractedText(match?.[1] ?? "");
    if (
      !value ||
      /^(null|none|n\/a|na|keine|kein|nicht angegeben|unbekannt)$/i.test(value)
    ) {
      continue;
    }
    return value;
  }
  return undefined;
}

function parseTaskDraftFromCommand(
  input: string,
  projects: Project[],
): AssistTaskDraft | null {
  const normalized = normalizeSearchText(input);
  const hasTaskKeyword = /\btask\b/.test(normalized);
  const hasBlockingTaskIntent =
    /\b(?:oeffne|öffne|finde|suche|zeige|verschiebe|move|aktualisiere)\b/.test(
      normalized,
    );
  const hasTaskCueWord =
    /\b(?:erstelle|erzeuge|lege|anlegen|neu(?:e|er|en|es)?|muss|soll(?:te)?|will|moechte|möchte|plane|planen|notiere|erinnere)\b/.test(
      normalized,
    );
  const hasDateCue =
    /\b(?:heute|morgen|uebermorgen|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/.test(
      normalized,
    );
  const hasTimeCue =
    /\b([01]?\d|2[0-3])(?::[0-5]\d)?\s*uhr\b/.test(normalized) ||
    /\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/.test(normalized);
  const isProjectCreateCommand =
    /\bprojekt\b/.test(normalized) &&
    /\b(?:erstelle|erzeuge|lege|erstellen|anlegen|neu(?:e|er|en|es)?)\b/.test(
      normalized,
    ) &&
    !hasTaskKeyword;
  const isNaturalTaskCommand =
    !hasTaskKeyword &&
    !isProjectCreateCommand &&
    hasTaskCueWord &&
    (hasDateCue || hasTimeCue);
  const isCreateTaskCommand =
    !hasBlockingTaskIntent &&
    ((hasTaskKeyword && (hasTaskCueWord || hasDateCue || hasTimeCue)) ||
      isNaturalTaskCommand);
  if (!isCreateTaskCommand) return null;

  const titleCandidate =
    input.match(/\btask\b[^:\n]*:\s*([^;\n]+)/i)?.[1] ??
    input.match(
      /\btask\s+(.+?)(?=\s+(?:im|in)\s+projekt\b|\s+mit\s+standort\b|\s+mit\s+notiz(?:en)?\b|$)/i,
    )?.[1] ??
    input.match(
      /\b(?:erstelle|erzeuge|lege)\b\s+(.+?)(?=\s+(?:im|in)\s+projekt\b|\s+mit\s+standort\b|\s+mit\s+notiz(?:en)?\b|$)/i,
    )?.[1] ??
    input.match(
      /\b(?:ich\s+)?(?:muss|soll(?:te)?|will|moechte|möchte|plane|planen|notiere|erinnere(?:\s+mich(?:\s+daran)?)?)\b\s+(.+)$/i,
    )?.[1] ??
    input.match(/^\s*(.+)$/)?.[1] ??
    "";

  let title = cleanExtractedText(titleCandidate.replace(/^task\s+/i, ""));
  title = cleanExtractedText(
    title.replace(
      /^(?:ich\s+)?(?:muss|soll(?:te)?|will|moechte|möchte|plane|planen|notiere|erinnere(?:\s+mich(?:\s+daran)?)?)\s+/i,
      "",
    ),
  );
  title = cleanExtractedText(
    title.replace(
      /^(?:fuer|für)?\s*(?:heute|morgen|uebermorgen|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b(?:\s+(?:um\s+)?\d{1,2}(?::\d{2})?\s*uhr)?\s*[:,-]?\s*/i,
      "",
    ),
  );
  title = cleanExtractedText(
    title.replace(/^(?:um\s+)?\d{1,2}(?::\d{2})?\s*uhr\s*[:,-]?\s*/i, ""),
  );
  title = cleanExtractedText(
    title.replace(/\s+\b(?:im|in)\s+projekt\s+.+$/i, ""),
  );
  title = cleanExtractedText(title.replace(/\s+\bmit\s+standort\b\s+.+$/i, ""));
  title = cleanExtractedText(
    title.replace(/\s+\bmit\s+notiz(?:en)?\b\s+.+$/i, ""),
  );
  if (!title) return null;

  const projectNameRaw = cleanExtractedText(
    input.match(
      /\b(?:im|in)\s+projekt\s+(.+?)(?=\s+(?:mit\s+standort\b|mit\s+notiz(?:en)?\b|heute\b|morgen\b|uebermorgen\b|\d{1,2}(?::\d{2})?\s*uhr\b|\d{1,2}[:.]\d{2}\b|$))/i,
    )?.[1] ?? "",
  );
  const projectResolution = resolveProjectFromDraftName(
    projects,
    projectNameRaw,
  );

  let location = cleanExtractedText(
    input.match(
      /\bmit\s+standort\s+(.+?)(?=\s+(?:mit\s+notiz(?:en)?\b|heute\b|morgen\b|uebermorgen\b|$))/i,
    )?.[1] ?? "",
  );
  if (!location) {
    const inlineLocationMatch = title.match(
      /^(.+?)\s+\bin\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß0-9\s-]{1,40})$/,
    );
    if (inlineLocationMatch) {
      title = cleanExtractedText(inlineLocationMatch[1] ?? title);
      location = cleanExtractedText(inlineLocationMatch[2] ?? "");
    }
  }
  const notes = cleanExtractedText(
    input.match(/\bmit\s+notiz(?:en)?\s+(.+?)$/i)?.[1] ?? "",
  );

  const due = parseDueFromText(input);

  return {
    title,
    emoji: inferTaskEmojiFromTitle(title),
    dueAt: due.dueAt,
    dueHasTime: due.dueHasTime,
    projectId: projectResolution.projectId,
    projectName: projectResolution.projectName,
    location: location || undefined,
    notes: notes || undefined,
  };
}

function parseTaskDraftFromAssistantText(
  text: string,
  projects: Project[],
): AssistTaskDraft | null {
  const title = extractFieldByAliases(text, ["title", "titel", "task titel"]);
  if (!title) return null;

  const subtitle = extractFieldByAliases(text, ["subtitle", "untertitel"]);
  const projectFromField = extractFieldByAliases(text, [
    "projektname",
    "projekt",
  ]);
  const projectNameFromSubtitle = subtitle?.match(/\bprojekt\s+(.+)/i)?.[1];
  const projectResolution = resolveProjectFromDraftName(
    projects,
    projectFromField ?? projectNameFromSubtitle,
  );

  const dueDateField = extractFieldByAliases(text, [
    "dueAt",
    "dueDate",
    "datum",
    "date",
    "faelligkeitsdatum",
    "fälligkeitsdatum",
  ]);
  const dueTimeField = extractFieldByAliases(text, [
    "dueTime",
    "zeit",
    "uhrzeit",
    "abgabezeit",
    "faelligkeitszeit",
    "fälligkeitszeit",
  ]);
  const dueCombined = [dueDateField, dueTimeField].filter(Boolean).join(" ");
  const dueParsed = parseDueFromText(
    dueCombined || dueDateField || dueTimeField || "",
  );
  const dueAt = dueParsed.dueAt;
  const dueHasTime = dueParsed.dueHasTime;

  const explicitEmoji = extractFirstEmojiSafe(
    extractFieldByAliases(text, ["emoji", "symbol", "icon"]),
  );
  const inferredEmoji = inferTaskEmojiFromTitle(title);

  return {
    title,
    subtitle,
    emoji: explicitEmoji ?? inferredEmoji,
    projectId: projectResolution.projectId,
    projectName: projectResolution.projectName,
    dueAt,
    dueHasTime,
    location: extractFieldByAliases(text, ["location", "ort"]),
    notes: extractFieldByAliases(text, ["notes", "notizen", "notiz"]),
    color: normalizeHexColorSafe(
      extractFieldByAliases(text, ["color", "farbe"]),
    ),
    isRoutine: /true|1|ja/i.test(
      extractFieldByAliases(text, ["isRoutine", "routine"]) ?? "",
    ),
    routineType:
      (extractFieldByAliases(text, ["routineType"]) as Task["routineType"]) ??
      undefined,
  };
}

function parseProjectDraftFromCommand(
  input: string,
): AssistProjectDraft | null {
  const normalized = normalizeSearchText(input);
  const hasProjectCreateIntent =
    /\bprojekt\b/.test(normalized) &&
    /\b(?:erstelle|erzeuge|lege|erstellen|anlegen|neu(?:e|er|en|es)?)\b/.test(
      normalized,
    );
  if (!hasProjectCreateIntent) return null;

  const nameRaw =
    input.match(
      /^\s*(?:bitte\s+)?(?:erstelle|erzeuge|lege)\s+(?:ein(?:e|en|es)?\s+)?(?:neues?\s+)?projekt\s*[:\-]?\s*(.+)$/i,
    )?.[1] ??
    input.match(
      /^\s*(?:bitte\s+)?projekt\s+(?:erstellen|anlegen)\s*[:\-]?\s*(.+)$/i,
    )?.[1] ??
    input.match(
      /^\s*(?:bitte\s+)?projekt\s+(.+?)\s+(?:erstellen|anlegen)\s*$/i,
    )?.[1] ??
    input.match(/^\s*(?:bitte\s+)?neues?\s+projekt\s*[:\-]?\s*(.+)$/i)?.[1] ??
    input.match(/^\s*(?:bitte\s+)?neuer\s+projekt\s*[:\-]?\s*(.+)$/i)?.[1] ??
    "";

  let name = cleanExtractedText(nameRaw);
  if (!name) return null;

  const description = cleanExtractedText(
    input.match(/\b(?:beschreibung|description)\s*[:\-]?\s*(.+)$/i)?.[1] ?? "",
  );
  name = cleanExtractedText(
    name.replace(
      /\s+\b(?:mit\s+beschreibung|beschreibung|description)\b[\s\S]*$/i,
      "",
    ),
  );
  name = cleanExtractedText(name.replace(/\b(?:erstellen|anlegen)\b$/i, ""));
  name = cleanExtractedText(name.replace(/[;:,.\-]+$/g, ""));
  if (!name) return null;

  const color = normalizeHexColorSafe(input.match(/#[0-9a-fA-F]{6}/)?.[0]);
  const explicitEmoji = extractFirstEmojiSafe(input);

  return {
    name,
    description: description || undefined,
    color,
    emoji:
      (explicitEmoji ?? inferProjectEmojiFromName(`${name} ${description}`)) ||
      "📁",
    icon: "folder.fill",
  };
}

function parseProjectDraftFromAssistantText(
  text: string,
): AssistProjectDraft | null {
  const name = extractFieldByAliases(text, ["name", "projektname"]);
  if (!name) return null;

  const description = extractFieldByAliases(text, [
    "beschreibung",
    "description",
  ]);
  const color = normalizeHexColorSafe(
    extractFieldByAliases(text, ["farbe", "color"]),
  );
  const explicitEmoji = extractFirstEmojiSafe(
    extractFieldByAliases(text, ["emoji", "symbol", "icon"]),
  );

  return {
    name,
    description,
    color,
    emoji:
      (explicitEmoji ??
        inferProjectEmojiFromName(`${name} ${description ?? ""}`)) ||
      "📁",
    icon: "folder.fill",
  };
}

function isLikelyCreateTaskPrompt(input: string): boolean {
  const normalized = normalizeSearchText(input);
  const hasTaskKeyword = /\btask\b/.test(normalized);
  const hasBlockingTaskIntent =
    /\b(?:oeffne|öffne|finde|suche|zeige|verschiebe|move|aktualisiere)\b/.test(
      normalized,
    );
  const hasTaskCueWord =
    /\b(?:erstelle|erzeuge|lege|anlegen|neu(?:e|er|en|es)?|muss|soll(?:te)?|will|moechte|möchte|plane|planen|notiere|erinnere)\b/.test(
      normalized,
    );
  const hasDateCue =
    /\b(?:heute|morgen|uebermorgen|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/.test(
      normalized,
    );
  const hasTimeCue =
    /\b([01]?\d|2[0-3])(?::[0-5]\d)?\s*uhr\b/.test(normalized) ||
    /\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/.test(normalized);
  const isProjectCreateCommand =
    /\bprojekt\b/.test(normalized) &&
    /\b(?:erstelle|erzeuge|lege|erstellen|anlegen|neu(?:e|er|en|es)?)\b/.test(
      normalized,
    ) &&
    !hasTaskKeyword;
  const isNaturalTaskCommand =
    !hasTaskKeyword &&
    !isProjectCreateCommand &&
    hasTaskCueWord &&
    (hasDateCue || hasTimeCue);

  return (
    !hasBlockingTaskIntent &&
    ((hasTaskKeyword && (hasTaskCueWord || hasDateCue || hasTimeCue)) ||
      isNaturalTaskCommand)
  );
}

function isLikelyCreateProjectPrompt(input: string): boolean {
  const normalized = normalizeSearchText(input);
  return (
    /\bprojekt\b/.test(normalized) &&
    /\b(?:erstelle|erzeuge|lege|neu(?:e|er|en|es)?)\b/.test(normalized) &&
    !/\btask\b/.test(normalized)
  );
}

function formatDraftDue(draft: AssistTaskDraft): string | undefined {
  if (!draft.dueAt || draft.dueAt <= 0) return undefined;
  const date = new Date(draft.dueAt);
  const locale = getIntlLocale();
  if (draft.dueHasTime) {
    return date.toLocaleString(locale, {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
  });
}

function taskCandidateFromDraft(draft: AssistTaskDraft): AssistCandidate {
  const subtitleParts = [
    draft.projectName ? `${t("common.project")}: ${draft.projectName}` : undefined,
    formatDraftDue(draft),
    draft.location,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    kind: "task",
    id: `draft-task-${Date.now()}`,
    title: `${draft.emoji ?? "📝"} ${draft.title}`,
    subtitle: subtitleParts || undefined,
  };
}

function projectCandidateFromDraft(draft: AssistProjectDraft): AssistCandidate {
  return {
    kind: "project",
    id: `draft-project-${Date.now()}`,
    title: `${draft.emoji ?? "📁"} ${draft.name}`,
    subtitle: draft.description || undefined,
  };
}

function extractProjectQueryFromInput(input: string): string | undefined {
  const match = input.match(/\b(?:im|in)\s+projekt\s+([^,.;\n]+)(?:[,.!?]|$)/i);
  const value = cleanExtractedText(match?.[1] ?? "");
  return value || undefined;
}

function isKnowledgeTaskQuestion(input: string): boolean {
  const normalized = normalizeSearchText(input);
  if (!/\b(?:aufgabe|aufgaben|task|tasks)\b/.test(normalized)) return false;
  return /\b(?:welche|welcher|welches|was|zeige|liste|list|gib|stehen|sind)\b/.test(
    normalized,
  );
}

function wantsSingleTaskResult(input: string): boolean {
  const normalized = normalizeSearchText(input);
  const asksPlural =
    /\b(?:alle|mehrere|aufgaben|tasks|welche\s+aufgaben|welche\s+tasks)\b/.test(
      normalized,
    );
  const asksSingle =
    /\b(?:ein(?:e|en)?|nur\s+ein(?:e|en)?|genau\s+ein(?:e|en)?|naechst(?:e|en)|nächst(?:e|en))\b/.test(
      normalized,
    ) || /\b(?:welche\s+aufgabe|welcher\s+task)\b/.test(normalized);
  return asksSingle && !asksPlural;
}

function sortTasksByDeadlineRelevance(
  candidates: AssistTaskCandidate[],
  nowMs: number = Date.now(),
): AssistTaskCandidate[] {
  const safeDueAt = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) && value > 0
      ? value
      : null;

  return [...candidates].sort((left, right) => {
    const leftDue = safeDueAt(left.dueAt);
    const rightDue = safeDueAt(right.dueAt);
    const leftFuture = leftDue !== null && leftDue >= nowMs;
    const rightFuture = rightDue !== null && rightDue >= nowMs;
    if (leftFuture !== rightFuture) return leftFuture ? -1 : 1;

    const leftOverdue = leftDue !== null && leftDue < nowMs;
    const rightOverdue = rightDue !== null && rightDue < nowMs;
    if (leftOverdue !== rightOverdue) return leftOverdue ? 1 : -1;

    if (leftDue !== null && rightDue !== null) {
      const distanceDelta =
        Math.abs(leftDue - nowMs) - Math.abs(rightDue - nowMs);
      if (distanceDelta !== 0) return distanceDelta;
    } else if (leftDue !== null) {
      return -1;
    } else if (rightDue !== null) {
      return 1;
    }

    const scoreDelta = (right.score ?? 0) - (left.score ?? 0);
    if (scoreDelta !== 0) return scoreDelta;

    return (left.orderRank ?? 0) - (right.orderRank ?? 0);
  });
}

function isKnowledgeProjectQuestion(input: string): boolean {
  const normalized = normalizeSearchText(input);
  if (!/\b(?:projekt|projekte)\b/.test(normalized)) return false;
  return /\b(?:welche|welcher|welches|was|zeige|liste|list|gib|sind)\b/.test(
    normalized,
  );
}

function resolveDirectKnowledgeRequest({
  input,
  tasks,
  projects,
}: {
  input: string;
  tasks: Task[];
  projects: Project[];
}): DirectAssistResolution | null {
  const normalized = normalizeSearchText(input);

  if (isKnowledgeTaskQuestion(input)) {
    const asksSingleTask = wantsSingleTaskResult(input);
    const wantsNow = normalized.includes("jetzt");
    const section: SectionId | undefined =
      normalized.includes("heute") || wantsNow
        ? "today"
        : normalized.includes("erledigt")
          ? "completed"
          : normalized.includes("morgen") ||
              normalized.includes("ansteh") ||
              normalized.includes("upcoming")
            ? "upcoming"
            : undefined;
    const projectQuery = extractProjectQueryFromInput(input);
    const includeCompleted =
      section === "completed" ||
      /(?:\berledigt\b|\bcompleted\b)/.test(normalized);

    let matches = findTasksLocally(tasks, projects, {
      section,
      includeCompleted,
      includeDeleted: false,
      projectQuery,
      limit: 20,
    });
    if (matches.length === 0 && wantsNow && section === "today") {
      matches = findTasksLocally(tasks, projects, {
        includeCompleted,
        includeDeleted: false,
        projectQuery,
        limit: 20,
      });
    }

    if (matches.length === 0) {
      if (section === "today") {
        return { content: t("assist.direct.todayNone") };
      }
      return { content: t("assist.direct.noTaskMatches") };
    }

    if (asksSingleTask) {
      const ranked = sortTasksByDeadlineRelevance(matches);
      const primary = ranked[0];
      if (!primary) {
        return { content: t("assist.direct.noSingleTask") };
      }

      const remainingTaskIds = ranked
        .slice(1)
        .map((entry) => entry.id)
        .filter(Boolean);
      const actions: AssistAction[] = [
        {
          type: "open-task",
          candidate: taskCandidateFromToolCandidate(primary),
        },
      ];
      if (remainingTaskIds.length > 0) {
        actions.push({
          type: "show-more-tasks",
          candidate: {
            kind: "task",
            id: `show-more-tasks:${Date.now()}`,
            title: t("assist.direct.moreTasksTitle"),
            subtitle: t("assist.direct.moreTasksSubtitle", {
              count: remainingTaskIds.length,
            }),
          },
          taskIdsToShow: remainingTaskIds,
        });
      }
      const hasPrimaryDueAt =
        typeof primary.dueAt === "number" &&
        Number.isFinite(primary.dueAt) &&
        primary.dueAt > 0;

      return {
        content: hasPrimaryDueAt
          ? t("assist.direct.selectedWithDeadline")
          : t("assist.direct.selected"),
        actions,
      };
    }

    const actions: AssistAction[] = matches.map((match) => ({
      type: "suggest-task",
      candidate: taskCandidateFromToolCandidate(match),
    }));

    const content =
      section === "today"
        ? countLabel(
            matches.length,
            "assist.direct.todayCount.one",
            "assist.direct.todayCount.other",
          )
        : countLabel(
            matches.length,
            "assist.direct.taskMatches.one",
            "assist.direct.taskMatches.other",
          );

    return {
      content,
      actions,
    };
  }

  if (isKnowledgeProjectQuestion(input)) {
    const matches = findProjectsLocally(projects, "", {
      includeDeleted: false,
      limit: 20,
    });
    if (matches.length === 0) {
      return { content: t("assist.direct.noProjects") };
    }
    const actions: AssistAction[] = matches.map((match) => ({
      type: "suggest-project",
      candidate: projectCandidateFromToolCandidate(match),
    }));
    return {
      content: countLabel(
        matches.length,
        "assist.direct.projectMatches.one",
        "assist.direct.projectMatches.other",
      ),
      actions,
    };
  }

  return null;
}

function isAssistIntent(value: string): value is AssistIntent {
  return ASSIST_RESPONSE_INTENTS.includes(value as AssistIntent);
}

function extractJsonObjectCandidate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    const fenced = fencedMatch[1].trim();
    if (fenced.startsWith("{") && fenced.endsWith("}")) return fenced;
  }

  const firstBrace = trimmed.indexOf("{");
  if (firstBrace < 0) return null;

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = firstBrace; index < trimmed.length; index += 1) {
    const char = trimmed[index] as string;

    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }
      if (char === "\\") {
        escaping = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return trimmed.slice(firstBrace, index + 1);
      }
    }
  }

  return null;
}

function parseAssistModelResponse(value: unknown): AssistModelResponse | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      return parseAssistModelResponse(JSON.parse(trimmed));
    } catch {
      const candidate = extractJsonObjectCandidate(trimmed);
      if (!candidate || candidate === trimmed) return null;
      try {
        return parseAssistModelResponse(JSON.parse(candidate));
      } catch {
        return null;
      }
    }
  }

  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.intent !== "string" || !isAssistIntent(raw.intent))
    return null;

  const toStringList = (candidate: unknown): string[] | undefined => {
    if (!Array.isArray(candidate)) return undefined;
    const values = candidate
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
    return values.length > 0 ? values.slice(0, 5) : undefined;
  };

  return {
    intent: raw.intent,
    answer: typeof raw.answer === "string" ? raw.answer.trim() : "",
    openTaskId:
      typeof raw.openTaskId === "string" && raw.openTaskId.trim()
        ? raw.openTaskId.trim()
        : undefined,
    openProjectId:
      typeof raw.openProjectId === "string" && raw.openProjectId.trim()
        ? raw.openProjectId.trim()
        : undefined,
    suggestTaskIds: toStringList(raw.suggestTaskIds),
    suggestProjectIds: toStringList(raw.suggestProjectIds),
  };
}

function parseToolResultPayload(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (raw && typeof raw === "object") {
    const value = raw as Record<string, unknown>;
    if (value.type === "json" && value.value != null) return value.value;
    if (value.type === "text" && typeof value.value === "string") {
      try {
        return JSON.parse(value.value);
      } catch {
        return null;
      }
    }
  }
  return raw;
}

function parseFindTasksToolResult(raw: unknown): FindTasksToolOutput | null {
  const parsed = parseToolResultPayload(raw);
  if (!parsed || typeof parsed !== "object") return null;
  const value = parsed as Partial<FindTasksToolOutput>;
  if (!Array.isArray(value.results)) return null;
  return {
    status: value.status ?? "ok",
    query: typeof value.query === "string" ? value.query : undefined,
    filters: value.filters,
    results: value.results.filter((entry): entry is AssistTaskCandidate =>
      Boolean(
        entry &&
        typeof entry.id === "string" &&
        typeof entry.title === "string" &&
        typeof entry.section === "string",
      ),
    ),
    message: typeof value.message === "string" ? value.message : undefined,
  };
}

function parseFindProjectsToolResult(
  raw: unknown,
): FindProjectsToolOutput | null {
  const parsed = parseToolResultPayload(raw);
  if (!parsed || typeof parsed !== "object") return null;
  const value = parsed as Partial<FindProjectsToolOutput>;
  if (!Array.isArray(value.results)) return null;
  return {
    status: value.status ?? "ok",
    query: typeof value.query === "string" ? value.query : undefined,
    includeDeleted: value.includeDeleted,
    results: value.results.filter((entry): entry is AssistProjectCandidate =>
      Boolean(
        entry && typeof entry.id === "string" && typeof entry.name === "string",
      ),
    ),
    message: typeof value.message === "string" ? value.message : undefined,
  };
}

function parseCreateTaskToolResult(raw: unknown): CreateTaskToolOutput | null {
  const parsed = parseToolResultPayload(raw);
  if (!parsed || typeof parsed !== "object") return null;
  const value = parsed as Partial<CreateTaskToolOutput>;
  return {
    status: value.status ?? "error",
    task:
      value.task &&
      typeof value.task.id === "string" &&
      typeof value.task.title === "string"
        ? value.task
        : undefined,
    project:
      value.project &&
      typeof value.project.id === "string" &&
      typeof value.project.name === "string"
        ? value.project
        : undefined,
    message: typeof value.message === "string" ? value.message : undefined,
    projectCandidates: Array.isArray(value.projectCandidates)
      ? value.projectCandidates.filter(
          (entry): entry is AssistProjectCandidate =>
            Boolean(
              entry &&
              typeof entry.id === "string" &&
              typeof entry.name === "string",
            ),
        )
      : undefined,
  };
}

function parseCreateProjectToolResult(
  raw: unknown,
): CreateProjectToolOutput | null {
  const parsed = parseToolResultPayload(raw);
  if (!parsed || typeof parsed !== "object") return null;
  const value = parsed as Partial<CreateProjectToolOutput>;
  return {
    status: value.status ?? "error",
    project:
      value.project &&
      typeof value.project.id === "string" &&
      typeof value.project.name === "string"
        ? value.project
        : undefined,
    message: typeof value.message === "string" ? value.message : undefined,
    similarProjects: Array.isArray(value.similarProjects)
      ? value.similarProjects.filter((entry): entry is AssistProjectCandidate =>
          Boolean(
            entry &&
            typeof entry.id === "string" &&
            typeof entry.name === "string",
          ),
        )
      : undefined,
  };
}

function parseMoveTaskToolResult(raw: unknown): MoveTaskToolOutput | null {
  const parsed = parseToolResultPayload(raw);
  if (!parsed || typeof parsed !== "object") return null;
  const value = parsed as Partial<MoveTaskToolOutput>;
  return {
    status: value.status ?? "error",
    task:
      value.task &&
      typeof value.task.id === "string" &&
      typeof value.task.title === "string"
        ? value.task
        : undefined,
    project:
      value.project &&
      typeof value.project.id === "string" &&
      typeof value.project.name === "string"
        ? value.project
        : undefined,
    message: typeof value.message === "string" ? value.message : undefined,
    taskCandidates: Array.isArray(value.taskCandidates)
      ? value.taskCandidates.filter((entry): entry is AssistTaskCandidate =>
          Boolean(
            entry &&
            typeof entry.id === "string" &&
            typeof entry.title === "string",
          ),
        )
      : undefined,
    projectCandidates: Array.isArray(value.projectCandidates)
      ? value.projectCandidates.filter(
          (entry): entry is AssistProjectCandidate =>
            Boolean(
              entry &&
              typeof entry.id === "string" &&
              typeof entry.name === "string",
            ),
        )
      : undefined,
  };
}

function extractToolResultEntries(result: any): ToolResultEntry[] {
  const entries: ToolResultEntry[] = [];

  const pushFrom = (collection: unknown) => {
    if (!Array.isArray(collection)) return;
    for (const entry of collection) {
      if (!entry || typeof entry !== "object") continue;
      const value = entry as Record<string, unknown>;
      entries.push({
        toolName:
          typeof value.toolName === "string" ? value.toolName : undefined,
        output: value.output,
        result: value.result,
      });
    }
  };

  pushFrom(result?.toolResults);
  if (Array.isArray(result?.steps)) {
    for (const step of result.steps) {
      if (!step || typeof step !== "object") continue;
      pushFrom((step as Record<string, unknown>).toolResults);
    }
  }

  return entries;
}

function collectToolCandidates(
  entries: ToolResultEntry[],
): CollectedToolCandidates {
  const tasks: AssistTaskCandidate[] = [];
  const projects: AssistProjectCandidate[] = [];
  let taskToolWasCalled = false;
  let projectToolWasCalled = false;
  let taskQuery: string | undefined;
  let projectQuery: string | undefined;
  let createdTask: AssistTaskCandidate | undefined;
  let movedTask: AssistTaskCandidate | undefined;
  let createdProject: AssistProjectCandidate | undefined;

  for (const entry of entries) {
    const payload = entry.output ?? entry.result;

    if (entry.toolName === "findTasks") {
      taskToolWasCalled = true;
      const parsed = parseFindTasksToolResult(payload);
      if (!parsed) continue;
      if (parsed.query) taskQuery = parsed.query;
      tasks.push(...parsed.results);
      continue;
    }

    if (entry.toolName === "findProjects") {
      projectToolWasCalled = true;
      const parsed = parseFindProjectsToolResult(payload);
      if (!parsed) continue;
      if (parsed.query) projectQuery = parsed.query;
      projects.push(...parsed.results);
      continue;
    }

    if (entry.toolName === "createTask") {
      taskToolWasCalled = true;
      const parsed = parseCreateTaskToolResult(payload);
      if (!parsed) continue;
      if (parsed.task) {
        createdTask = parsed.task;
        tasks.push(parsed.task);
      }
      if (parsed.project) projects.push(parsed.project);
      if (parsed.projectCandidates) projects.push(...parsed.projectCandidates);
      continue;
    }

    if (entry.toolName === "moveTask") {
      taskToolWasCalled = true;
      const parsed = parseMoveTaskToolResult(payload);
      if (!parsed) continue;
      if (parsed.task) {
        movedTask = parsed.task;
        tasks.push(parsed.task);
      }
      if (parsed.taskCandidates) tasks.push(...parsed.taskCandidates);
      if (parsed.project) projects.push(parsed.project);
      if (parsed.projectCandidates) projects.push(...parsed.projectCandidates);
      continue;
    }

    if (entry.toolName === "createProject") {
      projectToolWasCalled = true;
      const parsed = parseCreateProjectToolResult(payload);
      if (!parsed) continue;
      if (parsed.project) {
        createdProject = parsed.project;
        projects.push(parsed.project);
      }
      if (parsed.similarProjects) projects.push(...parsed.similarProjects);
    }
  }

  const dedupeTasks = new Map<string, AssistTaskCandidate>();
  for (const task of tasks) {
    const prev = dedupeTasks.get(task.id);
    if (!prev || (task.score ?? 0) > (prev.score ?? 0)) {
      dedupeTasks.set(task.id, task);
    }
  }

  const dedupeProjects = new Map<string, AssistProjectCandidate>();
  for (const project of projects) {
    const prev = dedupeProjects.get(project.id);
    if (!prev || (project.score ?? 0) > (prev.score ?? 0)) {
      dedupeProjects.set(project.id, project);
    }
  }

  return {
    tasks: Array.from(dedupeTasks.values()).sort(
      (left, right) => (right.score ?? 0) - (left.score ?? 0),
    ),
    projects: Array.from(dedupeProjects.values()).sort(
      (left, right) => (right.score ?? 0) - (left.score ?? 0),
    ),
    taskToolWasCalled,
    projectToolWasCalled,
    taskQuery,
    projectQuery,
    createdTask,
    movedTask,
    createdProject,
  };
}

function isAmbiguousByScore<T extends { score?: number }>(
  values: T[],
): boolean {
  if (values.length <= 1) return false;
  const first = values[0]?.score ?? 0;
  const second = values[1]?.score ?? 0;
  return first - second <= 0.02;
}

function formatTaskSubtitle(
  task: Task | AssistTaskCandidate,
  projectName?: string,
): string {
  const sectionLabel = (() => {
    if (task.section === "today") return t("common.today");
    if (task.section === "upcoming") return t("common.upcoming");
    if (task.section === "completed") return t("common.completed");
    return task.section;
  })();
  const routineLabel = (() => {
    switch (task.routineType) {
      case "hourly":
        return t("taskDetail.routine.hourly");
      case "daily":
        return t("taskDetail.routine.daily");
      case "weekdays":
        return t("taskDetail.routine.weekdays");
      case "weekends":
        return t("taskDetail.routine.weekends");
      case "weekly":
        return t("taskDetail.routine.weekly");
      case "biweekly":
        return t("taskDetail.routine.biweekly");
      case "monthly":
        return t("taskDetail.routine.monthly");
      case "quarterly":
        return t("taskDetail.routine.quarterly");
      case "biannually":
        return t("taskDetail.routine.biannually");
      case "yearly":
        return t("taskDetail.routine.yearly");
      case "custom":
        return t("taskDetail.routine.custom");
      default:
        return t("taskDetail.routine.default");
    }
  })();
  const parts: string[] = [];

  if (projectName) parts.push(projectName);

  const dueAt = task.dueAt;
  if (typeof dueAt === "number" && dueAt > 0) {
    const date = new Date(dueAt);
    const hasTime = Boolean(task.dueHasTime);
    const locale = getIntlLocale();
    parts.push(
      hasTime
        ? date.toLocaleString(locale, {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })
        : date.toLocaleDateString(locale, {
            day: "2-digit",
            month: "2-digit",
          }),
    );
  }

  parts.push(sectionLabel);
  if (task.location) parts.push(task.location);
  if (task.isRoutine) parts.push(routineLabel);

  return parts.join(" · ");
}

function taskCandidateFromTask(
  task: Task,
  projectsById: Map<string, Project>,
): AssistCandidate {
  const projectName = task.projectId
    ? projectsById.get(task.projectId)?.name
    : undefined;
  const title = `${task.emoji ?? "📝"} ${task.title}`;
  return {
    kind: "task",
    id: task.id,
    title,
    subtitle: formatTaskSubtitle(task, projectName),
  };
}

function taskCandidateFromToolCandidate(
  candidate: AssistTaskCandidate,
): AssistCandidate {
  const title = `${candidate.emoji ?? "📝"} ${candidate.title}`;
  return {
    kind: "task",
    id: candidate.id,
    title,
    subtitle: formatTaskSubtitle(candidate, candidate.projectName),
    score: candidate.score,
  };
}

function projectCandidateFromProject(project: Project): AssistCandidate {
  const title = `${project.emoji ?? "📁"} ${project.name}`;
  return {
    kind: "project",
    id: project.id,
    title,
    subtitle: project.description || undefined,
  };
}

function projectCandidateFromToolCandidate(
  candidate: AssistProjectCandidate,
): AssistCandidate {
  const title = `${candidate.emoji ?? "📁"} ${candidate.name}`;
  return {
    kind: "project",
    id: candidate.id,
    title,
    subtitle: candidate.description || undefined,
    score: candidate.score,
  };
}

function uniqActions(actions: AssistAction[]): AssistAction[] {
  const seen = new Set<string>();
  const unique: AssistAction[] = [];
  for (const action of actions) {
    const key = `${action.type}:${action.candidate.kind}:${action.candidate.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(action);
  }
  return unique;
}

function isLikelyStructuredJsonText(text: string): boolean {
  return Boolean(parseAssistModelResponse(text));
}

function isLikelyMarkdownFieldDump(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return (
    /\*\*[^*]+:\*\*/.test(trimmed) ||
    /^\s*[-*]\s+\*\*/m.test(trimmed) ||
    (/^\s*[-*]\s+/m.test(trimmed) && /:\s/.test(trimmed))
  );
}

function buildDefaultAssistantMessage({
  intent,
  answer,
  actions,
  toolCandidates,
}: {
  intent: AssistIntent;
  answer: string;
  actions: AssistAction[];
  toolCandidates: CollectedToolCandidates;
}): string {
  const cleanAnswer = answer.trim();

  const hasOpenTask = actions.some((entry) => entry.type === "open-task");
  const hasOpenProject = actions.some((entry) => entry.type === "open-project");
  const hasSuggestTask = actions.some((entry) => entry.type === "suggest-task");
  const hasSuggestProject = actions.some(
    (entry) => entry.type === "suggest-project",
  );
  const hasCreateTask = actions.some((entry) => entry.type === "create-task");
  const hasCreateProject = actions.some(
    (entry) => entry.type === "create-project",
  );
  const taskSuggestionCount = actions.filter(
    (entry) => entry.type === "suggest-task",
  ).length;
  const projectSuggestionCount = actions.filter(
    (entry) => entry.type === "suggest-project",
  ).length;

  if (toolCandidates.createdTask) {
    return t("assist.default.createdTask");
  }
  if (toolCandidates.movedTask) {
    return t("assist.default.updatedTask");
  }
  if (toolCandidates.createdProject) {
    return t("assist.default.createdProject");
  }
  if (hasCreateTask) {
    return t("assist.default.preparedTaskDraft");
  }
  if (hasCreateProject) {
    return t("assist.default.preparedProjectDraft");
  }

  if (hasOpenTask && hasOpenProject) {
    return t("assist.default.foundTaskAndProject");
  }
  if (hasOpenTask) {
    return t("assist.default.foundTask");
  }
  if (hasOpenProject) {
    return t("assist.default.foundProject");
  }
  if (hasSuggestTask && hasSuggestProject) {
    return t("assist.default.foundTaskAndProjectSuggestions", {
      taskCount: taskSuggestionCount,
      projectCount: projectSuggestionCount,
    });
  }
  if (hasSuggestTask) {
    return countLabel(
      taskSuggestionCount,
      "assist.default.foundTaskSuggestions.one",
      "assist.default.foundTaskSuggestions.other",
    );
  }
  if (hasSuggestProject) {
    return countLabel(
      projectSuggestionCount,
      "assist.default.foundProjectSuggestions.one",
      "assist.default.foundProjectSuggestions.other",
    );
  }

  if (toolCandidates.taskToolWasCalled && toolCandidates.tasks.length === 0) {
    return toolCandidates.taskQuery
      ? t("assist.default.noTaskForQuery", { query: toolCandidates.taskQuery })
      : t("assist.default.noTask");
  }

  if (
    toolCandidates.projectToolWasCalled &&
    toolCandidates.projects.length === 0
  ) {
    return toolCandidates.projectQuery
      ? t("assist.default.noProjectForQuery", {
          query: toolCandidates.projectQuery,
        })
      : t("assist.default.noProject");
  }

  if (intent === "clarify") {
    return t("assist.default.clarify");
  }

  if (
    cleanAnswer &&
    !isLikelyStructuredJsonText(cleanAnswer) &&
    !isLikelyMarkdownFieldDump(cleanAnswer)
  ) {
    return cleanAnswer;
  }

  return t("assist.default.help");
}

function resolveTaskCandidateById({
  taskId,
  tasks,
  projectsById,
  toolCandidates,
}: {
  taskId: string;
  tasks: Task[];
  projectsById: Map<string, Project>;
  toolCandidates: CollectedToolCandidates;
}): AssistCandidate | null {
  const taskFromStore = tasks.find(
    (entry) => entry.id === taskId && !entry.deletedAt,
  );
  if (taskFromStore) {
    return taskCandidateFromTask(taskFromStore, projectsById);
  }

  const fromTool = toolCandidates.tasks.find((entry) => entry.id === taskId);
  if (fromTool) {
    return taskCandidateFromToolCandidate(fromTool);
  }

  return null;
}

function resolveProjectCandidateById({
  projectId,
  projects,
  toolCandidates,
}: {
  projectId: string;
  projects: Project[];
  toolCandidates: CollectedToolCandidates;
}): AssistCandidate | null {
  const projectFromStore = projects.find(
    (entry) => entry.id === projectId && !entry.deletedAt,
  );
  if (projectFromStore) {
    return projectCandidateFromProject(projectFromStore);
  }

  const fromTool = toolCandidates.projects.find(
    (entry) => entry.id === projectId,
  );
  if (fromTool) {
    return projectCandidateFromToolCandidate(fromTool);
  }

  return null;
}

function buildActionsFromResponse({
  response,
  toolCandidates,
  tasks,
  projects,
}: {
  response: AssistModelResponse;
  toolCandidates: CollectedToolCandidates;
  tasks: Task[];
  projects: Project[];
}): AssistAction[] {
  const actions: AssistAction[] = [];
  const projectsById = new Map(
    projects.map((project) => [project.id, project] as const),
  );
  const wantsTaskCollection = response.intent === "find_task";
  const wantsProjectCollection = response.intent === "find_project";
  const maxTaskSuggestions = wantsTaskCollection ? 20 : 3;
  const maxProjectSuggestions = wantsProjectCollection ? 20 : 3;

  if (response.openTaskId) {
    const candidate = resolveTaskCandidateById({
      taskId: response.openTaskId,
      tasks,
      projectsById,
      toolCandidates,
    });
    if (candidate) {
      actions.push({ type: "open-task", candidate });
    }
  }

  if (response.openProjectId) {
    const candidate = resolveProjectCandidateById({
      projectId: response.openProjectId,
      projects,
      toolCandidates,
    });
    if (candidate) {
      actions.push({ type: "open-project", candidate });
    }
  }

  const hasTaskAction = () =>
    actions.some(
      (entry) => entry.type === "open-task" || entry.type === "suggest-task",
    );
  const hasProjectAction = () =>
    actions.some(
      (entry) =>
        entry.type === "open-project" || entry.type === "suggest-project",
    );

  if (
    !hasTaskAction() &&
    (response.intent === "create_task" || response.intent === "move_task")
  ) {
    const direct = toolCandidates.createdTask ?? toolCandidates.movedTask;
    if (direct) {
      actions.push({
        type: "open-task",
        candidate: taskCandidateFromToolCandidate(direct),
      });
    }
  }

  if (
    !hasProjectAction() &&
    response.intent === "create_project" &&
    toolCandidates.createdProject
  ) {
    actions.push({
      type: "open-project",
      candidate: projectCandidateFromToolCandidate(
        toolCandidates.createdProject,
      ),
    });
  }

  if (!hasTaskAction()) {
    if (
      Array.isArray(response.suggestTaskIds) &&
      response.suggestTaskIds.length > 0
    ) {
      for (const taskId of response.suggestTaskIds.slice(
        0,
        maxTaskSuggestions,
      )) {
        const candidate = resolveTaskCandidateById({
          taskId,
          tasks,
          projectsById,
          toolCandidates,
        });
        if (candidate) {
          actions.push({ type: "suggest-task", candidate });
        }
      }
    } else if (
      !wantsTaskCollection &&
      toolCandidates.tasks.length === 1 &&
      !isAmbiguousByScore(toolCandidates.tasks)
    ) {
      actions.push({
        type: "open-task",
        candidate: taskCandidateFromToolCandidate(
          toolCandidates.tasks[0] as AssistTaskCandidate,
        ),
      });
    } else if (toolCandidates.tasks.length > 1) {
      for (const candidate of toolCandidates.tasks.slice(
        0,
        maxTaskSuggestions,
      )) {
        actions.push({
          type: "suggest-task",
          candidate: taskCandidateFromToolCandidate(candidate),
        });
      }
    } else if (wantsTaskCollection && toolCandidates.tasks.length === 1) {
      actions.push({
        type: "suggest-task",
        candidate: taskCandidateFromToolCandidate(
          toolCandidates.tasks[0] as AssistTaskCandidate,
        ),
      });
    }
  }

  if (!hasProjectAction()) {
    if (
      Array.isArray(response.suggestProjectIds) &&
      response.suggestProjectIds.length > 0
    ) {
      for (const projectId of response.suggestProjectIds.slice(
        0,
        maxProjectSuggestions,
      )) {
        const candidate = resolveProjectCandidateById({
          projectId,
          projects,
          toolCandidates,
        });
        if (candidate) {
          actions.push({ type: "suggest-project", candidate });
        }
      }
    } else if (
      !wantsProjectCollection &&
      toolCandidates.projects.length === 1 &&
      !isAmbiguousByScore(toolCandidates.projects)
    ) {
      actions.push({
        type: "open-project",
        candidate: projectCandidateFromToolCandidate(
          toolCandidates.projects[0] as AssistProjectCandidate,
        ),
      });
    } else if (toolCandidates.projects.length > 1) {
      for (const candidate of toolCandidates.projects.slice(
        0,
        maxProjectSuggestions,
      )) {
        actions.push({
          type: "suggest-project",
          candidate: projectCandidateFromToolCandidate(candidate),
        });
      }
    } else if (wantsProjectCollection && toolCandidates.projects.length === 1) {
      actions.push({
        type: "suggest-project",
        candidate: projectCandidateFromToolCandidate(
          toolCandidates.projects[0] as AssistProjectCandidate,
        ),
      });
    }
  }

  const maxActions = wantsTaskCollection || wantsProjectCollection ? 20 : 6;
  return uniqActions(actions).slice(0, maxActions);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return "";
}

function isToolCallLimitError(error: unknown): boolean {
  return getErrorMessage(error).includes(ASSIST_TOOL_CALL_LIMIT_ERROR);
}

function isAppleGenerationError(error: unknown): boolean {
  const normalized = getErrorMessage(error).replace(/\s+/g, "");
  if (!normalized) return false;
  return (
    /FoundationModels\.LanguageModelSession\.GenerationError/i.test(
      normalized,
    ) || /GenerationError/i.test(normalized)
  );
}

function toMutedTintColor(color: string): string {
  const normalized = color.trim();
  const longHex = normalized.match(/^#([0-9a-f]{6})$/i);
  if (longHex) {
    const hex = longHex[1];
    const red = Number.parseInt(hex.slice(0, 2), 16);
    const green = Number.parseInt(hex.slice(2, 4), 16);
    const blue = Number.parseInt(hex.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, 0.84)`;
  }
  const shortHex = normalized.match(/^#([0-9a-f]{3})$/i);
  if (shortHex) {
    const hex = shortHex[1];
    const red = Number.parseInt(`${hex[0]}${hex[0]}`, 16);
    const green = Number.parseInt(`${hex[1]}${hex[1]}`, 16);
    const blue = Number.parseInt(`${hex[2]}${hex[2]}`, 16);
    return `rgba(${red}, ${green}, ${blue}, 0.84)`;
  }
  return color;
}

function getReadableTextColor(hexColor: string): string {
  const normalized = hexColor.trim();
  const longHex = normalized.match(/^#([0-9a-f]{6})$/i);
  if (!longHex) return "#FFFFFF";

  const hex = longHex[1];
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;

  return luminance >= 0.72 ? "#11181C" : "#FFFFFF";
}

function TypingAnimation({
  bubbleColor,
  textColor,
}: {
  bubbleColor: string;
  textColor: string;
}) {
  const [dotCount, setDotCount] = React.useState(1);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setDotCount((prev) => (prev % 3) + 1);
    }, 450);
    return () => clearInterval(interval);
  }, []);

  return (
    <View
      style={[
        styles.messageBubble,
        styles.assistantBubble,
        { backgroundColor: bubbleColor },
      ]}
    >
      <Text style={[styles.typingText, { color: textColor }]}>
        {".".repeat(dotCount)}
        {" ".repeat(3 - dotCount)}
      </Text>
    </View>
  );
}

function AssistEntityActionButton({
  messageId,
  action,
  tintColor,
  tintTextColor,
  colorScheme,
  onCreateTaskDraft,
  onCreateProjectDraft,
  onShowMoreTasks,
}: {
  messageId: string;
  action: AssistAction;
  tintColor: string;
  tintTextColor: string;
  colorScheme: "light" | "dark";
  onCreateTaskDraft: (messageId: string, action: AssistAction) => void;
  onCreateProjectDraft: (messageId: string, action: AssistAction) => void;
  onShowMoreTasks: (messageId: string, action: AssistAction) => void;
}) {
  const router = useRouter();
  const isDark = colorScheme === "dark";
  const cardBackground = isDark ? "rgba(255,255,255,0.08)" : "#edf2f6";
  const primaryTextColor = isDark ? "#f2f2f7" : "#1c1c1e";
  const secondaryTextColor = isDark ? "#d1d1d6" : "#3a3a3c";
  const buttonColor = toMutedTintColor(tintColor);

  const verb =
    action.type === "create-task"
      ? t("assist.action.createTask")
      : action.type === "create-project"
        ? t("assist.action.createProject")
        : action.type === "show-more-tasks"
          ? t("assist.action.showMore")
          : action.type === "open-task"
            ? t("assist.action.openTask")
            : action.type === "open-project"
              ? t("assist.action.openProject")
              : action.type === "suggest-task"
                ? t("assist.action.showTask")
                : t("assist.action.showProject");

  const handlePress = () => {
    if (action.type === "create-task" && action.taskDraft) {
      onCreateTaskDraft(messageId, action);
      return;
    }
    if (action.type === "create-project" && action.projectDraft) {
      onCreateProjectDraft(messageId, action);
      return;
    }
    if (action.type === "show-more-tasks") {
      onShowMoreTasks(messageId, action);
      return;
    }
    if (action.candidate.kind === "task") {
      router.push({
        pathname: "/task/[id]",
        params: { id: action.candidate.id },
      });
      return;
    }
    router.push({
      pathname: "/project/[id]",
      params: { id: action.candidate.id },
    });
  };

  return (
    <View style={styles.entityActionContainer}>
      <View
        style={[styles.entityActionCard, { backgroundColor: cardBackground }]}
      >
        <Text style={[styles.entityActionTitle, { color: primaryTextColor }]}>
          {action.candidate.title}
        </Text>
        {action.candidate.subtitle ? (
          <Text
            style={[styles.entityActionSubtitle, { color: secondaryTextColor }]}
          >
            {action.candidate.subtitle}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.openEntityButton,
          { backgroundColor: buttonColor },
          pressed && { opacity: 0.8 },
        ]}
      >
        <Text style={[styles.openEntityButtonText, { color: tintTextColor }]}>
          {verb}
        </Text>
        <Text style={[styles.openEntityButtonIcon, { color: tintTextColor }]}>
          →
        </Text>
      </Pressable>
    </View>
  );
}

function AssistUnlockedScreen() {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [isAIAvailable, setIsAIAvailable] = React.useState(true);
  // Cancels the running generation when the user leaves Assist, so no answer
  // or tool call lands after they are gone.
  const generationAbortRef = React.useRef<AbortController | null>(null);
  useFocusEffect(
    React.useCallback(
      () => () => {
        generationAbortRef.current?.abort();
        generationAbortRef.current = null;
      },
      [],
    ),
  );
  const [isKeyboardVisible, setIsKeyboardVisible] = React.useState(false);

  const scrollViewRef = React.useRef<ScrollView>(null);
  const router = useRouter();
  const rawColorScheme = useColorScheme();
  const resolvedColorScheme: "light" | "dark" =
    rawColorScheme === "dark" ? "dark" : "light";
  const colors = Colors[resolvedColorScheme];
  const hasVerticalBar = useVerticalBarActive();
  const { accentColor } = useAppSettings();
  const highContrast = useHighContrast();
  const accentColorValue = React.useMemo(
    () => getAccentColorValue(accentColor),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- highContrast isn't read directly; getAccentColorValue returns the accessible variant while it is on.
    [accentColor, highContrast],
  );

  const { tasks, projects, setTasks, setProjects } = useTasksStore();
  const tasksRef = React.useRef<Task[]>(tasks);
  const projectsRef = React.useRef<Project[]>(projects);
  const createdActionTargetsRef = React.useRef<Map<string, string>>(new Map());
  const pendingRestoreScrollRef = React.useRef(false);

  React.useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  React.useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  React.useEffect(() => {
    const loadMessages = async () => {
      try {
        const stored = await AsyncStorage.getItem(ASSIST_STORAGE_KEY);
        if (!stored) return;
        const parsedMessages = JSON.parse(stored) as Message[];
        if (Array.isArray(parsedMessages)) {
          pendingRestoreScrollRef.current = parsedMessages.length > 0;
          setMessages(parsedMessages);
        }
      } catch {
        // Ignore parse/storage errors for chat history.
      }
    };
    void loadMessages();
  }, []);

  React.useEffect(() => {
    if (messages.length === 0) return;
    void AsyncStorage.setItem(ASSIST_STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  React.useEffect(() => {
    const available = Platform.OS === "ios" && apple.isAvailable();
    setIsAIAvailable(available);
  }, []);

  React.useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSubscription = Keyboard.addListener(showEvent, () => {
      setIsKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const inputContainerPaddingBottom =
    Platform.OS === "ios" ? (isKeyboardVisible ? 12 : 36) : 24;

  const scrollToBottom = React.useCallback((animated: boolean = true) => {
    const runScroll = () => {
      scrollViewRef.current?.scrollToEnd({ animated });
    };

    if (!animated) {
      runScroll();
      return;
    }

    setTimeout(runScroll, 100);
  }, []);

  React.useEffect(() => {
    if (!pendingRestoreScrollRef.current || messages.length === 0) return;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleCallbackId: number | null = null;
    const completePendingRestore = () => {
      scrollToBottom(false);
      pendingRestoreScrollRef.current = false;
    };

    if (typeof globalThis.requestIdleCallback === "function") {
      idleCallbackId = globalThis.requestIdleCallback(() => {
        completePendingRestore();
      });
    } else {
      timeoutId = setTimeout(() => {
        completePendingRestore();
      }, 0);
    }

    return () => {
      if (
        idleCallbackId !== null &&
        typeof globalThis.cancelIdleCallback === "function"
      ) {
        globalThis.cancelIdleCallback(idleCallbackId);
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [messages.length, scrollToBottom]);

  const handleContentSizeChange = React.useCallback(() => {
    if (pendingRestoreScrollRef.current) return;
    scrollToBottom();
  }, [scrollToBottom]);

  const handleClearHistory = React.useCallback(() => {
    Alert.alert(
      t("assist.clearHistory.title"),
      t("assist.clearHistory.body"),
      [
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            await AsyncStorage.removeItem(ASSIST_STORAGE_KEY);
            pendingRestoreScrollRef.current = false;
            setMessages([]);
          },
        },
        { text: t("common.cancel"), style: "cancel" },
      ],
    );
  }, []);

  const handleCreateTaskDraft = React.useCallback(
    (messageId: string, action: AssistAction) => {
      if (action.type !== "create-task" || !action.taskDraft) return;
      const draft = action.taskDraft;
      const lockKey = `task:${messageId}:${action.candidate.id}`;
      const existingTaskId = createdActionTargetsRef.current.get(lockKey);
      if (existingTaskId) {
        router.push({ pathname: "/task/[id]", params: { id: existingTaskId } });
        return;
      }

      const dueAt =
        typeof draft.dueAt === "number" && Number.isFinite(draft.dueAt)
          ? draft.dueAt
          : 0;
      const section: SectionId =
        dueAt > 0 ? deriveActiveSectionFromDueAt(dueAt) : "upcoming";
      const nextTaskId = `t-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const openCandidate: AssistCandidate = {
        kind: "task",
        id: nextTaskId,
        title: `${draft.emoji ?? "📝"} ${draft.title}`,
        subtitle: taskCandidateFromDraft(draft).subtitle,
      };

      setTasks((prev) => {
        const minRank = prev
          .filter((entry) => !entry.deletedAt && entry.section === section)
          .reduce<
            number | null
          >((acc, entry) => (acc === null ? entry.orderRank : Math.min(acc, entry.orderRank)), null);
        const orderRank = (minRank ?? 1000) - 1000;

        const next: Task = {
          id: nextTaskId,
          title: draft.title,
          subtitle: draft.subtitle,
          emoji: draft.emoji ?? "📝",
          projectId: draft.projectId ?? "",
          dueAt,
          dueHasTime: draft.dueHasTime ?? false,
          completedAt: undefined,
          location: draft.location,
          notes: draft.notes,
          subtasks: undefined,
          section,
          orderRank,
          color: normalizeHexColorSafe(draft.color),
          deletedAt: undefined,
          isRoutine: draft.isRoutine || undefined,
          routineType: draft.routineType,
          routineWeekday: draft.routineWeekday,
          routineNthWeek: draft.routineNthWeek,
          routineMonthDay: draft.routineMonthDay,
          routineMonth: draft.routineMonth,
        };
        return [next, ...prev];
      });
      createdActionTargetsRef.current.set(lockKey, nextTaskId);
      setMessages((prev) =>
        prev.map((message) => {
          if (message.id !== messageId) return message;
          const nextActions = (message.actions ?? []).map((entry) => {
            if (
              entry.type === "create-task" &&
              entry.candidate.id === action.candidate.id
            ) {
              return {
                type: "open-task" as const,
                candidate: openCandidate,
              };
            }
            return entry;
          });
          return {
            ...message,
            actions: nextActions,
          };
        }),
      );
      router.push({ pathname: "/task/[id]", params: { id: nextTaskId } });
    },
    [router, setTasks],
  );

  const handleCreateProjectDraft = React.useCallback(
    (messageId: string, action: AssistAction) => {
      if (action.type !== "create-project" || !action.projectDraft) return;
      const draft = action.projectDraft;
      const lockKey = `project:${messageId}:${action.candidate.id}`;
      const existingProjectId = createdActionTargetsRef.current.get(lockKey);
      if (existingProjectId) {
        router.push({
          pathname: "/project/[id]",
          params: { id: existingProjectId },
        });
        return;
      }

      const name = cleanExtractedText(draft.name);
      if (!name) return;

      const nextProjectId = `p-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const color = normalizeHexColorSafe(draft.color) ?? "#2563EB";
      const emoji =
        extractFirstEmojiSafe(draft.emoji) ??
        inferProjectEmojiFromName(`${name} ${draft.description ?? ""}`) ??
        "📁";
      const icon = cleanExtractedText(draft.icon ?? "") || "folder.fill";

      const nextProject: Project = {
        id: nextProjectId,
        name,
        color,
        emoji: emoji || "📁",
        icon,
        description: cleanExtractedText(draft.description ?? "") || undefined,
        completed: false,
        deletedAt: undefined,
      };

      setProjects((prev) => [nextProject, ...prev]);
      createdActionTargetsRef.current.set(lockKey, nextProjectId);
      setMessages((prev) =>
        prev.map((message) => {
          if (message.id !== messageId) return message;
          const nextActions = (message.actions ?? []).map((entry) => {
            if (
              entry.type === "create-project" &&
              entry.candidate.id === action.candidate.id
            ) {
              return {
                type: "open-project" as const,
                candidate: projectCandidateFromProject(nextProject),
              };
            }
            return entry;
          });
          return {
            ...message,
            actions: nextActions,
          };
        }),
      );
      router.push({ pathname: "/project/[id]", params: { id: nextProjectId } });
    },
    [router, setProjects],
  );

  const handleShowMoreTasks = React.useCallback(
    (messageId: string, action: AssistAction) => {
      if (action.type !== "show-more-tasks") return;

      const taskIds = Array.isArray(action.taskIdsToShow)
        ? action.taskIdsToShow.filter(
            (value): value is string =>
              typeof value === "string" && value.trim().length > 0,
          )
        : [];
      if (taskIds.length === 0) return;

      const projectsById = new Map(
        projectsRef.current.map((project) => [project.id, project] as const),
      );
      const taskById = new Map(
        tasksRef.current
          .filter((task) => !task.deletedAt)
          .map((task) => [task.id, task] as const),
      );

      const nextActions: AssistAction[] = taskIds
        .map((taskId) => taskById.get(taskId))
        .filter((task): task is Task => Boolean(task))
        .map((task) => ({
          type: "suggest-task",
          candidate: taskCandidateFromTask(task, projectsById),
        }));

      setMessages((prev) => {
        const withoutShowMore = prev.map((message) => {
          if (message.id !== messageId) return message;
          const remainingActions = (message.actions ?? []).filter(
            (entry) =>
              !(
                entry.type === "show-more-tasks" &&
                entry.candidate.id === action.candidate.id
              ),
          );
          return {
            ...message,
            actions: remainingActions.length > 0 ? remainingActions : undefined,
          };
        });

        if (nextActions.length === 0) {
          return [
            ...withoutShowMore,
            {
              id: `${Date.now() + 1}`,
              role: "assistant",
              content: t("assist.showMore.none"),
            },
          ];
        }

        return [
          ...withoutShowMore,
          {
            id: `${Date.now() + 1}`,
            role: "assistant",
            content: countLabel(
              nextActions.length,
              "assist.showMore.more.one",
              "assist.showMore.more.other",
            ),
            actions: nextActions,
          },
        ];
      });
      scrollToBottom();
    },
    [scrollToBottom],
  );

  const handleSend = React.useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    scrollToBottom();

    generationAbortRef.current?.abort();
    const abortController = new AbortController();
    generationAbortRef.current = abortController;
    const abortSignal = abortController.signal;

    let toolCallsCount = 0;

    try {
      const assistantMessageId = `${Date.now() + 1}`;
      const currentLocale = getLocale();
      const canUseRuleBasedFallback =
        supportsRuleBasedAssistantParsing(currentLocale);

      if (!isAIAvailable) {
        setMessages((prev) => [
          ...prev,
          {
            id: assistantMessageId,
            role: "assistant",
            content: t("assist.error.foundationUnavailableDevice"),
          },
        ]);
        return;
      }

      const directKnowledge = resolveDirectKnowledgeRequest({
        input: userMessage.content,
        tasks: tasksRef.current,
        projects: projectsRef.current,
      });
      if (directKnowledge) {
        setMessages((prev) => [
          ...prev,
          {
            id: assistantMessageId,
            role: "assistant",
            content: directKnowledge.content,
            actions: directKnowledge.actions,
          },
        ]);
        return;
      }

      const quickProjectDraft = canUseRuleBasedFallback
        ? parseProjectDraftFromCommand(userMessage.content)
        : null;
      if (quickProjectDraft) {
        setMessages((prev) => [
          ...prev,
          {
            id: assistantMessageId,
            role: "assistant",
            content: t("assist.default.preparedProjectDraft"),
            actions: [
              {
                type: "create-project",
                candidate: projectCandidateFromDraft(quickProjectDraft),
                projectDraft: quickProjectDraft,
              },
            ],
          },
        ]);
        return;
      }

      const quickTaskDraft = canUseRuleBasedFallback
        ? parseTaskDraftFromCommand(userMessage.content, projectsRef.current)
        : null;
      if (quickTaskDraft) {
        const projectWarning =
          quickTaskDraft.projectName && !quickTaskDraft.projectId
            ? t("assist.warning.projectNotMatched", {
                name: quickTaskDraft.projectName,
              })
            : "";

        setMessages((prev) => [
          ...prev,
          {
            id: assistantMessageId,
            role: "assistant",
            content: [
              t("assist.default.preparedTaskDraftPrefix"),
              projectWarning,
              t("assist.default.preparedTaskDraftSuffix"),
            ]
              .filter(Boolean)
              .join(" "),
            actions: [
              {
                type: "create-task",
                candidate: taskCandidateFromDraft(quickTaskDraft),
                taskDraft: quickTaskDraft,
              },
            ],
          },
        ]);
        return;
      }

      const toolset = createAssistTools({
        getTasks: () => tasksRef.current,
        getProjects: () => projectsRef.current,
        setTasks,
        setProjects,
        onToolCall: () => {
          toolCallsCount += 1;
        },
        shouldAbortToolCalls: () =>
          abortSignal.aborted || toolCallsCount >= MAX_ASSIST_TOOL_CALLS,
      });

      const provider = createAppleProvider({ availableTools: toolset });
      const runGeneration = async ({
        systemPrompt,
        withTools,
        maxOutputTokens,
      }: {
        systemPrompt: string;
        withTools: boolean;
        maxOutputTokens: number;
      }) => {
        if (abortSignal.aborted) throw new Error("Assist generation aborted");
        return generateText({
          model: provider(),
          abortSignal,
          system: systemPrompt,
          prompt: userMessage.content,
          tools: withTools ? toolset : undefined,
          maxOutputTokens,
          temperature: 0.2,
        });
      };

      let result: Awaited<ReturnType<typeof runGeneration>>;

      try {
        result = await runGeneration({
          systemPrompt: buildSystemPrompt(currentLocale),
          withTools: true,
          maxOutputTokens: 420,
        });
      } catch (primaryError) {
        if (!isAppleGenerationError(primaryError)) {
          throw primaryError;
        }
        console.warn(
          "[assist] primary generation failed, retrying with compact tool prompt",
          primaryError,
        );

        try {
          result = await runGeneration({
            systemPrompt: buildCompactSystemPrompt(currentLocale),
            withTools: true,
            maxOutputTokens: 320,
          });
        } catch (secondaryError) {
          if (!isAppleGenerationError(secondaryError)) {
            throw secondaryError;
          }
          console.warn(
            "[assist] compact tool retry failed, retrying text-only",
            secondaryError,
          );

          result = await runGeneration({
            systemPrompt: buildCompactSystemPrompt(currentLocale),
            withTools: false,
            maxOutputTokens: 220,
          });
        }
      }

      if (abortSignal.aborted) return;
      const structuredResponse = parseAssistModelResponse(result.text);

      const toolEntries = extractToolResultEntries(result);
      const toolCandidates = collectToolCandidates(toolEntries);

      if (
        canUseRuleBasedFallback &&
        !structuredResponse &&
        !toolCandidates.createdTask &&
        !toolCandidates.movedTask &&
        !toolCandidates.createdProject
      ) {
        const userAskedTaskCreate = isLikelyCreateTaskPrompt(
          userMessage.content,
        );
        const userAskedProjectCreate = isLikelyCreateProjectPrompt(
          userMessage.content,
        );

        const emitTaskDraft = (draftFromAssistant: AssistTaskDraft) => {
          const projectWarning =
            draftFromAssistant.projectName && !draftFromAssistant.projectId
              ? t("assist.warning.projectNotMatched", {
                  name: draftFromAssistant.projectName,
                })
              : "";

          setMessages((prev) => [
            ...prev,
            {
              id: assistantMessageId,
              role: "assistant",
              content: [
                t("assist.default.preparedTaskDraftPrefix"),
                projectWarning,
                t("assist.default.preparedTaskDraftSuffix"),
              ]
                .filter(Boolean)
                .join(" "),
              actions: [
                {
                  type: "create-task",
                  candidate: taskCandidateFromDraft(draftFromAssistant),
                  taskDraft: draftFromAssistant,
                },
              ],
            },
          ]);
        };

        const emitProjectDraft = (
          projectDraftFromAssistant: AssistProjectDraft,
        ) => {
          setMessages((prev) => [
            ...prev,
            {
              id: assistantMessageId,
              role: "assistant",
              content: t("assist.default.preparedProjectDraft"),
              actions: [
                {
                  type: "create-project",
                  candidate: projectCandidateFromDraft(
                    projectDraftFromAssistant,
                  ),
                  projectDraft: projectDraftFromAssistant,
                },
              ],
            },
          ]);
        };

        if (userAskedTaskCreate) {
          const taskDraft = parseTaskDraftFromAssistantText(
            result.text ?? "",
            projectsRef.current,
          );
          if (taskDraft) {
            emitTaskDraft(taskDraft);
            return;
          }
        } else if (userAskedProjectCreate) {
          const projectDraft = parseProjectDraftFromAssistantText(
            result.text ?? "",
          );
          if (projectDraft) {
            emitProjectDraft(projectDraft);
            return;
          }
        } else {
          const taskDraft = parseTaskDraftFromAssistantText(
            result.text ?? "",
            projectsRef.current,
          );
          if (taskDraft) {
            emitTaskDraft(taskDraft);
            return;
          }
          const projectDraft = parseProjectDraftFromAssistantText(
            result.text ?? "",
          );
          if (projectDraft) {
            emitProjectDraft(projectDraft);
            return;
          }
        }
      }

      const fallbackResponse: AssistModelResponse = {
        intent: "general",
        answer: result.text?.trim() ?? "",
      };
      const safeResponse = structuredResponse ?? fallbackResponse;

      const liveTasks = tasksRef.current;
      const liveProjects = projectsRef.current;
      const actions = buildActionsFromResponse({
        response: safeResponse,
        toolCandidates,
        tasks: liveTasks,
        projects: liveProjects,
      });

      const assistantContent = buildDefaultAssistantMessage({
        intent: safeResponse.intent,
        answer: safeResponse.answer,
        actions,
        toolCandidates,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: assistantMessageId,
          role: "assistant",
          content: assistantContent,
          actions: actions.length > 0 ? actions : undefined,
        },
      ]);
    } catch (error) {
      if (abortSignal.aborted) return;
      const errorMessage = getErrorMessage(error);
      console.error("[assist] handleSend failed:", error);
      const content = isToolCallLimitError(error)
        ? t("assist.error.toolCallLimit")
        : isAppleGenerationError(error)
          ? t("assist.error.appleGeneration")
          : errorMessage &&
              /not available|availability|foundation models/i.test(errorMessage)
            ? t("assist.error.foundationUnavailable")
            : __DEV__ && errorMessage
              ? t("assist.error.requestWithMessage", { message: errorMessage })
              : t("assist.error.request");

      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now() + 1}`,
          role: "assistant",
          content,
        },
      ]);
    } finally {
      if (generationAbortRef.current === abortController) {
        generationAbortRef.current = null;
      }
      setIsLoading(false);
      scrollToBottom();
    }
  }, [input, isAIAvailable, isLoading, scrollToBottom, setProjects, setTasks]);

  const isDarkMode = resolvedColorScheme === "dark";
  const userBubbleBg = accentColorValue;
  const userBubbleTextColor = getReadableTextColor(userBubbleBg);
  const assistantBubbleBg = withAlpha(userBubbleBg, isDarkMode ? 0.24 : 0.16);
  const assistantTextColor = colors.text;
  const inputBgColor = isDarkMode
    ? "rgba(255,255,255,0.08)"
    : "rgba(0,0,0,0.04)";
  const inputBorderColor = isDarkMode
    ? "rgba(255,255,255,0.14)"
    : "rgba(0,0,0,0.12)";
  const inputTopBorderColor = isDarkMode
    ? "rgba(255,255,255,0.14)"
    : "rgba(0,0,0,0.08)";

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: t("screen.assist"),
          headerLargeTitle: false,
          headerBackButtonDisplayMode: "minimal",
          headerTitleAlign: Platform.OS === "ios" ? "left" : "center",
          headerTransparent: Platform.OS === "ios",
          headerTintColor: colors.text,
          headerRight: hasVerticalBar
            ? undefined
            : () => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("assist.clearHistory.title")}
                  onPress={handleClearHistory}
                  style={({ pressed }) => [
                    styles.headerClearButton,
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <Text
                    style={[
                      styles.headerClearButtonText,
                      { color: colors.text },
                    ]}
                  >
                    {t("assist.clearHistory.action")}
                  </Text>
                </Pressable>
              ),
          // Text-only and custom header views stay out of the vertical bar,
          // so that layout gets a native item with title and symbol.
          unstable_headerRightItems: hasVerticalBar
            ? () => [
                {
                  type: "button",
                  label: t("assist.clearHistory.title"),
                  icon: { type: "sfSymbol", name: "trash" },
                  onPress: handleClearHistory,
                },
              ]
            : undefined,
        }}
      />

      {!isAIAvailable ? (
        <View style={styles.centeredMessage}>
          <Text style={[styles.errorTitle, { color: colors.text }]}>
            {t("assist.unavailable.title")}
          </Text>
          <Text style={[styles.errorMessage, { color: colors.text }]}>
            {t("assist.unavailable.body")}
          </Text>
          {!isIOS26OrNewer() ? (
            <Text style={[styles.errorHint, { color: colors.icon }]}>
              {t("assist.unavailable.hint")}
            </Text>
          ) : null}
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
        >
          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesContainer}
            contentContainerStyle={styles.messagesContent}
            contentInsetAdjustmentBehavior="automatic"
            automaticallyAdjustsScrollIndicatorInsets
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={handleContentSizeChange}
          >
            {messages.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  {t("assist.empty.title")}
                </Text>
                <Text style={[styles.emptySubtitle, { color: colors.icon }]}>
                  {t("assist.empty.subtitle")}
                </Text>
              </View>
            )}

            {messages.map((message) => (
              <View
                key={message.id}
                style={[
                  styles.messageContainer,
                  message.role === "user"
                    ? styles.userMessageContainer
                    : styles.assistantMessageContainer,
                ]}
              >
                <View
                  style={[
                    styles.messageBubble,
                    message.role === "user"
                      ? [styles.userBubble, { backgroundColor: userBubbleBg }]
                      : [
                          styles.assistantBubble,
                          { backgroundColor: assistantBubbleBg },
                        ],
                  ]}
                >
                  <Text
                    selectable
                    style={[
                      styles.messageText,
                      message.role === "user"
                        ? [
                            styles.userMessageText,
                            { color: userBubbleTextColor },
                          ]
                        : [
                            styles.assistantMessageText,
                            { color: assistantTextColor },
                          ],
                    ]}
                  >
                    {message.content}
                  </Text>
                </View>

                {message.actions && message.actions.length > 0 ? (
                  <View style={styles.actionButtonContainer}>
                    {message.actions.map((action) => (
                      <AssistEntityActionButton
                        key={`${action.type}-${action.candidate.id}`}
                        messageId={message.id}
                        action={action}
                        colorScheme={resolvedColorScheme}
                        tintColor={userBubbleBg}
                        tintTextColor={userBubbleTextColor}
                        onCreateTaskDraft={handleCreateTaskDraft}
                        onCreateProjectDraft={handleCreateProjectDraft}
                        onShowMoreTasks={handleShowMoreTasks}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            ))}

            {isLoading && (
              <View style={styles.assistantMessageContainer}>
                <TypingAnimation
                  bubbleColor={assistantBubbleBg}
                  textColor={assistantTextColor}
                />
              </View>
            )}
          </ScrollView>

          <View
            style={[
              styles.inputContainer,
              {
                backgroundColor: colors.background,
                borderTopColor: inputTopBorderColor,
                paddingBottom: inputContainerPaddingBottom,
              },
            ]}
          >
            <View
              style={[
                styles.inputWrapper,
                {
                  backgroundColor: inputBgColor,
                  borderColor: inputBorderColor,
                },
              ]}
            >
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={input}
                onChangeText={setInput}
                placeholder={t("assist.input.placeholder")}
                placeholderTextColor={
                  resolvedColorScheme === "dark"
                    ? "rgba(255,255,255,0.4)"
                    : "rgba(0,0,0,0.4)"
                }
                multiline
                maxLength={700}
                editable={!isLoading}
                // A multiline field only fires onSubmitEditing on iOS when
                // Return submits instead of adding a line break.
                submitBehavior="submit"
                returnKeyType="send"
                onSubmitEditing={handleSend}
              />
              <Pressable
                onPress={handleSend}
                disabled={!input.trim() || isLoading}
                style={({ pressed }) => [
                  styles.sendButton,
                  { backgroundColor: userBubbleBg },
                  (!input.trim() || isLoading) && styles.sendButtonDisabled,
                  pressed && styles.sendButtonPressed,
                ]}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color={userBubbleTextColor} />
                ) : (
                  <Text
                    style={[
                      styles.sendButtonText,
                      { color: userBubbleTextColor },
                    ]}
                  >
                    ↑
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}
    </ThemedView>
  );
}

function AssistScreenContent() {
  const router = useRouter();
  const rawColorScheme = useColorScheme();
  const resolvedColorScheme: "light" | "dark" =
    rawColorScheme === "dark" ? "dark" : "light";
  const colors = Colors[resolvedColorScheme];
  const isDark = resolvedColorScheme === "dark";
  const { hasPremiumAccess, isReady } = usePremium();

  if (!isReady) {
    return (
      <ThemedView
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 24,
          gap: 14,
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.text} />
        <Text
          style={{
            fontSize: 15,
            lineHeight: 21,
            textAlign: "center",
            color: withAlpha(colors.text, contrastAlpha(0.72)),
          }}
        >
          {t("projectLimit.loading")}
        </Text>
      </ThemedView>
    );
  }

  if (!hasPremiumAccess) {
    return (
      <ThemedView
        style={{
          flex: 1,
          justifyContent: "center",
          paddingHorizontal: 18,
          backgroundColor: colors.background,
        }}
      >
        <View
          style={{
            borderRadius: 28,
            paddingHorizontal: 20,
            paddingVertical: 22,
            gap: 14,
            backgroundColor: isDark ? "#18212B" : "#FFF5E6",
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: isDark
              ? "rgba(255,255,255,0.08)"
              : "rgba(17,24,28,0.08)",
          }}
        >
          <Text
            style={{
              fontSize: 30,
              lineHeight: 34,
              fontWeight: "800",
              letterSpacing: -0.8,
              color: colors.text,
            }}
          >
            {t("plus.source.assist")}
          </Text>
          <Text
            style={{
              fontSize: 15,
              lineHeight: 22,
              color: withAlpha(colors.text, contrastAlpha(0.74)),
            }}
          >
            {t("assist.locked.body")}
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.replace({
                pathname: "/plus",
                params: { source: "assist" },
              })
            }
            style={({ pressed }) => [
              {
                minHeight: 48,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#FF8A00",
              },
              pressed && { opacity: 0.86 },
            ]}
          >
            <Text
              style={{
                color: "#FFFFFF",
                fontSize: 15,
                fontWeight: "700",
              }}
            >
              {t("projectLimit.action.openPlus")}
            </Text>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  return <AssistUnlockedScreen />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingTop: 100,
    paddingBottom: 100,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 60,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 10,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  messageContainer: {
    marginBottom: 12,
    maxWidth: "84%",
  },
  userMessageContainer: {
    alignSelf: "flex-end",
  },
  assistantMessageContainer: {
    alignSelf: "flex-start",
  },
  messageBubble: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  userBubble: {
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userMessageText: {
    color: "#ffffff",
  },
  assistantMessageText: {
    color: "#ffffff",
  },
  typingText: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: 4,
  },
  inputContainer: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  inputWrapper: {
    alignItems: "flex-end",
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 20,
    maxHeight: 120,
    paddingVertical: 8,
  },
  sendButton: {
    alignItems: "center",
    borderRadius: 20,
    height: 36,
    justifyContent: "center",
    marginLeft: 6,
    width: 36,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonPressed: {
    opacity: 0.7,
  },
  sendButtonText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "700",
  },
  centeredMessage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  errorTitle: {
    marginBottom: 12,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "700",
  },
  errorMessage: {
    fontSize: 16,
    lineHeight: 24,
    opacity: 0.75,
    textAlign: "center",
  },
  errorHint: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  actionButtonContainer: {
    marginTop: 4,
  },
  openEntityButton: {
    alignItems: "center",
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 14,
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  openEntityButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  openEntityButtonIcon: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
    marginLeft: 8,
  },
  entityActionContainer: {
    gap: 0,
    marginTop: 4,
  },
  entityActionCard: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    padding: 14,
    gap: 4,
  },
  entityActionTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  entityActionSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  headerClearButton: {
    justifyContent: "center",
    alignItems: "center",
    height: 36,
    paddingHorizontal: 8,
  },
  headerClearButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },
});

/**
 * Assist runs on Apple Foundation Models and has no Android backend, so the
 * screen is never mounted there. Guarding at the component boundary (rather than
 * inside `AssistScreenContent`) keeps the hook order stable.
 */
export default function AssistScreen() {
  if (!IS_ASSIST_SUPPORTED) {
    return <Redirect href="/home" />;
  }

  return <AssistScreenContent />;
}
