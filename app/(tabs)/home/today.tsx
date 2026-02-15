import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { TaskSwipeDraggableList } from '@/components/tasks/task-swipe-draggable-list';
import { FloatingAddButton } from '@/components/ui/floating-add-button';
import { withAlpha } from '@/components/ui/glass-surface';
import { Colors } from '@/constants/theme';
import { useHomeFilters } from '@/context/home-filters-store';
import { type Task, useTasksStore } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { t } from '@/i18n';
import { isIOS26OrNewer } from '@/utils/ios-version';

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
  const showFloatingAddButton = Platform.OS === 'ios' && !isIOS26OrNewer();
  const params = useLocalSearchParams<{ withNotes?: string; withSubtasks?: string }>();
  const withNotesEnabled = params.withNotes === '1';

  const { enabledTags, showTagIcons, showCompactSubtasks } = useHomeFilters();
  const withSubtasksEnabled =
    params.withSubtasks === undefined
      ? showCompactSubtasks
      : params.withSubtasks === '1';
  const { tasks, setTasks, projects } = useTasksStore();
  const styles = React.useMemo(() => createStyles(theme), [theme]);

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
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                section: 'completed',
                completedAt: Date.now(),
              }
            : t
        )
      );
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
    router.push('/task/create-modal');
  }, [router]);

  return (
    <View style={styles.container}>
      <TaskSwipeDraggableList
        theme={theme}
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
        showCompactSubtasks={withSubtasksEnabled}
        onPressTask={onPressTask}
        toggleComplete={toggleComplete}
        toggleSubtask={toggleSubtask}
        deleteTask={deleteTask}
        onReorder={applyOrderFromListData}
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
  const rowMetaText = withAlpha(text, isDark ? 0.5 : 0.42);

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors[theme].background,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 184,
    },

    itemSpacer: {
      marginBottom: 0,
    },
    swipeClip: {
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: rowSurface,
    },
    underlay: {
      ...StyleSheet.absoluteFillObject,
    },
    actionSlot: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      justifyContent: 'center',
    },
    actionSlotLeft: {
      left: 0,
      alignItems: 'center',
    },
    actionSlotRight: {
      right: 0,
      alignItems: 'center',
    },
    actionSlotInner: {
      width: 40,
      height: 40,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },

    row: {
      minHeight: 66,
      borderRadius: 0,
      backgroundColor: rowSurface,
      justifyContent: 'center',
      paddingHorizontal: 8,
      paddingVertical: 11,
      gap: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: rowDivider,
    },
    rowInner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    emojiTile: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      marginTop: 1,
    },
    emojiText: {
      fontSize: 17,
    },
    textStack: {
      flex: 1,
      gap: 4,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    rowTitle: {
      flex: 1,
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '600',
      color: text,
      letterSpacing: -0.2,
    },
    rowMeta: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '600',
      color: rowMetaText,
      letterSpacing: 0.15,
    },
    rowSubtitle: {
      fontSize: 14,
      lineHeight: 19,
      fontWeight: '500',
      color: withAlpha(text, 0.72),
    },

    tagRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 2,
    },
    tagChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: '100%',
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hairline,
      backgroundColor: tagBg,
    },
    tagChipDanger: {
      backgroundColor: dangerBg,
      borderColor: dangerBorder,
    },
    tagChipText: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '600',
      color: tagText,
      maxWidth: 220,
    },

    dragRow: {
      borderRadius: 0,
      backgroundColor: rowSurface,
      borderWidth: 0,
      opacity: 1,
    },

    empty: {
      alignItems: 'center',
      paddingVertical: 22,
    },
    emptyText: {
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '600',
      opacity: 0.65,
    },
  });
};
