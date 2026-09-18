import { useFocusEffect } from "expo-router";
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { NativeModules, Platform, StyleSheet, Text, View } from 'react-native';

import { TaskSwipeDraggableList } from '@/components/tasks/task-swipe-draggable-list';
import {
  createSharedTaskRowStyles,
  SPACING,
} from '@/components/tasks/task-row-style-tokens';
import { FloatingAddButton } from '@/components/ui/floating-add-button';
import { withAlpha } from '@/components/ui/glass-surface';
import { StreakAccentBackground } from '@/components/ui/streak-accent-background';
import { Colors } from '@/constants/theme';
import { useHomeFilters } from '@/context/home-filters-store';
import { useTaskCreateContext } from '@/context/task-create-context';
import {
  createRoutineCompletionTransition,
  type Task,
  useTasksStore,
} from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { t } from '@/i18n';
import { isIOS26OrNewer } from '@/utils/ios-version';

type TaskAccessoryContextBridge = {
  setContext?: (
    mode: 'task' | 'today' | 'routine' | 'project' | 'inProject',
    projectId?: string | null,
    projectLabel?: string | null,
    selectedDateStart?: number | null,
  ) => void;
};

function hasValidDueDate(task: Task) {
  // Robust gegen ältere/teilweise Daten (z.B. Persisted State), obwohl `Task.dueAt` im Typ required ist.
  const dueAt = (task as any).dueAt as unknown;
  return typeof dueAt === 'number' && Number.isFinite(dueAt) && dueAt > 0;
}

function isDueToday(task: Task, startOfDayMs: number, endOfDayMs: number) {
  if (!hasValidDueDate(task)) return false;
  return task.dueAt >= startOfDayMs && task.dueAt < endOfDayMs;
}

export default function TodayScreen() {
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const accessoryBridge = NativeModules
    .TaskAccessoryContextBridge as TaskAccessoryContextBridge | undefined;
  const { setMode, setPresetDateStart } = useTaskCreateContext();
  const showFloatingAddButton = Platform.OS === 'ios' && !isIOS26OrNewer();
  const params = useLocalSearchParams<{ withNotes?: string; withSubtasks?: string }>();
  const withNotesEnabled = params.withNotes === '1';

  const { enabledTags, showTagIcons, showProjectNames, showCompactSubtasks } = useHomeFilters();
  const withSubtasksEnabled =
    params.withSubtasks === undefined
      ? showCompactSubtasks
      : params.withSubtasks === '1';
  const { tasks, setTasks, projects } = useTasksStore();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const setTodayAccessoryContext = React.useCallback((dateStart: number) => {
    if (Platform.OS !== 'ios' || !isIOS26OrNewer()) return;
    const setContext = accessoryBridge?.setContext;
    if (!setContext) return;
    try {
      (setContext as any)('today', null, null, dateStart);
    } catch {
      setContext('today', null, null);
    }
  }, [accessoryBridge]);

  useFocusEffect(
    React.useCallback(() => {
      setMode('today');
      const now = new Date();
      const selectedDateStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0,
        0,
        0,
        0,
      ).getTime();
      setPresetDateStart(selectedDateStart);
      setTodayAccessoryContext(selectedDateStart);
      return undefined;
    }, [setMode, setPresetDateStart, setTodayAccessoryContext]),
  );

  const projectsById = React.useMemo(() => new Map(projects.map((p) => [p.id, p] as const)), [projects]);

  const { startOfDayMs, endOfDayMs } = React.useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { startOfDayMs: start.getTime(), endOfDayMs: end.getTime() };
  }, []);

  const todayTasks = React.useMemo(() => {
    const base = tasks.filter((t) => !t.deletedAt && t.section !== 'completed' && isDueToday(t, startOfDayMs, endOfDayMs));
    if (!withNotesEnabled) return base.sort((a, b) => a.orderRank - b.orderRank);
    return base
      .filter((t) => !!t.subtitle)
      .sort((a, b) => a.orderRank - b.orderRank);
  }, [endOfDayMs, startOfDayMs, tasks, withNotesEnabled]);

  const onPressTask = React.useCallback(
    (taskId: string) => {
      router.push({ pathname: '/task/[id]', params: { id: taskId } });
    },
    [router]
  );

  const toggleComplete = React.useCallback(
    (taskId: string) => {
      const now = Date.now();
      setTasks((prev) => {
        const task = prev.find((candidate) => candidate.id === taskId);
        if (!task) return prev;

        const routineTransition = createRoutineCompletionTransition(
          task,
          now,
          new Set(prev.map((candidate) => candidate.id)),
        );
        if (routineTransition && task.section !== 'completed') {
          const next = prev.map((candidate) =>
            candidate.id === taskId ? routineTransition.nextTask : candidate,
          );
          return [...next, routineTransition.completedTask];
        }

        return prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                section: 'completed',
                completedAt: now,
              }
            : t
        );
      });
    },
    [setTasks]
  );

  const deleteTask = React.useCallback(
    (taskId: string) => {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, deletedAt: Date.now() } : t)));
    },
    [setTasks]
  );

  const toggleSubtask = React.useCallback(
    (taskId: string, subtaskId: string) => {
      setTasks((prev) => {
        let changed = false;
        const next = prev.map((task) => {
          if (task.id !== taskId || !task.subtasks?.length) return task;

          let toggled = false;
          const subtasks = task.subtasks.map((subtask) => {
            if (subtask.id !== subtaskId) return subtask;
            toggled = true;
            return { ...subtask, done: !subtask.done };
          });

          if (!toggled) return task;
          changed = true;
          return { ...task, subtasks };
        });

        return changed ? next : prev;
      });
    },
    [setTasks]
  );

  const applyOrderFromListData = React.useCallback(
    (orderedTaskIds: string[]) => {
      const orderIndex = new Map(orderedTaskIds.map((id, i) => [id, i] as const));
      setTasks((prev) => {
        const maxRank = 1000;
        return prev.map((t) => {
          const i = orderIndex.get(t.id);
          if (i === undefined) return t;
          return { ...t, orderRank: (i + 1) * maxRank };
        });
      });
    },
    [setTasks]
  );

  const handleAddTask = React.useCallback(() => {
    router.push({ pathname: '/task/create-modal', params: { preset: 'today' } });
  }, [router]);

  return (
    <View style={styles.container}>
      <StreakAccentBackground isDark={theme === 'dark'} />
      <TaskSwipeDraggableList
        theme={theme}
        isDark={theme === 'dark'}
        tasks={todayTasks}
        projectsById={projectsById}
        rowStyles={styles}
        contentContainerStyle={styles.content}
        empty={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: Colors[theme].text }]}>{t('today.empty')}</Text>
          </View>
        }
        enabledTags={enabledTags}
        showTaskIcons={showTagIcons}
        showProjectNames={showProjectNames}
        showCompactSubtasks={withSubtasksEnabled}
        onPressTask={onPressTask}
        toggleComplete={toggleComplete}
        toggleSubtask={toggleSubtask}
        deleteTask={deleteTask}
        onReorder={applyOrderFromListData}
        containerStyle={{ backgroundColor: 'transparent' }}
      />

      {showFloatingAddButton ? <FloatingAddButton onPress={handleAddTask} /> : null}
    </View>
  );
}

const createStyles = (theme: keyof typeof Colors) => {
  const isDark = theme === 'dark';
  const text = Colors[theme].text;
  const rowSurface = Colors[theme].background;
  const hairline = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)';
  const rowDivider = isDark ? 'rgba(255,255,255,0.24)' : 'rgba(0,0,0,0.16)';
  const tagBg = withAlpha(text, isDark ? 0.10 : 0.08);
  const tagText = withAlpha(text, 0.78);
  const dangerBg = isDark ? 'rgba(255,69,58,0.18)' : 'rgba(255,59,48,0.14)';
  const dangerBorder = isDark ? 'rgba(255,69,58,0.32)' : 'rgba(255,59,48,0.26)';
  const rowMetaText = withAlpha(text, isDark ? 0.42 : 0.34);
  const sharedRowStyles = createSharedTaskRowStyles({
    textColor: text,
    rowSurface,
    rowDividerColor: rowDivider,
    rowMetaColor: rowMetaText,
    rowSubtitleColor: withAlpha(text, 0.62),
    hairlineColor: hairline,
    tagBackground: tagBg,
    tagTextColor: tagText,
    dangerBackground: dangerBg,
    dangerBorderColor: dangerBorder,
    rowMinHeight: 58,
    rowPaddingVertical: SPACING.xs,
    rowTitleFontSize: 16,
    rowTitleLineHeight: 21,
    rowMetaFontSize: 11,
    rowMetaLineHeight: 14,
    rowSubtitleFontSize: 13,
    rowSubtitleLineHeight: 17,
  });

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    content: {
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.xxs,
      paddingBottom: 160,
    },
    ...sharedRowStyles,

    empty: {
      alignItems: 'center',
      marginTop: SPACING.xs,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.sm,
      borderRadius: SPACING.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha(text, isDark ? 0.14 : 0.1),
      backgroundColor: withAlpha(text, isDark ? 0.06 : 0.03),
    },
    emptyText: {
      fontSize: 13,
      lineHeight: 17,
      fontWeight: '600',
      opacity: 0.6,
    },
  });
};
