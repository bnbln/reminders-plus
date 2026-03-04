import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TaskSwipeDraggableList } from '@/components/tasks/task-swipe-draggable-list';
import { withAlpha } from '@/components/ui/glass-surface';
import { Colors } from '@/constants/theme';
import { useHomeFilters } from '@/context/home-filters-store';
import { type Task, useTasksStore } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { t } from '@/i18n';

const IOS_LIGHT_BASE_BACKGROUND = '#F2F2F7';
const IOS_LIGHT_ELEVATED_SURFACE = '#FFFFFF';
const HOME_TASK_ROW_SURFACE_LIGHT = IOS_LIGHT_ELEVATED_SURFACE;
const HOME_TASK_ROW_SURFACE_DARK = 'rgba(89, 89, 89, 0.2)';
const SEARCH_RESULT_LIMIT = 120;
const SEARCH_TASK_ITEM_SPACING = 8;

export default function SearchIndex() {
  const router = useRouter();
  const { q, withSubtasks } = useLocalSearchParams<{ q?: string; withSubtasks?: string }>();
  const theme = useColorScheme() ?? 'light';
  const isDark = theme === 'dark';
  const screenBackground = isDark ? Colors[theme].background : IOS_LIGHT_BASE_BACKGROUND;
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
      .slice(0, SEARCH_RESULT_LIMIT);
  }, [query, tasks]);

  const enabledTagsSeed = React.useMemo(
    () => Array.from(enabledTags).sort().join(','),
    [enabledTags]
  );
  const rowLayoutSeed = React.useMemo(
    () =>
      `${enabledTagsSeed}|icons:${showTagIcons ? 1 : 0}|subtasks:${withSubtasksEnabled ? 1 : 0}`,
    [enabledTagsSeed, showTagIcons, withSubtasksEnabled]
  );
  const keyForTask = React.useCallback(
    (task: Task) =>
      `task-${task.id}:${rowLayoutSeed}:${task.subtitle?.length ?? 0}:${task.subtasks?.length ?? 0}:${task.notes?.length ?? 0}:${task.dueAt}:${task.dueHasTime ? 1 : 0}:${task.completedAt ?? 0}:${task.color ?? ''}`,
    [rowLayoutSeed]
  );
  const listRenderKey = React.useMemo(
    () =>
      `search:${query || '__empty__'}:${rowLayoutSeed}:${results.map((task) => keyForTask(task)).join('|')}`,
    [keyForTask, query, results, rowLayoutSeed]
  );

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

  const isEmptyWithoutQuery = query.length === 0;

  return (
    <View style={styles.container}>
      <ScrollView
        key={listRenderKey}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <TaskSwipeDraggableList
          renderMode="static"
          animateDataLayoutChanges={false}
          theme={theme}
          isDark={theme === 'dark'}
          tasks={results}
          keyForTask={keyForTask}
          projectsById={projectsById}
          rowStyles={styles}
          itemSpacing={SEARCH_TASK_ITEM_SPACING}
          contentContainerStyle={styles.listContent}
          containerStyle={{ backgroundColor: screenBackground }}
          empty={
            <View style={styles.empty}>
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconWrap}>
                  <MaterialIcons
                    name={isEmptyWithoutQuery ? 'search' : 'search-off'}
                    size={26}
                    color={withAlpha(Colors[theme].text, isDark ? 0.8 : 0.72)}
                  />
                </View>
                <Text style={styles.emptyTitle}>
                  {isEmptyWithoutQuery
                    ? t('search.placeholder')
                    : t('search.empty.noResults', { query: q ?? '' })}
                </Text>
                <Text style={styles.emptyText}>{t('search.empty.hint')}</Text>
              </View>
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
          sortByOrderRank={false}
        />
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: keyof typeof Colors) => {
  const isDark = theme === 'dark';
  const useAppleLightPalette = !isDark && Platform.OS === 'ios';
  const text = Colors[theme].text;
  const rowCardSurface = isDark
    ? HOME_TASK_ROW_SURFACE_DARK
    : HOME_TASK_ROW_SURFACE_LIGHT;
  const heroCardBorder = isDark
    ? 'rgba(255,255,255,0.09)'
    : useAppleLightPalette
      ? 'rgba(60,60,67,0.18)'
      : 'rgba(17,24,28,0.09)';
  const rowMetaText = withAlpha(text, 0.48);
  const dangerBg = isDark ? 'rgba(255,69,58,0.18)' : 'rgba(255,59,48,0.14)';
  const dangerBorder = isDark ? 'rgba(255,69,58,0.32)' : 'rgba(255,59,48,0.26)';

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? Colors[theme].background : IOS_LIGHT_BASE_BACKGROUND,
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 184,
    },
    listContent: {
      paddingBottom: 0,
    },
    itemSpacer: {
      marginBottom: 0,
      width: '100%',
      alignSelf: 'stretch',
    },
    swipeClip: {
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: 'transparent',
      marginHorizontal: 0,
      minHeight: 52,
      width: '100%',
      alignSelf: 'stretch',
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
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'stretch',
    },
    row: {
      minHeight: 52,
      width: '100%',
      borderRadius: 12,
      backgroundColor: rowCardSurface,
      justifyContent: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: heroCardBorder,
    },
    dragRow: {
      borderRadius: 20,
      backgroundColor: rowCardSurface,
      borderWidth: 0,
      opacity: 1,
      overflow: 'visible',
      zIndex: 80,
      elevation: 28,
      shadowColor: '#000000',
      shadowOpacity: isDark ? 0.24 : 0.12,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
    },
    rowInner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    emojiTile: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderWidth: 0,
      marginTop: 0,
      backgroundColor: 'transparent',
    },
    emojiText: {
      fontSize: 24,
    },
    textStack: {
      flex: 1,
      gap: 2,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    rowTitle: {
      flex: 1,
      fontSize: 16,
      lineHeight: 20,
      fontWeight: '700',
      color: text,
      letterSpacing: -0.2,
    },
    rowMeta: {
      fontSize: 10,
      lineHeight: 14,
      fontWeight: '600',
      color: rowMetaText,
      letterSpacing: 0.1,
    },
    rowSubtitle: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500',
      color: withAlpha(text, 0.32),
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
      gap: 3,
      maxWidth: '100%',
      paddingVertical: 2,
      paddingHorizontal: 8,
      borderRadius: 999,
      borderWidth: 0,
      backgroundColor: isDark
        ? 'rgba(255,255,255,0.12)'
        : useAppleLightPalette
          ? IOS_LIGHT_BASE_BACKGROUND
          : 'rgba(255,255,255,0.85)',
    },
    tagChipDanger: {
      backgroundColor: dangerBg,
      borderColor: dangerBorder,
    },
    tagChipText: {
      fontSize: 10,
      lineHeight: 14,
      fontWeight: '700',
      letterSpacing: 0.2,
      textTransform: 'uppercase',
      color: isDark ? withAlpha(text, 0.7) : withAlpha(text, 0.5),
      maxWidth: 220,
    },
    empty: {
      minHeight: 340,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 24,
    },
    emptyCard: {
      width: '100%',
      borderRadius: 20,
      paddingHorizontal: 20,
      paddingVertical: 24,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha(text, isDark ? 0.2 : 0.12),
      backgroundColor: withAlpha(text, isDark ? 0.07 : 0.04),
    },
    emptyIconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(text, isDark ? 0.12 : 0.08),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha(text, isDark ? 0.22 : 0.12),
    },
    emptyTitle: {
      fontSize: 16,
      lineHeight: 20,
      fontWeight: '700',
      textAlign: 'center',
      color: text,
    },
    emptyText: {
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '600',
      color: withAlpha(text, isDark ? 0.58 : 0.52),
      textAlign: 'center',
    },
  });
};
