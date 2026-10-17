import { usePageDimensions } from "@/components/navigation/vertical-bar-safe-area";
import * as Haptics from 'expo-haptics';
import { useIsFocused } from "expo-router";
import React from 'react';
import {
  Animated,
  LayoutAnimation,
  LayoutChangeEvent,
  Platform,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';

import type {
  SwipeTaskRowStyles,
  TaskRowLanding,
  TaskRowMeasure,
  TaskRowWindowFrame,
} from '@/components/tasks/swipe-task-row';
import { SwipeTaskRow } from '@/components/tasks/swipe-task-row';
import { withAlpha } from '@/components/ui/glass-surface';
import { Colors } from '@/constants/theme';
import type { TagId } from '@/context/home-filters-store';
import { useAppSettings } from '@/context/settings-store';
import { useTaskCreateContext } from '@/context/task-create-context';
import type { Project, Task } from '@/context/tasks-store';
import { triggerImpactHaptic } from '@/utils/haptics';
import { configureLayoutAnimation, motionSpring } from "@/utils/motion";
import { traceDrag } from '@/utils/drag-diagnostics';

type ThemeName = keyof typeof Colors;
// DraggableFlatList wraps the whole list (including its ListHeaderComponent,
// where the horizontal date rail lives) in a single unconstrained Pan
// gesture when activationDistance is falsy. On Android that gesture wins the
// touch over nested native scrollables, so the date rail can't be swiped;
// a nonzero distance makes the library apply activeOffsetY, restricting the
// container gesture to vertical drags and letting horizontal children scroll.
const LIST_ACTIVATION_DISTANCE_DEFAULT = Platform.OS === "android" ? 12 : 0;
const LIST_AUTOSCROLL_SPEED = 58;
const TASK_LIST_WIDE_LAYOUT_BREAKPOINT = 900;
const TASK_LIST_MAX_CONTENT_WIDTH = 760;
const LIST_ANIMATION_CONFIG = {
  damping: 26,
  stiffness: 300,
  mass: 0.28,
  overshootClamping: true,
} as const;
const DRAG_TRANSLATE_X_SETTLE_SPRING = {
  damping: 22,
  stiffness: 320,
  mass: 0.7,
} as const;
const ROW_MEASURE_TIMEOUT_MS = 80;

type TaskRowStyleOverrides = {
  itemSpacerStyle?: StyleProp<ViewStyle>;
  swipeClipStyle?: StyleProp<ViewStyle>;
  rowStyle?: StyleProp<ViewStyle>;
};

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

export type TaskDragDropParams = {
  taskId: string;
  absoluteX: number;
  absoluteY: number;
  /** Window position of the dragged row's top-left corner at release (NaN if unknown). */
  rowX: number;
  rowY: number;
  rowHeight: number;
};

export type TaskListLanding = TaskRowLanding & {
  /** Rows that already lived in this list before the drop; they don't animate. */
  excludeTaskIds: ReadonlySet<string>;
};

export type TaskSwipeDraggableListHandle = {
  closeAnyOpen: () => void;
  /** Window frames of the currently rendered task rows, keyed by task id. */
  measureTaskRows: () => Promise<Map<string, TaskRowWindowFrame>>;
};

const getDefaultTaskAppearanceKey = (task: Task) =>
  `${task.id}:${task.section}:${task.completedAt ?? 0}:${task.deletedAt ?? 0}`;

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

const configureDropLayoutAnimation = () => {
  // Only move surviving rows; the dropped row runs its own landing animation.
  configureLayoutAnimation({
    duration: 320,
    update: {
      type: LayoutAnimation.Types.spring,
      springDamping: 0.86,
    },
  });
};

const configureListDataLayoutAnimation = () => {
  configureLayoutAnimation({
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
   * Called when the finger lifts. Return `true` to take over the drop (e.g. a
   * move into another list): the list then skips its own reorder, keeps the
   * row where it was released and removes it once the parent data updates.
   */
  onDragDrop?: (params: TaskDragDropParams) => boolean;
  /** A row dropped in from another list; new rows spring in from `x`/`y`. */
  landing?: TaskListLanding | null;
  onLandingEnd?: (taskId: string) => void;

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
  showProjectNames?: boolean;
  showCompactSubtasks?: boolean;
  /** While dragging, switches the active drag preview into compact icon mode. */
  dragCompactPreview?: boolean;
  /** While dragging, apply horizontal translation to the active row preview. */
  followHorizontalDrag?: boolean;
  /** Additional horizontal drag compensation (for parent horizontal scroll while dragging). */
  dragTranslateXCompensation?: number;
  /** Override row swipe activation threshold to improve parent horizontal scrolling. */
  rowSwipeActivationThreshold?: number;
  /** When set, datetime tags matching this day are suppressed in task rows. */
  selectedDateStart?: number;
  /** When true, prepend overdue date before the overdue time in row meta. */
  showOverdueDatePrefix?: boolean;

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
  }) => TaskRowStyleOverrides | null;

  keyForTask?: (task: Task) => string;
  sortByOrderRank?: boolean;
  /**
   * Keep list data in sync with parent updates even during an active drag.
   * Useful for views that intentionally swap datasets mid-drag.
   */
  syncDataDuringDrag?: boolean;
  /** Disable internal list layout animations when parent drives its own transition. */
  animateDataLayoutChanges?: boolean;
  /**
   * Let a Reanimated layout transition apply the reordered cell positions and
   * the reset of the drag offsets in the same frame (drop flicker prototype).
   */
  dropLayoutHandoff?: boolean;
  /** Optional section reveal progress (0..1 expanded) for staggered task entry animation. */
  revealProgress?: Animated.Value | Animated.AnimatedInterpolation<number>;
  revealPhase?: 'enter' | 'exit';
  revealStaggerStep?: number;
  revealTranslateX?: number;
  /**
   * When true, the list shrinks to content height when short.
   * This keeps the area below rows free for parent gestures.
   */
  shrinkToContentWhenShort?: boolean;
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
    onDragDrop,
    landing = null,
    onLandingEnd,
    onDragStateChange,
    onSwipeStateChange,
    onRowTouchStateChange,
    header,
    footer,
    empty,
    enabledTags,
    showTaskIcons,
    showProjectNames = false,
    showCompactSubtasks = false,
    dragCompactPreview = false,
    followHorizontalDrag = false,
    dragTranslateXCompensation = 0,
    rowSwipeActivationThreshold,
    selectedDateStart,
    showOverdueDatePrefix = false,
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
    dropLayoutHandoff = false,
    revealProgress,
    revealPhase = 'enter',
    revealStaggerStep = 0.055,
    revealTranslateX = 72,
    shrinkToContentWhenShort = false,
  },
  ref
) {
  const { reduceMotionEnabled } = useAppSettings();
  const isFocused = useIsFocused();
  const { width: viewportWidth } = usePageDimensions();
  const { popInTaskIds, consumeTaskPopIn } = useTaskCreateContext();
  const emojiTint = React.useMemo(() => withAlpha(Colors[theme].background, isDark ? 0.12 : 0.22), [isDark, theme]);
  const emojiFallback = React.useMemo(
    () => withAlpha(Colors[theme].background, isDark ? 0.52 : 0.74),
    [isDark, theme]
  );

  const swipeCompleteBg = React.useMemo(() => '#22C55E', []);
  const swipeDeleteBg = React.useMemo(() => '#F4512C', []);

  const enabledTagsResolved = React.useMemo(() => enabledTags ?? new Set<TagId>(), [enabledTags]);
  const showTaskIconsResolved = React.useMemo(() => showTaskIcons ?? true, [showTaskIcons]);
  const popInTaskIdSet = React.useMemo(() => new Set(popInTaskIds), [popInTaskIds]);
  const [dynamicPopInTaskIds, setDynamicPopInTaskIds] = React.useState<string[]>([]);
  const dynamicPopInTaskIdSet = React.useMemo(
    () => new Set(dynamicPopInTaskIds),
    [dynamicPopInTaskIds],
  );
  const previousTaskKeyByIdRef = React.useRef<Map<string, string> | null>(null);
  const suppressDynamicPopInUntilRef = React.useRef(0);

  const diagnosticListId = React.useId();
  const isDraggingRef = React.useRef(false);
  const dragGenerationRef = React.useRef(0);
  const completedDragGenerationRef = React.useRef(0);
  const placeholderIndexRef = React.useRef<number>(-1);
  const draggingTaskIdRef = React.useRef<string | null>(null);
  const activeDragTranslationX = React.useRef(new Animated.Value(0)).current;
  const activeDragTranslationXValueRef = React.useRef(0);
  const dragCompensationX = React.useRef(new Animated.Value(0)).current;
  const dragCompensationXValueRef = React.useRef(0);
  const openSwipeIdRef = React.useRef<string | null>(null);
  const closeByIdRef = React.useRef(new Map<string, () => void>());
  const swipingTaskIdsRef = React.useRef(new Set<string>());
  const touchingTaskIdsRef = React.useRef(new Set<string>());
  const rowMeasuresRef = React.useRef(new Map<string, TaskRowMeasure>());
  const dragFromIndexRef = React.useRef(-1);
  const dragRowFrameRef = React.useRef<TaskRowWindowFrame | null>(null);
  // Set when the parent takes over a drop; the next data change removes the
  // row one frame late so it never snaps back into its old slot.
  const externalDropRef = React.useRef<{ canAnimateRemoval: boolean } | null>(
    null,
  );
  const ignoreNextDragEndRef = React.useRef(false);
  const deferredSyncFrameRef = React.useRef<number | null>(null);
  const dragCompletionFrameRef = React.useRef<number | null>(null);
  const skippedSyncDuringDragRef = React.useRef(false);
  const finishDrag = React.useCallback(() => {
    const generation = dragGenerationRef.current;
    if (dragCompletionFrameRef.current !== null) {
      cancelAnimationFrame(dragCompletionFrameRef.current);
    }
    dragCompletionFrameRef.current = requestAnimationFrame(() => {
      dragCompletionFrameRef.current = null;
      if (generation !== dragGenerationRef.current) return;
      isDraggingRef.current = false;
      if (skippedSyncDuringDragRef.current) {
        // Data that arrived mid-drag was held back; apply it now, since a drop
        // that changes nothing won't rerun the sync effect on its own.
        skippedSyncDuringDragRef.current = false;
        setFlatListData((current) => {
          const next = latestResolvedDataRef.current;
          return areListItemsEqual(current, next) ? current : next;
        });
      }
      traceDrag(diagnosticListId, "settled", { generation });
      onDragStateChange?.(false);
    });
  }, [diagnosticListId, onDragStateChange]);
  React.useEffect(() => () => {
    if (dragCompletionFrameRef.current !== null) {
      cancelAnimationFrame(dragCompletionFrameRef.current);
    }
  }, []);

  const registerRowMeasure = React.useCallback(
    (taskId: string, measure: TaskRowMeasure) => {
      const measures = rowMeasuresRef.current;
      measures.set(taskId, measure);
      return () => {
        if (measures.get(taskId) === measure) measures.delete(taskId);
      };
    },
    [],
  );

  const measureTaskRows = React.useCallback(() => {
    const entries = Array.from(rowMeasuresRef.current.entries());
    return new Promise<Map<string, TaskRowWindowFrame>>((resolve) => {
      const frames = new Map<string, TaskRowWindowFrame>();
      let pending = entries.length;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve(frames);
      };
      if (pending === 0) {
        finish();
        return;
      }
      const timeout = setTimeout(finish, ROW_MEASURE_TIMEOUT_MS);
      for (const [taskId, measure] of entries) {
        measure((frame) => {
          if (frame) frames.set(taskId, frame);
          pending -= 1;
          if (pending === 0) {
            clearTimeout(timeout);
            finish();
          }
        });
      }
    });
  }, []);

  const resetActiveDragTranslationX = React.useCallback(() => {
    // Always write 0: a settle spring may have been stopped mid-way.
    activeDragTranslationX.stopAnimation();
    activeDragTranslationXValueRef.current = 0;
    activeDragTranslationX.setValue(0);
  }, [activeDragTranslationX]);

  const settleActiveDragTranslationX = React.useCallback(() => {
    if (activeDragTranslationXValueRef.current === 0) return;
    activeDragTranslationXValueRef.current = 0;
    if (reduceMotionEnabled) {
      activeDragTranslationX.setValue(0);
      return;
    }
    motionSpring(activeDragTranslationX, {
      toValue: 0,
      ...DRAG_TRANSLATE_X_SETTLE_SPRING,
      useNativeDriver: false,
    }).start();
  }, [activeDragTranslationX, reduceMotionEnabled]);

  const updateActiveDragTranslationX = React.useCallback(
    (nextValue: number) => {
      if (!Number.isFinite(nextValue)) return;
      const current = activeDragTranslationXValueRef.current;
      if (Math.abs(current - nextValue) < 0.5) return;
      activeDragTranslationXValueRef.current = nextValue;
      activeDragTranslationX.setValue(nextValue);
    },
    [activeDragTranslationX]
  );

  React.useEffect(() => {
    const nextCompensation = Number.isFinite(dragTranslateXCompensation)
      ? dragTranslateXCompensation
      : 0;
    const current = dragCompensationXValueRef.current;
    if (Math.abs(current - nextCompensation) < 0.5) return;
    dragCompensationXValueRef.current = nextCompensation;
    dragCompensationX.setValue(nextCompensation);
  }, [dragCompensationX, dragTranslateXCompensation]);

  const resolvedActiveDragTranslateX = React.useMemo(
    () => Animated.add(activeDragTranslationX, dragCompensationX),
    [activeDragTranslationX, dragCompensationX]
  );

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
      measureTaskRows,
    }),
    [closeAnyOpen, measureTaskRows]
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
      setDynamicPopInTaskIds((current) =>
        current.filter((candidate) => candidate !== taskId),
      );
    },
    [consumeTaskPopIn]
  );
  const suppressDynamicPopIns = React.useCallback((durationMs = 520) => {
    suppressDynamicPopInUntilRef.current = Date.now() + durationMs;
    setDynamicPopInTaskIds([]);
  }, []);

  React.useEffect(() => {
    if (isFocused) return;
    setDynamicPopInTaskIds([]);
  }, [isFocused]);

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
    const makeKey = keyForTask ?? getDefaultTaskAppearanceKey;
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
  const [pendingDropData, setPendingDropData] = React.useState<
    TaskSwipeDraggableListItem[] | null
  >(null);
  React.useEffect(() => {
    traceDrag(diagnosticListId, "mount");
    return () => traceDrag(diagnosticListId, "unmount");
  }, [diagnosticListId]);
  React.useLayoutEffect(() => {
    traceDrag(diagnosticListId, "data-commit", {
      count: flatListData.length,
      dragging: isDraggingRef.current,
      pending: pendingDropData !== null,
      generation: dragGenerationRef.current,
    });
  }, [diagnosticListId, flatListData, pendingDropData]);
  const latestResolvedDataRef = React.useRef(resolvedData);
  latestResolvedDataRef.current = resolvedData;
  const shouldAnimateDropLayout = landing !== null && !reduceMotionEnabled;

  React.useEffect(() => {
    return () => {
      if (deferredSyncFrameRef.current !== null) {
        cancelAnimationFrame(deferredSyncFrameRef.current);
        deferredSyncFrameRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    const nextTaskKeyById = new Map<string, string>();
    for (const item of resolvedData) {
      if (item.kind !== 'task') continue;
      nextTaskKeyById.set(item.taskId, item.key);
    }

    const previousTaskKeyById = previousTaskKeyByIdRef.current;
    previousTaskKeyByIdRef.current = nextTaskKeyById;
    if (!previousTaskKeyById) return;
    if (!isFocused || reduceMotionEnabled) return;
    if (suppressDynamicPopInUntilRef.current > Date.now()) return;

    const changedTaskIds: string[] = [];
    let structuralChangeCount = 0;
    for (const taskId of previousTaskKeyById.keys()) {
      if (!nextTaskKeyById.has(taskId)) {
        structuralChangeCount += 1;
      }
    }
    for (const [taskId, key] of nextTaskKeyById.entries()) {
      const previousKey = previousTaskKeyById.get(taskId);
      if (!previousKey) {
        structuralChangeCount += 1;
        continue;
      }
      if (previousKey && previousKey !== key) {
        changedTaskIds.push(taskId);
      }
    }

    if (changedTaskIds.length === 0 || changedTaskIds.length > 2) return;
    if (structuralChangeCount > 1) return;

    setDynamicPopInTaskIds((current) => {
      const next = new Set(current);
      changedTaskIds.forEach((taskId) => next.add(taskId));
      return Array.from(next);
    });
  }, [isFocused, reduceMotionEnabled, resolvedData]);

  React.useLayoutEffect(() => {
    const externalDrop = externalDropRef.current;
    if (externalDrop) {
      // The row that left this list is still drawn where it was released.
      // Remove it one frame later, after the destination list has mounted its
      // landing copy, so both hand off seamlessly.
      externalDropRef.current = null;
      if (deferredSyncFrameRef.current !== null) {
        cancelAnimationFrame(deferredSyncFrameRef.current);
      }
      deferredSyncFrameRef.current = requestAnimationFrame(() => {
        deferredSyncFrameRef.current = null;
        setFlatListData((current) => {
          const next = latestResolvedDataRef.current;
          if (areListItemsEqual(current, next)) return current;
          if (externalDrop.canAnimateRemoval && !reduceMotionEnabled) {
            configureDropLayoutAnimation();
          }
          return next;
        });
      });
      return;
    }

    if (isDraggingRef.current && !syncDataDuringDrag) {
      skippedSyncDuringDragRef.current = true;
      return;
    }

    setFlatListData((current) => {
      if (areListItemsEqual(current, resolvedData)) return current;
      if (shouldAnimateDropLayout) {
        configureDropLayoutAnimation();
      } else if (animateDataLayoutChanges && !reduceMotionEnabled) {
        configureListDataLayoutAnimation();
      }
      return resolvedData;
    });
  }, [
    animateDataLayoutChanges,
    reduceMotionEnabled,
    resolvedData,
    shouldAnimateDropLayout,
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
  const flatListIndexByKey = React.useMemo(
    () =>
      new Map(flatListData.map((item, index) => [item.key, index] as const)),
    [flatListData],
  );
  // One interpolation per index, reused across renders: a fresh node on every
  // render defeats SwipeTaskRow's memo and re-renders every row on any list
  // update (including the drop commit).
  const getRevealTranslateX = React.useMemo(() => {
    const cache = new Map<number, Animated.AnimatedInterpolation<number>>();
    return (index: number) => {
      if (!revealProgress || reduceMotionEnabled) return null;

      const safeIndex = Number.isFinite(index) ? Math.max(0, index) : 0;
      const cached = cache.get(safeIndex);
      if (cached) return cached;

      const stagger = Math.max(0.02, Math.min(0.1, revealStaggerStep));
      const start = Math.min(0.03 + safeIndex * stagger, 0.76);
      const end = Math.min(start + 0.3, 1);
      const interpolation = revealProgress.interpolate({
        inputRange: [0, start, end, 1],
        outputRange:
          revealPhase === 'exit'
            ? [0, 0, revealTranslateX, revealTranslateX]
            : [revealTranslateX, revealTranslateX, 0, 0],
        extrapolate: 'clamp',
      });
      cache.set(safeIndex, interpolation);
      return interpolation;
    };
  }, [
    reduceMotionEnabled,
    revealPhase,
    revealProgress,
    revealStaggerStep,
    revealTranslateX,
  ]);


  const listActivationDistance = LIST_ACTIVATION_DISTANCE_DEFAULT;
  const simultaneousHandlers = React.useMemo(
    () => scrollRef ?? undefined,
    [scrollRef]
  );
  const resolvedContainerStyle: StyleProp<ViewStyle> = React.useMemo(() => {
    return [
      {
        flex: shrinkToContentWhenShort ? undefined : 1,
        flexShrink: shrinkToContentWhenShort ? 1 : undefined,
        minHeight: shrinkToContentWhenShort ? 0 : undefined,
        backgroundColor: Colors[theme].background,
        overflow: "visible",
      },
      containerStyle,
    ];
  }, [containerStyle, shrinkToContentWhenShort, theme]);
  const resolvedListStyle: StyleProp<ViewStyle> = React.useMemo(
    () =>
      shrinkToContentWhenShort
        ? {
            alignSelf: "stretch",
            flexGrow: 0,
            flexShrink: 1,
            minHeight: 0,
            overflow: "visible",
          }
        : { flex: 1, overflow: "visible" },
    [shrinkToContentWhenShort]
  );
  const constrainedRowMaxWidth = React.useMemo(() => {
    if (viewportWidth < TASK_LIST_WIDE_LAYOUT_BREAKPOINT) return 0;
    return Math.min(TASK_LIST_MAX_CONTENT_WIDTH, viewportWidth - 32);
  }, [viewportWidth]);
  const autoTaskRowStyleOverrides = React.useMemo<TaskRowStyleOverrides | null>(
    () => {
      if (constrainedRowMaxWidth <= 0) return null;
      return {
        itemSpacerStyle: { alignItems: "center" as const },
        swipeClipStyle: {
          width: "100%" as const,
          maxWidth: constrainedRowMaxWidth,
          alignSelf: "center" as const,
        },
        rowStyle: { width: "100%" as const },
      };
    },
    [constrainedRowMaxWidth]
  );
  const constrainedHeaderContainerStyle = React.useMemo<
    StyleProp<ViewStyle> | null
  >(() => {
    if (constrainedRowMaxWidth <= 0) return null;
    return {
      width: "100%",
      maxWidth: constrainedRowMaxWidth,
      alignSelf: "center",
    };
  }, [constrainedRowMaxWidth]);
  const mergeTaskRowStyleOverrides = React.useCallback(
    (nextOverrides: TaskRowStyleOverrides | null | undefined) => {
      if (!autoTaskRowStyleOverrides) return nextOverrides ?? null;
      return {
        itemSpacerStyle: [
          autoTaskRowStyleOverrides.itemSpacerStyle,
          nextOverrides?.itemSpacerStyle,
        ],
        swipeClipStyle: [
          autoTaskRowStyleOverrides.swipeClipStyle,
          nextOverrides?.swipeClipStyle,
        ],
        rowStyle: [autoTaskRowStyleOverrides.rowStyle, nextOverrides?.rowStyle],
      } satisfies TaskRowStyleOverrides;
    },
    [autoTaskRowStyleOverrides]
  );

  const landingRow = React.useMemo<TaskRowLanding | null>(
    () =>
      landing && !reduceMotionEnabled
        ? { x: landing.x, y: landing.y, token: landing.token }
        : null,
    [landing, reduceMotionEnabled],
  );

  const renderItem = React.useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<TaskSwipeDraggableListItem>) => {
      const liveIndex = getIndex();
      const index =
        typeof liveIndex === "number" &&
        Number.isFinite(liveIndex) &&
        liveIndex >= 0
          ? liveIndex
          : (flatListIndexByKey.get(item.key) ?? -1);
      if (item.kind === 'header') {
        const headerRow = renderHeaderRow ? renderHeaderRow(item.sectionId) : null;
        if (!headerRow) return null;
        if (!constrainedHeaderContainerStyle) return headerRow;
        return <View style={constrainedHeaderContainerStyle}>{headerRow}</View>;
      }

      const task = tasksById.get(item.taskId);
      if (!task) return null;
      const sectionMeta = taskSectionMetaById.get(item.taskId) ?? {
        sectionId: null,
        isSectionFirstTask: false,
        isSectionLastTask: false,
      };
      const rowStyleOverrides = mergeTaskRowStyleOverrides(
        getTaskRowStyleOverrides?.({
          task,
          sectionId: sectionMeta.sectionId,
          isSectionFirstTask: sectionMeta.isSectionFirstTask,
          isSectionLastTask: sectionMeta.isSectionLastTask,
        }),
      );
      const shouldAnimatePopIn =
        isFocused &&
        (popInTaskIdSet.has(task.id) || dynamicPopInTaskIdSet.has(task.id));

      const row = (
        <SwipeTaskRow
          task={task}
          project={projectsById?.get(task.projectId)}
          drag={drag}
          isActive={isActive}
          styles={rowStyles}
          isDark={isDark}
          itemSpacing={itemSpacing}
          emojiTint={emojiTint}
          emojiFallback={emojiFallback}
          swipeCompleteBg={swipeCompleteBg}
          swipeDeleteBg={swipeDeleteBg}
          enabledTags={enabledTagsResolved}
          showTaskIcons={showTaskIconsResolved}
          showProjectNames={showProjectNames}
          showCompactSubtasks={showCompactSubtasks}
          dragCompactPreview={dragCompactPreview}
          activeDragTranslateX={resolvedActiveDragTranslateX}
          revealTranslateX={shouldAnimatePopIn ? null : getRevealTranslateX(index)}
          followHorizontalDrag={followHorizontalDrag}
          swipeActivationThreshold={rowSwipeActivationThreshold}
          landingFrom={
            landingRow && !landing?.excludeTaskIds.has(task.id)
              ? landingRow
              : null
          }
          onLandingEnd={onLandingEnd}
          registerMeasure={registerRowMeasure}
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
          shouldPopIn={shouldAnimatePopIn}
          onPopInAnimationEnd={handlePopInAnimationEnd}
          selectedDateStart={selectedDateStart}
          showOverdueDatePrefix={showOverdueDatePrefix}
          itemSpacerStyle={rowStyleOverrides?.itemSpacerStyle}
          swipeClipStyle={rowStyleOverrides?.swipeClipStyle}
          rowStyle={rowStyleOverrides?.rowStyle}
        />
      );
      return row;
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
      mergeTaskRowStyleOverrides,
      getRevealTranslateX,
      handlePressTask,
      handlePopInAnimationEnd,
      constrainedHeaderContainerStyle,
      dynamicPopInTaskIdSet,
      isFocused,
      isDark,
      itemSpacing,
      popInTaskIdSet,
      renderHeaderRow,
      projectsById,
      rowStyles,
      registerClose,
      selectedDateStart,
      showOverdueDatePrefix,
      showTaskIconsResolved,
      showProjectNames,
      showCompactSubtasks,
      dragCompactPreview,
      followHorizontalDrag,
      resolvedActiveDragTranslateX,
      rowSwipeActivationThreshold,
      swipeCompleteBg,
      swipeDeleteBg,
      taskSectionMetaById,
      tasksById,
      toggleComplete,
      toggleSubtask,
      unregisterClose,
      reportSwipeGestureActive,
      reportRowTouchInteraction,
      flatListIndexByKey,
      landing,
      landingRow,
      onLandingEnd,
      registerRowMeasure,
    ]
  );

  const renderCompatItem = React.useCallback(
    (item: TaskSwipeDraggableListItem, index: number) => {
      if (item.kind === 'header') {
        const headerRow = renderHeaderRow ? renderHeaderRow(item.sectionId) : null;
        if (!headerRow) return null;
        if (!constrainedHeaderContainerStyle) return headerRow;
        return <View style={constrainedHeaderContainerStyle}>{headerRow}</View>;
      }

      const task = tasksById.get(item.taskId);
      if (!task) return null;
      const sectionMeta = taskSectionMetaById.get(item.taskId) ?? {
        sectionId: null,
        isSectionFirstTask: false,
        isSectionLastTask: false,
      };
      const rowStyleOverrides = mergeTaskRowStyleOverrides(
        getTaskRowStyleOverrides?.({
          task,
          sectionId: sectionMeta.sectionId,
          isSectionFirstTask: sectionMeta.isSectionFirstTask,
          isSectionLastTask: sectionMeta.isSectionLastTask,
        }),
      );
      const shouldAnimatePopIn =
        isFocused &&
        (popInTaskIdSet.has(task.id) || dynamicPopInTaskIdSet.has(task.id));

      const row = (
        <SwipeTaskRow
          task={task}
          project={projectsById?.get(task.projectId)}
          drag={() => { }}
          isActive={false}
          styles={rowStyles}
          isDark={isDark}
          itemSpacing={itemSpacing}
          emojiTint={emojiTint}
          emojiFallback={emojiFallback}
          swipeCompleteBg={swipeCompleteBg}
          swipeDeleteBg={swipeDeleteBg}
          enabledTags={enabledTagsResolved}
          showTaskIcons={showTaskIconsResolved}
          showProjectNames={showProjectNames}
          showCompactSubtasks={showCompactSubtasks}
          dragCompactPreview={dragCompactPreview}
          activeDragTranslateX={null}
          revealTranslateX={shouldAnimatePopIn ? null : getRevealTranslateX(index)}
          followHorizontalDrag={followHorizontalDrag}
          swipeActivationThreshold={rowSwipeActivationThreshold}
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
          shouldPopIn={shouldAnimatePopIn}
          onPopInAnimationEnd={handlePopInAnimationEnd}
          selectedDateStart={selectedDateStart}
          showOverdueDatePrefix={showOverdueDatePrefix}
          itemSpacerStyle={rowStyleOverrides?.itemSpacerStyle}
          swipeClipStyle={rowStyleOverrides?.swipeClipStyle}
          rowStyle={rowStyleOverrides?.rowStyle}
        />
      );
      return row;
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
      mergeTaskRowStyleOverrides,
      getRevealTranslateX,
      handlePressTask,
      handlePopInAnimationEnd,
      constrainedHeaderContainerStyle,
      dynamicPopInTaskIdSet,
      isFocused,
      isDark,
      itemSpacing,
      popInTaskIdSet,
      projectsById,
      registerClose,
      renderHeaderRow,
      rowStyles,
      selectedDateStart,
      showOverdueDatePrefix,
      showTaskIconsResolved,
      showProjectNames,
      showCompactSubtasks,
      dragCompactPreview,
      followHorizontalDrag,
      rowSwipeActivationThreshold,
      swipeCompleteBg,
      swipeDeleteBg,
      taskSectionMetaById,
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
          flatListData.map((item, index) => <React.Fragment key={item.key}>{renderCompatItem(item, index)}</React.Fragment>)
        )}

        {footer ?? null}
      </>
    );
  }, [empty, flatListData, footer, header, renderCompatItem]);

  const handleDragBegin = React.useCallback(
    (fromIndex: number) => {
      dragGenerationRef.current += 1;
      traceDrag(diagnosticListId, "begin", {
        from: fromIndex, generation: dragGenerationRef.current,
      });
      isDraggingRef.current = true;
      externalDropRef.current = null;
      ignoreNextDragEndRef.current = false;
      dragRowFrameRef.current = null;
      dragFromIndexRef.current = fromIndex;
      suppressDynamicPopIns();
      resetActiveDragTranslationX();
      onDragStateChange?.(true);
      placeholderIndexRef.current = fromIndex;
      closeAnyOpen();
      setFlatListData(resolvedData);
      const sourceItem = resolvedData[fromIndex];
      if (sourceItem?.kind === "task") {
        const taskId = sourceItem.taskId;
        draggingTaskIdRef.current = taskId;
        // Remember where the row started so its window position at release is
        // simply this origin plus the gesture translation.
        rowMeasuresRef.current.get(taskId)?.((frame) => {
          if (draggingTaskIdRef.current === taskId) {
            dragRowFrameRef.current = frame;
          }
        });
        onDragBeginTask?.(taskId);
      } else {
        draggingTaskIdRef.current = null;
      }
      triggerImpactHaptic(Haptics.ImpactFeedbackStyle.Medium);
    },
    [
      closeAnyOpen,
      diagnosticListId,
      onDragBeginTask,
      onDragStateChange,
      resetActiveDragTranslationX,
      resolvedData,
      suppressDynamicPopIns,
    ],
  );

  const handleDragRelease = React.useCallback(() => {
    triggerImpactHaptic(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleDragGestureUpdateInternal = React.useCallback(
    (params: TaskDragGestureUpdateParams) => {
      const { phase, translationX } = params;
      if (phase === "begin") {
        resetActiveDragTranslationX();
      } else if (phase === "update") {
        if (followHorizontalDrag) {
          updateActiveDragTranslationX(
            Number.isFinite(translationX) ? translationX : 0
          );
        } else {
          resetActiveDragTranslationX();
        }
      }
      onDragGestureUpdate?.(params);
      if (phase !== "end") return;

      const taskId = draggingTaskIdRef.current;
      traceDrag(diagnosticListId, "gesture-release", {
        generation: dragGenerationRef.current,
      });
      const origin = dragRowFrameRef.current;
      const handledExternally =
        !!taskId &&
        onDragDrop?.({
          taskId,
          absoluteX: params.absoluteX,
          absoluteY: params.absoluteY,
          rowX: origin ? origin.x + params.translationX : Number.NaN,
          rowY: origin ? origin.y + params.translationY : Number.NaN,
          rowHeight: origin?.height ?? Number.NaN,
        }) === true;

      if (handledExternally) {
        // Keep the row where it was released until the parent moves it.
        externalDropRef.current = {
          // Neighbours only sit untranslated when the placeholder never moved;
          // otherwise animating the gap would fight the library's offsets.
          canAnimateRemoval:
            placeholderIndexRef.current === dragFromIndexRef.current,
        };
        ignoreNextDragEndRef.current = true;
        return;
      }
      settleActiveDragTranslationX();
    },
    [
      diagnosticListId,
      followHorizontalDrag,
      onDragDrop,
      onDragGestureUpdate,
      resetActiveDragTranslationX,
      settleActiveDragTranslationX,
      updateActiveDragTranslationX,
    ],
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
      // A release reaction and a spring completion can both report the same
      // drag. The second callback still carries the old from/to indices.
      // Claim this generation before invoking parents or scheduling commits.
      if (completedDragGenerationRef.current === dragGenerationRef.current) {
        traceDrag(diagnosticListId, "duplicate-end-ignored", {
          from, to, generation: dragGenerationRef.current,
        });
        return;
      }
      completedDragGenerationRef.current = dragGenerationRef.current;
      traceDrag(diagnosticListId, "end", {
        from, to, generation: dragGenerationRef.current,
        external: ignoreNextDragEndRef.current,
      });
      if (ignoreNextDragEndRef.current) {
        // The parent already committed this drop; the library's indices are
        // stale by now, so don't reorder anything.
        ignoreNextDragEndRef.current = false;
        draggingTaskIdRef.current = null;
        dragRowFrameRef.current = null;
        placeholderIndexRef.current = -1;
        finishDrag();
        return;
      }
      const nextData = data.filter(
        (item) => item.kind === "header" || tasksById.has(item.taskId),
      );
      suppressDynamicPopIns();
      const handledExternally =
        onDragEndMeta?.({ data: nextData, from, to }) === true;
      if (handledExternally) {
        resetActiveDragTranslationX();
        // External handlers mutate parent data; keep local list stable and
        // wait for parent sync to avoid transient remount flashes.
        // Delay the drag-state reset so the drop commit's state changes
        // propagate before the useLayoutEffect re-syncs flatListData.
        draggingTaskIdRef.current = null;
        placeholderIndexRef.current = -1;
        finishDrag();
      } else {
        resetActiveDragTranslationX();
        draggingTaskIdRef.current = null;
        placeholderIndexRef.current = -1;
        // A lift released in its original slot needs no data commit, parent
        // persistence or second render of every row.
        if (areListItemsEqual(nextData, flatListData)) {
          finishDrag();
          return;
        }
        // Don't reorder in this render: the library clears its active cell in
        // it, and every cell keeps its drag offset until Reanimated restarts
        // the cell styles in the passive effects of this commit. The reorder
        // follows in the effect below, so layout and offsets change together.
        setPendingDropData(nextData);
      }
    },
    [
      diagnosticListId,
      finishDrag,
      flatListData,
      onDragEndMeta,
      resetActiveDragTranslationX,
      suppressDynamicPopIns,
      tasksById,
    ],
  );

  React.useEffect(() => {
    if (!pendingDropData) return;
    // Runs after the cells' own passive effects (children first), i.e. once
    // their styles hold the drop position independently of the data order.
    setPendingDropData(null);
    setFlatListData(pendingDropData);
    onReorderData?.(pendingDropData);
    onReorder?.(
      pendingDropData
        .filter((d) => d.kind === "task")
        .map((d) => d.taskId),
    );
    finishDrag();
  }, [finishDrag, onReorder, onReorderData, pendingDropData]);

  const dragListProps = {
    data: flatListData,
    keyExtractor: (item: TaskSwipeDraggableListItem) => item.key,
    renderItem,
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
      style={resolvedListStyle}
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
      dropLayoutHandoff={dropLayoutHandoff}
      onDragBegin={handleDragBegin}
      onPlaceholderIndexChange={(index) => {
        placeholderIndexRef.current = index;
      }}
      onRelease={handleDragRelease}
      onDragEnd={handleDragEnd}
    />
  );
});
