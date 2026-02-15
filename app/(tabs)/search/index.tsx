import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TaskSwipeDraggableList } from '@/components/tasks/task-swipe-draggable-list';
import { withAlpha } from '@/components/ui/glass-surface';
import { Colors } from '@/constants/theme';
import { useHomeFilters } from '@/context/home-filters-store';
import { useTasksStore } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { t } from '@/i18n';

export default function SearchIndex() {
  const router = useRouter();
  const { q, withSubtasks } = useLocalSearchParams<{ q?: string; withSubtasks?: string }>();
  const theme = useColorScheme() ?? 'light';
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  const { tasks, setTasks, projects } = useTasksStore();
  const { enabledTags, showTagIcons, showCompactSubtasks } = useHomeFilters();
  const withSubtasksEnabled =
    withSubtasks === undefined ? showCompactSubtasks : withSubtasks === '1';

  const projectsById = React.useMemo(() => new Map(projects.map((p) => [p.id, p] as const)), [projects]);

  const query = typeof q === 'string' ? q.trim().toLowerCase() : '';
  const results = React.useMemo(() => {
    if (!query) return [];
    return tasks
      .filter((t) => !t.deletedAt)
      .filter((t) => {
        const hay = `${t.title} ${t.subtitle ?? ''} ${t.notes ?? ''}`.toLowerCase();
        return hay.includes(query);
      })
      .slice(0, 50); // Increased limit slightly
  }, [query, tasks]);

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

  // No-op for search reordering
  const handleReorder = React.useCallback(() => { }, []);

  return (
    <TaskSwipeDraggableList
      theme={theme}
      tasks={results}
      projectsById={projectsById}
      rowStyles={styles}
      contentContainerStyle={styles.content}
      empty={
        <View style={styles.empty}>
          {!query ? (
            <Text style={[styles.emptyText, { color: Colors[theme].text }]}>
              {t('search.empty.hint')}
            </Text>
          ) : (
            <Text style={[styles.emptyText, { color: Colors[theme].text }]}>
              {t('search.empty.noResults', { query: q ?? '' })}
            </Text>
          )}
        </View>
      }
      enabledTags={enabledTags}
      showTaskIcons={showTagIcons}
      showCompactSubtasks={withSubtasksEnabled}
      onPressTask={onPressTask}
      toggleComplete={toggleComplete}
      toggleSubtask={toggleSubtask}
      deleteTask={deleteTask}
      onReorder={handleReorder}
      sortByOrderRank={false} // Don't enforce order rank sorting for search results
    />
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
    content: {
      paddingHorizontal: 16,
      paddingTop: 0,
      paddingBottom: 168,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    title: {
      fontSize: 16,
      fontWeight: '800',
      color: text,
    },
    subtitle: {
      fontSize: 13,
      fontWeight: '700',
      opacity: 0.7,
      color: text,
    },
    hintCard: {
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    hintTitle: {
      fontSize: 13,
      fontWeight: '800',
      marginBottom: 4,
    },
    hintText: {
      fontSize: 12,
      fontWeight: '600',
      lineHeight: 16,
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
      minHeight: 62,
      borderRadius: 0,
      backgroundColor: rowSurface,
      justifyContent: 'center',
      paddingHorizontal: 6,
      paddingVertical: 12,
      gap: 5,
      borderBottomWidth: 1,
      borderBottomColor: rowDivider,
    },
    rowInner: {
      flexDirection: 'row',
      alignItems: 'center',
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
    },
    emojiText: {
      fontSize: 17,
    },
    textStack: {
      flex: 1,
      gap: 5,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    rowTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: '600',
      color: text,
      letterSpacing: -0.15,
    },
    rowMeta: {
      fontSize: 14,
      fontWeight: '600',
      color: rowMetaText,
      letterSpacing: 0.2,
    },
    rowSubtitle: {
      fontSize: 14,
      color: text,
      opacity: 0.66,
    },

    tagRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 4,
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
      paddingVertical: 40,
    },
    emptyText: {
      fontSize: 15,
      fontWeight: '500',
      opacity: 0.5,
      textAlign: 'center',
    },
  });
};
