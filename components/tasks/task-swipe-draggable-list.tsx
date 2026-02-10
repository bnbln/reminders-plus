import * as Haptics from 'expo-haptics';
import { useIsFocused } from '@react-navigation/native';
import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import DraggableFlatList, {
  NestableDraggableFlatList,
  NestableScrollContainer,
  RenderItemParams,
} from 'react-native-draggable-flatlist';

import type { SwipeTaskRowStyles } from '@/components/tasks/swipe-task-row';
import { SwipeTaskRow } from '@/components/tasks/swipe-task-row';
import { withAlpha } from '@/components/ui/glass-surface';
import { Colors } from '@/constants/theme';
import type { TagId } from '@/context/home-filters-store';
import { useTaskCreateContext } from '@/context/task-create-context';
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
  itemSpacing?: number;
  /**
   * Optional scroll ref for coordinating gestures with an outer scroll container.
   */
  scrollRef?: React.RefObject<any>;
  /**
   * Rendering mode for the list.
   * - `auto` (default): DraggableFlatList on most platforms, ScrollView on iOS 26+.
   * - `static`: Render list content only; caller owns the scroll container.
   * - `nestable`: Render a NestableDraggableFlatList for use inside a NestableScrollContainer.
   */
  renderMode?: 'auto' | 'static' | 'nestable';

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
  onSwipeStateChange?: (isSwiping: boolean) => void;
  onRowTouchStateChange?: (isTouchingRow: boolean) => void;
  /**
   * Horizontal outer board offset used to compensate active drag X while board auto-scrolls.
   * Only used together with `dragAxisMode="free"`.
   */
  crossAxisExternalOffset?: SharedValue<number>;
  /**
   * Drag axis behavior:
   * - `vertical` (default): classic sortable list drag.
   * - `free`: keep vertical reorder, but let the active item follow finger on X too.
   */
  dragAxisMode?: "vertical" | "free";

  header?: React.ReactElement | null;
  footer?: React.ReactElement | null;
  empty?: React.ReactElement | null;

  enabledTags?: Set<TagId>;
  showTaskIcons?: boolean;
  showCompactSubtasks?: boolean;

  onPressTask: (taskId: string) => void;
  toggleComplete: (taskId: string) => void;
  toggleSubtask?: (taskId: string, subtaskId: string) => void;
  deleteTask: (taskId: string) => void;

  onReorder?: (orderedTaskIds: string[]) => void;
  onReorderData?: (data: TaskSwipeDraggableListItem[]) => void;
  onDragBeginTask?: (taskId: string) => void;
  onDragEndMeta?: (params: {
    data: TaskSwipeDraggableListItem[];
    from: number;
    to: number;
  }) => void;
  onDragTouchPoint?: (params: {
    absoluteX: number;
    absoluteY: number;
    translationX: number;
    translationY: number;
  }) => void;

  keyForTask?: (task: Task) => string;
  sortByOrderRank?: boolean;
};

export const TaskSwipeDraggableList = React.forwardRef<TaskSwipeDraggableListHandle, TaskSwipeDraggableListProps>(function TaskSwipeDraggableList(
{
  theme,
  tasks,
  projectsById,
  rowStyles,
  itemSpacing,
  scrollRef,
  renderMode = 'auto',
  data,
  renderHeaderRow,
  contentContainerStyle,
  containerStyle,
  contentInsetAdjustmentBehavior,
  onScrollOffsetChange,
  onDragStateChange,
  onSwipeStateChange,
  onRowTouchStateChange,
  crossAxisExternalOffset,
  dragAxisMode = "vertical",
  header,
  footer,
  empty,
  enabledTags,
  showTaskIcons,
  showCompactSubtasks = false,
  onPressTask,
  toggleComplete,
  toggleSubtask,
  deleteTask,
  onReorder,
  onReorderData,
  onDragBeginTask,
  onDragEndMeta,
  onDragTouchPoint,
  keyForTask,
  sortByOrderRank,
},
ref
) {
  const isDark = theme === 'dark';
  const isFocused = useIsFocused();
  const { popInTaskIds, consumeTaskPopIn } = useTaskCreateContext();

  const emojiTint = React.useMemo(() => withAlpha(Colors[theme].background, isDark ? 0.12 : 0.22), [isDark, theme]);
  const emojiFallback = React.useMemo(
    () => withAlpha(Colors[theme].background, isDark ? 0.52 : 0.74),
    [isDark, theme]
  );

  const swipeCompleteBg = React.useMemo(() => (isDark ? '#30D158' : '#34C759'), [isDark]);
  const swipeDeleteBg = React.useMemo(() => (isDark ? '#FF453A' : '#FF3B30'), [isDark]);

  const enabledTagsResolved = React.useMemo(() => enabledTags ?? new Set<TagId>(), [enabledTags]);
  const showTaskIconsResolved = React.useMemo(() => showTaskIcons ?? true, [showTaskIcons]);
  const popInTaskIdSet = React.useMemo(() => new Set(popInTaskIds), [popInTaskIds]);

  const isDraggingRef = React.useRef(false);
  const placeholderIndexRef = React.useRef<number>(-1);
  const openSwipeIdRef = React.useRef<string | null>(null);
  const closeByIdRef = React.useRef(new Map<string, () => void>());
  const swipingTaskIdsRef = React.useRef(new Set<string>());
  const touchingTaskIdsRef = React.useRef(new Set<string>());
  const internalScrollRef = React.useRef<any>(null);

  const registerClose = React.useCallback((taskId: string, close: () => void) => {
    closeByIdRef.current.set(taskId, close);
  }, []);

  const unregisterClose = React.useCallback((taskId: string) => {
    closeByIdRef.current.delete(taskId);
    if (openSwipeIdRef.current === taskId) openSwipeIdRef.current = null;
    const hadAnyBefore = swipingTaskIdsRef.current.size > 0;
    swipingTaskIdsRef.current.delete(taskId);
    if (hadAnyBefore && swipingTaskIdsRef.current.size === 0) onSwipeStateChange?.(false);
    const hadTouchingBefore = touchingTaskIdsRef.current.size > 0;
    touchingTaskIdsRef.current.delete(taskId);
    if (hadTouchingBefore && touchingTaskIdsRef.current.size === 0) {
      onRowTouchStateChange?.(false);
    }
  }, [onRowTouchStateChange, onSwipeStateChange]);

  const reportSwipeGestureActive = React.useCallback(
    (taskId: string, isActive: boolean) => {
      const wasActive = swipingTaskIdsRef.current.size > 0;
      if (isActive) {
        swipingTaskIdsRef.current.add(taskId);
      } else {
        swipingTaskIdsRef.current.delete(taskId);
      }
      const isNowActive = swipingTaskIdsRef.current.size > 0;
      if (wasActive !== isNowActive) onSwipeStateChange?.(isNowActive);
    },
    [onSwipeStateChange]
  );

  const reportRowTouchInteraction = React.useCallback(
    (taskId: string, isTouching: boolean) => {
      const wasTouchingAny = touchingTaskIdsRef.current.size > 0;
      if (isTouching) {
        touchingTaskIdsRef.current.add(taskId);
      } else {
        touchingTaskIdsRef.current.delete(taskId);
      }
      const isTouchingAny = touchingTaskIdsRef.current.size > 0;
      if (wasTouchingAny !== isTouchingAny) onRowTouchStateChange?.(isTouchingAny);
    },
    [onRowTouchStateChange]
  );

  React.useEffect(() => {
    const swipingTaskIds = swipingTaskIdsRef.current;
    const touchingTaskIds = touchingTaskIdsRef.current;
    return () => {
      if (swipingTaskIds.size > 0) onSwipeStateChange?.(false);
      if (touchingTaskIds.size > 0) onRowTouchStateChange?.(false);
    };
  }, [onRowTouchStateChange, onSwipeStateChange]);

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

  const handlePopInAnimationEnd = React.useCallback(
    (taskId: string) => {
      consumeTaskPopIn(taskId);
    },
    [consumeTaskPopIn]
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

  // Native tab-bar minimize-on-scroll currently tracks ScrollView reliably on iOS 26,
  // but not DraggableFlatList. Keep a ScrollView path for iOS 26 to preserve native minimize behavior.
  const useScrollViewCompatibilityMode = isIOS26OrNewer();
  const rowScrollGestureRef = React.useMemo(() => {
    if (scrollRef) return scrollRef;
    if (useScrollViewCompatibilityMode) return internalScrollRef;
    return undefined;
  }, [scrollRef, useScrollViewCompatibilityMode]);
  const simultaneousHandlers = React.useMemo(() => {
    if (scrollRef) return scrollRef;
    if (useScrollViewCompatibilityMode) return internalScrollRef;
    return undefined;
  }, [scrollRef, useScrollViewCompatibilityMode]);
  const usesNestedScrollGestures = renderMode === 'nestable' || useScrollViewCompatibilityMode;
  const listActivationDistance = usesNestedScrollGestures ? 22 : 12;
  const allowCrossAxisDrag = dragAxisMode === "free";
  const resolvedContainerStyle: StyleProp<ViewStyle> = React.useMemo(() => {
    return [{ flex: 1, backgroundColor: Colors[theme].background, overflow: 'visible' }, containerStyle];
  }, [containerStyle, theme]);

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
          itemSpacing={itemSpacing}
          emojiTint={emojiTint}
          emojiFallback={emojiFallback}
          swipeCompleteBg={swipeCompleteBg}
          swipeDeleteBg={swipeDeleteBg}
          enabledTags={enabledTagsResolved}
          showTaskIcons={showTaskIconsResolved}
          showCompactSubtasks={showCompactSubtasks}
          beginSwipe={beginSwipe}
          endSwipe={endSwipe}
          registerClose={registerClose}
          unregisterClose={unregisterClose}
          closeAnyOpen={closeAnyOpen}
          onPressTask={handlePressTask}
          toggleComplete={toggleComplete}
          toggleSubtask={toggleSubtask}
          deleteTask={deleteTask}
          externalScrollRef={rowScrollGestureRef}
          onSwipeGestureActiveChange={reportSwipeGestureActive}
          onTouchInteractionChange={reportRowTouchInteraction}
          shouldPopIn={isFocused && popInTaskIdSet.has(task.id)}
          onPopInAnimationEnd={handlePopInAnimationEnd}
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
      handlePressTask,
      handlePopInAnimationEnd,
      isFocused,
      itemSpacing,
      popInTaskIdSet,
      rowScrollGestureRef,
      renderHeaderRow,
      projectsById,
      rowStyles,
      registerClose,
      showTaskIconsResolved,
      showCompactSubtasks,
      swipeCompleteBg,
      swipeDeleteBg,
      tasksById,
      toggleComplete,
      toggleSubtask,
      unregisterClose,
      reportSwipeGestureActive,
      reportRowTouchInteraction,
    ]
  );

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
          itemSpacing={itemSpacing}
          emojiTint={emojiTint}
          emojiFallback={emojiFallback}
          swipeCompleteBg={swipeCompleteBg}
          swipeDeleteBg={swipeDeleteBg}
          enabledTags={enabledTagsResolved}
          showTaskIcons={showTaskIconsResolved}
          showCompactSubtasks={showCompactSubtasks}
          beginSwipe={beginSwipe}
          endSwipe={endSwipe}
          registerClose={registerClose}
          unregisterClose={unregisterClose}
          closeAnyOpen={closeAnyOpen}
          onPressTask={handlePressTask}
          toggleComplete={toggleComplete}
          toggleSubtask={toggleSubtask}
          deleteTask={deleteTask}
          externalScrollRef={rowScrollGestureRef}
          onSwipeGestureActiveChange={reportSwipeGestureActive}
          onTouchInteractionChange={reportRowTouchInteraction}
          shouldPopIn={isFocused && popInTaskIdSet.has(task.id)}
          onPopInAnimationEnd={handlePopInAnimationEnd}
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
      handlePressTask,
      handlePopInAnimationEnd,
      isFocused,
      itemSpacing,
      popInTaskIdSet,
      projectsById,
      registerClose,
      rowScrollGestureRef,
      renderHeaderRow,
      rowStyles,
      showTaskIconsResolved,
      showCompactSubtasks,
      swipeCompleteBg,
      swipeDeleteBg,
      tasksById,
      toggleComplete,
      toggleSubtask,
      unregisterClose,
      reportSwipeGestureActive,
      reportRowTouchInteraction,
    ]
  );

  const renderListContent = React.useCallback(() => {
    return (
      <>
        {header ?? null}

        {flatListData.length === 0 ? (
          empty ?? null
        ) : (
          flatListData.map((item) => <React.Fragment key={item.key}>{renderCompatItem(item)}</React.Fragment>)
        )}

        {footer ?? null}
      </>
    );
  }, [empty, flatListData, footer, header, renderCompatItem]);

  const dragListProps = {
    data: flatListData,
    keyExtractor: (item: TaskSwipeDraggableListItem) => item.key,
    renderItem,
    style: { overflow: 'visible' as const },
    ListHeaderComponent: header ?? null,
    ListFooterComponent: footer ?? null,
    ListEmptyComponent: empty ?? null,
    contentContainerStyle,
    simultaneousHandlers,
    activationDistance: listActivationDistance,
    autoscrollSpeed: 22,
    animationConfig: {
      damping: 32,
      stiffness: 420,
      mass: 0.22,
      overshootClamping: true,
    },
    dragItemOverflow: true,
    onDragBegin: (fromIndex: number) => {
      isDraggingRef.current = true;
      onDragStateChange?.(true);
      placeholderIndexRef.current = fromIndex;
      closeAnyOpen();
      setFlatListData(resolvedData);
      const sourceItem = resolvedData[fromIndex];
      if (sourceItem?.kind === 'task') {
        onDragBeginTask?.(sourceItem.taskId);
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    },
    onPlaceholderIndexChange: (index: number) => {
      placeholderIndexRef.current = index;
    },
    onRelease: (fromIndex: number) => {
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
    },
    onDragEnd: ({ data, from, to }: { data: TaskSwipeDraggableListItem[]; from: number; to: number }) => {
      setFlatListData(data);
      isDraggingRef.current = false;
      onDragStateChange?.(false);
      onReorderData?.(data);
      onDragEndMeta?.({ data, from, to });
      onReorder?.(data.filter((d) => d.kind === 'task').map((d) => d.taskId));
    },
    onDragTouchPoint,
    allowCrossAxisDrag,
    crossAxisExternalOffset,
  };

  if (renderMode === 'static') {
    return renderListContent();
  }

  if (renderMode === 'nestable') {
    return (
      <NestableDraggableFlatList
        {...dragListProps}
        style={[{ flex: 1, overflow: 'visible' }, containerStyle]}
      />
    );
  }

  if (useScrollViewCompatibilityMode) {
    return (
      <View style={resolvedContainerStyle}>
        <NestableScrollContainer
          ref={internalScrollRef}
          style={{ flex: 1, overflow: "visible" }}
          contentInsetAdjustmentBehavior={contentInsetAdjustmentBehavior ?? 'automatic'}
          alwaysBounceVertical
          showsVerticalScrollIndicator={false}
        >
          <NestableDraggableFlatList {...dragListProps} />
        </NestableScrollContainer>
      </View>
    );
  }

  return (
    <DraggableFlatList
      {...dragListProps}
      style={{ flex: 1, overflow: "visible" }}
      containerStyle={resolvedContainerStyle}
      contentContainerStyle={contentContainerStyle}
      contentInsetAdjustmentBehavior={contentInsetAdjustmentBehavior ?? 'automatic'}
      onScrollOffsetChange={onScrollOffsetChange}
      showsVerticalScrollIndicator={false}
      activationDistance={listActivationDistance}
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
        const sourceItem = resolvedData[fromIndex];
        if (sourceItem?.kind === 'task') {
          onDragBeginTask?.(sourceItem.taskId);
        }
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
      onDragEnd={({ data, from, to }) => {
        setFlatListData(data);
        isDraggingRef.current = false;
        onDragStateChange?.(false);
        onReorderData?.(data);
        onDragEndMeta?.({ data, from, to });
        onReorder?.(data.filter((d) => d.kind === 'task').map((d) => d.taskId));
      }}
    />
  );
});
