import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as ExpoGlassEffect from 'expo-glass-effect';
import {
  GlassView,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import { useIsFocused } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface, withAlpha } from '@/components/ui/glass-surface';
import { Colors } from '@/constants/theme';
import { getAccentColorValue, useAppSettings } from '@/context/settings-store';
import { useTaskCreateContext } from '@/context/task-create-context';
import {
  useTasksStore,
  type RoutineType,
  type SectionId,
  type Task,
} from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatDate, t } from '@/i18n';
import {
  alignDueAtToLocalDay,
  deriveActiveSectionFromDueAt,
  getStartOfLocalDayMs,
  hasValidDueAt,
  isSameLocalDay,
} from '@/utils/task-dates';
import {
  detectTaskTextSuggestions,
  type DetectedTaskTextSuggestion,
  stripTaskSuggestionText,
} from '@/utils/task-text-suggestions';

const createTaskId = () => `t-${Date.now()}-${Math.random().toString(16).slice(2)}`;

type ComposerActionId = 'date' | 'time' | 'style' | 'location' | 'routine' | 'project';
type MaterialIconName = React.ComponentProps<typeof MaterialIcons>['name'];
type ComposerAction = {
  id: ComposerActionId;
  title: string;
  icon: MaterialIconName;
  accentColor: string;
};

type ComposerSelectionTag = {
  key: string;
  actionId: ComposerActionId;
  label: string;
  icon: MaterialIconName;
  accentColor: string;
  removable: boolean;
};

type RegexManagedActionId = 'date' | 'time' | 'location' | 'project' | 'routine';
type RegexAppliedSuggestions = Partial<Record<RegexManagedActionId, DetectedTaskTextSuggestion>>;

const ROUTINE_LABEL_KEY_BY_TYPE: Record<RoutineType, string> = {
  hourly: 'taskDetail.routine.hourly',
  daily: 'taskDetail.routine.daily',
  weekdays: 'taskDetail.routine.weekdays',
  weekends: 'taskDetail.routine.weekends',
  weekly: 'taskDetail.routine.weekly',
  biweekly: 'taskDetail.routine.biweekly',
  monthly: 'taskDetail.routine.monthly',
  quarterly: 'taskDetail.routine.quarterly',
  biannually: 'taskDetail.routine.biannually',
  yearly: 'taskDetail.routine.yearly',
  custom: 'taskDetail.routine.custom',
};

const STYLE_COLOR_LABEL_KEY_BY_HEX: Record<string, string> = {
  '#34C759': 'taskCreate.color.green',
  '#0A84FF': 'taskCreate.color.blue',
  '#FF9500': 'taskCreate.color.orange',
  '#FF3B30': 'taskCreate.color.red',
  '#AF52DE': 'taskCreate.color.purple',
  '#5E5CE6': 'taskCreate.color.indigo',
  '#32D74B': 'taskCreate.color.mint',
  '#FFD60A': 'taskCreate.color.yellow',
  '#64D2FF': 'taskCreate.color.cyan',
  '#FF2D55': 'taskCreate.color.pink',
  '#8E8E93': 'taskCreate.color.gray',
  '#1C1C1E': 'taskCreate.color.black',
};

const toLegacyRoutineInterval = (type: RoutineType) => {
  switch (type) {
    case 'daily':
    case 'weekly':
    case 'monthly':
    case 'yearly':
      return type;
    default:
      return undefined;
  }
};

const normalizeComposerLocation = (value: string | undefined) =>
  (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

const getSuggestionTimeValue = (hours: number, minutes: number) => hours * 60 + minutes;

const mergeOriginalInputIntoNotes = (originalInput: string, existingNotes?: string) => {
  const normalizedOriginal = originalInput.trim();
  const normalizedExisting = existingNotes?.trim() ?? '';
  if (!normalizedOriginal) return normalizedExisting || undefined;
  if (!normalizedExisting) return normalizedOriginal;
  if (normalizedExisting === normalizedOriginal) return normalizedExisting;
  if (normalizedExisting.startsWith(`${normalizedOriginal}\n`)) return normalizedExisting;
  return `${normalizedOriginal}\n\n${normalizedExisting}`;
};

const formatComposerDateLabel = (dueAt: number) => {
  if (!hasValidDueAt(dueAt)) return '';

  if (isSameLocalDay(dueAt, Date.now())) {
    return t('taskDetail.relative.today');
  }

  const tomorrowStart = new Date(getStartOfLocalDayMs());
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  if (isSameLocalDay(dueAt, tomorrowStart)) {
    return t('taskDetail.relative.tomorrow');
  }

  return formatDate(dueAt, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
};

const formatComposerTimeLabel = (dueAt: number) => {
  if (!hasValidDueAt(dueAt)) return '';

  return formatDate(dueAt, {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function CreateTaskModal() {
  const router = useRouter();
  const {
    projectId: projectIdParam,
    draftId: draftIdParam,
    preset: presetParam,
    dateStart: dateStartParam,
  } = useLocalSearchParams<{
    projectId?: string | string[];
    draftId?: string | string[];
    preset?: string | string[];
    dateStart?: string | string[];
  }>();
  const theme = useColorScheme() ?? 'light';
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const {
    projectId: focusedProjectId,
    mode: taskCreateMode,
    presetDateStart,
    queueTaskPopIn,
  } = useTaskCreateContext();
  const { accentColor } = useAppSettings();

  const { tasks, projects, setTasks } = useTasksStore();
  const routeDraftId = React.useMemo(() => {
    const rawDraftId = Array.isArray(draftIdParam) ? draftIdParam[0] : draftIdParam;
    if (typeof rawDraftId !== 'string') return '';
    return rawDraftId.trim();
  }, [draftIdParam]);
  const routeProjectId = React.useMemo(() => {
    const rawRouteProjectId = Array.isArray(projectIdParam) ? projectIdParam[0] : projectIdParam;
    if (typeof rawRouteProjectId !== 'string') return '';
    return rawRouteProjectId.trim();
  }, [projectIdParam]);
  const routePreset = React.useMemo(() => {
    const rawPreset = Array.isArray(presetParam) ? presetParam[0] : presetParam;
    if (typeof rawPreset !== 'string') return '';
    return rawPreset.trim().toLowerCase();
  }, [presetParam]);
  const routePresetDateStart = React.useMemo(() => {
    const rawDateStart = Array.isArray(dateStartParam) ? dateStartParam[0] : dateStartParam;
    if (typeof rawDateStart !== 'string') return 0;
    const parsed = Number.parseInt(rawDateStart.trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return getStartOfLocalDayMs(parsed);
  }, [dateStartParam]);
  const shouldPresetRoutine =
    routePreset === 'routine' || routePreset === 'routines' || taskCreateMode === 'routine';
  const shouldPresetToday =
    routePreset === 'today' ||
    routePresetDateStart > 0 ||
    presetDateStart > 0 ||
    taskCreateMode === 'today';
  const todayPresetDateStart = React.useMemo(() => {
    if (routePresetDateStart > 0) return routePresetDateStart;
    if (presetDateStart > 0) return getStartOfLocalDayMs(presetDateStart);
    if (!shouldPresetToday) return 0;
    return getStartOfLocalDayMs();
  }, [presetDateStart, routePresetDateStart, shouldPresetToday]);
  const routeProjectIdIsValid = React.useMemo(
    () =>
      routeProjectId.length > 0 &&
      projects.some((project) => project.id === routeProjectId && !project.deletedAt),
    [projects, routeProjectId]
  );
  const initialProjectId = React.useMemo(() => {
    if (routeProjectIdIsValid) return routeProjectId;

    const normalizedFocusedProjectId =
      typeof focusedProjectId === 'string' ? focusedProjectId.trim() : '';
    if (!normalizedFocusedProjectId) return '';

    const focusedProjectExists = projects.some(
      (project) => project.id === normalizedFocusedProjectId && !project.deletedAt
    );
    return focusedProjectExists ? normalizedFocusedProjectId : '';
  }, [focusedProjectId, projects, routeProjectId, routeProjectIdIsValid]);
  const initialDraftDueAt = React.useMemo(() => {
    if (!shouldPresetToday || todayPresetDateStart <= 0) return 0;
    return alignDueAtToLocalDay(todayPresetDateStart, {
      keepTime: false,
    });
  }, [shouldPresetToday, todayPresetDateStart]);
  const initialDraftSection = React.useMemo<SectionId>(() => {
    if (!hasValidDueAt(initialDraftDueAt)) return 'upcoming';
    return deriveActiveSectionFromDueAt(initialDraftDueAt);
  }, [initialDraftDueAt]);

  const [title, setTitle] = React.useState('');
  const [dismissedSuggestionKeys, setDismissedSuggestionKeys] = React.useState<string[]>([]);
  const [appliedRegexSuggestions, setAppliedRegexSuggestions] = React.useState<RegexAppliedSuggestions>({});
  const [isMenuExpanded, setMenuExpanded] = React.useState(false);
  const trimmed = title.trim();
  const hasTitle = trimmed.length > 0;
  const menuProgress = React.useRef(new Animated.Value(0)).current;

  const inputRef = React.useRef<TextInput | null>(null);

  // Draft management
  const draftIdRef = React.useRef<string | null>(null);
  const isCreatedRef = React.useRef(false);
  const isNavigatingToChildModalRef = React.useRef(false);
  const isSyncingDraftRouteParamRef = React.useRef(false);
  const draftRouteParamSyncTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftTask = React.useMemo<Task | undefined>(() => {
    const draftId = draftIdRef.current ?? routeDraftId;
    if (!draftId) return undefined;
    return tasks.find((task) => task.id === draftId);
  }, [routeDraftId, tasks]);

  React.useEffect(() => {
    return () => {
      if (draftRouteParamSyncTimeoutRef.current != null) {
        clearTimeout(draftRouteParamSyncTimeoutRef.current);
        draftRouteParamSyncTimeoutRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    if (draftIdRef.current || !routeDraftId) return;
    const draftFromRoute = tasks.find((task) => task.id === routeDraftId);
    if (!draftFromRoute) return;
    draftIdRef.current = routeDraftId;
    if (isSyncingDraftRouteParamRef.current) {
      isSyncingDraftRouteParamRef.current = false;
      if (draftRouteParamSyncTimeoutRef.current != null) {
        clearTimeout(draftRouteParamSyncTimeoutRef.current);
        draftRouteParamSyncTimeoutRef.current = null;
      }
    }
  }, [routeDraftId, tasks]);

  React.useEffect(() => {
    if (isFocused) {
      isNavigatingToChildModalRef.current = false;
    }
  }, [isFocused]);

  // Focus input on mount
  React.useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, []);

  // Cleanup draft on unmount if not created
  React.useEffect(() => {
    return () => {
      const idToDelete = draftIdRef.current ?? routeDraftId;
      if (
        !isCreatedRef.current &&
        idToDelete &&
        !isNavigatingToChildModalRef.current &&
        !isSyncingDraftRouteParamRef.current
      ) {
        // Use functional update to avoid stale closure if we depended on 'tasks' directly,
        // though setStates are stable.
        setTasks((prev) => prev.filter((t) => t.id !== idToDelete));
      }
    };
  }, [routeDraftId, setTasks]);

  const persistDraftIdParam = React.useCallback((draftId: string) => {
    isSyncingDraftRouteParamRef.current = true;
    if (draftRouteParamSyncTimeoutRef.current != null) {
      clearTimeout(draftRouteParamSyncTimeoutRef.current);
      draftRouteParamSyncTimeoutRef.current = null;
    }
    draftRouteParamSyncTimeoutRef.current = setTimeout(() => {
      isSyncingDraftRouteParamRef.current = false;
      draftRouteParamSyncTimeoutRef.current = null;
    }, 1200);
    const applyParam = () => {
      try {
        router.setParams({ draftId });
      } catch (error) {
        if (__DEV__) {
          console.warn('[task/create-modal] Could not persist draftId route param yet.', error);
        }
      }
    };

    requestAnimationFrame(applyParam);
  }, [router]);

  const ensureDraftTask = React.useCallback(() => {
    const upsertHiddenDraftTask = (id: string) => {
      setTasks((prev) => {
        if (prev.some((task) => task.id === id)) return prev;
        return [
          {
            id,
            title: title || '',
            emoji: '📝',
            projectId: initialProjectId,
            dueAt: initialDraftDueAt,
            dueHasTime: hasValidDueAt(initialDraftDueAt),
            section: initialDraftSection,
            orderRank: 0, // will be fixed on create
            deletedAt: Date.now(), // Hidden
          },
          ...prev,
        ];
      });
    };

    if (draftIdRef.current) {
      const existingDraftId = draftIdRef.current;
      if (!tasks.some((task) => task.id === existingDraftId)) {
        upsertHiddenDraftTask(existingDraftId);
      }
      return existingDraftId;
    }

    if (routeDraftId && tasks.some((task) => task.id === routeDraftId)) {
      draftIdRef.current = routeDraftId;
      return routeDraftId;
    }

    const nextId = createTaskId();
    draftIdRef.current = nextId;
    upsertHiddenDraftTask(nextId);
    persistDraftIdParam(nextId);

    return nextId;
  }, [initialDraftDueAt, initialDraftSection, initialProjectId, persistDraftIdParam, routeDraftId, setTasks, tasks, title]);

  const didInitRoutinePresetRef = React.useRef(false);
  React.useEffect(() => {
    if (!shouldPresetRoutine || didInitRoutinePresetRef.current) return;
    didInitRoutinePresetRef.current = true;

    const draftId = ensureDraftTask();
    setTasks((prev) =>
      prev.map((task) =>
        task.id === draftId
          ? {
            ...task,
            isRoutine: true,
            routineType: undefined,
            routineInterval: undefined,
            routineWeekday: undefined,
            routineNthWeek: undefined,
            routineMonthDay: undefined,
            routineMonth: undefined,
          }
          : task
      )
    );
  }, [ensureDraftTask, setTasks, shouldPresetRoutine]);

  const didInitTodayPresetRef = React.useRef(false);
  React.useEffect(() => {
    if (!shouldPresetToday || didInitTodayPresetRef.current) return;
    didInitTodayPresetRef.current = true;

    const draftId = ensureDraftTask();
    const dueAt = alignDueAtToLocalDay(
      todayPresetDateStart > 0 ? todayPresetDateStart : getStartOfLocalDayMs(),
      { keepTime: false }
    );
    setTasks((prev) =>
      prev.map((task) =>
        task.id === draftId
          ? {
              ...task,
              dueAt,
              dueHasTime: false,
              section: deriveActiveSectionFromDueAt(dueAt),
            }
          : task
      )
    );
  }, [ensureDraftTask, setTasks, shouldPresetToday, todayPresetDateStart]);

  // Keep draft title in sync so if we navigate away and back, we don't lose it
  // (Optional, but good if we want "Draft" persistence while modal is open to sub-screens)
  const isUpdatingRef = React.useRef(false);
  React.useEffect(() => {
    if (draftIdRef.current && !isUpdatingRef.current) {
      setTasks(prev => prev.map(t => t.id === draftIdRef.current ? { ...t, title: title } : t));
    }
  }, [title, setTasks]);

  React.useEffect(() => {
    Animated.spring(menuProgress, {
      toValue: isMenuExpanded ? 1 : 0,
      tension: 220,
      friction: 26,
      overshootClamping: true,
      useNativeDriver: true,
    }).start();
  }, [isMenuExpanded, menuProgress]);

  const actions = React.useMemo<ComposerAction[]>(() => {
    return [
      {
        id: 'date',
        title: t('taskCreate.menu.date'),
        icon: 'event',
        accentColor: '#4D7CFF',
      },
      {
        id: 'style',
        title: t('taskCreate.menu.style'),
        icon: 'palette',
        accentColor: '#B56CFF',
      },
      {
        id: 'location',
        title: t('taskCreate.menu.location'),
        icon: 'location-on',
        accentColor: '#34C759',
      },
      {
        id: 'routine',
        title: t('taskCreate.menu.routine'),
        icon: 'autorenew',
        accentColor: '#FF9F0A',
      },
      {
        id: 'project',
        title: t('taskCreate.menu.project'),
        icon: 'folder',
        accentColor: '#5AC8FA',
      },
    ];
  }, []);

  const runAction = React.useCallback((actionId: ComposerActionId) => {
    const id = ensureDraftTask();

    switch (actionId) {
      case 'date':
      case 'time':
        isNavigatingToChildModalRef.current = true;
        router.push({ pathname: '/task/date-picker', params: { taskId: id, draftId: id } });
        break;
      case 'style':
        isNavigatingToChildModalRef.current = true;
        router.push({ pathname: '/task/emoji-picker', params: { taskId: id, draftId: id } });
        break;
      case 'location':
        isNavigatingToChildModalRef.current = true;
        router.push({ pathname: '/task/location-picker', params: { taskId: id, draftId: id } });
        break;
      case 'routine':
        const openRoutinePicker = () => {
          isNavigatingToChildModalRef.current = true;
          router.push({ pathname: '/task/routine-picker', params: { taskId: id, draftId: id } });
        };
        if (tasks.some((task) => task.id === id)) {
          openRoutinePicker();
        } else {
          requestAnimationFrame(openRoutinePicker);
        }
        break;
      case 'project':
        isNavigatingToChildModalRef.current = true;
        router.push({ pathname: '/task/project-picker', params: { taskId: id, draftId: id } });
        break;
    }
  }, [ensureDraftTask, router, tasks]);

  const onActionPress = React.useCallback((actionId: ComposerActionId) => {
    setMenuExpanded(false);
    runAction(actionId);
  }, [runAction]);

  const selectedRoutineType = draftTask?.isRoutine
    ? (draftTask.routineType ?? draftTask.routineInterval)
    : undefined;
  const hasRoutineInterval = typeof selectedRoutineType === 'string' && selectedRoutineType.length > 0;
  const requiresRoutineInterval = shouldPresetRoutine;
  const canSubmit = hasTitle && (!requiresRoutineInterval || hasRoutineInterval);
  const selectedProjectId = draftTask ? draftTask.projectId : initialProjectId;
  const isProjectPinnedByRoute = routeProjectIdIsValid && selectedProjectId === routeProjectId;
  const dismissedSuggestionKeySet = React.useMemo(
    () => new Set(dismissedSuggestionKeys),
    [dismissedSuggestionKeys]
  );
  const detectedTextSuggestions = React.useMemo(
    () =>
      detectTaskTextSuggestions(title, {
        projects,
      }),
    [projects, title]
  );
  const availableRegexSuggestions = React.useMemo(() => {
    const next: RegexAppliedSuggestions = {};

    for (const suggestion of detectedTextSuggestions) {
      if (dismissedSuggestionKeySet.has(suggestion.key)) continue;
      switch (suggestion.actionId) {
        case 'date':
          next.date = suggestion;
          break;
        case 'time':
          next.time = suggestion;
          break;
        case 'location':
          next.location = suggestion;
          break;
        case 'project':
          next.project = suggestion;
          break;
        case 'routine':
          next.routine = suggestion;
          break;
      }
    }

    return next;
  }, [detectedTextSuggestions, dismissedSuggestionKeySet]);

  const selectedTags = React.useMemo<ComposerSelectionTag[]>(() => {
    const tags: ComposerSelectionTag[] = [];

    if (draftTask) {
      if (draftTask.dueAt > 0) {
        tags.push({
          key: 'date',
          actionId: 'date',
          label: formatComposerDateLabel(draftTask.dueAt),
          icon: 'event',
          accentColor: '#4D7CFF',
          removable: true,
        });

        if (draftTask.dueHasTime === true) {
          tags.push({
            key: 'time',
            actionId: 'time',
            label: formatComposerTimeLabel(draftTask.dueAt),
            icon: 'schedule',
            accentColor: '#4D7CFF',
            removable: true,
          });
        }
      }

      if (draftTask.emoji && (draftTask.emoji !== '📝' || !!draftTask.color)) {
        const styleAccentColor = draftTask.color ? draftTask.color.toUpperCase() : '#B56CFF';
        const colorLabelKey = draftTask.color
          ? STYLE_COLOR_LABEL_KEY_BY_HEX[draftTask.color.toUpperCase()]
          : undefined;
        const styleParts = [
          draftTask.emoji !== '📝' ? draftTask.emoji : '',
          draftTask.color ? t(colorLabelKey ?? 'taskCreate.color.custom') : '',
        ].filter(Boolean);

        tags.push({
          key: 'style',
          actionId: 'style',
          label: styleParts.join(' · '),
          icon: 'palette',
          accentColor: styleAccentColor,
          removable: true,
        });
      }

      if (draftTask.location?.trim()) {
        tags.push({
          key: 'location',
          actionId: 'location',
          label: draftTask.location.trim(),
          icon: 'location-on',
          accentColor: '#34C759',
          removable: true,
        });
      }

      const routineType = draftTask.isRoutine
        ? (draftTask.routineType ?? draftTask.routineInterval)
        : undefined;
      if (routineType) {
        const key = ROUTINE_LABEL_KEY_BY_TYPE[routineType as RoutineType];
        tags.push({
          key: 'routine',
          actionId: 'routine',
          label: t(key),
          icon: 'autorenew',
          accentColor: '#FF9F0A',
          removable: true,
        });
      }
    }

    if (shouldPresetRoutine && !hasRoutineInterval) {
      tags.push({
        key: 'routine',
        actionId: 'routine',
        label: t('taskCreate.routine.chooseInterval'),
        icon: 'autorenew',
        accentColor: '#FF9F0A',
        removable: false,
      });
    }

    if (selectedProjectId) {
      const project = projects.find((candidate) => candidate.id === selectedProjectId);
      tags.push({
        key: 'project',
        actionId: 'project',
        label: project?.name?.trim() || t('taskCreate.menu.project'),
        icon: 'folder',
        accentColor: project?.color ?? '#5AC8FA',
        removable: !isProjectPinnedByRoute,
      });
    }

    return tags;
  }, [draftTask, hasRoutineInterval, isProjectPinnedByRoute, projects, selectedProjectId, shouldPresetRoutine]);

  React.useEffect(() => {
    setAppliedRegexSuggestions((prev) => {
      let didChange = false;
      const next: RegexAppliedSuggestions = { ...prev };

      if (
        prev.date?.actionId === 'date' &&
        (!hasValidDueAt(draftTask?.dueAt) || !isSameLocalDay(draftTask.dueAt, prev.date.dayStartMs))
      ) {
        delete next.date;
        didChange = true;
      }

      if (
        prev.time?.actionId === 'time' &&
        (
          !hasValidDueAt(draftTask?.dueAt) ||
          draftTask?.dueHasTime !== true ||
          new Date(draftTask.dueAt).getHours() !== prev.time.hours ||
          new Date(draftTask.dueAt).getMinutes() !== prev.time.minutes
        )
      ) {
        delete next.time;
        didChange = true;
      }

      if (
        prev.location?.actionId === 'location' &&
        normalizeComposerLocation(draftTask?.location) !== normalizeComposerLocation(prev.location.location)
      ) {
        delete next.location;
        didChange = true;
      }

      if (prev.project?.actionId === 'project' && selectedProjectId !== prev.project.projectId) {
        delete next.project;
        didChange = true;
      }

      if (prev.routine?.actionId === 'routine' && selectedRoutineType !== prev.routine.routineType) {
        delete next.routine;
        didChange = true;
      }

      return didChange ? next : prev;
    });
  }, [
    draftTask?.dueAt,
    draftTask?.dueHasTime,
    draftTask?.location,
    selectedProjectId,
    selectedRoutineType,
  ]);

  const onTagPress = React.useCallback((actionId: ComposerActionId) => {
    setMenuExpanded(false);
    runAction(actionId);
  }, [runAction]);

  React.useEffect(() => {
    const nextDateSuggestion = availableRegexSuggestions.date;
    const nextTimeSuggestion = availableRegexSuggestions.time;
    const nextLocationSuggestion = availableRegexSuggestions.location;
    const nextProjectSuggestion = availableRegexSuggestions.project;
    const nextRoutineSuggestion = availableRegexSuggestions.routine;

    const hasAnySuggestion =
      !!nextDateSuggestion ||
      !!nextTimeSuggestion ||
      !!nextLocationSuggestion ||
      !!nextProjectSuggestion ||
      !!nextRoutineSuggestion;
    if (!hasAnySuggestion) return;

    const todayPresetDayStart = shouldPresetToday
      ? getStartOfLocalDayMs(todayPresetDateStart > 0 ? todayPresetDateStart : Date.now())
      : 0;
    const currentDayStart = hasValidDueAt(draftTask?.dueAt)
      ? getStartOfLocalDayMs(draftTask.dueAt)
      : 0;
    const hasDate = hasValidDueAt(draftTask?.dueAt);
    const currentTimeValue =
      hasDate && draftTask?.dueHasTime === true
        ? getSuggestionTimeValue(new Date(draftTask.dueAt).getHours(), new Date(draftTask.dueAt).getMinutes())
        : null;

    const shouldApplyDate =
      nextDateSuggestion?.actionId === 'date' &&
      (
        !hasDate ||
        appliedRegexSuggestions.date?.actionId === 'date' ||
        (todayPresetDayStart > 0 && currentDayStart === todayPresetDayStart)
      ) &&
      currentDayStart !== nextDateSuggestion.dayStartMs;

    const shouldApplyTime =
      nextTimeSuggestion?.actionId === 'time' &&
      (
        !hasDate ||
        draftTask?.dueHasTime !== true ||
        appliedRegexSuggestions.time?.actionId === 'time'
      ) &&
      currentTimeValue !== getSuggestionTimeValue(nextTimeSuggestion.hours, nextTimeSuggestion.minutes);

    const shouldApplyLocation =
      nextLocationSuggestion?.actionId === 'location' &&
      (
        !draftTask?.location?.trim() ||
        appliedRegexSuggestions.location?.actionId === 'location'
      ) &&
      normalizeComposerLocation(draftTask?.location) !== normalizeComposerLocation(nextLocationSuggestion.location);

    const shouldApplyProject =
      nextProjectSuggestion?.actionId === 'project' &&
      !isProjectPinnedByRoute &&
      (
        !selectedProjectId ||
        selectedProjectId === initialProjectId ||
        appliedRegexSuggestions.project?.actionId === 'project'
      ) &&
      selectedProjectId !== nextProjectSuggestion.projectId;

    const shouldApplyRoutine =
      nextRoutineSuggestion?.actionId === 'routine' &&
      (
        !selectedRoutineType ||
        (shouldPresetRoutine && !hasRoutineInterval) ||
        appliedRegexSuggestions.routine?.actionId === 'routine'
      ) &&
      selectedRoutineType !== nextRoutineSuggestion.routineType;

    if (
      !shouldApplyDate &&
      !shouldApplyTime &&
      !shouldApplyLocation &&
      !shouldApplyProject &&
      !shouldApplyRoutine
    ) {
      return;
    }

    const draftId = ensureDraftTask();

    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== draftId) return task;

        let nextTask = task;

        if (shouldApplyDate && nextDateSuggestion?.actionId === 'date') {
          const nextDueAt = alignDueAtToLocalDay(nextDateSuggestion.dayStartMs, {
            keepTime: nextTask.dueHasTime === true,
            sourceDueAt: nextTask.dueAt,
          });
          nextTask = {
            ...nextTask,
            dueAt: nextDueAt,
            dueHasTime: nextTask.dueHasTime === true,
            section: nextTask.section === 'completed'
              ? nextTask.section
              : deriveActiveSectionFromDueAt(nextDueAt),
          };
        }

        if (shouldApplyTime && nextTimeSuggestion?.actionId === 'time') {
          const baseDayStart = hasValidDueAt(nextTask.dueAt)
            ? getStartOfLocalDayMs(nextTask.dueAt)
            : getStartOfLocalDayMs();
          const nextDueAt = new Date(baseDayStart);
          nextDueAt.setHours(nextTimeSuggestion.hours, nextTimeSuggestion.minutes, 0, 0);
          nextTask = {
            ...nextTask,
            dueAt: nextDueAt.getTime(),
            dueHasTime: true,
            section: nextTask.section === 'completed'
              ? nextTask.section
              : deriveActiveSectionFromDueAt(nextDueAt.getTime()),
          };
        }

        if (shouldApplyLocation && nextLocationSuggestion?.actionId === 'location') {
          nextTask = {
            ...nextTask,
            location: nextLocationSuggestion.location,
          };
        }

        if (shouldApplyProject && nextProjectSuggestion?.actionId === 'project') {
          nextTask = {
            ...nextTask,
            projectId: nextProjectSuggestion.projectId,
          };
        }

        if (shouldApplyRoutine && nextRoutineSuggestion?.actionId === 'routine') {
          nextTask = {
            ...nextTask,
            isRoutine: true,
            routineType: nextRoutineSuggestion.routineType,
            routineInterval: toLegacyRoutineInterval(nextRoutineSuggestion.routineType),
            routineWeekday: undefined,
            routineNthWeek: undefined,
            routineMonthDay: undefined,
            routineMonth: undefined,
          };
        }

        return nextTask;
      })
    );

    setAppliedRegexSuggestions((prev) => ({
      ...prev,
      ...(shouldApplyDate && nextDateSuggestion?.actionId === 'date' ? { date: nextDateSuggestion } : {}),
      ...(shouldApplyTime && nextTimeSuggestion?.actionId === 'time' ? { time: nextTimeSuggestion } : {}),
      ...(shouldApplyLocation && nextLocationSuggestion?.actionId === 'location' ? { location: nextLocationSuggestion } : {}),
      ...(shouldApplyProject && nextProjectSuggestion?.actionId === 'project' ? { project: nextProjectSuggestion } : {}),
      ...(shouldApplyRoutine && nextRoutineSuggestion?.actionId === 'routine' ? { routine: nextRoutineSuggestion } : {}),
    }));
  }, [
    appliedRegexSuggestions.date,
    appliedRegexSuggestions.location,
    appliedRegexSuggestions.project,
    appliedRegexSuggestions.routine,
    appliedRegexSuggestions.time,
    availableRegexSuggestions.date,
    availableRegexSuggestions.location,
    availableRegexSuggestions.project,
    availableRegexSuggestions.routine,
    availableRegexSuggestions.time,
    draftTask?.dueAt,
    draftTask?.dueHasTime,
    draftTask?.location,
    ensureDraftTask,
    hasRoutineInterval,
    initialProjectId,
    isProjectPinnedByRoute,
    selectedProjectId,
    selectedRoutineType,
    setTasks,
    shouldPresetRoutine,
    shouldPresetToday,
    todayPresetDateStart,
  ]);

  const dismissSuggestion = React.useCallback((suggestionKey: string) => {
    setDismissedSuggestionKeys((prev) =>
      prev.includes(suggestionKey) ? prev : [...prev, suggestionKey]
    );
  }, []);

  const onTagRemove = React.useCallback((actionId: ComposerActionId) => {
    const draftId = draftIdRef.current;
    if (!draftId) return;

    setMenuExpanded(false);
    const appliedSuggestion = appliedRegexSuggestions[actionId as RegexManagedActionId];
    if (appliedSuggestion) {
      dismissSuggestion(appliedSuggestion.key);
      setAppliedRegexSuggestions((prev) => {
        const next = { ...prev };
        delete next[actionId as RegexManagedActionId];
        if (actionId === 'date') {
          delete next.time;
        }
        return next;
      });
    }
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== draftId) return task;

        switch (actionId) {
          case 'date':
            return {
              ...task,
              dueAt: 0,
              dueHasTime: false,
            };
          case 'time':
            if (!hasValidDueAt(task.dueAt)) return task;
            return {
              ...task,
              dueAt: alignDueAtToLocalDay(task.dueAt, {
                keepTime: false,
              }),
              dueHasTime: false,
            };
          case 'style':
            return {
              ...task,
              emoji: '📝',
              color: undefined,
            };
          case 'location':
            return {
              ...task,
              location: undefined,
            };
          case 'routine':
            return {
              ...task,
              isRoutine: false,
              routineType: undefined,
              routineInterval: undefined,
              routineWeekday: undefined,
              routineNthWeek: undefined,
              routineMonthDay: undefined,
              routineMonth: undefined,
            };
          case 'project':
            return {
              ...task,
              projectId: '',
            };
        }
      })
    );
  }, [appliedRegexSuggestions, dismissSuggestion, setTasks]);

  const appliedTitleCleanupSuggestions = React.useMemo(
    () =>
      Object.values(appliedRegexSuggestions).filter(
        (suggestion): suggestion is DetectedTaskTextSuggestion => Boolean(suggestion)
      ),
    [appliedRegexSuggestions]
  );


  const onCreate = React.useCallback(() => {
    setMenuExpanded(false);
    if (!hasTitle) {
      Alert.alert(t('taskCreate.titleMissingTitle'), t('taskCreate.titleMissingBody'));
      return;
    }
    if (requiresRoutineInterval && !hasRoutineInterval) {
      runAction('routine');
      return;
    }

    // Finalize
    isCreatedRef.current = true;
    const originalInput = trimmed;
    const cleanedTitleCandidate = stripTaskSuggestionText(originalInput, appliedTitleCleanupSuggestions);
    const finalTitle = cleanedTitleCandidate.length > 0 ? cleanedTitleCandidate : originalInput;
    const didStripFromTitle = finalTitle !== originalInput;

    const id = draftIdRef.current;
    let createdTaskId = id ?? '';

    if (id) {
      // Update existing draft
      setTasks((prev) => {
        const task = prev.find(t => t.id === id);
        if (!task) return prev; // Should not happen

        // Recalc section based on set due date?
        // The user might have set a due date via picker.
        // If so, we should respect it.

        // Logic:
        // If dueAt is set -> calculate section (today vs upcoming).
        // If not set -> upcoming.

        const dueAt = task.dueAt;
        let section: SectionId = 'upcoming';

        if (hasValidDueAt(dueAt)) {
          section = deriveActiveSectionFromDueAt(dueAt);
        }

        // Find min rank in target section
        const minRank = prev
          .filter((t) => !t.deletedAt && t.section === section && t.id !== id)
          .reduce<number | null>((acc, t) => (acc === null ? t.orderRank : Math.min(acc, t.orderRank)), null);
        const orderRank = (minRank ?? 1000) - 1000;

        return prev.map(t => t.id === id ? {
          ...t,
          title: finalTitle,
          notes: didStripFromTitle ? mergeOriginalInputIntoNotes(originalInput, t.notes) : t.notes,
          section,
          orderRank,
          deletedAt: undefined // Un-delete
        } : t);
      });
    } else {
      // No draft exists, create fresh
      const nextId = createTaskId();
      createdTaskId = nextId;
      const section: SectionId = 'upcoming';

      setTasks((prev) => {
        const minRank = prev
          .filter((t) => !t.deletedAt && t.section === section)
          .reduce<number | null>((acc, t) => (acc === null ? t.orderRank : Math.min(acc, t.orderRank)), null);
        const orderRank = (minRank ?? 1000) - 1000;

        return [
          {
            id: nextId,
            title: finalTitle,
            subtitle: undefined,
            emoji: '📝',
            projectId: initialProjectId,
            dueAt: 0,
            dueHasTime: false,
            isRoutine: shouldPresetRoutine ? true : undefined,
            section,
            orderRank,
            location: undefined,
            notes: didStripFromTitle ? originalInput : undefined,
            subtasks: undefined,
            completedAt: undefined,
            deletedAt: undefined,
          },
          ...prev,
        ];
      });
    }

    if (createdTaskId) {
      queueTaskPopIn(createdTaskId);
    }
    router.back();
  }, [
    appliedTitleCleanupSuggestions,
    hasRoutineInterval,
    hasTitle,
    initialProjectId,
    queueTaskPopIn,
    requiresRoutineInterval,
    router,
    runAction,
    setTasks,
    shouldPresetRoutine,
    trimmed,
  ]);

  const close = React.useCallback(() => {
    setMenuExpanded(false);
    router.back();
  }, [router]);

  const onBackdropPress = React.useCallback(() => {
    if (isMenuExpanded) {
      setMenuExpanded(false);
      return;
    }

    close();
  }, [close, isMenuExpanded]);

  const menuAnimatedStyle = React.useMemo(
    () => ({
      transform: [
        {
          translateY: menuProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [20, 0],
          }),
        },
        {
          scale: menuProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [0.96, 1],
          }),
        },
      ],
    }),
    [menuProgress]
  );

  const isDark = theme === 'dark';
  const glassApiAvailableFn = (ExpoGlassEffect as any).isGlassEffectAPIAvailable as
    | undefined
    | (() => boolean);
  const canUseNativeGlass =
    Platform.OS === 'ios' &&
    isLiquidGlassAvailable() &&
    (glassApiAvailableFn ? glassApiAvailableFn() : true);
  const accentColorValue = getAccentColorValue(accentColor);
  const plusTint = withAlpha(Colors[theme].background, isDark ? 0.20 : 0.26);
  const inputTint = withAlpha(Colors[theme].background, isDark ? 0.22 : 0.33);
  const menuTint = withAlpha(Colors[theme].background, isDark ? 0.24 : 0.38);
  const neutralFallback = withAlpha(Colors[theme].background, isDark ? 0.86 : 0.90);
  const expandedMenuFallback = withAlpha(Colors[theme].background, isDark ? 0.84 : 0.88);
  const sendTint = withAlpha(accentColorValue, isDark ? 0.88 : 0.78);
  const sendFallback = accentColorValue;
  const sendIconColor = 'white';
  const composerBottom = Math.max(14, insets.bottom - 16);
  const menuBottom = 66;

  return (
    <View style={styles.root}>
      <Pressable
        style={styles.backdrop}
        accessibilityRole="button"
        accessibilityLabel={t('taskCreate.close')}
        onPress={onBackdropPress}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? -10 : 0}
        style={styles.keyboard}
      >
        <View style={[styles.composerWrap, { paddingBottom: composerBottom }]} pointerEvents="box-none">
          {isMenuExpanded ? (
            <Animated.View
              pointerEvents="auto"
              style={[styles.expandedMenuWrap, { bottom: menuBottom }, menuAnimatedStyle]}
            >
              {canUseNativeGlass ? (
                <GlassView
                  key="actions-menu-native-glass"
                  style={styles.expandedMenuSurface}
                  glassEffectStyle="regular"
                  tintColor={menuTint}
                  isInteractive
                >
                  {actions.map((action) => (
                    <Pressable
                      key={action.id}
                      accessibilityRole="button"
                      accessibilityLabel={action.title}
                      onPress={() => onActionPress(action.id)}
                      style={({ pressed }) => [styles.expandedMenuItem, pressed && styles.expandedMenuItemPressed]}
                    >
                    {canUseNativeGlass ? (
                      <GlassView
                        style={styles.expandedMenuIconBubble}
                        glassEffectStyle="regular"
                        tintColor={isDark ? withAlpha('#0B1118', 0.86) : withAlpha('#FFFFFF', 0.88)}
                        isInteractive
                      >
                        <MaterialIcons
                          name={action.icon}
                          size={20}
                          color={isDark ? withAlpha(action.accentColor, 0.82) : action.accentColor}
                        />
                      </GlassView>
                    ) : (
                      <View
                        style={[
                          styles.expandedMenuIconBubble,
                          {
                            backgroundColor: isDark
                              ? withAlpha('#0B1118', 0.92)
                              : withAlpha('#FFFFFF', 0.88),
                          },
                        ]}
                      >
                        <MaterialIcons
                          name={action.icon}
                          size={20}
                          color={isDark ? withAlpha(action.accentColor, 0.82) : action.accentColor}
                        />
                      </View>
                    )}
                      <Text style={styles.expandedMenuLabel}>{action.title}</Text>
                    </Pressable>
                  ))}
                </GlassView>
              ) : (
                <View style={[styles.expandedMenuSurface, { backgroundColor: expandedMenuFallback }]}>
                  {actions.map((action) => (
                    <Pressable
                      key={action.id}
                      accessibilityRole="button"
                      accessibilityLabel={action.title}
                      onPress={() => onActionPress(action.id)}
                      style={({ pressed }) => [styles.expandedMenuItem, pressed && styles.expandedMenuItemPressed]}
                    >
                    <View
                      style={[
                        styles.expandedMenuIconBubble,
                        {
                          backgroundColor: isDark
                            ? withAlpha('#0B1118', 0.92)
                            : withAlpha('#FFFFFF', 0.88),
                        },
                      ]}
                    >
                      <MaterialIcons
                        name={action.icon}
                        size={20}
                        color={isDark ? withAlpha(action.accentColor, 0.82) : action.accentColor}
                      />
                    </View>
                      <Text style={styles.expandedMenuLabel}>{action.title}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </Animated.View>
          ) : null}

          {selectedTags.length > 0 ? (
            <View style={styles.selectedTagsWrap}>
              {selectedTags.map((tag) =>
                <Pressable
                  key={tag.key}
                  accessibilityRole="button"
                  accessibilityLabel={tag.label}
                  onPress={() => onTagPress(tag.actionId)}
                  style={({ pressed }) => [styles.selectedTagPressable, pressed && styles.selectedTagPressed]}
                >
                  {canUseNativeGlass ? (
                    <GlassView
                      style={styles.selectedTagChip}
                      glassEffectStyle="regular"
                      tintColor={withAlpha(tag.accentColor, isDark ? 0.22 : 0.12)}
                      isInteractive
                    >
                      <MaterialIcons name={tag.icon} size={14} color={tag.accentColor} />
                      <Text style={styles.selectedTagText} numberOfLines={1}>
                        {tag.label}
                      </Text>
                      {tag.removable ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${tag.label} entfernen`}
                          onPress={(event) => {
                            event.stopPropagation();
                            onTagRemove(tag.actionId);
                          }}
                          hitSlop={8}
                          style={({ pressed }) => [styles.selectedTagRemoveButton, pressed && styles.selectedTagPressed]}
                        >
                          <MaterialIcons
                            name="close"
                            size={12}
                            color={isDark ? 'rgba(255,255,255,0.86)' : 'rgba(28,28,30,0.72)'}
                          />
                        </Pressable>
                      ) : null}
                    </GlassView>
                  ) : (
                    <View
                      style={[
                        styles.selectedTagChip,
                        { backgroundColor: withAlpha(tag.accentColor, isDark ? 0.22 : 0.12) },
                      ]}
                    >
                      <MaterialIcons name={tag.icon} size={14} color={tag.accentColor} />
                      <Text style={styles.selectedTagText} numberOfLines={1}>
                        {tag.label}
                      </Text>
                      {tag.removable ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${tag.label} entfernen`}
                          onPress={(event) => {
                            event.stopPropagation();
                            onTagRemove(tag.actionId);
                          }}
                          hitSlop={8}
                          style={({ pressed }) => [styles.selectedTagRemoveButton, pressed && styles.selectedTagPressed]}
                        >
                          <MaterialIcons
                            name="close"
                            size={12}
                            color={isDark ? 'rgba(255,255,255,0.86)' : 'rgba(28,28,30,0.72)'}
                          />
                        </Pressable>
                      ) : null}
                    </View>
                  )}
                </Pressable>
              )}
            </View>
          ) : null}

          <View style={styles.composerStack}>
            <View pointerEvents="none" style={styles.composerShadowLayer} />
            <View style={styles.composer}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={isMenuExpanded ? t('taskCreate.close') : t('taskCreate.more')}
                  hitSlop={10}
                  onPress={() => {
                    setMenuExpanded((prev) => {
                      const next = !prev;
                      if (next) setTimeout(() => inputRef.current?.focus(), 0);
                      return next;
                    });
                  }}
                  style={({ pressed }) => [styles.controlPressable, pressed && styles.controlPressed]}
                >
                  {canUseNativeGlass ? (
                    <GlassView
                      key="plus-native-glass"
                      style={[styles.plusButton, isMenuExpanded && styles.plusButtonExpanded]}
                      glassEffectStyle="clear"
                      tintColor={plusTint}
                      isInteractive
                    >
                      <MaterialIcons
                        name={isMenuExpanded ? 'close' : 'add'}
                        size={22}
                        color={styles.plusIcon.color as string}
                      />
                    </GlassView>
                  ) : (
                    <GlassSurface
                      style={[styles.plusButton, isMenuExpanded && styles.plusButtonExpanded]}
                      glassEffectStyle="clear"
                      tintColor={plusTint}
                      fallbackBackgroundColor={neutralFallback}
                      isInteractive
                    >
                      <MaterialIcons
                        name={isMenuExpanded ? 'close' : 'add'}
                        size={22}
                        color={styles.plusIcon.color as string}
                      />
                    </GlassSurface>
                  )}
                </Pressable>

                {canUseNativeGlass ? (
                  <GlassView
                    key="input-native-glass"
                    style={styles.inputShell}
                    glassEffectStyle="regular"
                    tintColor={inputTint}
                    isInteractive
                  >
                    <TextInput
                      ref={(r) => {
                        inputRef.current = r;
                      }}
                      value={title}
                      onChangeText={(next) => {
                        if (isMenuExpanded) setMenuExpanded(false);
                        setTitle(next);
                      }}
                      placeholder={t('taskCreate.placeholder.title')}
                      placeholderTextColor={styles.placeholder.color as string}
                      returnKeyType="done"
                      autoCapitalize="sentences"
                      autoCorrect
                      onKeyPress={() => {
                        if (isMenuExpanded) setMenuExpanded(false);
                      }}
                      onFocus={() => setMenuExpanded(false)}
                      onSubmitEditing={onCreate}
                      style={styles.input}
                    />
                  </GlassView>
                ) : (
                  <GlassSurface
                    style={styles.inputShell}
                    glassEffectStyle="regular"
                    tintColor={inputTint}
                    fallbackBackgroundColor={neutralFallback}
                    isInteractive
                  >
                    <TextInput
                      ref={(r) => {
                        inputRef.current = r;
                      }}
                      value={title}
                      onChangeText={(next) => {
                        if (isMenuExpanded) setMenuExpanded(false);
                        setTitle(next);
                      }}
                      placeholder={t('taskCreate.placeholder.title')}
                      placeholderTextColor={styles.placeholder.color as string}
                      returnKeyType="done"
                      autoCapitalize="sentences"
                      autoCorrect
                      onKeyPress={() => {
                        if (isMenuExpanded) setMenuExpanded(false);
                      }}
                      onFocus={() => setMenuExpanded(false)}
                      onSubmitEditing={onCreate}
                      style={styles.input}
                    />
                  </GlassSurface>
                )}

                <Pressable
                  onPress={onCreate}
                  disabled={!canSubmit}
                  accessibilityRole="button"
                  accessibilityLabel={
                    canSubmit
                      ? t('taskCreate.accessibility.create')
                      : (!hasTitle ? t('taskCreate.accessibility.enterTitle') : t('taskCreate.accessibility.chooseInterval'))
                  }
                  hitSlop={10}
                  style={({ pressed }) => [styles.controlPressable, pressed && canSubmit && styles.controlPressed]}
                >
                  {canUseNativeGlass ? (
                    <GlassView
                      key={`send-native-glass-${canSubmit ? 'active' : 'disabled'}`}
                      style={styles.sendButton}
                      glassEffectStyle="regular"
                      tintColor={sendTint}
                      isInteractive
                    >
                      <MaterialIcons name="arrow-upward" size={18} color={sendIconColor} />
                    </GlassView>
                  ) : (
                    <GlassSurface
                      style={styles.sendButton}
                      glassEffectStyle="regular"
                      tintColor={sendTint}
                      fallbackBackgroundColor={sendFallback}
                      isInteractive
                    >
                      <MaterialIcons name="arrow-upward" size={18} color={sendIconColor} />
                    </GlassSurface>
                  )}
                </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const createStyles = (theme: keyof typeof Colors) => {
  const isDark = theme === 'dark';
  const text = Colors[theme].text;
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: isDark ? 'rgba(0,0,0,0.58)' : 'rgba(0,0,0,0.14)',
    },
    keyboard: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    composerWrap: {
      paddingHorizontal: 12,
      paddingTop: 12,
    },
    expandedMenuWrap: {
      position: 'absolute',
      left: 4,
      width: '63%',
      maxWidth: 300,
      zIndex: 8,
    },
    expandedMenuSurface: {
      borderRadius: 28,
      paddingHorizontal: 10,
      paddingVertical: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.30)',
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.48 : 0.26,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 16 },
    },
    expandedMenuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      minHeight: 56,
      borderRadius: 18,
      paddingHorizontal: 10,
    },
    expandedMenuItemPressed: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.62)',
    },
    expandedMenuIconBubble: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 0,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.26 : 0.12,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
    },
    expandedMenuLabel: {
      fontSize: 20,
      lineHeight: 26,
      fontWeight: '500',
      color: text,
    },
    selectedTagsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingLeft: 56,
      paddingRight: 56,
      marginBottom: 8,
    },
    selectedTagChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: '100%',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
      overflow: 'hidden',
    },
    selectedTagPressable: {
      maxWidth: '100%',
      borderRadius: 14,
    },
    selectedTagPressed: {
      opacity: 0.85,
    },
    selectedTagText: {
      flexShrink: 1,
      fontSize: 13,
      fontWeight: '600',
      color: text,
    },
    selectedTagRemoveButton: {
      width: 18,
      height: 18,
      borderRadius: 9,
      marginLeft: 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.68)',
    },
    composerStack: {
      width: '100%',
      position: 'relative',
    },
    composerShadowLayer: {
      position: 'absolute',
      left: 6,
      right: 6,
      top: 12,
      bottom: -8,
      borderRadius: 30,
      backgroundColor: isDark ? 'rgba(0,0,0,0.42)' : 'rgba(0,0,0,0.18)',
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.62 : 0.36,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: 16 },
    },
    composer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    controlPressable: {
      borderRadius: 22,
    },
    controlPressed: {
      transform: [{ scale: 0.98 }],
    },
    plusButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 0,
      borderColor: 'transparent',
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.42 : 0.24,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
    },
    plusButtonExpanded: {
      transform: [{ scale: 1.02 }],
    },
    plusIcon: {
      color: text,
    },
    inputShell: {
      flex: 1,
      minHeight: 44,
      borderRadius: 22,
      borderWidth: 0,
      borderColor: 'transparent',
      overflow: 'hidden',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.4 : 0.2,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
    },
    input: {
      minHeight: 44,
      maxHeight: 120,
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: 17,
      color: text,
    },
    placeholder: {
      color: isDark ? 'rgba(235,235,245,0.45)' : 'rgba(60,60,67,0.45)',
    },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 0,
      borderColor: 'transparent',
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.52 : 0.32,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
    },
    sendIcon: {
      color: 'white',
    },
  });
};
