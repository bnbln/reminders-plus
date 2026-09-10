import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  TaskSwipeDraggableList,
  type TaskSwipeDraggableListItem,
} from "@/components/tasks/task-swipe-draggable-list";
import { FloatingAddButton } from "@/components/ui/floating-add-button";
import { withAlpha } from "@/components/ui/glass-surface";
import { StreakAccentBackground } from "@/components/ui/streak-accent-background";
import { Colors } from "@/constants/theme";
import { useHomeFilters } from "@/context/home-filters-store";
import {
  createRoutineCompletionTransition,
  getDueAtForSection,
  type Task,
  useTasksStore,
} from "@/context/tasks-store";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { t } from "@/i18n";
import { isIOS26OrNewer } from "@/utils/ios-version";
import { ripple } from '@/components/ui/ripple';
import {
  deriveActiveSectionFromDueAt,
  hasValidDueAt,
} from "@/utils/task-dates";

const HOME_TASK_ITEM_SPACING = 8;
const IOS_LIGHT_BASE_BACKGROUND = "#F2F2F7";
const IOS_LIGHT_ELEVATED_SURFACE = "#FFFFFF";
const HOME_TASK_ROW_SURFACE_LIGHT = IOS_LIGHT_ELEVATED_SURFACE;
const HOME_TASK_ROW_SURFACE_DARK = "rgba(35, 35, 35, 0.2)";
const SECTION_SIDE_INSET = 0;
const INBOX_SECTION_ORDER: InboxSectionId[] = ["overdue", "withoutDate"];

type InboxSectionId = "overdue" | "withoutDate";

function hasNoDueDate(task: Task) {
  const dueAt = (task as { dueAt?: unknown }).dueAt;
  return typeof dueAt !== "number" || !Number.isFinite(dueAt) || dueAt <= 0;
}

function isOverdue(task: Task, nowMs: number) {
  if (!hasValidDueAt(task.dueAt)) return false;
  if (task.dueHasTime === false) {
    const due = new Date(task.dueAt);
    const startOfNextDay = new Date(
      due.getFullYear(),
      due.getMonth(),
      due.getDate() + 1,
      0,
      0,
      0,
      0,
    ).getTime();
    return nowMs >= startOfNextDay;
  }
  return task.dueAt < nowMs;
}

function deriveInboxSection(
  task: Task,
  nowMs: number,
): InboxSectionId | null {
  if (isOverdue(task, nowMs)) return "overdue";
  if (hasNoDueDate(task)) return "withoutDate";
  return null;
}

function adjustTaskForInboxSection(
  task: Task,
  sectionId: InboxSectionId,
  nowMs: number,
): Task {
  if (sectionId === "withoutDate") {
    return {
      ...task,
      section: "upcoming",
      dueAt: 0,
      dueHasTime: false,
      completedAt: undefined,
    };
  }

  if (isOverdue(task, nowMs)) {
    return {
      ...task,
      section: deriveActiveSectionFromDueAt(task.dueAt, nowMs),
      completedAt: undefined,
    };
  }

  const nextDueAt = Math.max(1, nowMs - 60_000);
  return {
    ...task,
    section: deriveActiveSectionFromDueAt(nextDueAt, nowMs),
    dueAt: nextDueAt,
    dueHasTime: true,
    completedAt: undefined,
  };
}

export default function InboxScreen() {
  const router = useRouter();
  const theme = useColorScheme() ?? "light";
  const isDark = theme === "dark";
  const showFloatingAddButton = Platform.OS === "ios" && !isIOS26OrNewer();
  const params = useLocalSearchParams<{ withSubtasks?: string }>();

  const { enabledTags, showTagIcons, showProjectNames, showCompactSubtasks } =
    useHomeFilters();
  const withSubtasksEnabled =
    params.withSubtasks === undefined
      ? showCompactSubtasks
      : params.withSubtasks === "1";
  const { tasks, setTasks, projects } = useTasksStore();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const [isListDragging, setIsListDragging] = React.useState(false);
  const [collapsedSections, setCollapsedSections] = React.useState<
    Record<InboxSectionId, boolean>
  >({
    overdue: false,
    withoutDate: false,
  });

  const projectsById = React.useMemo(
    () => new Map(projects.map((p) => [p.id, p] as const)),
    [projects],
  );

  const nowMs = Date.now();
  const activeTasks = React.useMemo(
    () =>
      tasks.filter((task) => !task.deletedAt && task.section !== "completed"),
    [tasks],
  );

  const overdueTasks = React.useMemo(() => {
    const visible = activeTasks.filter((task) => isOverdue(task, nowMs));
    return [...visible].sort((a, b) => a.orderRank - b.orderRank);
  }, [activeTasks, nowMs]);

  const withoutDateTasks = React.useMemo(() => {
    const visible = activeTasks.filter((task) => hasNoDueDate(task));
    return [...visible].sort((a, b) => a.orderRank - b.orderRank);
  }, [activeTasks]);

  const enabledTagsSeed = React.useMemo(
    () => Array.from(enabledTags).sort().join(","),
    [enabledTags],
  );
  const rowLayoutSeed = React.useMemo(
    () =>
      `${enabledTagsSeed}|icons:${showTagIcons ? 1 : 0}|projects:${showProjectNames ? 1 : 0}|subtasks:${withSubtasksEnabled ? 1 : 0}`,
    [enabledTagsSeed, showProjectNames, showTagIcons, withSubtasksEnabled],
  );
  const getRowDataKey = React.useCallback(
    (task: Task) =>
      `task-${task.id}:${rowLayoutSeed}:${task.subtitle?.length ?? 0}:${task.subtasks?.length ?? 0}`,
    [rowLayoutSeed],
  );

  const tasksForList = React.useMemo(
    () => [...overdueTasks, ...withoutDateTasks],
    [overdueTasks, withoutDateTasks],
  );

  const swipeListData = React.useMemo<TaskSwipeDraggableListItem[]>(() => {
    // Keep both section markers in the drag data so empty sections can still
    // become visible drop targets once a drag begins.
    const data: TaskSwipeDraggableListItem[] = [
      { kind: "header", key: "h-overdue", sectionId: "overdue" },
    ];

    if (!collapsedSections.overdue) {
      for (const task of overdueTasks) {
        data.push({ kind: "task", key: getRowDataKey(task), taskId: task.id });
      }
    }

    data.push({ kind: "header", key: "h-withoutDate", sectionId: "withoutDate" });

    if (!collapsedSections.withoutDate) {
      for (const task of withoutDateTasks) {
        data.push({ kind: "task", key: getRowDataKey(task), taskId: task.id });
      }
    }

    return data;
  }, [
    collapsedSections.overdue,
    collapsedSections.withoutDate,
    getRowDataKey,
    overdueTasks,
    withoutDateTasks,
  ]);

  const applyOrderFromSwipeListData = React.useCallback(
    (data: TaskSwipeDraggableListItem[]) => {
      setTasks((prev) => {
        const nowReference = Date.now();
        const tasksById = new Map(prev.map((task) => [task.id, task] as const));
        const draggableTaskIdSet = new Set(
          data
            .filter(
              (
                item,
              ): item is Extract<TaskSwipeDraggableListItem, { kind: "task" }> =>
                item.kind === "task",
            )
            .map((item) => item.taskId),
        );
        const bySection: Record<InboxSectionId, string[]> = {
          overdue: [],
          withoutDate: [],
        };
        let currentSection: InboxSectionId = INBOX_SECTION_ORDER[0];

        for (const item of data) {
          if (item.kind === "header") {
            currentSection =
              item.sectionId === "withoutDate" ? "withoutDate" : "overdue";
            continue;
          }

          const task = tasksById.get(item.taskId);
          if (!task) continue;
          bySection[currentSection].push(item.taskId);
        }

        const nextById = new Map(tasksById);
        for (const sectionId of INBOX_SECTION_ORDER) {
          const reorderedVisibleIds = bySection[sectionId];
          const reorderedVisibleSet = new Set(reorderedVisibleIds);
          const stableHiddenIds = prev
            .filter((task) => {
              if (task.deletedAt || task.section === "completed") return false;
              return (
                deriveInboxSection(task, nowReference) === sectionId &&
                !draggableTaskIdSet.has(task.id)
              );
            })
            .sort((a, b) => a.orderRank - b.orderRank)
            .map((task) => task.id);

          const finalOrder = [...reorderedVisibleIds, ...stableHiddenIds];
          finalOrder.forEach((taskId, index) => {
            const currentTask = nextById.get(taskId);
            if (!currentTask) return;
            const nextTask = reorderedVisibleSet.has(taskId)
              ? adjustTaskForInboxSection(currentTask, sectionId, nowReference)
              : currentTask;
            nextById.set(taskId, {
              ...nextTask,
              orderRank: (index + 1) * 1000,
            });
          });
        }

        return prev.map((task) => nextById.get(task.id) ?? task);
      });
    },
    [setTasks],
  );

  const onPressTask = React.useCallback(
    (taskId: string) => {
      router.push({ pathname: "/task/[id]", params: { id: taskId } });
    },
    [router],
  );

  const toggleComplete = React.useCallback(
    (taskId: string) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setTasks((prev) => {
        const task = prev.find((candidate) => candidate.id === taskId);
        if (!task) return prev;

        const fromSection = task.section;
        const now = Date.now();

        const routineTransition = createRoutineCompletionTransition(
          task,
          now,
          new Set(prev.map((candidate) => candidate.id)),
        );
        if (routineTransition && fromSection !== "completed") {
          const next = prev.map((candidate): Task =>
            candidate.id === taskId ? routineTransition.nextTask : candidate,
          );
          return [...next, routineTransition.completedTask];
        }

        return prev.map((candidate): Task => {
          if (candidate.id !== taskId) return candidate;

          if (fromSection === "completed") {
            const hasDueAt = hasValidDueAt(candidate.dueAt);
            const toSection = hasDueAt
              ? deriveActiveSectionFromDueAt(candidate.dueAt)
              : "today";
            return {
              ...candidate,
              section: toSection,
              completedAt: undefined,
              ...(hasDueAt
                ? {}
                : {
                    dueAt: getDueAtForSection("today"),
                    dueHasTime: true,
                  }),
            };
          }

          return {
            ...candidate,
            section: "completed",
            completedAt: now,
          };
        });
      });
    },
    [setTasks],
  );

  const deleteTask = React.useCallback(
    (taskId: string) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setTasks((prev) =>
        prev.map((task) =>
          task.id === taskId ? { ...task, deletedAt: Date.now() } : task,
        ),
      );
    },
    [setTasks],
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
    [setTasks],
  );

  const toggleSectionCollapsed = React.useCallback(
    (sectionId: InboxSectionId) => {
      setCollapsedSections((prev) => ({
        ...prev,
        [sectionId]: !prev[sectionId],
      }));
    },
    [],
  );

  const renderSectionHeaderRow = React.useCallback(
    (sectionId: string) => {
      const id: InboxSectionId =
        sectionId === "withoutDate" ? "withoutDate" : "overdue";
      const count =
        id === "overdue" ? overdueTasks.length : withoutDateTasks.length;
      if (count === 0) {
        if (id === "overdue") return null;
        if (!isListDragging) return null;
      }

      const isCollapsed = collapsedSections[id];
      const title =
        id === "overdue" ? t("tags.overdue") : t("home.section.withoutDate");
      const isOverdueSection = id === "overdue";
      const chevronColor = isOverdueSection
        ? isDark
          ? "#FF453A"
          : "#FF3B30"
        : withAlpha(Colors[theme].text, 0.48);

      return (
        <View style={styles.sectionHeader}>
          <Pressable
            android_ripple={ripple()}
            accessibilityRole="button"
            accessibilityState={{ expanded: !isCollapsed }}
            onPress={() => toggleSectionCollapsed(id)}
            style={({ pressed }) => [
              styles.sectionHeaderButton,
              pressed ? styles.sectionHeaderButtonPressed : null,
            ]}
          >
            <View style={styles.sectionTitleWrap}>
              <Text
                style={[
                  styles.sectionTitle,
                  isOverdueSection ? styles.sectionTitleDanger : null,
                ]}
              >
                {title}
              </Text>
              <View
                style={[
                  styles.sectionCountBadge,
                  isOverdueSection ? styles.sectionCountBadgeDanger : null,
                ]}
              >
                <Text
                  style={[
                    styles.sectionCountBadgeText,
                    isOverdueSection
                      ? styles.sectionCountBadgeTextDanger
                      : null,
                  ]}
                >
                  {count}
                </Text>
              </View>
            </View>
            <MaterialIcons
              name="expand-more"
              size={20}
              color={chevronColor}
              style={[
                styles.sectionChevron,
                { transform: [{ rotate: isCollapsed ? "0deg" : "180deg" }] },
              ]}
            />
          </Pressable>
        </View>
      );
    },
    [
      collapsedSections,
      isListDragging,
      overdueTasks.length,
      styles.sectionChevron,
      styles.sectionCountBadge,
      styles.sectionCountBadgeText,
      styles.sectionCountBadgeTextDanger,
      styles.sectionCountBadgeDanger,
      styles.sectionHeader,
      styles.sectionHeaderButton,
      styles.sectionHeaderButtonPressed,
      styles.sectionTitle,
      styles.sectionTitleDanger,
      styles.sectionTitleWrap,
      isDark,
      theme,
      toggleSectionCollapsed,
      withoutDateTasks.length,
    ],
  );

  const handleAddTask = React.useCallback(() => {
    router.push("/task/create-modal");
  }, [router]);

  const hasAnyTask = overdueTasks.length > 0 || withoutDateTasks.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: "transparent" }]}>
      <StreakAccentBackground isDark={isDark} />
      <TaskSwipeDraggableList
        renderMode="auto"
        theme={theme}
        isDark={isDark}
        tasks={tasksForList}
        data={swipeListData}
        renderHeaderRow={renderSectionHeaderRow}
        projectsById={projectsById}
        rowStyles={styles}
        itemSpacing={HOME_TASK_ITEM_SPACING}
        contentContainerStyle={styles.content}
        containerStyle={{ backgroundColor: "transparent" }}
        contentInsetAdjustmentBehavior="automatic"
        animateDataLayoutChanges={false}
        empty={null}
        footer={
          hasAnyTask ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{t("inbox.empty")}</Text>
            </View>
          )
        }
        enabledTags={enabledTags}
        showTaskIcons={showTagIcons}
        showProjectNames={showProjectNames}
        showCompactSubtasks={withSubtasksEnabled}
        showOverdueDatePrefix={true}
        onPressTask={onPressTask}
        toggleComplete={toggleComplete}
        toggleSubtask={toggleSubtask}
        deleteTask={deleteTask}
        onReorderData={applyOrderFromSwipeListData}
        onDragStateChange={setIsListDragging}
      />

      {showFloatingAddButton ? (
        <FloatingAddButton onPress={handleAddTask} />
      ) : null}
    </View>
  );
}

const createStyles = (theme: keyof typeof Colors) => {
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
    container: {
      flex: 1,
      backgroundColor: "transparent",
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 184,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 12,
      marginBottom: 6,
      paddingHorizontal: SECTION_SIDE_INSET,
    },
    sectionHeaderButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      width: "100%",
      paddingVertical: 6,
      paddingHorizontal: 0,
    },
    sectionHeaderButtonPressed: {
      opacity: 0.84,
    },
    sectionTitleWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    sectionTitle: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: WEIGHT_HEADING,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      color: text,
      opacity: ALPHA_3,
    },
    sectionTitleDanger: {
      color: isDark ? "#FF453A" : "#FF3B30",
      opacity: 0.92,
    },
    sectionChevron: {
      opacity: ALPHA_3,
    },
    sectionCountBadge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      paddingHorizontal: 4,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: withAlpha(text, isDark ? 0.18 : 0.1),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha(text, isDark ? 0.34 : 0.2),
    },
    sectionCountBadgeDanger: {
      backgroundColor: dangerBg,
      borderColor: dangerBorder,
    },
    sectionCountBadgeText: {
      fontSize: 12,
      lineHeight: 14,
      fontWeight: WEIGHT_HEADING,
      color: withAlpha(text, isDark ? 0.84 : 0.66),
      textAlign: "center",
    },
    sectionCountBadgeTextDanger: {
      color: isDark ? "#FFB4AD" : "#B42318",
    },
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
      zIndex: 80,
      elevation: 28,
      shadowColor: "#000000",
      shadowOpacity: isDark ? 0.24 : 0.12,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
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
    empty: {
      minHeight: 188,
      paddingVertical: 40,
      paddingHorizontal: 16,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
    },
    emptyText: {
      fontSize: 14,
      lineHeight: 18,
      fontWeight: WEIGHT_BODY,
      color: withAlpha(text, ALPHA_3),
    },
  });
};
