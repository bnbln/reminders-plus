import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { NestableScrollContainer } from "react-native-draggable-flatlist";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  TaskSwipeDraggableList,
  type TaskSwipeDraggableListHandle,
} from "@/components/tasks/task-swipe-draggable-list";
import { FloatingAddButton } from "@/components/ui/floating-add-button";
import { GlassSurface, withAlpha } from "@/components/ui/glass-surface";
import { Colors } from "@/constants/theme";
import { useHomeFilters } from "@/context/home-filters-store";
import {
  getDueAtForSection,
  getNextRoutineDate,
  SectionId,
  type Task,
  useTasksStore,
} from "@/context/tasks-store";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useStreaks } from "@/hooks/use-streaks";
import { t } from "@/i18n";
import { isIOS26OrNewer } from "@/utils/ios-version";

type ThemeName = keyof typeof Colors;
const GRID_HORIZONTAL_PADDING = 16;

const SECTION_ORDER: SectionId[] = ["today", "upcoming", "completed"];

const parseSectionsParam = (value: unknown): SectionId[] => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return SECTION_ORDER;
  }
  const parts = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const enabled = parts.filter(
    (p): p is SectionId =>
      p === "today" || p === "upcoming" || p === "completed",
  );
  return enabled.length ? Array.from(new Set(enabled)) : SECTION_ORDER;
};

const getStartOfToday = () => {
  return getStartOfDay(Date.now());
};

const getStartOfDay = (timestamp: number) => {
  const d = new Date(timestamp);
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    0,
    0,
    0,
    0,
  ).getTime();
};

const isSameLocalDay = (left: number, right: number) => {
  const a = new Date(left);
  const b = new Date(right);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
};

const getStartOfWeek = (timestamp: number) => {
  const d = new Date(timestamp);
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const addDays = (timestamp: number, days: number) => {
  const d = new Date(timestamp);
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const isMeetingLikeTask = (task: Task) => {
  const value = `${task.title} ${task.subtitle ?? ""}`.toLowerCase();
  return (
    value.includes("meeting") ||
    value.includes("call") ||
    value.includes("sync") ||
    value.includes("standup") ||
    value.includes("termin")
  );
};

const createStyles = (theme: ThemeName) => {
  const isDark = theme === "dark";
  const text = Colors[theme].text;
  const hairline = isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.12)";
  const cardBg = isDark ? "#1C1C1E" : "#F2F2F7";
  const tagBg = withAlpha(text, isDark ? 0.1 : 0.08);
  const tagText = withAlpha(text, 0.78);
  const dangerBg = isDark ? "rgba(255,69,58,0.18)" : "rgba(255,59,48,0.14)";
  const dangerBorder = isDark ? "rgba(255,69,58,0.32)" : "rgba(255,59,48,0.26)";
  const sheetBg = "#F3F4F6";

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "#000000",
    },
    scrollLayer: {
      flex: 1,
      zIndex: 1,
    },
    content: {
      paddingBottom: 180,
      gap: 0,
    },
    heroArea: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      paddingTop: 24,
      paddingHorizontal: 24,
      zIndex: 0,
    },
    heroTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      paddingRight: Platform.OS === "ios" ? 46 : 0,
    },
    heroDayRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    heroDayText: {
      color: "#FFFFFF",
      fontSize: 66,
      lineHeight: 70,
      fontWeight: "800",
      letterSpacing: -1.3,
    },
    heroDot: {
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: "#FF5246",
    },
    heroDateText: {
      color: "rgba(255,255,255,0.44)",
      fontSize: 17,
      lineHeight: 20,
      fontWeight: "700",
      textAlign: "right",
    },
    heroBody: {
      marginTop: 14,
      gap: 2,
    },
    heroGreet: {
      color: "rgba(255,255,255,0.78)",
      fontSize: 17,
      lineHeight: 25,
      fontWeight: "600",
      letterSpacing: -0.34,
    },
    heroGreetStrong: {
      color: "#FFFFFF",
      fontWeight: "800",
    },
    heroLine: {
      color: "rgba(255,255,255,0.78)",
      fontSize: 17,
      lineHeight: 28,
      fontWeight: "600",
      letterSpacing: -0.34,
    },
    heroLineRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 1,
    },
    heroLineStrong: {
      color: "#FFFFFF",
      fontWeight: "800",
    },
    heroLineIcon: {
      color: "#FFFFFF",
      opacity: 0.92,
      marginHorizontal: 2,
    },
    heroMetricsRow: {
      marginTop: 20,
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
      flexWrap: "wrap",
    },
    heroMetric: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    heroMetricText: {
      color: "rgba(255,255,255,0.9)",
      fontSize: 15,
      lineHeight: 22,
      fontWeight: "500",
    },
    cardsStack: {
      paddingHorizontal: 0,
      gap: 14,
    },
    dateCard: {
      backgroundColor: sheetBg,
      borderTopLeftRadius: 40,
      borderTopRightRadius: 40,
      borderBottomLeftRadius: 34,
      borderBottomRightRadius: 34,
      paddingTop: 18,
      paddingHorizontal: GRID_HORIZONTAL_PADDING,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOpacity: 0.2,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },
    inboxCard: {
      backgroundColor: sheetBg,
      borderTopLeftRadius: 34,
      borderTopRightRadius: 34,
      borderBottomLeftRadius: 34,
      borderBottomRightRadius: 34,
      paddingTop: 14,
      paddingHorizontal: GRID_HORIZONTAL_PADDING,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOpacity: 0.14,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    dateRailWrap: {
      paddingHorizontal: 2,
      paddingBottom: 12,
    },
    dateRailRow: {
      flexDirection: "row",
      alignItems: "stretch",
      justifyContent: "space-between",
      gap: 2,
    },
    dateRailDay: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      paddingHorizontal: 2,
      paddingVertical: 8,
      borderRadius: 14,
    },
    dateRailDaySelected: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: "#E5E7EB",
      backgroundColor: "#FFFFFF",
      paddingHorizontal: 6,
      paddingVertical: 7,
    },
    dateRailDayNum: {
      color: "#1E2939",
      opacity: 0.38,
      fontSize: 30,
      lineHeight: 38,
      fontWeight: "600",
      letterSpacing: 0.08,
    },
    dateRailDayNumSelected: {
      color: "#111827",
      opacity: 1,
    },
    dateRailDow: {
      color: "#6A7282",
      opacity: 0.58,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: "500",
      letterSpacing: 0.2,
      textTransform: "uppercase",
    },
    dateRailDowSelected: {
      color: "#EF4444",
      opacity: 1,
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 4,
      paddingBottom: 10,
    },
    cardTitle: {
      fontSize: 13,
      fontWeight: "700",
      letterSpacing: 0.9,
      textTransform: "uppercase",
      color: "#6A7282",
      opacity: 0.6,
    },
    cardDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: "rgba(106,114,130,0.24)",
      marginBottom: 8,
    },
    cardCount: {
      fontSize: 12,
      fontWeight: "700",
      color: "#6A7282",
      opacity: 0.7,
    },
    itemSpacer: {
      marginBottom: 12,
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
      gap: 4,
    },
    dragRow: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hairline,
      shadowColor: "#000",
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
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
    emptyState: {
      paddingTop: 16,
      paddingBottom: 12,
      alignItems: "center",
    },
    emptyText: {
      fontSize: 13,
      fontWeight: "600",
      color: withAlpha(text, 0.55),
    },
    archivePillFooter: {
      paddingTop: 14,
      paddingBottom: 26,
      alignItems: "center",
    },
    archivePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hairline,
    },
    archivePillText: {
      fontSize: 16,
      fontWeight: "700",
      color: text,
      opacity: 0.92,
    },
  });
};

export default function HomeScreen() {
  const router = useRouter();
  const theme = useColorScheme() ?? "light";
  const isDark = theme === "dark";
  const insets = useSafeAreaInsets();
  const { height: viewportHeight } = useWindowDimensions();
  const showFloatingAddButton = Platform.OS === "ios" && !isIOS26OrNewer();
  const params = useLocalSearchParams<{
    sections?: string;
    withNotes?: string;
    withSubtasks?: string;
  }>();
  const enabledSections = React.useMemo(
    () => parseSectionsParam(params.sections),
    [params.sections],
  );
  const withNotesEnabled = params.withNotes === "1";
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const { tasks, setTasks, projects } = useTasksStore();
  const { enabledTags, showTagIcons, showCompactSubtasks } = useHomeFilters();
  const withSubtasksEnabled =
    params.withSubtasks === undefined
      ? showCompactSubtasks
      : params.withSubtasks === "1";
  const { currentStreak } = useStreaks();
  const [selectedDateStart, setSelectedDateStart] = React.useState(() =>
    getStartOfToday(),
  );
  const [heroHeight, setHeroHeight] = React.useState(320);
  const [dateCardY, setDateCardY] = React.useState(0);
  const [inboxCardY, setInboxCardY] = React.useState(420);

  const dayLabelFormatter = React.useMemo(
    () => new Intl.DateTimeFormat(undefined, { weekday: "short" }),
    [],
  );
  const monthDayFormatter = React.useMemo(
    () => new Intl.DateTimeFormat(undefined, { month: "long", day: "2-digit" }),
    [],
  );
  const yearFormatter = React.useMemo(
    () => new Intl.DateTimeFormat(undefined, { year: "numeric" }),
    [],
  );
  const hourFormatter = React.useMemo(
    () => new Intl.DateTimeFormat(undefined, { hour: "numeric" }),
    [],
  );

  const selectedDayTasks = React.useMemo(() => {
    return tasks.filter(
      (task) =>
        !task.deletedAt &&
        task.section !== "completed" &&
        Number.isFinite(task.dueAt) &&
        task.dueAt > 0 &&
        isSameLocalDay(task.dueAt, selectedDateStart),
    );
  }, [selectedDateStart, tasks]);

  const greetingLabel = React.useMemo(() => {
    const nowHour = new Date().getHours();
    if (nowHour < 12) return "Good morning.";
    if (nowHour < 18) return "Good afternoon.";
    return "Good evening.";
  }, []);

  const meetingsCount = React.useMemo(
    () =>
      selectedDayTasks.filter(
        (task) => !task.isRoutine && isMeetingLikeTask(task),
      ).length,
    [selectedDayTasks],
  );
  const taskCount = React.useMemo(
    () =>
      selectedDayTasks.filter(
        (task) => !task.isRoutine && !isMeetingLikeTask(task),
      ).length,
    [selectedDayTasks],
  );
  const habitCount = React.useMemo(
    () => selectedDayTasks.filter((task) => !!task.isRoutine).length,
    [selectedDayTasks],
  );

  const freeAfterLabel = React.useMemo(() => {
    const timed = selectedDayTasks
      .filter((task) => !!task.dueHasTime)
      .map((task) => task.dueAt);
    if (timed.length === 0) return "4 pm";
    const latest = Math.max(...timed);
    const d = new Date(latest);
    d.setHours(Math.min(23, d.getHours() + 1), 0, 0, 0);
    return hourFormatter.format(d).toLowerCase();
  }, [hourFormatter, selectedDayTasks]);

  const heroDayLabel = React.useMemo(() => {
    const value = dayLabelFormatter.format(selectedDateStart).replace(".", "");
    return value.charAt(0).toUpperCase() + value.slice(1);
  }, [dayLabelFormatter, selectedDateStart]);

  const heroDateTopLabel = React.useMemo(
    () => monthDayFormatter.format(selectedDateStart),
    [monthDayFormatter, selectedDateStart],
  );
  const heroDateYearLabel = React.useMemo(
    () => yearFormatter.format(selectedDateStart),
    [selectedDateStart, yearFormatter],
  );

  const dateRailDays = React.useMemo(() => {
    const weekStart = getStartOfWeek(selectedDateStart);
    const todayStart = getStartOfToday();
    return Array.from({ length: 7 }, (_, index) => {
      const timestamp = addDays(weekStart, index);
      return {
        key: `d-${timestamp}`,
        timestamp,
        dayOfMonth: String(new Date(timestamp).getDate()),
        weekday: dayLabelFormatter.format(timestamp).replace(".", "").toUpperCase(),
        isSelected: isSameLocalDay(timestamp, selectedDateStart),
        isToday: isSameLocalDay(timestamp, todayStart),
      };
    });
  }, [dayLabelFormatter, selectedDateStart]);

  const homeEnabledSections = React.useMemo(() => {
    const withoutCompleted = enabledSections.filter((s) => s !== "completed");
    return (
      withoutCompleted.length ? withoutCompleted : ["today", "upcoming"]
    ) as SectionId[];
  }, [enabledSections]);

  const scrollRef = React.useRef<any>(null);
  const listRef = React.useRef<TaskSwipeDraggableListHandle | null>(null);
  const undatedListRef = React.useRef<TaskSwipeDraggableListHandle | null>(null);
  const [isSwipeGestureActive, setIsSwipeGestureActive] = React.useState(false);
  const [isRowTouchActive, setIsRowTouchActive] = React.useState(false);
  const [isDragGestureActive, setIsDragGestureActive] = React.useState(false);

  const handleSwipeStateChange = React.useCallback((isSwiping: boolean) => {
    setIsSwipeGestureActive(isSwiping);
  }, []);
  const handleRowTouchStateChange = React.useCallback((isTouching: boolean) => {
    setIsRowTouchActive(isTouching);
  }, []);
  const handleDragStateChange = React.useCallback((isDragging: boolean) => {
    setIsDragGestureActive(isDragging);
  }, []);

  const projectsById = React.useMemo(
    () => new Map(projects.map((p) => [p.id, p] as const)),
    [projects],
  );

  const visibleTasks = React.useMemo(() => {
    const base = tasks.filter((t) => {
      if (t.deletedAt) return false;
      if (!homeEnabledSections.includes(t.section)) return false;
      if (!(typeof t.dueAt === "number" && Number.isFinite(t.dueAt) && t.dueAt > 0)) {
        return false;
      }
      return isSameLocalDay(t.dueAt, selectedDateStart);
    });
    if (!withNotesEnabled) return base;
    return base.filter((t) => !!t.subtitle);
  }, [homeEnabledSections, selectedDateStart, tasks, withNotesEnabled]);

  const undatedTasks = React.useMemo(() => {
    const base = tasks.filter((t) => {
      if (t.deletedAt) return false;
      if (!homeEnabledSections.includes(t.section)) return false;
      return !(typeof t.dueAt === "number" && Number.isFinite(t.dueAt) && t.dueAt > 0);
    });
    if (!withNotesEnabled) return base.sort((a, b) => a.orderRank - b.orderRank);
    return base
      .filter((t) => !!t.subtitle)
      .sort((a, b) => a.orderRank - b.orderRank);
  }, [homeEnabledSections, tasks, withNotesEnabled]);
  const undatedCount = undatedTasks.length;
  const heroTopPadding = insets.top + (Platform.OS === "ios" ? 44 : 18);
  const cardsStartOffset = Math.max(220, heroHeight - 18);
  const calendarListHeight = Math.round(
    Math.max(230, Math.min(430, viewportHeight * 0.34)),
  );
  const inboxListHeight = Math.round(
    Math.max(170, Math.min(340, viewportHeight * 0.26)),
  );
  const contentBottomPadding =
    insets.bottom + (showFloatingAddButton ? 232 : 164);
  const walletSnapOffsets = React.useMemo(
    () =>
      Platform.OS === "ios"
        ? Array.from(
            new Set(
              [0, cardsStartOffset + dateCardY, cardsStartOffset + inboxCardY]
                .map((value) => Math.max(0, Math.round(value))),
            ),
          ).sort((a, b) => a - b)
        : undefined,
    [cardsStartOffset, dateCardY, inboxCardY],
  );

  const applyDatedOrder = React.useCallback(
    (orderedTaskIds: string[]) => {
      const orderIndex = new Map(orderedTaskIds.map((id, index) => [id, index] as const));
      setTasks((prev) =>
        prev.map((task) => {
          const index = orderIndex.get(task.id);
          if (index === undefined) return task;
          return { ...task, orderRank: (index + 1) * 1000 };
        }),
      );
    },
    [setTasks],
  );

  const applyUndatedOrder = React.useCallback(
    (orderedTaskIds: string[]) => {
      const orderIndex = new Map(orderedTaskIds.map((id, index) => [id, index] as const));
      setTasks((prev) =>
        prev.map((task) => {
          const index = orderIndex.get(task.id);
          if (index === undefined) return task;
          return { ...task, orderRank: (index + 1) * 1000 };
        }),
      );
    },
    [setTasks],
  );

  const reseedSection = React.useCallback(
    (items: Task[], sectionId: SectionId) => {
      const section = items
        .filter((t) => t.section === sectionId)
        .sort((a, b) => a.orderRank - b.orderRank)
        .map((t) => t.id);
      const byId = new Map(items.map((t) => [t.id, t] as const));
      section.forEach((id, index) => {
        const current = byId.get(id);
        if (!current) return;
        byId.set(id, { ...current, orderRank: (index + 1) * 1000 });
      });
      return items.map((t) => byId.get(t.id) ?? t);
    },
    [],
  );

  const handlePressTask = React.useCallback(
    (taskId: string) => {
      router.push({ pathname: "/task/[id]", params: { id: taskId } });
    },
    [router],
  );

  const handleToggleComplete = React.useCallback(
    (taskId: string) => {
      setTasks((prev) => {
        const task = prev.find((t) => t.id === taskId);
        if (!task) return prev;

        const fromSection = task.section;
        const now = Date.now();
        let toSection: SectionId = fromSection;
        const nowDate = new Date(now);

        const next = prev.map((t): Task => {
          if (t.id !== taskId) return t;

          if (fromSection === "completed") {
            toSection = "today";
            const hasDueAt =
              typeof t.dueAt === "number" &&
              Number.isFinite(t.dueAt) &&
              t.dueAt > 0;
            return {
              ...t,
              section: "today",
              completedAt: undefined,
              ...(hasDueAt
                ? {}
                : {
                    dueAt: getDueAtForSection("today"),
                    dueHasTime: true,
                  }),
            };
          }

          const routineType = t.isRoutine
            ? (t.routineType ?? t.routineInterval)
            : undefined;

          if (routineType) {
            const nextDue = getNextRoutineDate(t.dueAt, routineType, {
              weekday: t.routineWeekday,
              nthWeek: t.routineNthWeek,
              monthDay: t.routineMonthDay,
              month: t.routineMonth,
            });
            const due = new Date(nextDue);
            const isDueToday =
              due.getFullYear() === nowDate.getFullYear() &&
              due.getMonth() === nowDate.getMonth() &&
              due.getDate() === nowDate.getDate();
            toSection = isDueToday ? "today" : "upcoming";
            return {
              ...t,
              dueAt: nextDue,
              section: toSection,
              completedAt: undefined,
              // Start fresh for the next routine occurrence.
              subtasks: t.subtasks?.map((subtask) => ({
                ...subtask,
                done: false,
              })),
            };
          }

          toSection = "completed";
          return {
            ...t,
            section: "completed",
            completedAt: now,
          };
        });

        if (toSection === fromSection) return next;

        const moved = next.find((t) => t.id === taskId);
        if (!moved) return next;

        const other = next.filter((t) => t.id !== taskId);
        const dest = other
          .filter((t) => t.section === toSection)
          .sort((a, b) => a.orderRank - b.orderRank);
        const rest = other.filter((t) => t.section !== toSection);

        const withInserted = [...rest, moved, ...dest];

        const reseededFrom = reseedSection(withInserted, fromSection);
        const reseededBoth = reseedSection(reseededFrom, toSection);
        return reseededBoth;
      });
    },
    [reseedSection, setTasks],
  );

  const handleDeleteTask = React.useCallback(
    (taskId: string) => {
      setTasks((prev) => {
        const task = prev.find((t) => t.id === taskId);
        if (!task) return prev;
        return prev.map((t) =>
          t.id === taskId ? { ...t, deletedAt: Date.now() } : t,
        );
      });
    },
    [setTasks],
  );

  const handleToggleSubtask = React.useCallback(
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

  const handleAddTask = React.useCallback(() => {
    router.push("/task/create-modal");
  }, [router]);

  const archivePill = React.useMemo(() => {
    const completedCount = tasks.filter(
      (t) => t.section === "completed" && !t.deletedAt,
    ).length;
    const trashedCount = tasks.filter((t) => !!t.deletedAt).length;
    const show = completedCount > 0 || trashedCount > 0;
    if (!show) return null;

    const label =
      completedCount > 0
        ? t("home.archivePill.completed", { count: completedCount })
        : trashedCount > 0
          ? t("home.archivePill.trash", { count: trashedCount })
          : t("home.archivePill.archive");

    const iconKind: "completed" | "trash" =
      completedCount > 0 ? "completed" : "trash";

    return (
      <View style={styles.archivePillFooter}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("home.openArchive")}
          onPress={() => router.push("/home/archive")}
          style={({ pressed }) => [pressed && { opacity: 0.92 }]}
        >
          <GlassSurface
            tintColor={withAlpha(
              Colors[theme].background,
              isDark ? 0.18 : 0.28,
            )}
            fallbackBackgroundColor={withAlpha(
              Colors[theme].background,
              isDark ? 0.86 : 0.92,
            )}
            style={styles.archivePill}
          >
            <MaterialIcons
              name={iconKind === "completed" ? "check-circle" : "delete"}
              size={18}
              color={Colors[theme].text}
            />
            <Text style={styles.archivePillText}>{label}</Text>
          </GlassSurface>
        </Pressable>
      </View>
    );
  }, [isDark, router, styles, tasks, theme]);

  return (
    <View style={styles.container}>
      <View
        style={[styles.heroArea, { paddingTop: heroTopPadding }]}
        pointerEvents="box-none"
        onLayout={(event) => {
          const next = event.nativeEvent.layout.height;
          if (Math.abs(next - heroHeight) > 2) setHeroHeight(next);
        }}
      >
        <View style={styles.heroTopRow}>
          <View style={styles.heroDayRow}>
            <Text style={styles.heroDayText}>{heroDayLabel}</Text>
            <View style={styles.heroDot} />
          </View>
          <Text style={styles.heroDateText}>
            {heroDateTopLabel}
            {"\n"}
            {heroDateYearLabel}
          </Text>
        </View>

        <View style={styles.heroBody}>
          <Text style={styles.heroGreet}>{greetingLabel}</Text>
          <View style={styles.heroLineRow}>
            <Text style={styles.heroLine}>You have</Text>
            <MaterialIcons name="calendar-month" size={18} style={styles.heroLineIcon} />
            <Text style={[styles.heroLine, styles.heroLineStrong]}>
              {meetingsCount} {meetingsCount === 1 ? "meeting" : "meetings"}
            </Text>
            <Text style={styles.heroLine}>,</Text>
          </View>
          <View style={styles.heroLineRow}>
            <MaterialIcons
              name="check-box-outline-blank"
              size={18}
              style={styles.heroLineIcon}
            />
            <Text style={[styles.heroLine, styles.heroLineStrong]}>
              {taskCount} {taskCount === 1 ? "task" : "tasks"}
            </Text>
            <Text style={styles.heroLine}>and</Text>
            <MaterialIcons name="cloud" size={18} style={styles.heroLineIcon} />
            <Text style={[styles.heroLine, styles.heroLineStrong]}>
              {habitCount} {habitCount === 1 ? "habit" : "habits"}
            </Text>
          </View>
          <Text style={styles.heroLine}>
            {"today. You're "}<Text style={styles.heroLineStrong}>mostly free</Text>{" "}
            after <Text style={styles.heroLineStrong}>{freeAfterLabel}.</Text>
          </Text>
        </View>

        <View style={styles.heroMetricsRow}>
          <View style={styles.heroMetric}>
            <Text style={{ color: "#51A2FF", fontSize: 15 }}>🚶</Text>
            <Text style={styles.heroMetricText}>4.7k steps</Text>
          </View>
          <View style={styles.heroMetric}>
            <Text style={{ color: "#C27AFF", fontSize: 15 }}>🌙</Text>
            <Text style={styles.heroMetricText}>7.3 hours</Text>
          </View>
          <View style={styles.heroMetric}>
            <MaterialIcons
              name="local-fire-department"
              size={14}
              color={currentStreak > 0 ? "#F59E0B" : "#9CA3AF"}
            />
            <Text style={styles.heroMetricText}>
              {currentStreak} {currentStreak === 1 ? "day" : "days"}
            </Text>
          </View>
          {undatedCount > 0 ? (
            <View style={styles.heroMetric}>
              <MaterialIcons name="inbox" size={14} color="#9CA3AF" />
              <Text style={styles.heroMetricText}>
                {t("home.quick.withoutDate", { count: undatedCount })}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <NestableScrollContainer
        ref={scrollRef}
        style={styles.scrollLayer}
        scrollEnabled={!isSwipeGestureActive && !isRowTouchActive && !isDragGestureActive}
        contentInsetAdjustmentBehavior="never"
        decelerationRate={Platform.OS === "ios" ? "fast" : "normal"}
        snapToOffsets={walletSnapOffsets}
        snapToEnd={false}
        snapToStart
        bounces={Platform.OS === "ios"}
        disableIntervalMomentum={Platform.OS === "ios"}
        contentContainerStyle={[
          styles.content,
          { paddingTop: cardsStartOffset, paddingBottom: contentBottomPadding },
        ]}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.cardsStack}>
          <View
            style={styles.dateCard}
            onLayout={(event) => {
              const next = event.nativeEvent.layout.y;
              if (Math.abs(next - dateCardY) > 2) setDateCardY(next);
            }}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Kalender</Text>
              <Text style={styles.cardCount}>{visibleTasks.length}</Text>
            </View>
            <View style={styles.cardDivider} />
            <View style={styles.dateRailWrap}>
              <View style={styles.dateRailRow}>
                {dateRailDays.map((day) => {
                  const selectedDayNumStyle = [
                    styles.dateRailDayNum,
                    day.isSelected ? styles.dateRailDayNumSelected : null,
                    day.isSelected && day.isToday ? { color: "#FF6900" } : null,
                  ];

                  return (
                    <Pressable
                      key={day.key}
                      accessibilityRole="button"
                      accessibilityLabel={`${day.weekday} ${day.dayOfMonth}`}
                      onPress={() => setSelectedDateStart(day.timestamp)}
                      style={[
                        styles.dateRailDay,
                        day.isSelected ? styles.dateRailDaySelected : null,
                      ]}
                    >
                      <Text style={selectedDayNumStyle}>{day.dayOfMonth}</Text>
                      <Text
                        style={[
                          styles.dateRailDow,
                          day.isSelected ? styles.dateRailDowSelected : null,
                        ]}
                      >
                        {day.weekday}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={{ height: calendarListHeight }}>
              <TaskSwipeDraggableList
                ref={listRef}
                theme={theme}
                tasks={visibleTasks}
                projectsById={projectsById}
                rowStyles={styles}
                enabledTags={enabledTags}
                showTaskIcons={showTagIcons}
                showCompactSubtasks={withSubtasksEnabled}
                empty={
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>{t("home.empty.noTasks")}</Text>
                  </View>
                }
                onPressTask={handlePressTask}
                toggleComplete={handleToggleComplete}
                toggleSubtask={handleToggleSubtask}
                deleteTask={handleDeleteTask}
                onReorder={applyDatedOrder}
                onSwipeStateChange={handleSwipeStateChange}
                onRowTouchStateChange={handleRowTouchStateChange}
                onDragStateChange={handleDragStateChange}
                renderMode="nestable"
                scrollRef={scrollRef}
                containerStyle={{ flex: 1, backgroundColor: "transparent" }}
              />
            </View>
          </View>

          <View
            style={styles.inboxCard}
            onLayout={(event) => {
              const next = event.nativeEvent.layout.y;
              if (Math.abs(next - inboxCardY) > 2) setInboxCardY(next);
            }}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{t("common.inbox")}</Text>
              <Text style={styles.cardCount}>{undatedCount}</Text>
            </View>
            <View style={styles.cardDivider} />

            <View style={{ height: inboxListHeight }}>
              <TaskSwipeDraggableList
                ref={undatedListRef}
                theme={theme}
                tasks={undatedTasks}
                projectsById={projectsById}
                rowStyles={styles}
                enabledTags={enabledTags}
                showTaskIcons={showTagIcons}
                showCompactSubtasks={withSubtasksEnabled}
                empty={
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>{t("inbox.empty")}</Text>
                  </View>
                }
                onPressTask={handlePressTask}
                toggleComplete={handleToggleComplete}
                toggleSubtask={handleToggleSubtask}
                deleteTask={handleDeleteTask}
                onReorder={applyUndatedOrder}
                onSwipeStateChange={handleSwipeStateChange}
                onRowTouchStateChange={handleRowTouchStateChange}
                onDragStateChange={handleDragStateChange}
                renderMode="nestable"
                scrollRef={scrollRef}
                containerStyle={{ flex: 1, backgroundColor: "transparent" }}
              />
            </View>
          </View>

          {archivePill}
        </View>
      </NestableScrollContainer>

      {showFloatingAddButton ? <FloatingAddButton onPress={handleAddTask} /> : null}
    </View>
  );
}
