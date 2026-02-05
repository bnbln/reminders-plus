import * as Haptics from 'expo-haptics';
import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { ScrollView, View } from 'react-native';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';

import type { SwipeTaskRowStyles } from '@/components/tasks/swipe-task-row';
import { SwipeTaskRow } from '@/components/tasks/swipe-task-row';
import { withAlpha } from '@/components/ui/glass-surface';
import { Colors } from '@/constants/theme';
import type { TagId } from '@/context/home-filters-store';
import type { Project, Task } from '@/context/tasks-store';
import { isIOS26OrNewer } from '@/utils/ios-version';

type ThemeName = keyof typeof Colors;

export type TaskSwipeDraggableListItem =
  | { kind: 'task'; key: string; taskId: string }
  | { kind: 'header'; key: string; sectionId: string };

export type TaskSwipeDraggableListHandle = {
  closeAnyOpen: () => void;
};

export type TaskSwipeDraggableListProps = {
  theme: ThemeName;
  tasks: Task[];
  projectsById?: Map<string, Project>;
  rowStyles: SwipeTaskRowStyles;

  /**
   * Optional custom list data.
   * - `task` items render `SwipeTaskRow`.
   * - `header` items render via `renderHeaderRow`.
   */
  data?: TaskSwipeDraggableListItem[];
  renderHeaderRow?: (sectionId: string) => React.ReactElement | null;

  contentContainerStyle?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  contentInsetAdjustmentBehavior?: 'automatic' | 'never';

  /**
   * `react-native-draggable-flatlist` exposes scroll via `onScrollOffsetChange` (number), not `onScroll`.
   */
  onScrollOffsetChange?: (scrollOffset: number) => void;

  /**
   * Reports drag state changes so callers can avoid treating drag as scroll.
   */
  onDragStateChange?: (isDragging: boolean) => void;

  header?: React.ReactElement | null;
  footer?: React.ReactElement | null;
  empty?: React.ReactElement | null;

  enabledTags?: Set<TagId>;
  showTaskIcons?: boolean;

  onPressTask: (taskId: string) => void;
  toggleComplete: (taskId: string) => void;
  deleteTask: (taskId: string) => void;

  onReorder?: (orderedTaskIds: string[]) => void;
  onReorderData?: (data: TaskSwipeDraggableListItem[]) => void;

  keyForTask?: (task: Task) => string;
  sortByOrderRank?: boolean;
};

export const TaskSwipeDraggableList = React.forwardRef<TaskSwipeDraggableListHandle, TaskSwipeDraggableListProps>(function TaskSwipeDraggableList(
{
  theme,
  tasks,
  projectsById,
  rowStyles,
  data,
  renderHeaderRow,
  contentContainerStyle,
  containerStyle,
  contentInsetAdjustmentBehavior,
  onScrollOffsetChange,
  onDragStateChange,
  header,
  footer,
  empty,
  enabledTags,
  showTaskIcons,
  onPressTask,
  toggleComplete,
  deleteTask,
  onReorder,
  onReorderData,
  keyForTask,
  sortByOrderRank,
},
ref
) {
  const isDark = theme === 'dark';

  const glassDragTint = React.useMemo(() => withAlpha(Colors[theme].background, isDark ? 0.18 : 0.28), [isDark, theme]);
  const glassDragFallback = React.useMemo(
    () => withAlpha(Colors[theme].background, isDark ? 0.86 : 0.92),
    [isDark, theme]
  );

  const emojiTint = React.useMemo(() => withAlpha(Colors[theme].background, isDark ? 0.12 : 0.22), [isDark, theme]);
  const emojiFallback = React.useMemo(
    () => withAlpha(Colors[theme].background, isDark ? 0.52 : 0.74),
    [isDark, theme]
  );

  const swipeCompleteBg = React.useMemo(() => (isDark ? '#30D158' : '#34C759'), [isDark]);
  const swipeDeleteBg = React.useMemo(() => (isDark ? '#FF453A' : '#FF3B30'), [isDark]);

  const enabledTagsResolved = React.useMemo(() => enabledTags ?? new Set<TagId>(), [enabledTags]);
  const showTaskIconsResolved = React.useMemo(() => showTaskIcons ?? true, [showTaskIcons]);

  const isDraggingRef = React.useRef(false);
  const placeholderIndexRef = React.useRef<number>(-1);
  const openSwipeIdRef = React.useRef<string | null>(null);
  const closeByIdRef = React.useRef(new Map<string, () => void>());

  const registerClose = React.useCallback((taskId: string, close: () => void) => {
    closeByIdRef.current.set(taskId, close);
  }, []);

  const unregisterClose = React.useCallback((taskId: string) => {
    closeByIdRef.current.delete(taskId);
    if (openSwipeIdRef.current === taskId) openSwipeIdRef.current = null;
  }, []);

  const closeAnyOpen = React.useCallback(() => {
    const openId = openSwipeIdRef.current;
    if (!openId) return;
    closeByIdRef.current.get(openId)?.();
    openSwipeIdRef.current = null;
  }, []);

  React.useImperativeHandle(
    ref,
    () => ({
      closeAnyOpen,
    }),
    [closeAnyOpen]
  );

  const handlePressTask = React.useCallback(
    (taskId: string) => {
      // First tap closes swipe if anything is open.
      if (openSwipeIdRef.current) {
        closeAnyOpen();
        return;
      }
      onPressTask(taskId);
    },
    [closeAnyOpen, onPressTask]
  );

  const beginSwipe = React.useCallback((taskId: string) => {
    for (const [id, close] of closeByIdRef.current.entries()) {
      if (id !== taskId) close();
    }
    openSwipeIdRef.current = taskId;
  }, []);

  const endSwipe = React.useCallback((taskId: string) => {
    if (openSwipeIdRef.current === taskId) openSwipeIdRef.current = null;
  }, []);

  const tasksSorted = React.useMemo(() => {
    const base = [...tasks];
    if (sortByOrderRank ?? true) {
      base.sort((a, b) => (a.orderRank ?? 0) - (b.orderRank ?? 0));
    }
    return base;
  }, [sortByOrderRank, tasks]);

  const tasksById = React.useMemo(() => new Map(tasksSorted.map((t) => [t.id, t] as const)), [tasksSorted]);

  const listData = React.useMemo<TaskSwipeDraggableListItem[]>(() => {
    const makeKey = keyForTask ?? ((t: Task) => t.id);
    return tasksSorted.map((t) => ({ kind: 'task', key: makeKey(t), taskId: t.id }));
  }, [keyForTask, tasksSorted]);

  const resolvedData = data ?? listData;

  const [flatListData, setFlatListData] = React.useState<TaskSwipeDraggableListItem[]>(() => resolvedData);

  React.useEffect(() => {
    if (!isDraggingRef.current) setFlatListData(resolvedData);
  }, [resolvedData]);

  const renderItem = React.useCallback(
    ({ item, drag, isActive }: RenderItemParams<TaskSwipeDraggableListItem>) => {
      if (item.kind === 'header') {
        return renderHeaderRow ? renderHeaderRow(item.sectionId) : null;
      }

      const task = tasksById.get(item.taskId);
      if (!task) return null;

      return (
        <SwipeTaskRow
          task={task}
          project={projectsById?.get(task.projectId)}
          drag={drag}
          isActive={isActive}
          styles={rowStyles}
          glassDragTint={glassDragTint}
          glassDragFallback={glassDragFallback}
          emojiTint={emojiTint}
          emojiFallback={emojiFallback}
          swipeCompleteBg={swipeCompleteBg}
          swipeDeleteBg={swipeDeleteBg}
          enabledTags={enabledTagsResolved}
          showTaskIcons={showTaskIconsResolved}
          beginSwipe={beginSwipe}
          endSwipe={endSwipe}
          registerClose={registerClose}
          unregisterClose={unregisterClose}
          closeAnyOpen={closeAnyOpen}
          onPressTask={handlePressTask}
          toggleComplete={toggleComplete}
          deleteTask={deleteTask}
        />
      );
    },
    [
      beginSwipe,
      closeAnyOpen,
      deleteTask,
      enabledTagsResolved,
      emojiFallback,
      emojiTint,
      endSwipe,
      glassDragFallback,
      glassDragTint,
      handlePressTask,
      renderHeaderRow,
      projectsById,
      rowStyles,
      registerClose,
      showTaskIconsResolved,
      swipeCompleteBg,
      swipeDeleteBg,
      tasksById,
      toggleComplete,
      unregisterClose,
    ]
  );

  const resolvedContainerStyle: StyleProp<ViewStyle> = React.useMemo(() => {
    return [{ flex: 1, backgroundColor: Colors[theme].background }, containerStyle];
  }, [containerStyle, theme]);

  // Native tab-bar minimize-on-scroll currently tracks ScrollView reliably on iOS 26,
  // but not DraggableFlatList. Keep a ScrollView path for iOS 26 to preserve native minimize behavior.
  const useScrollViewCompatibilityMode = isIOS26OrNewer();

  const renderCompatItem = React.useCallback(
    (item: TaskSwipeDraggableListItem) => {
      if (item.kind === 'header') {
        return renderHeaderRow ? renderHeaderRow(item.sectionId) : null;
      }

      const task = tasksById.get(item.taskId);
      if (!task) return null;

      return (
        <SwipeTaskRow
          task={task}
          project={projectsById?.get(task.projectId)}
          drag={() => {}}
          isActive={false}
          styles={rowStyles}
          glassDragTint={glassDragTint}
          glassDragFallback={glassDragFallback}
          emojiTint={emojiTint}
          emojiFallback={emojiFallback}
          swipeCompleteBg={swipeCompleteBg}
          swipeDeleteBg={swipeDeleteBg}
          enabledTags={enabledTagsResolved}
          showTaskIcons={showTaskIconsResolved}
          beginSwipe={beginSwipe}
          endSwipe={endSwipe}
          registerClose={registerClose}
          unregisterClose={unregisterClose}
          closeAnyOpen={closeAnyOpen}
          onPressTask={handlePressTask}
          toggleComplete={toggleComplete}
          deleteTask={deleteTask}
        />
      );
    },
    [
      beginSwipe,
      closeAnyOpen,
      deleteTask,
      enabledTagsResolved,
      emojiFallback,
      emojiTint,
      endSwipe,
      glassDragFallback,
      glassDragTint,
      handlePressTask,
      projectsById,
      registerClose,
      renderHeaderRow,
      rowStyles,
      showTaskIconsResolved,
      swipeCompleteBg,
      swipeDeleteBg,
      tasksById,
      toggleComplete,
      unregisterClose,
    ]
  );

  if (useScrollViewCompatibilityMode) {
    return (
      <View style={resolvedContainerStyle}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={contentContainerStyle}
          contentInsetAdjustmentBehavior={contentInsetAdjustmentBehavior ?? 'automatic'}
          alwaysBounceVertical
          onScroll={(event) => {
            onScrollOffsetChange?.(event.nativeEvent.contentOffset.y);
          }}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          {header ?? null}

          {flatListData.length === 0 ? (
            empty ?? null
          ) : (
            flatListData.map((item) => <React.Fragment key={item.key}>{renderCompatItem(item)}</React.Fragment>)
          )}

          {footer ?? null}
        </ScrollView>
      </View>
    );
  }

  return (
    <DraggableFlatList
      data={flatListData}
      keyExtractor={(item) => item.key}
      renderItem={renderItem}
      ListHeaderComponent={header ?? null}
      ListFooterComponent={footer ?? null}
      ListEmptyComponent={empty ?? null}
      style={{ flex: 1 }}
      containerStyle={resolvedContainerStyle}
      contentContainerStyle={contentContainerStyle}
      contentInsetAdjustmentBehavior={contentInsetAdjustmentBehavior ?? 'automatic'}
      onScrollOffsetChange={onScrollOffsetChange}
      showsVerticalScrollIndicator={false}
      activationDistance={12}
      autoscrollSpeed={22}
      animationConfig={{
        damping: 32,
        stiffness: 420,
        mass: 0.22,
        overshootClamping: true,
      }}
      dragItemOverflow
      onDragBegin={(fromIndex) => {
        isDraggingRef.current = true;
        onDragStateChange?.(true);
        placeholderIndexRef.current = fromIndex;
        closeAnyOpen();
        setFlatListData(resolvedData);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      }}
      onPlaceholderIndexChange={(index) => {
        placeholderIndexRef.current = index;
      }}
      onRelease={(fromIndex) => {
        const toIndex = placeholderIndexRef.current;
        if (toIndex >= 0 && fromIndex >= 0 && toIndex !== fromIndex) {
          setFlatListData((prev) => {
            if (fromIndex >= prev.length || toIndex >= prev.length) return prev;
            const next = [...prev];
            const [moved] = next.splice(fromIndex, 1);
            if (!moved) return prev;
            next.splice(toIndex, 0, moved);
            return next;
          });
        }
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      }}
      onDragEnd={({ data }) => {
        setFlatListData(data);
        isDraggingRef.current = false;
        onDragStateChange?.(false);
        onReorderData?.(data);
        onReorder?.(data.filter((d) => d.kind === 'task').map((d) => d.taskId));
      }}
    />
  );
});
