import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { GestureHandlerRootView, ScrollView } from "react-native-gesture-handler";
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";

import type { SwipeTaskRowStyles } from "@/components/tasks/swipe-task-row";
import { TaskSwipeDraggableList } from "@/components/tasks/task-swipe-draggable-list";
import { FloatingAddButton } from "@/components/ui/floating-add-button";
import { GlassSurface, withAlpha } from "@/components/ui/glass-surface";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { Colors } from "@/constants/theme";
import {
  getDueAtForSection,
  Project,
  SectionId,
  Task,
  useTasksStore,
} from "@/context/tasks-store";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { t } from "@/i18n";
import { isIOS26OrNewer } from "@/utils/ios-version";
import { deriveActiveSectionFromDueAt, hasValidDueAt } from "@/utils/task-dates";

const SCREEN_WIDTH = Dimensions.get("window").width;
const COLUMN_WIDTH = SCREEN_WIDTH * 0.78; // Narrower to show peers
const COLUMN_GAP = 12; // Slightly smaller gap
const BOARD_SIDE_PADDING = 16;
const EDGE_AUTO_SCROLL_ZONE = 84;
const EDGE_AUTO_SCROLL_MAX_STEP = 16;
const EDGE_AUTO_SCROLL_MIN_STEP = 1.5;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const AnimatedBoardScrollView = Animated.createAnimatedComponent(ScrollView);

const SNAP_OFFSETS = [
  0,
  BOARD_SIDE_PADDING + COLUMN_WIDTH + COLUMN_GAP + COLUMN_WIDTH / 2 - SCREEN_WIDTH / 2,
  BOARD_SIDE_PADDING +
    2 * (COLUMN_WIDTH + COLUMN_GAP) +
    COLUMN_WIDTH -
    (SCREEN_WIDTH - BOARD_SIDE_PADDING),
];

// Updated Order: Upcoming -> Today -> Completed
const SECTIONS: SectionId[] = ["upcoming", "today", "completed"];
const SECTION_TITLES: Record<SectionId, string> = {
  today: t("common.today"),
  upcoming: t("common.upcoming"),
  completed: t("common.completed"),
};

type ThemeName = keyof typeof Colors;

// --- Components ---

function KanbanColumn({
  section,
  tasks,
  isDragSource,
  columnBackgroundColor,
  columnBottomPadding,
  boardScrollRef,
  onPressTask,
  theme,
  styles,
  rowStyles,
  projectsById,
  toggleComplete,
  deleteTask,
  onReorderSection,
  onDragBeginTask,
  onDragStateChange,
  onSwipeStateChange,
  onRowTouchStateChange,
}: {
  section: SectionId;
  tasks: Task[];
  isDragSource: boolean;
  columnBackgroundColor: string;
  columnBottomPadding: number;
  boardScrollRef: React.RefObject<ScrollView | null>;
  onPressTask: (id: string) => void;
  theme: ThemeName;
  styles: ReturnType<typeof createStyles>;
  rowStyles: SwipeTaskRowStyles;
  projectsById: Map<string, Project>;
  toggleComplete: (taskId: string) => void;
  deleteTask: (taskId: string) => void;
  onReorderSection: (sectionId: SectionId, orderedTaskIds: string[]) => void;
  onDragBeginTask: (taskId: string) => void;
  onDragStateChange: (isDragging: boolean) => void;
  onSwipeStateChange: (isSwiping: boolean) => void;
  onRowTouchStateChange: (isTouching: boolean) => void;
}) {
  return (
    <View
      style={[
        styles.column,
        {
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
        theme={theme}
        isDark={theme === "dark"}
        tasks={tasks}
        projectsById={projectsById}
        rowStyles={rowStyles}
        itemSpacing={8}
        scrollRef={boardScrollRef}
        enabledTags={new Set()}
        showTaskIcons={true}
        contentContainerStyle={[styles.columnContent, { paddingBottom: columnBottomPadding }]}
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
        onSwipeStateChange={onSwipeStateChange}
        onRowTouchStateChange={onRowTouchStateChange}
      />
    </View>
  );
}

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = (useColorScheme() ?? "light") as ThemeName;
  const isDark = theme === "dark";
  const isIOS26Plus = Platform.OS === "ios" && isIOS26OrNewer();
  const showFloatingAddButton = Platform.OS === "ios" && !isIOS26Plus;
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const rowStyles = React.useMemo(() => createRowStyles(theme), [theme]);
  const { projects, tasks, setTasks } = useTasksStore();
  const boardScrollRef = React.useRef<ScrollView | null>(null);
  const boardOffsetXRef = React.useRef<number>(SNAP_OFFSETS[1] ?? 0);
  const boardOffsetXShared = useSharedValue<number>(SNAP_OFFSETS[1] ?? 0);
  const boardPageXRef = React.useRef<number>(0);
  const dragPointerXRef = React.useRef<number | null>(null);
  const dragHoverSectionRef = React.useRef<SectionId | null>(null);
  const isBoardDraggingRef = React.useRef(false);
  const autoScrollVelocityRef = React.useRef(0);
  const autoScrollFrameRef = React.useRef<number | null>(null);
  const previousProjectIdRef = React.useRef<string | undefined>(undefined);
  const previousProjectTaskIdsRef = React.useRef<Set<string>>(new Set());
  const pendingAddTaskScrollRef = React.useRef(false);
  const dragContextRef = React.useRef<{ taskId: string; sourceSection: SectionId } | null>(null);
  const swipingSectionsRef = React.useRef(new Set<SectionId>());
  const touchingSectionsRef = React.useRef(new Set<SectionId>());
  const boardScrollLockedRef = React.useRef(false);
  const [isBoardScrollLocked, setIsBoardScrollLocked] = React.useState(false);
  const [activeDragSourceSection, setActiveDragSourceSection] =
    React.useState<SectionId | null>(null);

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
  }, []);

  const resolveSectionFromBoardContentX = React.useCallback(
    (boardContentX: number): SectionId => {
      const span = COLUMN_WIDTH + COLUMN_GAP;
      const start = BOARD_SIDE_PADDING + COLUMN_WIDTH / 2;
      const relative = boardContentX - start;
      const index = clamp(Math.round(relative / span), 0, SECTIONS.length - 1);
      return SECTIONS[index] ?? "today";
    },
    [],
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
    }
  }, []);

  const applyBoardScrollLock = React.useCallback((locked: boolean) => {
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
  }, [boardOffsetXShared]);

  const syncBoardScrollLock = React.useCallback(() => {
    const shouldLock =
      isBoardDraggingRef.current ||
      swipingSectionsRef.current.size > 0 ||
      touchingSectionsRef.current.size > 0;
    applyBoardScrollLock(shouldLock);
  }, [applyBoardScrollLock]);

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

  const handleSectionRowTouchStateChange = React.useCallback(
    (section: SectionId, isTouching: boolean) => {
      const set = touchingSectionsRef.current;
      if (isTouching) {
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

      const maxOffset = SNAP_OFFSETS[SNAP_OFFSETS.length - 1] ?? 0;
      const currentOffset = boardOffsetXRef.current;
      const nextOffset = clamp(currentOffset + velocity, 0, maxOffset);
      if (nextOffset !== currentOffset) {
        boardOffsetXRef.current = nextOffset;
        boardOffsetXShared.value = nextOffset;
        boardScrollRef.current?.scrollTo({ x: nextOffset, animated: false });
        const pointerX = dragPointerXRef.current;
        if (typeof pointerX === "number" && Number.isFinite(pointerX)) {
          updateHoverSection(resolveSectionFromBoardContentX(nextOffset + pointerX));
        }
      }

      autoScrollFrameRef.current = requestAnimationFrame(tick);
    };
    autoScrollFrameRef.current = requestAnimationFrame(tick);
  }, [boardOffsetXShared, resolveSectionFromBoardContentX, updateHoverSection]);

  const applyDragPointerX = React.useCallback(
    (pointerX: number) => {
      dragPointerXRef.current = pointerX;
      updateHoverSection(resolveSectionFromBoardContentX(boardOffsetXRef.current + pointerX));

      let velocity = 0;
      if (pointerX <= EDGE_AUTO_SCROLL_ZONE) {
        const strength = clamp(
          (EDGE_AUTO_SCROLL_ZONE - pointerX) / EDGE_AUTO_SCROLL_ZONE,
          0,
          1,
        );
        velocity =
          -(EDGE_AUTO_SCROLL_MIN_STEP +
            strength * (EDGE_AUTO_SCROLL_MAX_STEP - EDGE_AUTO_SCROLL_MIN_STEP));
      } else if (pointerX >= SCREEN_WIDTH - EDGE_AUTO_SCROLL_ZONE) {
        const strength = clamp(
          (pointerX - (SCREEN_WIDTH - EDGE_AUTO_SCROLL_ZONE)) / EDGE_AUTO_SCROLL_ZONE,
          0,
          1,
        );
        velocity =
          EDGE_AUTO_SCROLL_MIN_STEP +
          strength * (EDGE_AUTO_SCROLL_MAX_STEP - EDGE_AUTO_SCROLL_MIN_STEP);
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
    [resolveSectionFromBoardContentX, startAutoScroll, stopAutoScroll, updateHoverSection],
  );

  const onReorderSection = React.useCallback(
    (section: SectionId, orderedTaskIds: string[]) => {
      const dropSection = (() => {
        if (dragHoverSectionRef.current) {
          return dragHoverSectionRef.current;
        }
        const pointerX = dragPointerXRef.current;
        if (typeof pointerX === "number" && Number.isFinite(pointerX)) {
          return resolveSectionFromBoardContentX(boardOffsetXRef.current + pointerX);
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
        dragPointerXRef.current = null;
        updateHoverSection(null);
        stopAutoScroll();
        isBoardDraggingRef.current = false;
        syncBoardScrollLock();
        setActiveDragSourceSection(null);
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

        const sourceIds = orderedTaskIds.filter((taskId) => taskId !== draggedTaskId);
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

        const sourceOrderIndex = new Map(sourceIds.map((taskId, idx) => [taskId, idx] as const));
        const targetOrderIndex = new Map(
          [draggedTaskId, ...targetIds].map((taskId, idx) => [taskId, idx] as const),
        );

        return prev.map((task) => {
          if (task.id === draggedTaskId) {
            const needsDueAt =
              (dropSection === "today" || dropSection === "upcoming") &&
              (!Number.isFinite(task.dueAt) || task.dueAt <= 0);
            return {
              ...task,
              section: dropSection,
              completedAt: dropSection === "completed" ? Date.now() : undefined,
              ...(needsDueAt
                ? {
                    dueAt: getDueAtForSection(dropSection),
                    dueHasTime: dropSection === "today",
                  }
                : {}),
              orderRank: ((targetOrderIndex.get(task.id) ?? 0) + 1) * 1000,
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
      });
      dragContextRef.current = null;
      dragPointerXRef.current = null;
      updateHoverSection(null);
      stopAutoScroll();
      isBoardDraggingRef.current = false;
      syncBoardScrollLock();
      setActiveDragSourceSection(null);
    },
    [
      id,
      resolveSectionFromBoardContentX,
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

        const next: Task[] = prev.map((t) => {
          if (t.id !== taskId) return t;

          if (toSection === "completed") {
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

        // Keep ordering tidy within the destination section by putting moved task at the top.
        const moved = next.find((t) => t.id === taskId);
        if (!moved) return next;

        const others = next.filter((t) => t.id !== taskId);
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

  const handleBoardTouch = React.useCallback((event: any) => {
    if (!dragContextRef.current) return;
    const nativeEvent = event?.nativeEvent;
    const touch = nativeEvent?.touches?.[0] ?? nativeEvent?.changedTouches?.[0];
    const locationX =
      typeof touch?.locationX === "number"
        ? touch.locationX
        : typeof nativeEvent?.locationX === "number"
          ? nativeEvent.locationX
          : null;
    if (typeof locationX === "number" && Number.isFinite(locationX)) {
      applyDragPointerX(locationX);
    }
  }, [applyDragPointerX]);

  const handleAddTask = React.useCallback(() => {
    pendingAddTaskScrollRef.current = true;
    router.push({ pathname: "/task/create-modal", params: { projectId: id } });
  }, [id, router]);

  React.useEffect(() => {
    const rafId = requestAnimationFrame(updateBoardPageX);
    return () => cancelAnimationFrame(rafId);
  }, [updateBoardPageX]);

  React.useEffect(() => {
    const swipingSections = swipingSectionsRef.current;
    const touchingSections = touchingSectionsRef.current;
    const boardRef = boardScrollRef.current;
    return () => {
      stopAutoScroll();
      isBoardDraggingRef.current = false;
      swipingSections.clear();
      touchingSections.clear();
      boardScrollLockedRef.current = false;
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
    const targetOffsetX = SNAP_OFFSETS[sectionIndex] ?? 0;
    requestAnimationFrame(() => {
      boardScrollRef.current?.scrollTo({ x: targetOffsetX, animated: true });
    });
  }, [id, projectTasks, tasks]);

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
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors[theme].background }}>
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
          horizontal
          scrollEnabled={!isBoardScrollLocked}
          pagingEnabled={false}
          snapToOffsets={SNAP_OFFSETS}
          decelerationRate="fast"
          contentContainerStyle={[
            styles.boardContent,
            { paddingHorizontal: 16, paddingBottom: boardBottomPadding },
          ]}
          showsHorizontalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
          contentOffset={{ x: SNAP_OFFSETS[1], y: 0 }} // Start focused on Today
          onScroll={onBoardScroll}
          onScrollEndDrag={syncBoardOffsetFromScrollEvent}
          onMomentumScrollEnd={syncBoardOffsetFromScrollEvent}
          onTouchStart={handleBoardTouch}
          onTouchMove={handleBoardTouch}
          onTouchEnd={handleBoardTouch}
          onLayout={updateBoardPageX}
          onTouchCancel={() => {
            dragPointerXRef.current = null;
            stopAutoScroll();
          }}
          scrollEventThrottle={16}
        >
          {SECTIONS.map((section) => (
            <KanbanColumn
              key={section}
              section={section}
              tasks={tasksBySection[section]}
              isDragSource={activeDragSourceSection === section}
              columnBackgroundColor={columnBackgroundColor}
              columnBottomPadding={columnBottomPadding}
              boardScrollRef={boardScrollRef}
              onPressTask={onPressTask}
              theme={theme}
              styles={styles}
              rowStyles={rowStyles}
              projectsById={projectsById}
              toggleComplete={toggleComplete}
              deleteTask={deleteTask}
              onReorderSection={onReorderSection}
              onDragBeginTask={(taskId) => {
                dragPointerXRef.current = null;
                dragContextRef.current = { taskId, sourceSection: section };
                const currentOffset = boardOffsetXShared.value;
                if (typeof currentOffset === "number" && Number.isFinite(currentOffset)) {
                  boardOffsetXRef.current = currentOffset;
                }
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
              onSwipeStateChange={(isSwiping) =>
                handleSectionSwipeStateChange(section, isSwiping)
              }
              onRowTouchStateChange={(isTouching) =>
                handleSectionRowTouchStateChange(section, isTouching)
              }
            />
          ))}
        </AnimatedBoardScrollView>
        {showFloatingAddButton ? <FloatingAddButton onPress={handleAddTask} /> : null}
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
      // paddingHorizontal is handled dynamically in style prop
    },
    column: {
      width: COLUMN_WIDTH,
      borderRadius: 16,
      padding: 12,
      maxHeight: "100%",
      position: "relative",
      overflow: "visible",
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
  const text = Colors[theme].text;
  const hairline = isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)";
  const cardBg = isDark ? "#1C1C1E" : "#FFFFFF";
  const tagBg = withAlpha(text, isDark ? 0.1 : 0.08);
  const tagText = withAlpha(text, 0.78);
  const dangerBg = isDark ? "rgba(255,69,58,0.18)" : "rgba(255,59,48,0.14)";
  const dangerBorder = isDark ? "rgba(255,69,58,0.32)" : "rgba(255,59,48,0.26)";

  return StyleSheet.create({
    itemSpacer: {
      marginBottom: 0,
    },
    swipeClip: {
      borderRadius: 12,
      overflow: "hidden",
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
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },

    row: {
      minHeight: 56,
      borderRadius: 12,
      backgroundColor: cardBg,
      justifyContent: "center",
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 0,
    },
    dragRow: {
      opacity: 0.96,
    },
    rowInner: {
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
    emojiText: {
      fontSize: 18,
    },
    textStack: {
      flex: 1,
      gap: 4,
    },
    rowTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: text,
    },
    rowSubtitle: {
      fontSize: 13,
      color: text,
      opacity: 0.7,
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
      gap: 6,
      maxWidth: "100%",
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
      fontWeight: "600",
      color: tagText,
      maxWidth: 220,
    },
  }) as unknown as SwipeTaskRowStyles;
};
