import * as Haptics from 'expo-haptics';
import React from 'react';
import {
  Animated,
  LayoutAnimation,
  LayoutChangeEvent,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle
} from "react-native";
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';

import type { SwipeTaskRowStyles } from '@/components/tasks/swipe-task-row';
import { SwipeTaskRow } from '@/components/tasks/swipe-task-row';
import { withAlpha } from '@/components/ui/glass-surface';
import { Colors } from '@/constants/theme';
import type { TagId } from '@/context/home-filters-store';
import { useAppSettings } from '@/context/settings-store';
import type { Project, Task } from '@/context/tasks-store';
import { triggerImpactHaptic } from '@/utils/haptics';

type ThemeName = keyof typeof Colors;
const LIST_ACTIVATION_DISTANCE_DEFAULT = 0;
const LIST_AUTOSCROLL_SPEED = 58;
const LIST_ANIMATION_CONFIG = {
  damping: 26,
  stiffness: 300,
  mass: 0.28,
  overshootClamping: true,
} as const;

export type TaskSwipeDraggableListItem =
  | { kind: 'task'; key: string; taskId: string }
  | { kind: 'header'; key: string; sectionId: string };

export type TaskDragGestureUpdateParams = {
  phase: "begin" | "update" | "end";
  absoluteX: number;
  absoluteY: number;
  translationX: number;
  translationY: number;
};

export type TaskSwipeDraggableListHandle = {
  closeAnyOpen: () => void;
};

const areListItemsEqual = (
  current: TaskSwipeDraggableListItem[],
  next: TaskSwipeDraggableListItem[],
) => {
  if (current === next) return true;
  if (current.length !== next.length) return false;

  for (let index = 0; index < current.length; index += 1) {
    const currentItem = current[index];
    const nextItem = next[index];
    if (!nextItem) return false;
    if (currentItem.kind !== nextItem.kind) return false;
    if (currentItem.key !== nextItem.key) return false;

    if (currentItem.kind === 'task') {
      if (nextItem.kind !== 'task' || currentItem.taskId !== nextItem.taskId) {
        return false;
      }
      continue;
    }

    if (
      nextItem.kind !== 'header' ||
      currentItem.sectionId !== nextItem.sectionId
    ) {
      return false;
    }
  }

  return true;
};

const configureListDataLayoutAnimation = () => {
  LayoutAnimation.configureNext({
    duration: 220,
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
      duration: 170,
    },
    update: {
      type: LayoutAnimation.Types.easeInEaseOut,
      duration: 220,
    },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
      duration: 170,
    },
  });
};

export type TaskSwipeDraggableListProps = {
  theme: ThemeName;
  tasks: Task[];
  projectsById?: Map<string, Project>;
  rowStyles: SwipeTaskRowStyles;
  itemSpacing?: number;
  /** Optional outer scroll ref for gesture coordination (e.g. horizontal parent scroll). */
  scrollRef?: React.RefObject<any>;
  /**
   * Rendering mode for the list.
   * - `auto` (default): DraggableFlatList.
   * - `static`: Render list content only; caller owns the scroll container.
   * - `nestable`: legacy alias of `auto`.
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
  isDark: boolean;
  onLayout?: (e: LayoutChangeEvent) => void;
  contentInsetAdjustmentBehavior?: 'automatic' | 'never';

  /**
   * `react - native - draggable - flatlist` exposes scroll via `onScrollOffsetChange` (number), not `onScroll`.
   */
  onScrollOffsetChange?: (scrollOffset: number) => void;
  onListTouchMove?: (event: GestureResponderEvent) => void;
  onListTouchEnd?: (event: GestureResponderEvent) => void;
  onListTouchCancel?: (event: GestureResponderEvent) => void;
  onDragGestureUpdate?: (params: TaskDragGestureUpdateParams) => void;

  /**
   * Reports drag state changes so callers can avoid treating drag as scroll.
   */
  onDragStateChange?: (isDragging: boolean) => void;
  onSwipeStateChange?: (isSwiping: boolean) => void;
  onRowTouchStateChange?: (isTouchingRow: boolean) => void;

  header?: React.ReactElement | null;
  footer?: React.ReactElement | null;
  empty?: React.ReactElement | null;

  enabledTags?: Set<TagId>;
  showTaskIcons?: boolean;
  showCompactSubtasks?: boolean;
  /** While dragging, switches the active drag preview into compact icon mode. */
  dragCompactPreview?: boolean;
  /** While dragging, apply horizontal translation to the active row preview. */
  followHorizontalDrag?: boolean;
  /** When set, datetime tags matching this day are suppressed in task rows. */
  selectedDateStart?: number;

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
  }) => boolean | void;
  getTaskRowStyleOverrides?: (params: {
    task: Task;
    sectionId: string | null;
    isSectionFirstTask: boolean;
    isSectionLastTask: boolean;
  }) => {
    itemSpacerStyle?: StyleProp<ViewStyle>;
    swipeClipStyle?: StyleProp<ViewStyle>;
    rowStyle?: StyleProp<ViewStyle>;
  } | null;

  keyForTask?: (task: Task) => string;
  sortByOrderRank?: boolean;
  /**
   * Keep list data in sync with parent updates even during an active drag.
   * Useful for views that intentionally swap datasets mid-drag.
   */
  syncDataDuringDrag?: boolean;
  /** Disable internal list layout animations when parent drives its own transition. */
  animateDataLayoutChanges?: boolean;
  /** Optional section reveal progress (0..1 expanded) for staggered task entry animation. */
  revealProgress?: Animated.Value | Animated.AnimatedInterpolation<number>;
  revealStaggerStep?: number;
  revealTranslateY?: number;
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
    isDark,
    onLayout,
    contentInsetAdjustmentBehavior,
    onScrollOffsetChange,
    onListTouchMove,
    onListTouchEnd,
    onListTouchCancel,
    onDragGestureUpdate,
    onDragStateChange,
    onSwipeStateChange,
    onRowTouchStateChange,
    header,
    footer,
    empty,
    enabledTags,
    showTaskIcons,
    showCompactSubtasks = false,
    dragCompactPreview = false,
    followHorizontalDrag = false,
    selectedDateStart,
    onPressTask,
    toggleComplete,
    toggleSubtask,
    deleteTask,
    onReorder,
    onReorderData,
    onDragBeginTask,
    onDragEndMeta,
    getTaskRowStyleOverrides,
    keyForTask,
    sortByOrderRank,
    syncDataDuringDrag = true,
    animateDataLayoutChanges = true,
    revealProgress,
    revealStaggerStep = 0.055,
    revealTranslateY = 10,
  },
  ref
) {
  const { reduceMotionEnabled } = useAppSettings();
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
  const draggingTaskIdRef = React.useRef<string | null>(null);
  const [activeDragTranslationX, setActiveDragTranslationX] = React.useState(0);
  const openSwipeIdRef = React.useRef<string | null>(null);
  const closeByIdRef = React.useRef(new Map<string, () => void>());
  const swipingTaskIdsRef = React.useRef(new Set<string>());
  const touchingTaskIdsRef = React.useRef(new Set<string>());

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

  const resolvedData = React.useMemo<TaskSwipeDraggableListItem[]>(() => {
    const base = data ?? listData;
    if (base.length === 0) return base;

    let hasDanglingTaskReference = false;
    const sanitized: TaskSwipeDraggableListItem[] = [];
    for (const item of base) {
      if (item.kind === 'header' || tasksById.has(item.taskId)) {
        sanitized.push(item);
      } else {
        hasDanglingTaskReference = true;
      }
    }

    return hasDanglingTaskReference ? sanitized : base;
  }, [data, listData, tasksById]);

  const [flatListData, setFlatListData] = React.useState<TaskSwipeDraggableListItem[]>(() => resolvedData);

  React.useLayoutEffect(() => {
    if (isDraggingRef.current && !syncDataDuringDrag) return;

    setFlatListData((current) => {
      if (areListItemsEqual(current, resolvedData)) return current;
      if (animateDataLayoutChanges && !reduceMotionEnabled) {
        configureListDataLayoutAnimation();
      }
      return resolvedData;
    });
  }, [
    animateDataLayoutChanges,
    reduceMotionEnabled,
    resolvedData,
    syncDataDuringDrag,
  ]);

  const taskSectionMetaById = React.useMemo(() => {
    const bySection = new Map<string, string[]>();
    let currentSection: string | null = null;

    const appendTask = (sectionId: string | null, taskId: string) => {
      const key = sectionId ?? '__none__';
      const existing = bySection.get(key);
      if (existing) {
        existing.push(taskId);
      } else {
        bySection.set(key, [taskId]);
      }
    };

    for (const item of flatListData) {
      if (item.kind === 'header') {
        currentSection = item.sectionId;
        continue;
      }
      appendTask(currentSection, item.taskId);
    }

    const taskMeta = new Map<
      string,
      {
        sectionId: string | null;
        isSectionFirstTask: boolean;
        isSectionLastTask: boolean;
      }
    >();
    for (const [sectionKey, taskIds] of bySection.entries()) {
      const sectionId = sectionKey === '__none__' ? null : sectionKey;
      taskIds.forEach((taskId, index) => {
        taskMeta.set(taskId, {
          sectionId,
          isSectionFirstTask: index === 0,
          isSectionLastTask: index === taskIds.length - 1,
        });
      });
    }
    return taskMeta;
  }, [flatListData]);

  const listActivationDistance = LIST_ACTIVATION_DISTANCE_DEFAULT;
  const simultaneousHandlers = React.useMemo(
    () => scrollRef ?? undefined,
    [scrollRef]
  );
  const resolvedContainerStyle: StyleProp<ViewStyle> = React.useMemo(() => {
    return [{ flex: 1, backgroundColor: Colors[theme].background, overflow: 'visible' }, containerStyle];
  }, [containerStyle, theme]);

  const renderItem = React.useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<TaskSwipeDraggableListItem>) => {
      const index = getIndex();
      if (item.kind === 'header') {
        return renderHeaderRow ? renderHeaderRow(item.sectionId) : null;
      }

      const task = tasksById.get(item.taskId);
      if (!task) return null;
      const sectionMeta = taskSectionMetaById.get(item.taskId) ?? {
        sectionId: null,
        isSectionFirstTask: false,
        isSectionLastTask: false,
      };
      const rowStyleOverrides = getTaskRowStyleOverrides?.({
        task,
        sectionId: sectionMeta.sectionId,
        isSectionFirstTask: sectionMeta.isSectionFirstTask,
        isSectionLastTask: sectionMeta.isSectionLastTask,
      });

      const row = (
        <SwipeTaskRow
          task={task}
          project={projectsById?.get(task.projectId)}
          drag={drag}
          isActive={isActive}
          styles={rowStyles}
          isDark={isDark}
          isLast={index === flatListData.length - 1}
          itemSpacing={itemSpacing}
          emojiTint={emojiTint}
          emojiFallback={emojiFallback}
          swipeCompleteBg={swipeCompleteBg}
          swipeDeleteBg={swipeDeleteBg}
          enabledTags={enabledTagsResolved}
          showTaskIcons={showTaskIconsResolved}
          showCompactSubtasks={showCompactSubtasks}
          dragCompactPreview={dragCompactPreview}
          activeDragTranslateX={activeDragTranslationX}
          followHorizontalDrag={followHorizontalDrag}
          beginSwipe={beginSwipe}
          endSwipe={endSwipe}
          registerClose={registerClose}
          unregisterClose={unregisterClose}
          closeAnyOpen={closeAnyOpen}
          onPressTask={handlePressTask}
          toggleComplete={toggleComplete}
          toggleSubtask={toggleSubtask}
          deleteTask={deleteTask}
          onSwipeGestureActiveChange={reportSwipeGestureActive}
          onTouchInteractionChange={reportRowTouchInteraction}
          shouldPopIn={false}
          selectedDateStart={selectedDateStart}
          itemSpacerStyle={rowStyleOverrides?.itemSpacerStyle}
          swipeClipStyle={rowStyleOverrides?.swipeClipStyle}
          rowStyle={rowStyleOverrides?.rowStyle}
        />
      );
      if (!revealProgress || reduceMotionEnabled) return row;

      const safeIndex = typeof index === 'number' && Number.isFinite(index) ? Math.max(0, index) : 0;
      const stagger = Math.max(0.02, Math.min(0.1, revealStaggerStep));
      const start = Math.min(0.04 + safeIndex * stagger, 0.78);
      const mid = Math.min(start + 0.16, 0.94);
      const end = Math.min(start + 0.38, 1);
      const translateMid = revealTranslateY * 0.55;
      return (
        <Animated.View
          style={{
            opacity: revealProgress.interpolate({
              inputRange: [0, start, mid, end, 1],
              outputRange: [0, 0, 0.45, 1, 1],
              extrapolate: 'clamp',
            }),
            transform: [
              {
                translateY: revealProgress.interpolate({
                  inputRange: [0, start, mid, end, 1],
                  outputRange: [
                    revealTranslateY,
                    revealTranslateY,
                    translateMid,
                    0,
                    0,
                  ],
                  extrapolate: 'clamp',
                }),
              },
            ],
          }}
        >
          {row}
        </Animated.View>
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
      getTaskRowStyleOverrides,
      handlePressTask,
      isDark,
      itemSpacing,
      renderHeaderRow,
      projectsById,
      rowStyles,
      registerClose,
      selectedDateStart,
      showTaskIconsResolved,
      showCompactSubtasks,
      dragCompactPreview,
      followHorizontalDrag,
      activeDragTranslationX,
      swipeCompleteBg,
      swipeDeleteBg,
      taskSectionMetaById,
      tasksById,
      toggleComplete,
      toggleSubtask,
      unregisterClose,
      reportSwipeGestureActive,
      reportRowTouchInteraction,
      flatListData.length,
      revealProgress,
      revealStaggerStep,
      revealTranslateY,
      reduceMotionEnabled,
    ]
  );

  const renderCompatItem = React.useCallback(
    (item: TaskSwipeDraggableListItem, index: number) => {
      if (item.kind === 'header') {
        return renderHeaderRow ? renderHeaderRow(item.sectionId) : null;
      }

      const task = tasksById.get(item.taskId);
      if (!task) return null;
      const sectionMeta = taskSectionMetaById.get(item.taskId) ?? {
        sectionId: null,
        isSectionFirstTask: false,
        isSectionLastTask: false,
      };
      const rowStyleOverrides = getTaskRowStyleOverrides?.({
        task,
        sectionId: sectionMeta.sectionId,
        isSectionFirstTask: sectionMeta.isSectionFirstTask,
        isSectionLastTask: sectionMeta.isSectionLastTask,
      });

      const row = (
        <SwipeTaskRow
          task={task}
          project={projectsById?.get(task.projectId)}
          drag={() => { }}
          isActive={false}
          styles={rowStyles}
          isDark={isDark}
          isLast={index === flatListData.length - 1}
          itemSpacing={itemSpacing}
          emojiTint={emojiTint}
          emojiFallback={emojiFallback}
          swipeCompleteBg={swipeCompleteBg}
          swipeDeleteBg={swipeDeleteBg}
          enabledTags={enabledTagsResolved}
          showTaskIcons={showTaskIconsResolved}
          showCompactSubtasks={showCompactSubtasks}
          dragCompactPreview={dragCompactPreview}
          activeDragTranslateX={0}
          followHorizontalDrag={followHorizontalDrag}
          beginSwipe={beginSwipe}
          endSwipe={endSwipe}
          registerClose={registerClose}
          unregisterClose={unregisterClose}
          closeAnyOpen={closeAnyOpen}
          onPressTask={handlePressTask}
          toggleComplete={toggleComplete}
          toggleSubtask={toggleSubtask}
          deleteTask={deleteTask}
          onSwipeGestureActiveChange={reportSwipeGestureActive}
          onTouchInteractionChange={reportRowTouchInteraction}
          shouldPopIn={false}
          selectedDateStart={selectedDateStart}
          itemSpacerStyle={rowStyleOverrides?.itemSpacerStyle}
          swipeClipStyle={rowStyleOverrides?.swipeClipStyle}
          rowStyle={rowStyleOverrides?.rowStyle}
        />
      );
      if (!revealProgress || reduceMotionEnabled) return row;

      const safeIndex = Math.max(0, index);
      const stagger = Math.max(0.02, Math.min(0.1, revealStaggerStep));
      const start = Math.min(0.04 + safeIndex * stagger, 0.78);
      const mid = Math.min(start + 0.16, 0.94);
      const end = Math.min(start + 0.38, 1);
      const translateMid = revealTranslateY * 0.55;
      return (
        <Animated.View
          style={{
            opacity: revealProgress.interpolate({
              inputRange: [0, start, mid, end, 1],
              outputRange: [0, 0, 0.45, 1, 1],
              extrapolate: 'clamp',
            }),
            transform: [
              {
                translateY: revealProgress.interpolate({
                  inputRange: [0, start, mid, end, 1],
                  outputRange: [
                    revealTranslateY,
                    revealTranslateY,
                    translateMid,
                    0,
                    0,
                  ],
                  extrapolate: 'clamp',
                }),
              },
            ],
          }}
        >
          {row}
        </Animated.View>
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
      getTaskRowStyleOverrides,
      handlePressTask,
      isDark,
      itemSpacing,
      projectsById,
      registerClose,
      renderHeaderRow,
      rowStyles,
      selectedDateStart,
      showTaskIconsResolved,
      showCompactSubtasks,
      dragCompactPreview,
      followHorizontalDrag,
      swipeCompleteBg,
      swipeDeleteBg,
      taskSectionMetaById,
      tasksById,
      toggleComplete,
      toggleSubtask,
      unregisterClose,
      reportSwipeGestureActive,
      reportRowTouchInteraction,
      flatListData.length,
      revealProgress,
      revealStaggerStep,
      revealTranslateY,
      reduceMotionEnabled,
    ]
  );

  const renderListContent = React.useCallback(() => {
    return (
      <>
        {header ?? null}

        {flatListData.length === 0 ? (
          empty ?? null
        ) : (
          flatListData.map((item, index) => <React.Fragment key={item.key}>{renderCompatItem(item, index)}</React.Fragment>)
        )}

        {footer ?? null}
      </>
    );
  }, [empty, flatListData, footer, header, renderCompatItem]);

  const handleDragBegin = React.useCallback(
    (fromIndex: number) => {
      isDraggingRef.current = true;
      setActiveDragTranslationX(0);
      onDragStateChange?.(true);
      placeholderIndexRef.current = fromIndex;
      closeAnyOpen();
      setFlatListData(resolvedData);
      const sourceItem = resolvedData[fromIndex];
      if (sourceItem?.kind === "task") {
        draggingTaskIdRef.current = sourceItem.taskId;
        onDragBeginTask?.(sourceItem.taskId);
      } else {
        draggingTaskIdRef.current = null;
      }
      triggerImpactHaptic(Haptics.ImpactFeedbackStyle.Medium);
    },
    [
      closeAnyOpen,
      onDragBeginTask,
      onDragStateChange,
      resolvedData,
      setActiveDragTranslationX,
    ],
  );

  const handleDragRelease = React.useCallback(() => {
    triggerImpactHaptic(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleDragGestureUpdateInternal = React.useCallback(
    (params: TaskDragGestureUpdateParams) => {
      const { phase, translationX } = params;
      if (phase === "begin") {
        setActiveDragTranslationX((current) => (current === 0 ? current : 0));
      } else if (phase === "update") {
        const nextTranslateX = Number.isFinite(translationX) ? translationX : 0;
        setActiveDragTranslationX((current) =>
          Math.abs(current - nextTranslateX) < 0.5 ? current : nextTranslateX,
        );
      } else {
        setActiveDragTranslationX((current) => (current === 0 ? current : 0));
      }
      onDragGestureUpdate?.(params);
    },
    [onDragGestureUpdate],
  );

  const handleDragEnd = React.useCallback(
    ({
      data,
      from,
      to,
    }: {
      data: TaskSwipeDraggableListItem[];
      from: number;
      to: number;
    }) => {
      const nextData = data.filter(
        (item) => item.kind === "header" || tasksById.has(item.taskId),
      );
      const handledExternally =
        onDragEndMeta?.({ data: nextData, from, to }) === true;
      if (handledExternally) {
        setActiveDragTranslationX(0);
        // External handlers mutate parent data; keep local list stable and
        // wait for parent sync to avoid transient remount flashes.
        // Delay the drag-state reset so the drop commit's state changes
        // propagate before the useLayoutEffect re-syncs flatListData.
        draggingTaskIdRef.current = null;
        placeholderIndexRef.current = -1;
        requestAnimationFrame(() => {
          isDraggingRef.current = false;
          onDragStateChange?.(false);
        });
      } else {
        setActiveDragTranslationX(0);
        setFlatListData(nextData);
        onReorderData?.(nextData);
        onReorder?.(
          nextData.filter((d) => d.kind === "task").map((d) => d.taskId),
        );
        draggingTaskIdRef.current = null;
        placeholderIndexRef.current = -1;
        // Delay drag-state reset to give parent re-render one frame to propagate,
        // preventing the useLayoutEffect from re-syncing data and causing a flash.
        requestAnimationFrame(() => {
          isDraggingRef.current = false;
          onDragStateChange?.(false);
        });
      }
    },
    [
      onDragEndMeta,
      onDragStateChange,
      onReorder,
      onReorderData,
      tasksById,
      setActiveDragTranslationX,
    ],
  );

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
    autoscrollSpeed: LIST_AUTOSCROLL_SPEED,
    animationConfig: reduceMotionEnabled ? undefined : LIST_ANIMATION_CONFIG,
    dragItemOverflow: true,
    onDragBegin: handleDragBegin,
    onPlaceholderIndexChange: (index: number) => {
      placeholderIndexRef.current = index;
    },
    onRelease: handleDragRelease,
    onDragEnd: handleDragEnd,
    onTouchMove: onListTouchMove,
    onTouchEnd: onListTouchEnd,
    onTouchCancel: onListTouchCancel,
    onDragGestureUpdate: handleDragGestureUpdateInternal,
  };

  if (renderMode === 'static') {
    return renderListContent();
  }

  return (
    <DraggableFlatList
      {...dragListProps}
      style={{ flex: 1, overflow: "visible" }}
      containerStyle={resolvedContainerStyle}
      contentContainerStyle={contentContainerStyle}
      removeClippedSubviews={false}
      contentInsetAdjustmentBehavior={contentInsetAdjustmentBehavior ?? 'automatic'}
      onScrollOffsetChange={onScrollOffsetChange}
      showsVerticalScrollIndicator={false}
      activationDistance={listActivationDistance}
      autoscrollSpeed={LIST_AUTOSCROLL_SPEED}
      animationConfig={reduceMotionEnabled ? undefined : LIST_ANIMATION_CONFIG}
      dragItemOverflow
      onDragBegin={handleDragBegin}
      onPlaceholderIndexChange={(index) => {
        placeholderIndexRef.current = index;
      }}
      onRelease={handleDragRelease}
      onDragEnd={handleDragEnd}
    />
  );
});
