import type { Project, RoutineType } from "@/context/tasks-store";
import { getStartOfLocalDayMs } from "@/utils/task-dates";

type SuggestionActionId =
  | "date"
  | "time"
  | "location"
  | "project"
  | "routine";

type MatchRange = {
  start: number;
  end: number;
};

export type DetectedTaskTextSuggestion =
  | {
      actionId: "date";
      key: string;
      dayStartMs: number;
      range: MatchRange;
    }
  | {
      actionId: "time";
      key: string;
      hours: number;
      minutes: number;
      range: MatchRange;
    }
  | {
      actionId: "location";
      key: string;
      location: string;
      range: MatchRange;
    }
  | {
      actionId: "project";
      key: string;
      projectId: string;
      projectName: string;
      projectColor: string;
      range: MatchRange;
    }
  | {
      actionId: "routine";
      key: string;
      routineType: RoutineType;
      range: MatchRange;
    };

const WEEKDAY_INDEX_BY_TOKEN: Record<string, number> = {
  montag: 1,
  dienstag: 2,
  mittwoch: 3,
  donnerstag: 4,
  freitag: 5,
  samstag: 6,
  sonntag: 0,
};

const BLOCKED_LOCATION_TOKENS = new Set([
  "heute",
  "morgen",
  "uebermorgen",
  "übermorgen",
  "montag",
  "dienstag",
  "mittwoch",
  "donnerstag",
  "freitag",
  "samstag",
  "sonntag",
  "projekt",
  "task",
  "routine",
  "notiz",
  "notizen",
  "uhr",
]);

const ROUTINE_PATTERNS: Array<{
  routineType: RoutineType;
  pattern: RegExp;
}> = [
  { routineType: "weekdays", pattern: /\b(?:jeden?\s+werktag|an\s+werktagen|wochentags)\b/iu },
  { routineType: "weekends", pattern: /\b(?:jedes?\s+wochenende|an\s+wochenenden)\b/iu },
  { routineType: "biweekly", pattern: /\b(?:alle\s+2\s+wochen|jede\s+zweite\s+woche|zweiw(?:ö|oe)chentlich)\b/iu },
  { routineType: "weekly", pattern: /\b(?:jede\s+woche|w(?:ö|oe)chentlich)\b/iu },
  { routineType: "monthly", pattern: /\b(?:jeden?\s+monat|monatlich)\b/iu },
  { routineType: "quarterly", pattern: /\b(?:jedes?\s+quartal|viertelj(?:ä|ae)hrlich)\b/iu },
  { routineType: "biannually", pattern: /\b(?:alle\s+6\s+monate|halbj(?:ä|ae)hrlich)\b/iu },
  { routineType: "yearly", pattern: /\b(?:jedes?\s+jahr|j(?:ä|ae)hrlich)\b/iu },
  { routineType: "daily", pattern: /\b(?:jeden?\s+tag|t(?:ä|ae)glich)\b/iu },
  { routineType: "hourly", pattern: /\b(?:jede\s+stunde|st(?:ü|ue)ndlich)\b/iu },
];

// Keep inline location detection conservative; explicit cues win over fuzzy guesses.
const LOCATION_STOP_PATTERN = String.raw`(?=\s+(?:heute|morgen|uebermorgen|übermorgen|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|\d{1,2}\.\d{1,2}\.(?:\d{2,4})?|\d{1,2}\/\d{1,2}\/\d{4}|um\s+(?:[01]?\d|2[0-3])(?:[:.][0-5]\d)?(?:\s*uhr)?|(?:[01]?\d|2[0-3])[:.][0-5]\d|(?:[01]?\d|2[0-3])\s*uhr)\b|[,.!?;]|$)`;

const EXPLICIT_LOCATION_PATTERNS = [
  new RegExp(
    String.raw`\b(?:ort|standort)\s*:\s*([^\n,;.!?]+?)${LOCATION_STOP_PATTERN}`,
    "iu",
  ),
  new RegExp(
    String.raw`\bmit\s+(?:ort|standort)\s+([^\n,;.!?]+?)${LOCATION_STOP_PATTERN}`,
    "iu",
  ),
  new RegExp(
    String.raw`\b(?:in|bei|am|im)\s+([A-ZÄÖÜ0-9][A-Za-zÄÖÜäöüß0-9'’./-]*(?:\s+[A-ZÄÖÜ0-9][A-Za-zÄÖÜäöüß0-9'’./-]*){0,3})${LOCATION_STOP_PATTERN}`,
    "u",
  ),
];

type TimeParts = {
  hours: number;
  minutes: number;
};

function normalizeSuggestionKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildSuggestionKey(actionId: SuggestionActionId, value: string) {
  return `${actionId}:${normalizeSuggestionKey(value)}`;
}

function isBoundaryChar(char: string | undefined) {
  return !char || /[\s.,;:!?()[\]{}"'`´’“”/\\|-]/u.test(char);
}

function isRangeOverlapping(range: MatchRange, blocked: MatchRange[]) {
  return blocked.some(
    (candidate) => range.start < candidate.end && range.end > candidate.start,
  );
}

function isValidDateParts(year: number, monthIndex: number, day: number) {
  const candidate = new Date(year, monthIndex, day, 12, 0, 0, 0);
  return (
    candidate.getFullYear() === year &&
    candidate.getMonth() === monthIndex &&
    candidate.getDate() === day
  );
}

function findSafeTime(
  text: string,
  blockedRanges: MatchRange[],
): (TimeParts & { range: MatchRange }) | null {
  const patterns = [
    /\bum\s+([01]?\d|2[0-3])(?:[:.]([0-5]\d))?(?:\s*uhr)?\b/giu,
    /\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/gu,
    /\b([01]?\d|2[0-3])\s*uhr\b/giu,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (isRangeOverlapping({ start, end }, blockedRanges)) continue;

      const hours = Number.parseInt(match[1] ?? "", 10);
      const minutes = Number.parseInt(match[2] ?? "0", 10);
      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) continue;

      return {
        hours,
        minutes,
        range: { start, end },
      };
    }
  }

  return null;
}

function detectAbsoluteDate(
  text: string,
  referenceMs: number,
): { dayStartMs: number; range: MatchRange } | null {
  const now = new Date(referenceMs);

  const slashDateMatch = text.match(
    /\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(\d{4})\b/u,
  );
  if (slashDateMatch) {
    const monthIndex = Number.parseInt(slashDateMatch[1] ?? "", 10) - 1;
    const day = Number.parseInt(slashDateMatch[2] ?? "", 10);
    const year = Number.parseInt(slashDateMatch[3] ?? "", 10);
    if (isValidDateParts(year, monthIndex, day)) {
      const start = slashDateMatch.index ?? 0;
      return {
        dayStartMs: getStartOfLocalDayMs(new Date(year, monthIndex, day)),
        range: { start, end: start + slashDateMatch[0].length },
      };
    }
  }

  const dotDateMatch = text.match(
    /\b(0?[1-9]|[12]\d|3[01])\.(0?[1-9]|1[0-2])\.(?:\s*(\d{2,4}))?(?=\s|$|[,;:!?])/u,
  );
  if (!dotDateMatch) return null;

  const day = Number.parseInt(dotDateMatch[1] ?? "", 10);
  const monthIndex = Number.parseInt(dotDateMatch[2] ?? "", 10) - 1;
  const rawYear = dotDateMatch[3];
  const year =
    typeof rawYear === "string" && rawYear.length > 0
      ? Number.parseInt(rawYear, 10) < 100
        ? 2000 + Number.parseInt(rawYear, 10)
        : Number.parseInt(rawYear, 10)
      : now.getFullYear();

  if (!isValidDateParts(year, monthIndex, day)) return null;

  const resolved = new Date(year, monthIndex, day, 12, 0, 0, 0);
  if (!rawYear && resolved.getTime() < getStartOfLocalDayMs(referenceMs)) {
    resolved.setFullYear(resolved.getFullYear() + 1);
  }

  const start = dotDateMatch.index ?? 0;
  return {
    dayStartMs: getStartOfLocalDayMs(resolved),
    range: { start, end: start + dotDateMatch[0].length },
  };
}

function detectRelativeOrWeekdayDate(
  text: string,
  referenceMs: number,
): { dayStartMs: number; range: MatchRange } | null {
  const baseDate = new Date(referenceMs);
  baseDate.setSeconds(0, 0);

  const overmorrowMatch = text.match(/\b(?:übermorgen|uebermorgen)\b/iu);
  if (overmorrowMatch) {
    baseDate.setDate(baseDate.getDate() + 2);
    const start = overmorrowMatch.index ?? 0;
    return {
      dayStartMs: getStartOfLocalDayMs(baseDate),
      range: { start, end: start + overmorrowMatch[0].length },
    };
  }

  const tomorrowMatch = text.match(/\bmorgen\b/iu);
  if (tomorrowMatch) {
    baseDate.setDate(baseDate.getDate() + 1);
    const start = tomorrowMatch.index ?? 0;
    return {
      dayStartMs: getStartOfLocalDayMs(baseDate),
      range: { start, end: start + tomorrowMatch[0].length },
    };
  }

  const todayMatch = text.match(/\bheute\b/iu);
  if (todayMatch) {
    const start = todayMatch.index ?? 0;
    return {
      dayStartMs: getStartOfLocalDayMs(baseDate),
      range: { start, end: start + todayMatch[0].length },
    };
  }

  for (const [token, weekdayIndex] of Object.entries(WEEKDAY_INDEX_BY_TOKEN)) {
    const match = text.match(new RegExp(`\\b${token}\\b`, "iu"));
    if (!match) continue;

    const resolved = new Date(baseDate);
    const currentIndex = resolved.getDay();
    let delta = (weekdayIndex - currentIndex + 7) % 7;
    if (delta === 0) delta = 7;
    resolved.setDate(resolved.getDate() + delta);

    const start = match.index ?? 0;
    return {
      dayStartMs: getStartOfLocalDayMs(resolved),
      range: { start, end: start + match[0].length },
    };
  }

  return null;
}

function detectDateSuggestion(
  text: string,
  referenceMs: number,
) {
  const explicitDate = detectAbsoluteDate(text, referenceMs);
  if (explicitDate) {
    return {
      suggestion: {
        actionId: "date" as const,
        key: buildSuggestionKey("date", String(explicitDate.dayStartMs)),
        dayStartMs: explicitDate.dayStartMs,
        range: explicitDate.range,
      },
      blockedRange: explicitDate.range,
    };
  }

  const relativeDate = detectRelativeOrWeekdayDate(text, referenceMs);
  if (!relativeDate) return null;

  return {
    suggestion: {
      actionId: "date" as const,
      key: buildSuggestionKey("date", String(relativeDate.dayStartMs)),
      dayStartMs: relativeDate.dayStartMs,
      range: relativeDate.range,
    },
    blockedRange: relativeDate.range,
  };
}

function detectTimeSuggestion(
  text: string,
  blockedRanges: MatchRange[],
): DetectedTaskTextSuggestion | null {
  const time = findSafeTime(text, blockedRanges);
  if (!time) return null;

  return {
    actionId: "time",
    key: buildSuggestionKey("time", `${time.hours}:${time.minutes}`),
    hours: time.hours,
    minutes: time.minutes,
    range: time.range,
  };
}

function cleanLocationCandidate(value: string) {
  return value.trim().replace(/^[,;:.!?]+|[,;:.!?]+$/g, "").trim();
}

function isSafeLocationCandidate(value: string) {
  if (!value || value.length < 2 || value.length > 60) return false;
  if (!/[A-Za-zÄÖÜäöüß]/u.test(value)) return false;

  const firstToken = value.split(/\s+/u)[0]?.toLowerCase() ?? "";
  if (BLOCKED_LOCATION_TOKENS.has(firstToken)) return false;

  return true;
}

function detectLocationSuggestion(text: string): DetectedTaskTextSuggestion | null {
  for (const pattern of EXPLICIT_LOCATION_PATTERNS) {
    const match = text.match(pattern);
    const location = cleanLocationCandidate(match?.[1] ?? "");
    if (!isSafeLocationCandidate(location)) continue;

    return {
      actionId: "location",
      key: buildSuggestionKey("location", location),
      location,
      range: {
        start: match?.index ?? 0,
        end: (match?.index ?? 0) + (match?.[0]?.length ?? 0),
      },
    };
  }

  return null;
}

function detectProjectSuggestion(
  text: string,
  projects: readonly Project[],
): DetectedTaskTextSuggestion | null {
  if (!text.trim()) return null;

  const activeProjects = projects
    .filter((project) => !project.deletedAt && project.name.trim().length > 0)
    .sort((left, right) => right.name.trim().length - left.name.trim().length);

  for (const project of activeProjects) {
    const projectName = project.name.trim();
    const escapedProjectName = projectName
      .split(/\s+/u)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(String.raw`\s+`);
    const pattern = new RegExp(escapedProjectName, "igu");
    let match = pattern.exec(text);

    while (match) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      const before = text[start - 1];
      const after = text[end];
      if (isBoundaryChar(before) && isBoundaryChar(after)) {
        return {
          actionId: "project",
          key: buildSuggestionKey("project", project.id),
          projectId: project.id,
          projectName,
          projectColor: project.color,
          range: {
            start,
            end,
          },
        };
      }

      match = pattern.exec(text);
    }
  }

  return null;
}

function detectRoutineSuggestion(text: string): DetectedTaskTextSuggestion | null {
  for (const candidate of ROUTINE_PATTERNS) {
    const match = text.match(candidate.pattern);
    if (!match) continue;

    return {
      actionId: "routine",
      key: buildSuggestionKey("routine", candidate.routineType),
      routineType: candidate.routineType,
      range: {
        start: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
      },
    };
  }

  return null;
}

export function detectTaskTextSuggestions(
  text: string,
  options: {
    referenceMs?: number;
    projects?: readonly Project[];
  } = {},
) {
  const normalizedText = text.trim();
  if (!normalizedText) return [] as DetectedTaskTextSuggestion[];

  const suggestions: DetectedTaskTextSuggestion[] = [];
  const referenceMs = options.referenceMs ?? Date.now();

  // Resolve explicit dates first so "05.03." is not misread as the time "05:03".
  const dateSuggestion = detectDateSuggestion(normalizedText, referenceMs);
  if (dateSuggestion) {
    suggestions.push(dateSuggestion.suggestion);
  }

  const timeSuggestion = detectTimeSuggestion(
    normalizedText,
    dateSuggestion?.blockedRange ? [dateSuggestion.blockedRange] : [],
  );
  if (timeSuggestion) suggestions.push(timeSuggestion);

  const locationSuggestion = detectLocationSuggestion(normalizedText);
  if (locationSuggestion) suggestions.push(locationSuggestion);

  if (options.projects?.length) {
    const projectSuggestion = detectProjectSuggestion(normalizedText, options.projects);
    if (projectSuggestion) suggestions.push(projectSuggestion);
  }

  const routineSuggestion = detectRoutineSuggestion(normalizedText);
  if (routineSuggestion) suggestions.push(routineSuggestion);

  return suggestions;
}

export function stripTaskSuggestionText(
  text: string,
  suggestions: readonly DetectedTaskTextSuggestion[],
) {
  if (!text.trim() || suggestions.length === 0) return text.trim();

  const ranges = suggestions
    .map((suggestion) => {
      const range = { ...suggestion.range };

      // Some time matches may stop before a trailing "Uhr". Only consume it
      // when it directly belongs to the recognized time token.
      if (suggestion.actionId === "time") {
        const trailingClockWord = text
          .slice(range.end)
          .match(/^\s*uhr\b/iu);
        if (trailingClockWord) {
          range.end += trailingClockWord[0].length;
        }
      }

      return range;
    })
    .sort((left, right) => left.start - right.start)
    .reduce<MatchRange[]>((acc, range) => {
      const previous = acc[acc.length - 1];
      if (!previous || range.start > previous.end) {
        acc.push({ ...range });
        return acc;
      }

      previous.end = Math.max(previous.end, range.end);
      return acc;
    }, []);

  let cursor = 0;
  let stripped = "";

  for (const range of ranges) {
    stripped += text.slice(cursor, range.start);
    cursor = range.end;
  }

  stripped += text.slice(cursor);

  return stripped
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/^[,.;:!?/\-–—\s]+|[,.;:!?/\-–—\s]+$/g, "")
    .trim();
}
