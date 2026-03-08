import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import {
  GestureHandlerRootView,
  ScrollView as GHScrollView,
} from "react-native-gesture-handler";
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";

import type { SwipeTaskRowStyles } from "@/components/tasks/swipe-task-row";
import {
  TaskSwipeDraggableList,
  type TaskDragGestureUpdateParams,
} from "@/components/tasks/task-swipe-draggable-list";
import { FloatingAddButton } from "@/components/ui/floating-add-button";
import { GlassSurface, withAlpha } from "@/components/ui/glass-surface";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { Colors } from "@/constants/theme";
import { useHomeFilters, type TagId } from "@/context/home-filters-store";
import {
  createRoutineCompletionTransition,
  getDueAtForSection,
  Project,
  SectionId,
  Task,
  useTasksStore,
} from "@/context/tasks-store";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { t } from "@/i18n";
import { isIOS26OrNewer } from "@/utils/ios-version";
import {
  alignDueAtToLocalDay,
  deriveActiveSectionFromDueAt,
  getStartOfLocalDayMs,
  hasValidDueAt,
} from "@/utils/task-dates";

const PHONE_COLUMN_WIDTH_RATIO = 0.78; // Narrower to show peers
const COLUMN_GAP = 12; // Slightly smaller gap
const TABLET_LAYOUT_MIN_WIDTH = 768;
const IOS_LIGHT_BASE_BACKGROUND = "#F2F2F7";
const IOS_LIGHT_ELEVATED_SURFACE = "#FFFFFF";
const HOME_TASK_ROW_SURFACE_LIGHT = IOS_LIGHT_ELEVATED_SURFACE;
const HOME_TASK_ROW_SURFACE_DARK = "rgba(89, 89, 89, 0.2)";
const BOARD_SIDE_PADDING = 16;
const EDGE_AUTO_SCROLL_ZONE = 112;
const EDGE_AUTO_SCROLL_MAX_STEP = 20;
const EDGE_AUTO_SCROLL_MIN_STEP = 2;
const DRAG_ACCENT = "#F4512C";
const PROJECT_ROW_SWIPE_ACTIVATION_THRESHOLD = 10;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const AnimatedBoardScrollView = Animated.createAnimatedComponent(GHScrollView);

// Updated Order: Upcoming -> Today -> Completed
const SECTIONS: SectionId[] = ["upcoming", "today", "completed"];
const SECTION_TITLES: Record<SectionId, string> = {
  today: t("common.today"),
  upcoming: t("common.upcoming"),
  completed: t("common.completed"),
};

type ThemeName = keyof typeof Colors;

const getBoardLayoutMetrics = ({
  viewportWidth,
  isTabletLayout,
}: {
  viewportWidth: number;
  isTabletLayout: boolean;
}) => {
  const safeViewportWidth =
    Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 1;
  const columnWidth = isTabletLayout
    ? (safeViewportWidth -
        BOARD_SIDE_PADDING * 2 -
        COLUMN_GAP * (SECTIONS.length - 1)) /
      SECTIONS.length
    : safeViewportWidth * PHONE_COLUMN_WIDTH_RATIO;
  const maxOffset = Math.max(
    0,
    BOARD_SIDE_PADDING * 2 +
      columnWidth * SECTIONS.length +
      COLUMN_GAP * (SECTIONS.length - 1) -
      safeViewportWidth,
  );
  const snapOffsets = isTabletLayout
    ? [0, 0, 0]
    : [
        0,
        BOARD_SIDE_PADDING +
          columnWidth +
          COLUMN_GAP +
          columnWidth / 2 -
          safeViewportWidth / 2,
        BOARD_SIDE_PADDING +
          2 * (columnWidth + COLUMN_GAP) +
          columnWidth -
          (safeViewportWidth - BOARD_SIDE_PADDING),
      ].map((offset) => clamp(offset, 0, maxOffset));

  return {
    columnWidth,
    maxOffset,
    snapOffsets,
  };
};

// --- Components ---

function KanbanColumn({
  section,
  tasks,
  columnWidth,
  isDragSource,
  isDropTarget,
  columnBackgroundColor,
  columnBottomPadding,
  boardScrollRef,
  onPressTask,
  theme,
  styles,
  rowStyles,
  dragTranslateXCompensation,
  enabledTags,
  showTagIcons,
  showCompactSubtasks,
  projectsById,
  toggleComplete,
  deleteTask,
  onReorderSection,
  onDragBeginTask,
  onDragStateChange,
  onDragGestureUpdate,
  onSwipeStateChange,
  shrinkToContentWhenShort,
}: {
  section: SectionId;
  tasks: Task[];
  columnWidth: number;
  isDragSource: boolean;
  isDropTarget: boolean;
  columnBackgroundColor: string;
  columnBottomPadding: number;
  boardScrollRef: React.RefObject<GHScrollView | null>;
  onPressTask: (id: string) => void;
  theme: ThemeName;
  styles: ReturnType<typeof createStyles>;
  rowStyles: SwipeTaskRowStyles;
  dragTranslateXCompensation: number;
  enabledTags: Set<TagId>;
  showTagIcons: boolean;
  showCompactSubtasks: boolean;
  projectsById: Map<string, Project>;
  toggleComplete: (taskId: string) => void;
  deleteTask: (taskId: string) => void;
  onReorderSection: (sectionId: SectionId, orderedTaskIds: string[]) => void;
  onDragBeginTask: (taskId: string) => void;
  onDragStateChange: (isDragging: boolean) => void;
  onDragGestureUpdate: (params: TaskDragGestureUpdateParams) => void;
  onSwipeStateChange: (isSwiping: boolean) => void;
  shrinkToContentWhenShort: boolean;
}) {
  const enabledTagsSeed = React.useMemo(
    () => Array.from(enabledTags).sort().join(","),
    [enabledTags],
  );
  const rowLayoutSeed = React.useMemo(
    () =>
      `${enabledTagsSeed}|icons:${showTagIcons ? 1 : 0}|subtasks:${showCompactSubtasks ? 1 : 0}`,
    [enabledTagsSeed, showCompactSubtasks, showTagIcons],
  );
  const keyForTask = React.useCallback(
    (task: Task) =>
      `task-${task.id}:${rowLayoutSeed}:${task.subtitle?.length ?? 0}:${
        task.subtasks?.length ?? 0
      }:${task.notes?.length ?? 0}:${task.dueAt}:${task.dueHasTime ? 1 : 0}:${
        task.location ?? ""
      }:${task.routineType ?? task.routineInterval ?? ""}:${
        task.completedAt ?? 0
      }:${task.color ?? ""}`,
    [rowLayoutSeed],
  );

  return (
    <View
      style={[
        styles.column,
        isDropTarget ? styles.columnDropTarget : null,
        {
          width: columnWidth,
          backgroundColor: columnBackgroundColor,
          zIndex: isDragSource ? 60 : 1,
          elevation: isDragSource ? 60 : 0,
        },
      ]}
    >
      <View style={styles.columnHeader}>
        <Text style={styles.columnTitle}>{SECTION_TITLES[section]}</Text>
        <GlassSurface
          style={styles.countBadge}
          glassEffectStyle="regular"
          tintColor={withAlpha(Colors[theme].text, 0.1)}
          fallbackBackgroundColor={withAlpha(Colors[theme].text, 0.1)}
        >
          <Text style={styles.countText}>{tasks.length}</Text>
        </GlassSurface>
      </View>

      <TaskSwipeDraggableList
        renderMode="auto"
        animateDataLayoutChanges={false}
        theme={theme}
        isDark={theme === "dark"}
        tasks={tasks}
        keyForTask={keyForTask}
        projectsById={projectsById}
        rowStyles={rowStyles}
        itemSpacing={8}
        scrollRef={boardScrollRef}
        enabledTags={enabledTags}
        showTaskIcons={showTagIcons}
        showCompactSubtasks={showCompactSubtasks}
        followHorizontalDrag
        dragTranslateXCompensation={dragTranslateXCompensation}
        rowSwipeActivationThreshold={PROJECT_ROW_SWIPE_ACTIVATION_THRESHOLD}
        shrinkToContentWhenShort={shrinkToContentWhenShort}
        contentContainerStyle={[
          styles.columnContent,
          { paddingBottom: columnBottomPadding },
        ]}
        containerStyle={{ backgroundColor: "transparent", overflow: "visible" }}
        contentInsetAdjustmentBehavior="never"
        empty={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>{t("home.empty.noTasks")}</Text>
          </View>
        }
        onPressTask={onPressTask}
        toggleComplete={toggleComplete}
        deleteTask={deleteTask}
        onReorder={(orderedTaskIds) =>
          onReorderSection(section, orderedTaskIds)
        }
        onDragBeginTask={onDragBeginTask}
        onDragStateChange={onDragStateChange}
        onDragGestureUpdate={onDragGestureUpdate}
        onSwipeStateChange={onSwipeStateChange}
      />
    </View>
  );
}

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = (useColorScheme() ?? "light") as ThemeName;
  const isDark = theme === "dark";
  const { width: viewportWidth } = useWindowDimensions();
  const isTabletLayout =
    Platform.OS === "ios" && viewportWidth >= TABLET_LAYOUT_MIN_WIDTH;
  const { columnWidth, maxOffset: maxBoardOffset, snapOffsets } =
    React.useMemo(
      () =>
        getBoardLayoutMetrics({
          viewportWidth,
          isTabletLayout,
        }),
      [isTabletLayout, viewportWidth],
    );
  const todaySnapOffset = isTabletLayout ? 0 : (snapOffsets[1] ?? 0);
  const isIOS26Plus = Platform.OS === "ios" && isIOS26OrNewer();
  const showFloatingAddButton = Platform.OS === "ios" && !isIOS26Plus;
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const rowStyles = React.useMemo(() => createRowStyles(theme), [theme]);
  const { enabledTags, showTagIcons, showCompactSubtasks } = useHomeFilters();
  const { projects, tasks, setTasks } = useTasksStore();
  const boardScrollRef = React.useRef<GHScrollView | null>(null);
  const boardOffsetXRef = React.useRef<number>(todaySnapOffset);
  const boardOffsetXShared = useSharedValue<number>(todaySnapOffset);
  const boardPageXRef = React.useRef<number>(0);
  const dragPointerXRef = React.useRef<number | null>(null);
  const dragTranslationXRef = React.useRef(0);
  const dragHoverSectionRef = React.useRef<SectionId | null>(null);
  const dragDropSectionRef = React.useRef<SectionId | null>(null);
  const dragBoardOffsetStartRef = React.useRef<number>(todaySnapOffset);
  const isBoardDraggingRef = React.useRef(false);
  const autoScrollVelocityRef = React.useRef(0);
  const autoScrollFrameRef = React.useRef<number | null>(null);
  const previousProjectIdRef = React.useRef<string | undefined>(undefined);
  const previousProjectTaskIdsRef = React.useRef<Set<string>>(new Set());
  const pendingAddTaskScrollRef = React.useRef(false);
  const dragContextRef = React.useRef<{
    taskId: string;
    sourceSection: SectionId;
  } | null>(null);
  const swipingSectionsRef = React.useRef(new Set<SectionId>());
  const boardScrollLockedRef = React.useRef(false);
  const [isBoardScrollLocked, setIsBoardScrollLocked] = React.useState(false);
  const [activeDragSourceSection, setActiveDragSourceSection] =
    React.useState<SectionId | null>(null);
  const [activeDropSection, setActiveDropSection] =
    React.useState<SectionId | null>(null);
  const [dragTranslateXCompensation, setDragTranslateXCompensation] =
    React.useState(0);

  const projectsById = React.useMemo(
    () => new Map(projects.map((p) => [p.id, p] as const)),
    [projects],
  );

  const project = React.useMemo(
    () => projects.find((p) => p.id === id),
    [projects, id],
  );

  const projectTasks = React.useMemo(() => {
    return tasks.filter((t) => t.projectId === id && !t.deletedAt);
  }, [tasks, id]);

  const tasksBySection = React.useMemo(() => {
    const grouped: Record<SectionId, Task[]> = {
      today: [],
      upcoming: [],
      completed: [],
    };
    for (const t of projectTasks) {
      if (grouped[t.section]) {
        grouped[t.section].push(t);
      }
    }
    for (const sectionId of SECTIONS) {
      grouped[sectionId] = [...grouped[sectionId]].sort(
        (a, b) => (a.orderRank ?? 0) - (b.orderRank ?? 0),
      );
    }
    return grouped;
  }, [projectTasks]);

  const onPressTask = React.useCallback(
    (taskId: string) => {
      router.push({ pathname: "/task/[id]", params: { id: taskId } });
    },
    [router],
  );

  const onEditProject = React.useCallback(() => {
    router.push({ pathname: "/project/edit-modal", params: { id } });
  }, [id, router]);

  const updateHoverSection = React.useCallback((next: SectionId | null) => {
    if (dragHoverSectionRef.current === next) return;
    dragHoverSectionRef.current = next;
    dragDropSectionRef.current = next;
    setActiveDropSection((current) => (current === next ? current : next));
  }, []);

  const updateDragTranslateXCompensation = React.useCallback((offsetX: number) => {
    if (!isBoardDraggingRef.current || !Number.isFinite(offsetX)) {
      setDragTranslateXCompensation((current) => (current === 0 ? current : 0));
      return;
    }
    const nextCompensation = offsetX - dragBoardOffsetStartRef.current;
    setDragTranslateXCompensation((current) =>
      Math.abs(current - nextCompensation) < 0.5 ? current : nextCompensation
    );
  }, []);

  const resolveSectionFromBoardContentX = React.useCallback(
    (boardContentX: number): SectionId => {
      const span = columnWidth + COLUMN_GAP;
      const start = BOARD_SIDE_PADDING + columnWidth / 2;
      const relative = boardContentX - start;
      const index = clamp(Math.round(relative / span), 0, SECTIONS.length - 1);
      return SECTIONS[index] ?? "today";
    },
    [columnWidth],
  );
  const resolveSectionFromTranslationX = React.useCallback(
    (sourceSection: SectionId, translationX: number): SectionId => {
      if (!Number.isFinite(translationX)) return sourceSection;
      const sourceIndex = SECTIONS.indexOf(sourceSection);
      if (sourceIndex < 0) return sourceSection;
      const span = columnWidth + COLUMN_GAP;
      // Keep horizontal switching intentional and one column per drag step.
      const stepThreshold = Math.max(96, span * 0.42);
      const indexShift =
        translationX >= stepThreshold
          ? 1
          : translationX <= -stepThreshold
            ? -1
            : 0;
      const shiftedIndex = clamp(
        sourceIndex + indexShift,
        0,
        SECTIONS.length - 1,
      );
      return SECTIONS[shiftedIndex] ?? sourceSection;
    },
    [columnWidth],
  );

  const stopAutoScroll = React.useCallback(() => {
    autoScrollVelocityRef.current = 0;
    if (autoScrollFrameRef.current !== null) {
      cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
  }, []);

  const updateBoardPageX = React.useCallback(() => {
    const boardNode =
      // @ts-ignore - some scroll refs expose getNode
      boardScrollRef.current?.getNode?.() ?? boardScrollRef.current;
    if (!boardNode || typeof boardNode.measureInWindow !== "function") return;
    boardNode.measureInWindow((x: number) => {
      if (typeof x === "number" && Number.isFinite(x)) {
        boardPageXRef.current = x;
      }
    });
  }, []);

  const onBoardScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      boardOffsetXShared.value = event.contentOffset.x;
    },
  });

  const syncBoardOffsetFromScrollEvent = React.useCallback((event: any) => {
    const nextOffset = event?.nativeEvent?.contentOffset?.x;
    if (typeof nextOffset === "number" && Number.isFinite(nextOffset)) {
      boardOffsetXRef.current = nextOffset;
      updateDragTranslateXCompensation(nextOffset);
    }
  }, [updateDragTranslateXCompensation]);

  const applyBoardScrollLock = React.useCallback(
    (locked: boolean) => {
      if (boardScrollLockedRef.current === locked) return;
      boardScrollLockedRef.current = locked;
      setIsBoardScrollLocked((prev) => (prev === locked ? prev : locked));

      const scrollNode =
        // @ts-ignore - some scroll refs expose getNode
        boardScrollRef.current?.getNode?.() ?? boardScrollRef.current;
      if (scrollNode?.setNativeProps) {
        scrollNode.setNativeProps({ scrollEnabled: !locked });
      }

      // Stop ongoing board movement immediately when a row interaction starts.
      if (locked) {
        const currentX = boardOffsetXShared.value;
        if (typeof currentX === "number" && Number.isFinite(currentX)) {
          boardOffsetXRef.current = currentX;
        }
        boardScrollRef.current?.scrollTo({ x: currentX, animated: false });
      }
    },
    [boardOffsetXShared],
  );

  const syncBoardScrollLock = React.useCallback(() => {
    const shouldLock =
      isTabletLayout ||
      isBoardDraggingRef.current ||
      swipingSectionsRef.current.size > 0;
    applyBoardScrollLock(shouldLock);
  }, [applyBoardScrollLock, isTabletLayout]);

  const handleSectionSwipeStateChange = React.useCallback(
    (section: SectionId, isSwiping: boolean) => {
      const set = swipingSectionsRef.current;
      if (isSwiping) {
        set.add(section);
      } else {
        set.delete(section);
      }
      syncBoardScrollLock();
    },
    [syncBoardScrollLock],
  );

  const startAutoScroll = React.useCallback(() => {
    if (autoScrollFrameRef.current !== null) return;
    const tick = () => {
      if (!isBoardDraggingRef.current) {
        autoScrollFrameRef.current = null;
        return;
      }
      const velocity = autoScrollVelocityRef.current;
      if (Math.abs(velocity) < 0.01) {
        autoScrollFrameRef.current = null;
        return;
      }

      const currentOffset = boardOffsetXRef.current;
      const nextOffset = clamp(currentOffset + velocity, 0, maxBoardOffset);
      if (nextOffset !== currentOffset) {
        boardOffsetXRef.current = nextOffset;
        boardOffsetXShared.value = nextOffset;
        boardScrollRef.current?.scrollTo({ x: nextOffset, animated: false });
        updateDragTranslateXCompensation(nextOffset);
        const pointerX = dragPointerXRef.current;
        if (typeof pointerX === "number" && Number.isFinite(pointerX)) {
          updateHoverSection(
            resolveSectionFromBoardContentX(nextOffset + pointerX),
          );
        }
      }

      autoScrollFrameRef.current = requestAnimationFrame(tick);
    };
    autoScrollFrameRef.current = requestAnimationFrame(tick);
  }, [
    boardOffsetXShared,
    maxBoardOffset,
    resolveSectionFromBoardContentX,
    updateDragTranslateXCompensation,
    updateHoverSection,
  ]);

  const applyDragPointerX = React.useCallback(
    (pointerX: number, preferredSection?: SectionId) => {
      dragPointerXRef.current = pointerX;
      const resolvedSection =
        preferredSection ??
        resolveSectionFromBoardContentX(boardOffsetXRef.current + pointerX);
      updateHoverSection(resolvedSection);

      let velocity = 0;
      if (pointerX <= EDGE_AUTO_SCROLL_ZONE) {
        const strength = clamp(
          (EDGE_AUTO_SCROLL_ZONE - pointerX) / EDGE_AUTO_SCROLL_ZONE,
          0,
          1,
        );
        velocity = -(
          EDGE_AUTO_SCROLL_MIN_STEP +
          strength * (EDGE_AUTO_SCROLL_MAX_STEP - EDGE_AUTO_SCROLL_MIN_STEP)
        );
      } else if (pointerX >= viewportWidth - EDGE_AUTO_SCROLL_ZONE) {
        const strength = clamp(
          (pointerX - (viewportWidth - EDGE_AUTO_SCROLL_ZONE)) /
            EDGE_AUTO_SCROLL_ZONE,
          0,
          1,
        );
        velocity =
          EDGE_AUTO_SCROLL_MIN_STEP +
          strength * (EDGE_AUTO_SCROLL_MAX_STEP - EDGE_AUTO_SCROLL_MIN_STEP);
      }

      if (isTabletLayout) {
        stopAutoScroll();
        return;
      }
      autoScrollVelocityRef.current = velocity;
      if (Math.abs(velocity) < 0.01) {
        stopAutoScroll();
        return;
      }
      if (isBoardDraggingRef.current) {
        startAutoScroll();
      }
    },
    [
      isTabletLayout,
      resolveSectionFromBoardContentX,
      startAutoScroll,
      stopAutoScroll,
      updateHoverSection,
      viewportWidth,
    ],
  );
  const handleBoardDragGestureUpdate = React.useCallback(
    (params: TaskDragGestureUpdateParams) => {
      const dragContext = dragContextRef.current;
      if (!dragContext) return;
      dragTranslationXRef.current = Number.isFinite(params.translationX)
        ? params.translationX
        : 0;
      if (!Number.isFinite(params.absoluteX)) {
        if (params.phase === "end") {
          stopAutoScroll();
        }
        return;
      }
      const pointerX = clamp(
        params.absoluteX - boardPageXRef.current,
        0,
        viewportWidth,
      );
      if (params.phase === "end") {
        dragPointerXRef.current = pointerX;
        const pointerSection = resolveSectionFromBoardContentX(
          boardOffsetXRef.current + pointerX,
        );
        updateHoverSection(pointerSection);
        stopAutoScroll();
        return;
      }
      const pointerSection = resolveSectionFromBoardContentX(
        boardOffsetXRef.current + pointerX,
      );
      applyDragPointerX(pointerX, pointerSection);
    },
    [
      applyDragPointerX,
      resolveSectionFromBoardContentX,
      stopAutoScroll,
      updateHoverSection,
      viewportWidth,
    ],
  );

  const onReorderSection = React.useCallback(
    (section: SectionId, orderedTaskIds: string[]) => {
      const dropSection = (() => {
        if (dragDropSectionRef.current) return dragDropSectionRef.current;
        if (dragHoverSectionRef.current) return dragHoverSectionRef.current;

        const pointerX = dragPointerXRef.current;
        if (typeof pointerX === "number" && Number.isFinite(pointerX)) {
          return resolveSectionFromBoardContentX(
            boardOffsetXRef.current + pointerX,
          );
        }

        if (
          dragContextRef.current &&
          Number.isFinite(dragTranslationXRef.current)
        ) {
          return resolveSectionFromTranslationX(
            dragContextRef.current.sourceSection,
            dragTranslationXRef.current,
          );
        }

        return section;
      })();

      const dragContext = dragContextRef.current;
      const draggedTaskId =
        dragContext?.sourceSection === section ? dragContext.taskId : null;

      if (dropSection === section || !draggedTaskId) {
        const orderIndex = new Map(
          orderedTaskIds.map((taskId, i) => [taskId, i] as const),
        );
        setTasks((prev) =>
          prev.map((t) => {
            const idx = orderIndex.get(t.id);
            if (idx === undefined) return t;
            return { ...t, orderRank: (idx + 1) * 1000 };
          }),
        );
        dragContextRef.current = null;
        dragDropSectionRef.current = null;
        dragPointerXRef.current = null;
        dragTranslationXRef.current = 0;
        updateHoverSection(null);
        stopAutoScroll();
        isBoardDraggingRef.current = false;
        syncBoardScrollLock();
        setActiveDragSourceSection(null);
        setDragTranslateXCompensation(0);
        return;
      }

      setTasks((prev) => {
        const movedTask = prev.find(
          (candidate) =>
            candidate.id === draggedTaskId &&
            candidate.projectId === id &&
            !candidate.deletedAt,
        );
        if (!movedTask) {
          return prev;
        }

        const sourceIds = orderedTaskIds.filter(
          (taskId) => taskId !== draggedTaskId,
        );
        const targetIds = prev
          .filter(
            (candidate) =>
              candidate.projectId === id &&
              !candidate.deletedAt &&
              candidate.section === dropSection &&
              candidate.id !== draggedTaskId,
          )
          .sort((a, b) => (a.orderRank ?? 0) - (b.orderRank ?? 0))
          .map((candidate) => candidate.id);

        const sourceOrderIndex = new Map(
          sourceIds.map((taskId, idx) => [taskId, idx] as const),
        );
        const targetOrderIndex = new Map(
          [draggedTaskId, ...targetIds].map(
            (taskId, idx) => [taskId, idx] as const,
          ),
        );
        const completionTimestamp = Date.now();
        const targetDayStartMs = getStartOfLocalDayMs();
        let completedRoutineEntry: Task | null = null;
        const existingTaskIds = new Set(prev.map((candidate) => candidate.id));

        const next: Task[] = prev.map((task): Task => {
          if (task.id === draggedTaskId) {
            const nextOrderRank = ((targetOrderIndex.get(task.id) ?? 0) + 1) * 1000;
            if (dropSection === "completed") {
              const routineTransition = createRoutineCompletionTransition(
                task,
                completionTimestamp,
                existingTaskIds,
              );
              if (routineTransition) {
                completedRoutineEntry = {
                  ...routineTransition.completedTask,
                  orderRank: nextOrderRank,
                };
                return {
                  ...routineTransition.nextTask,
                  orderRank: completionTimestamp,
                };
              }
              return {
                ...task,
                section: "completed",
                completedAt: completionTimestamp,
                orderRank: nextOrderRank,
              };
            }

            if (dropSection === "today") {
              const keepTime =
                task.dueHasTime === true ||
                (task.dueHasTime !== false && hasValidDueAt(task.dueAt));
              const nextDueAt = alignDueAtToLocalDay(targetDayStartMs, {
                sourceDueAt: task.dueAt,
                keepTime,
              });
              return {
                ...task,
                section: deriveActiveSectionFromDueAt(nextDueAt),
                dueAt: nextDueAt,
                dueHasTime: keepTime,
                completedAt: undefined,
                orderRank: nextOrderRank,
              };
            }

            return {
              ...task,
              section: "upcoming",
              dueAt: 0,
              dueHasTime: false,
              completedAt: undefined,
              orderRank: nextOrderRank,
            };
          }

          if (task.projectId !== id || task.deletedAt) {
            return task;
          }

          if (task.section === section) {
            const sourceIdx = sourceOrderIndex.get(task.id);
            if (sourceIdx === undefined) return task;
            return { ...task, orderRank: (sourceIdx + 1) * 1000 };
          }

          if (task.section === dropSection) {
            const targetIdx = targetOrderIndex.get(task.id);
            if (targetIdx === undefined) return task;
            return { ...task, orderRank: (targetIdx + 1) * 1000 };
          }

          return task;
        });

        return completedRoutineEntry ? [...next, completedRoutineEntry] : next;
      });
      dragContextRef.current = null;
      dragDropSectionRef.current = null;
      dragPointerXRef.current = null;
      dragTranslationXRef.current = 0;
      updateHoverSection(null);
      stopAutoScroll();
      isBoardDraggingRef.current = false;
      syncBoardScrollLock();
      setActiveDragSourceSection(null);
      setDragTranslateXCompensation(0);
    },
    [
      id,
      resolveSectionFromBoardContentX,
      resolveSectionFromTranslationX,
      setTasks,
      syncBoardScrollLock,
      stopAutoScroll,
      updateHoverSection,
    ],
  );

  const toggleComplete = React.useCallback(
    (taskId: string) => {
      setTasks((prev) => {
        const task = prev.find((t) => t.id === taskId);
        if (!task) return prev;

        const fromSection = task.section;
        let toSection: SectionId =
          fromSection === "completed" ? "today" : "completed";

        const now = Date.now();
        let completedRoutineEntry: Task | null = null;

        const next: Task[] = prev.map((t) => {
          if (t.id !== taskId) return t;

          if (toSection === "completed") {
            const routineTransition = createRoutineCompletionTransition(
              t,
              now,
              new Set(prev.map((candidate) => candidate.id)),
            );
            if (routineTransition) {
              toSection = routineTransition.nextTask.section;
              completedRoutineEntry = routineTransition.completedTask;
              return routineTransition.nextTask;
            }
            const updated: Task = {
              ...t,
              section: "completed",
              completedAt: now,
            };
            return updated;
          }

          const hasDueAt = hasValidDueAt(t.dueAt);
          toSection = hasDueAt
            ? deriveActiveSectionFromDueAt(t.dueAt)
            : "today";
          const updated: Task = {
            ...t,
            section: toSection,
            completedAt: undefined,
            ...(hasDueAt
              ? {}
              : {
                  dueAt: getDueAtForSection("today"),
                  dueHasTime: true,
                }),
          };
          return updated;
        });

        const nextWithCompletionEntry = completedRoutineEntry
          ? [...next, completedRoutineEntry]
          : next;

        // Keep ordering tidy within the destination section by putting moved task at the top.
        const moved = nextWithCompletionEntry.find((t) => t.id === taskId);
        if (!moved) return nextWithCompletionEntry;

        const others = nextWithCompletionEntry.filter((t) => t.id !== taskId);
        const dest = others
          .filter((t) => t.section === toSection)
          .sort((a, b) => (a.orderRank ?? 0) - (b.orderRank ?? 0));
        const rest = others.filter((t) => t.section !== toSection);

        const withInserted = [...rest, moved, ...dest];

        const reseed = (items: Task[], sectionId: SectionId) => {
          const sectionIds = items
            .filter((t) => t.section === sectionId)
            .sort((a, b) => (a.orderRank ?? 0) - (b.orderRank ?? 0))
            .map((t) => t.id);
          const byId = new Map(items.map((t) => [t.id, t] as const));
          sectionIds.forEach((id, index) => {
            const current = byId.get(id);
            if (!current) return;
            byId.set(id, { ...current, orderRank: (index + 1) * 1000 });
          });
          return items.map((t) => byId.get(t.id) ?? t);
        };

        const reseededFrom = reseed(withInserted, fromSection);
        const reseededBoth = reseed(reseededFrom, toSection);
        if (completedRoutineEntry && toSection !== "completed") {
          return reseed(reseededBoth, "completed");
        }
        return reseededBoth;
      });
    },
    [setTasks],
  );

  const deleteTask = React.useCallback(
    (taskId: string) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, deletedAt: Date.now() } : t,
        ),
      );
    },
    [setTasks],
  );

  const handleBoardTouch = React.useCallback(
    (event: any) => {
      if (!dragContextRef.current || !isBoardDraggingRef.current) return;
      const nativeEvent = event?.nativeEvent;
      const touch =
        nativeEvent?.touches?.[0] ?? nativeEvent?.changedTouches?.[0];
      const pageX =
        typeof touch?.pageX === "number"
          ? touch.pageX
          : typeof nativeEvent?.pageX === "number"
            ? nativeEvent.pageX
            : null;
      const pointerX =
        typeof pageX === "number" && Number.isFinite(pageX)
          ? pageX - boardPageXRef.current
          : null;
      if (typeof pointerX === "number" && Number.isFinite(pointerX)) {
        applyDragPointerX(clamp(pointerX, 0, viewportWidth));
      }
    },
    [applyDragPointerX, viewportWidth],
  );

  const handleAddTask = React.useCallback(() => {
    pendingAddTaskScrollRef.current = true;
    router.push({ pathname: "/task/create-modal", params: { projectId: id } });
  }, [id, router]);

  React.useEffect(() => {
    boardOffsetXRef.current = todaySnapOffset;
    boardOffsetXShared.value = todaySnapOffset;
    dragBoardOffsetStartRef.current = todaySnapOffset;
    requestAnimationFrame(() => {
      boardScrollRef.current?.scrollTo({ x: todaySnapOffset, animated: false });
    });
  }, [boardOffsetXShared, todaySnapOffset]);

  React.useEffect(() => {
    const rafId = requestAnimationFrame(updateBoardPageX);
    return () => cancelAnimationFrame(rafId);
  }, [updateBoardPageX]);

  React.useEffect(() => {
    const swipingSections = swipingSectionsRef.current;
    const boardRef = boardScrollRef.current;
    return () => {
      stopAutoScroll();
      isBoardDraggingRef.current = false;
      swipingSections.clear();
      boardScrollLockedRef.current = false;
      setDragTranslateXCompensation(0);
      const scrollNode =
        // @ts-ignore - some scroll refs expose getNode
        boardRef?.getNode?.() ?? boardRef;
      if (scrollNode?.setNativeProps) {
        scrollNode.setNativeProps({ scrollEnabled: true });
      }
    };
  }, [stopAutoScroll]);

  React.useEffect(() => {
    const currentIds = new Set(projectTasks.map((task) => task.id));

    if (previousProjectIdRef.current !== id) {
      previousProjectIdRef.current = id;
      previousProjectTaskIdsRef.current = currentIds;
      return;
    }

    const previousIds = previousProjectTaskIdsRef.current;
    const addedIds: string[] = [];
    currentIds.forEach((taskId) => {
      if (!previousIds.has(taskId)) {
        addedIds.push(taskId);
      }
    });
    previousProjectTaskIdsRef.current = currentIds;

    if (!pendingAddTaskScrollRef.current || addedIds.length === 0) {
      return;
    }
    pendingAddTaskScrollRef.current = false;

    const addedIdSet = new Set(addedIds);
    let targetSection: SectionId = "today";
    for (let index = tasks.length - 1; index >= 0; index -= 1) {
      const candidate = tasks[index];
      if (
        candidate.projectId === id &&
        !candidate.deletedAt &&
        addedIdSet.has(candidate.id)
      ) {
        targetSection = candidate.section;
        break;
      }
    }

    const sectionIndex = SECTIONS.indexOf(targetSection);
    if (sectionIndex < 0) {
      return;
    }
    const targetOffsetX = snapOffsets[sectionIndex] ?? 0;
    requestAnimationFrame(() => {
      boardScrollRef.current?.scrollTo({ x: targetOffsetX, animated: true });
    });
  }, [id, projectTasks, snapOffsets, tasks]);

  React.useEffect(() => {
    if (project) return;
    router.replace("/(tabs)/explore");
  }, [project, router]);

  if (!project) {
    return null;
  }

  const projectDescription = project.description?.trim();
  const columnBackgroundColor = withAlpha(project.color, isDark ? 0.2 : 0.14);
  const boardBottomPadding = showFloatingAddButton ? 96 : 40;
  const columnBottomPadding = isIOS26Plus ? 96 : 20;

  return (
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: Colors[theme].background }}
    >
      <View style={styles.container}>
        <Stack.Screen
          options={{
            title: project.name,
            headerLargeTitle: false,
            headerShadowVisible: false,
            headerBackButtonDisplayMode: "minimal",
            gestureEnabled: false,
            headerBackTitle: t("project.backProjects"),
            headerTintColor: Colors[theme].text,
            headerTitleAlign: "left",
            headerTitleStyle: { color: Colors[theme].text },
            headerStyle: { backgroundColor: Colors[theme].background },
            headerRight: () => (
              <HeaderIconButton
                onPress={onEditProject}
                accessibilityRole="button"
                accessibilityLabel={t("projectEdit.editProject")}
              >
                <MaterialIcons
                  name="edit"
                  size={24}
                  color={Colors[theme].text}
                />
              </HeaderIconButton>
            ),
          }}
        />

        {projectDescription ? (
          <View style={styles.descriptionWrap}>
            <Text style={styles.descriptionText} numberOfLines={2}>
              {projectDescription}
            </Text>
          </View>
        ) : null}

        {/* Main Board */}
        <AnimatedBoardScrollView
          ref={boardScrollRef}
          style={styles.boardScroll}
          horizontal
          scrollEnabled={!isBoardScrollLocked && !isTabletLayout}
          pagingEnabled={false}
          snapToOffsets={isTabletLayout ? undefined : snapOffsets}
          decelerationRate="fast"
          contentContainerStyle={[
            styles.boardContent,
            { paddingHorizontal: 16, paddingBottom: boardBottomPadding },
          ]}
          showsHorizontalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
          contentOffset={{ x: todaySnapOffset, y: 0 }} // Start focused on Today
          onScroll={onBoardScroll}
          onScrollEndDrag={syncBoardOffsetFromScrollEvent}
          onMomentumScrollEnd={syncBoardOffsetFromScrollEvent}
          onTouchStart={handleBoardTouch}
          onTouchMove={handleBoardTouch}
          onTouchEnd={handleBoardTouch}
          onTouchEndCapture={handleBoardTouch}
          onLayout={updateBoardPageX}
          onTouchCancel={() => {
            dragPointerXRef.current = null;
            stopAutoScroll();
            setDragTranslateXCompensation(0);
          }}
          scrollEventThrottle={16}
        >
          {SECTIONS.map((section) => (
            <KanbanColumn
              key={section}
              section={section}
              tasks={tasksBySection[section]}
              columnWidth={columnWidth}
              isDragSource={activeDragSourceSection === section}
              isDropTarget={
                activeDragSourceSection !== null &&
                activeDropSection === section
              }
              columnBackgroundColor={columnBackgroundColor}
              columnBottomPadding={columnBottomPadding}
              boardScrollRef={boardScrollRef}
              onPressTask={onPressTask}
              theme={theme}
              styles={styles}
              rowStyles={rowStyles}
              dragTranslateXCompensation={
                activeDragSourceSection === section
                  ? dragTranslateXCompensation
                  : 0
              }
              enabledTags={enabledTags}
              showTagIcons={showTagIcons}
              showCompactSubtasks={showCompactSubtasks}
              projectsById={projectsById}
              toggleComplete={toggleComplete}
              deleteTask={deleteTask}
              onReorderSection={onReorderSection}
              onDragBeginTask={(taskId) => {
                dragPointerXRef.current = null;
                dragTranslationXRef.current = 0;
                dragDropSectionRef.current = section;
                dragContextRef.current = { taskId, sourceSection: section };
                const currentOffset = boardOffsetXShared.value;
                if (
                  typeof currentOffset === "number" &&
                  Number.isFinite(currentOffset)
                ) {
                  boardOffsetXRef.current = currentOffset;
                  dragBoardOffsetStartRef.current = currentOffset;
                }
                setDragTranslateXCompensation(0);
                setActiveDragSourceSection(section);
                updateBoardPageX();
                updateHoverSection(section);
                stopAutoScroll();
              }}
              onDragStateChange={(isDragging) => {
                isBoardDraggingRef.current = isDragging;
                syncBoardScrollLock();
                if (!isDragging) {
                  // Keep hover/pointer state until onReorderSection runs.
                  // DraggableFlatList calls onDragStateChange(false) before onReorder.
                  stopAutoScroll();
                }
              }}
              onDragGestureUpdate={handleBoardDragGestureUpdate}
              onSwipeStateChange={(isSwiping) =>
                handleSectionSwipeStateChange(section, isSwiping)
              }
              shrinkToContentWhenShort={!isTabletLayout}
            />
          ))}
        </AnimatedBoardScrollView>
        {showFloatingAddButton ? (
          <FloatingAddButton onPress={handleAddTask} />
        ) : null}
      </View>
    </GestureHandlerRootView>
  );
}

const createStyles = (theme: ThemeName) => {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors[theme].background,
    },
    descriptionWrap: {
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 2,
    },
    descriptionText: {
      fontSize: 14,
      lineHeight: 20,
      color: withAlpha(Colors[theme].text, 0.65),
    },
    boardContent: {
      paddingTop: 8,
      gap: COLUMN_GAP,
      overflow: "visible",
      alignItems: "stretch",
      // paddingHorizontal is handled dynamically in style prop
    },
    boardScroll: {
      flex: 1,
      overflow: "visible",
    },
    column: {
      borderRadius: 16,
      padding: 12,
      height: "100%",
      position: "relative",
      overflow: "visible",
    },
    columnDropTarget: {
      borderWidth: 2,
      borderColor: DRAG_ACCENT,
      backgroundColor: withAlpha(DRAG_ACCENT, theme === "dark" ? 0.2 : 0.12),
      shadowColor: DRAG_ACCENT,
      shadowOpacity: theme === "dark" ? 0.34 : 0.2,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
    },
    columnHeader: {
      position: "relative",
      zIndex: 30,
      elevation: 30,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
      paddingHorizontal: 4,
    },
    columnTitle: {
      fontSize: 17,
      fontWeight: "600",
      color: Colors[theme].text,
    },
    countBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 12,
      overflow: "hidden",
    },
    countText: {
      fontSize: 13,
      fontWeight: "500",
      color: withAlpha(Colors[theme].text, 0.6),
    },
    columnContent: {
      gap: 0,
      overflow: "visible",
    },
    card: {
      borderRadius: 12,
      padding: 12, // Reduced padding slightly as rowInner has gap
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
      justifyContent: "center",
    },
    cardInner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    emojiTile: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    emoji: {
      fontSize: 18,
    },
    textStack: {
      flex: 1,
      gap: 2,
    },
    cardTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: Colors[theme].text,
      lineHeight: 20,
    },
    cardSubtitle: {
      fontSize: 12,
      fontWeight: "600",
      color: withAlpha(Colors[theme].text, 0.7),
    },
    emptyState: {
      padding: 20,
      alignItems: "center",
    },
    emptyText: {
      color: withAlpha(Colors[theme].text, 0.4),
      fontStyle: "italic",
    },
  });
};

const createRowStyles = (theme: ThemeName): SwipeTaskRowStyles => {
  const isDark = theme === "dark";
  const useAppleLightPalette = !isDark && Platform.OS === "ios";
  const text = Colors[theme].text;

  const ALPHA_3 = 0.48;
  const WEIGHT_HEADING = "700" as const;
  const WEIGHT_BODY = "600" as const;
  const WEIGHT_SUBTLE = "500" as const;
  const RADIUS_PILL = 999;

  const rowCardSurface = isDark
    ? HOME_TASK_ROW_SURFACE_DARK
    : HOME_TASK_ROW_SURFACE_LIGHT;
  const heroCardBorder = isDark
    ? "rgba(255,255,255,0.09)"
    : useAppleLightPalette
      ? "rgba(60,60,67,0.18)"
      : "rgba(17,24,28,0.09)";
  const rowMetaText = withAlpha(text, ALPHA_3);
  const dangerBg = isDark ? "rgba(255,69,58,0.18)" : "rgba(255,59,48,0.14)";
  const dangerBorder = isDark ? "rgba(255,69,58,0.32)" : "rgba(255,59,48,0.26)";

  return StyleSheet.create({
    itemSpacer: {
      marginBottom: 0,
      width: "100%",
      alignSelf: "stretch",
    },
    swipeClip: {
      borderRadius: 20,
      overflow: "hidden",
      backgroundColor: "transparent",
      marginHorizontal: 0,
      minHeight: 52,
      width: "100%",
      alignSelf: "stretch",
    },
    underlay: {
      ...StyleSheet.absoluteFillObject,
    },
    actionSlot: {
      position: "absolute",
      top: 0,
      bottom: 0,
      justifyContent: "center",
    },
    actionSlotLeft: {
      left: 0,
      alignItems: "center",
    },
    actionSlotRight: {
      right: 0,
      alignItems: "center",
    },
    actionSlotInner: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "stretch",
    },

    row: {
      minHeight: 52,
      width: "100%",
      borderRadius: 20,
      backgroundColor: rowCardSurface,
      justifyContent: "center",
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
      overflow: "visible",
      zIndex: 220,
      elevation: 72,
      shadowColor: "#000000",
      shadowOpacity: isDark ? 0.34 : 0.2,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      transform: [{ scale: 1.02 }],
    },
    rowInner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },
    emojiTile: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      borderWidth: 0,
      marginTop: 0,
      backgroundColor: "transparent",
    },
    emojiText: {
      fontSize: 24,
    },
    textStack: {
      flex: 1,
      gap: 2,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    rowTitle: {
      flex: 1,
      fontSize: 16,
      lineHeight: 20,
      fontWeight: WEIGHT_HEADING,
      color: text,
      letterSpacing: -0.2,
    },
    rowMeta: {
      fontSize: 10,
      lineHeight: 14,
      fontWeight: WEIGHT_BODY,
      color: rowMetaText,
      letterSpacing: 0.1,
    },
    rowSubtitle: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: WEIGHT_SUBTLE,
      color: withAlpha(text, 0.32),
    },

    tagRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 2,
    },
    tagChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      maxWidth: "100%",
      paddingVertical: 2,
      paddingHorizontal: 8,
      borderRadius: RADIUS_PILL,
      borderWidth: 0,
      backgroundColor: isDark
        ? "rgba(255,255,255,0.12)"
        : useAppleLightPalette
          ? IOS_LIGHT_BASE_BACKGROUND
          : "rgba(255,255,255,0.85)",
    },
    tagChipDanger: {
      backgroundColor: dangerBg,
      borderColor: dangerBorder,
    },
    tagChipText: {
      fontSize: 10,
      lineHeight: 14,
      fontWeight: WEIGHT_HEADING,
      letterSpacing: 0.2,
      textTransform: "uppercase",
      color: isDark ? withAlpha(text, 0.7) : withAlpha(text, 0.5),
      maxWidth: 220,
    },
  }) as unknown as SwipeTaskRowStyles;
};
