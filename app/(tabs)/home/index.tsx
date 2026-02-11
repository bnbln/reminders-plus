import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { NestableScrollContainer } from "react-native-draggable-flatlist";

import {
  TaskSwipeDraggableList,
  type TaskSwipeDraggableListHandle,
  type TaskSwipeDraggableListItem,
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
const GRID_GAP = 10;
const SECTION_SIDE_INSET = 4;
const DATE_RAIL_PAST_DAYS = 119;
const DATE_RAIL_FUTURE_DAYS = 365;
const DATE_RAIL_MIN_ITEM_WIDTH = 44;
const DATE_RAIL_ITEM_GAP = 0;
const DATE_RAIL_PAGE_DAYS = 7;

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

const SECTION_TITLE_KEYS: Record<SectionId, string> = {
  today: "common.today",
  upcoming: "home.section.withoutDate",
  completed: "common.completed",
};

const getStartOfDay = (timestamp: number) => {
  const date = new Date(timestamp);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  ).getTime();
};

const getStartOfToday = () => {
  return getStartOfDay(Date.now());
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

const addDays = (timestamp: number, days: number) => {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + days);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const adjustDueAtOnSectionChange = (
  task: Task,
  nextSection: SectionId,
): Task => {
  if (
    (task.section === "today" && nextSection === "upcoming") ||
    (task.section === "upcoming" && nextSection === "today")
  ) {
    if (task.section === "upcoming" && nextSection === "today") {
      return {
        ...task,
        section: "today",
        dueAt: getStartOfToday(),
        dueHasTime: false,
      };
    }

    if (task.section === "today" && nextSection === "upcoming") {
      return {
        ...task,
        section: "upcoming",
        dueAt: 0,
        dueHasTime: false,
      };
    }
  }

  return {
    ...task,
    section: nextSection,
  };
};

type QuickTile = {
  key: "streaks" | "routines";
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  iconColor: string;
  iconBadgeColor: string;
  onPress: () => void;
};

type QuickNavTheme = {
  tileTintColor: string;
  tileFallbackBg: string;
  chevronColor: string;
};

type DateRailDay = {
  key: string;
  timestamp: number;
  dayOfMonth: string;
  weekday: string;
  isSelected: boolean;
  isToday: boolean;
  isWeekend: boolean;
  eventCount: number;
};

function QuickNavGrid({
  tiles,
  styles,
  theme,
}: {
  tiles: QuickTile[];
  styles: ReturnType<typeof createStyles>;
  theme: QuickNavTheme;
}) {
  return (
    <View style={styles.quickGridWrap}>
      <View style={styles.quickGrid}>
        {tiles.map((tile) => (
          <Pressable
            key={tile.key}
            accessibilityRole="button"
            accessibilityLabel={`${tile.title}: ${tile.subtitle}`}
            onPress={tile.onPress}
            pressRetentionOffset={{ top: 2, bottom: 2, left: 2, right: 2 }}
            hitSlop={8}
            style={styles.quickTilePressable}
          >
            <GlassSurface
              style={styles.quickTile}
              glassEffectStyle="regular"
              tintColor={theme.tileTintColor}
              fallbackBackgroundColor={theme.tileFallbackBg}
              isInteractive
            >
              <View style={styles.quickTileInner}>
                <View style={styles.quickTileIconRow}>
                  <View
                    style={[
                      styles.quickTileIconBadge,
                      { backgroundColor: tile.iconBadgeColor },
                    ]}
                  >
                    <MaterialIcons
                      name={tile.icon}
                      size={18}
                      color={tile.iconColor}
                    />
                  </View>
                  <MaterialIcons
                    name="chevron-right"
                    size={18}
                    color={theme.chevronColor}
                  />
                </View>

                <View style={styles.quickTileTextWrap}>
                  <Text style={styles.quickTileTitle}>{tile.title}</Text>
                  <Text style={styles.quickTileSubtitle} numberOfLines={1}>
                    {tile.subtitle}
                  </Text>
                </View>
              </View>
            </GlassSurface>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const createStyles = (
  theme: ThemeName,
  quickTileWidth: number,
  dateRailItemWidth: number,
) => {
  const isDark = theme === "dark";
  const text = Colors[theme].text;
  const hairline = isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.12)";
  const cardBg = isDark ? "#1C1C1E" : "#F2F2F7";
  const tagBg = withAlpha(text, isDark ? 0.1 : 0.08);
  const tagText = withAlpha(text, 0.78);
  const dangerBg = isDark ? "rgba(255,69,58,0.18)" : "rgba(255,59,48,0.14)";
  const dangerBorder = isDark ? "rgba(255,69,58,0.32)" : "rgba(255,59,48,0.26)";
  const quickTileSubtitle = withAlpha(text, 0.62);
  const dayBubbleSize = Math.max(30, Math.min(40, dateRailItemWidth - 14));

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors[theme].background,
    },
    content: {
      paddingHorizontal: GRID_HORIZONTAL_PADDING,
      paddingTop: 16,
      paddingBottom: 180,
      gap: 10,
    },
    quickGridWrap: {
      marginTop: 0,
      marginBottom: 10,
    },
    quickGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: GRID_GAP,
    },
    quickTilePressable: {
      width: quickTileWidth,
      flexGrow: 0,
    },
    quickTile: {
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hairline,
      overflow: "hidden",
      backgroundColor: isDark ? "#1C1C1E" : "#F2F2F7",
      minHeight: 110,
    },
    quickTileInner: {
      paddingHorizontal: 12,
      paddingVertical: 12,
      gap: 6,
      flex: 1,
      justifyContent: "space-between",
    },
    quickTileIconRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    quickTileIconBadge: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: withAlpha(text, isDark ? 0.08 : 0.06),
    },
    quickTileTextWrap: {
      gap: 2,
    },
    quickTileTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: text,
      letterSpacing: 0.2,
      marginTop: 4,
    },
    quickTileSubtitle: {
      fontSize: 13,
      fontWeight: "600",
      color: quickTileSubtitle,
    },
    dateRailWrap: {
      paddingHorizontal: SECTION_SIDE_INSET,
      paddingTop: 4,
      paddingBottom: 12,
      marginBottom: 8,
    },
    dateRailList: {
      flexGrow: 0,
    },
    dateRailRow: {
      gap: DATE_RAIL_ITEM_GAP,
    },
    dateRailDay: {
      width: dateRailItemWidth,
      alignItems: "center",
      justifyContent: "flex-start",
      gap: 3,
      paddingHorizontal: 1,
      paddingTop: 2,
      paddingBottom: 6,
    },
    dateRailDayBubble: {
      width: dayBubbleSize,
      height: dayBubbleSize,
      borderRadius: dayBubbleSize / 2,
      alignItems: "center",
      justifyContent: "center",
    },
    dateRailDayBubbleSelected: {
      backgroundColor: "#000000",
    },
    dateRailDayNum: {
      color: isDark ? "rgba(255,255,255,0.92)" : "#111111",
      fontSize: 21,
      lineHeight: 24,
      fontWeight: "500",
      letterSpacing: -0.15,
    },
    dateRailDayNumSelected: {
      color: "#FFFFFF",
    },
    dateRailDayNumToday: {
      color: "#FF3B30",
    },
    dateRailDayNumWeekend: {
      color: isDark ? "rgba(255,255,255,0.52)" : "#8E8E93",
    },
    dateRailDow: {
      color: isDark ? "rgba(255,255,255,0.9)" : "#111111",
      fontSize: 12,
      lineHeight: 15,
      fontWeight: "600",
      letterSpacing: 0.18,
      textTransform: "uppercase",
    },
    dateRailDowWeekend: {
      color: isDark ? "rgba(255,255,255,0.52)" : "#8E8E93",
    },
    dateRailEventIndicator: {
      marginTop: 2,
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: isDark ? "#7CB8FF" : "#0A84FF",
    },
    dateRailEventIndicatorSpacer: {
      height: 5,
      marginTop: 2,
    },
    dateRailNoEventsHint: {
      marginTop: 7,
      marginHorizontal: 2,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-start",
      gap: 6,
      paddingVertical: 4,
      paddingHorizontal: 0,
    },
    dateRailNoEventsHintText: {
      fontSize: 12,
      fontWeight: "500",
      color: withAlpha(text, 0.68),
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 10,
      marginBottom: 6,
      paddingHorizontal: SECTION_SIDE_INSET,
    },
    sectionHeaderTightTop: {
      marginTop: 2,
    },
    sectionHeaderButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 4,
      paddingHorizontal: 0,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.9,
      textTransform: "uppercase",
      color: text,
      opacity: 0.55,
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
    minimizeProbeWrap: {
      marginTop: 0,
    },
    minimizeProbeRow: {
      height: 70,
      opacity: 0,
    },
  });
};

export default function HomeScreen() {
  const router = useRouter();
  const theme = useColorScheme() ?? "light";
  const isDark = theme === "dark";
  const { width: viewportWidth } = useWindowDimensions();
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
  const quickTileWidth = React.useMemo(
    () =>
      Math.max(
        0,
        (viewportWidth - GRID_HORIZONTAL_PADDING * 2 - GRID_GAP) / 2,
      ),
    [viewportWidth],
  );
  const dateRailItemWidth = React.useMemo(() => {
    const availableWidth = Math.max(
      0,
      viewportWidth - GRID_HORIZONTAL_PADDING * 2 - 4,
    );
    return Math.max(
      DATE_RAIL_MIN_ITEM_WIDTH,
      (availableWidth - DATE_RAIL_ITEM_GAP * 6) / 7,
    );
  }, [viewportWidth]);
  const styles = React.useMemo(
    () => createStyles(theme, quickTileWidth, dateRailItemWidth),
    [dateRailItemWidth, theme, quickTileWidth],
  );
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
  const dayLabelFormatter = React.useMemo(
    () => new Intl.DateTimeFormat(undefined, { weekday: "narrow" }),
    [],
  );
  const todayStart = React.useMemo(() => getStartOfToday(), []);
  const minimizeProbeRows = React.useMemo(
    () => Array.from({ length: 6 }, (_, index) => index),
    [],
  );

  const routineTasksCount = React.useMemo(() => {
    return tasks.filter(
      (t) =>
        !t.deletedAt && t.isRoutine && (!!t.routineType || !!t.routineInterval),
    ).length;
  }, [tasks]);

  const quickTiles = React.useMemo<QuickTile[]>(() => {
    const streakIconColor = currentStreak > 0 ? "#F59E0B" : "#9CA3AF";
    return [
      {
        key: "streaks",
        title: t("home.quick.streaks"),
        subtitle: `${currentStreak} ${
          currentStreak === 1 ? t("home.quick.day") : t("home.quick.days")
        }`,
        icon: "local-fire-department",
        iconColor: streakIconColor,
        iconBadgeColor: withAlpha(streakIconColor, isDark ? 0.24 : 0.18),
        onPress: () => router.push("/home/streaks"),
      },
      {
        key: "routines",
        title: t("home.quick.routines"),
        subtitle: t("home.quick.recurring", { count: routineTasksCount }),
        icon: "loop",
        iconColor: "#0A84FF",
        iconBadgeColor: withAlpha("#0A84FF", isDark ? 0.24 : 0.18),
        onPress: () => router.push("/home/routines"),
      },
    ];
  }, [currentStreak, isDark, routineTasksCount, router]);

  const quickNavTheme = React.useMemo<QuickNavTheme>(() => {
    const text = Colors[theme].text;
    const tileSurfaceBg = isDark ? "#1C1C1E" : "#F2F2F7";
    return {
      tileTintColor: isDark ? withAlpha(tileSurfaceBg, 0.22) : tileSurfaceBg,
      tileFallbackBg: tileSurfaceBg,
      chevronColor: withAlpha(text, 0.45),
    };
  }, [isDark, theme]);

  const homeEnabledSections = React.useMemo(() => {
    const withoutCompleted = enabledSections.filter((s) => s !== "completed");
    return (
      withoutCompleted.length ? withoutCompleted : ["today", "upcoming"]
    ) as SectionId[];
  }, [enabledSections]);

  const dayEventCountByStart = React.useMemo(() => {
    const counts = new Map<number, number>();
    for (const task of tasks) {
      if (task.deletedAt) continue;
      if (!homeEnabledSections.includes(task.section)) continue;
      if (withNotesEnabled && !task.subtitle) continue;
      if (
        typeof task.dueAt !== "number" ||
        !Number.isFinite(task.dueAt) ||
        task.dueAt <= 0
      ) {
        continue;
      }

      const dayStart = getStartOfDay(task.dueAt);
      counts.set(dayStart, (counts.get(dayStart) ?? 0) + 1);
    }
    return counts;
  }, [homeEnabledSections, tasks, withNotesEnabled]);

  const selectedDateHintFormatter = React.useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
      }),
    [],
  );
  const selectedDateHintLabel = React.useMemo(
    () => selectedDateHintFormatter.format(selectedDateStart),
    [selectedDateHintFormatter, selectedDateStart],
  );
  const selectedDayEventCount = React.useMemo(
    () => dayEventCountByStart.get(selectedDateStart) ?? 0,
    [dayEventCountByStart, selectedDateStart],
  );

  const dateRailInitialIndex = DATE_RAIL_PAST_DAYS;
  const dateRailSnapInterval = React.useMemo(
    () => dateRailItemWidth + DATE_RAIL_ITEM_GAP,
    [dateRailItemWidth],
  );
  const dateRailPageInterval = React.useMemo(
    () => dateRailSnapInterval * DATE_RAIL_PAGE_DAYS,
    [dateRailSnapInterval],
  );
  const dateRailDays = React.useMemo<DateRailDay[]>(() => {
    const rangeStart = addDays(todayStart, -DATE_RAIL_PAST_DAYS);
    return Array.from(
      { length: DATE_RAIL_PAST_DAYS + DATE_RAIL_FUTURE_DAYS + 1 },
      (_, index) => {
        const timestamp = addDays(rangeStart, index);
        const eventCount = dayEventCountByStart.get(timestamp) ?? 0;
        return {
          key: `d-${timestamp}`,
          timestamp,
          dayOfMonth: String(new Date(timestamp).getDate()),
          weekday: dayLabelFormatter
            .format(timestamp)
            .replace(".", "")
            .toUpperCase(),
          isSelected: isSameLocalDay(timestamp, selectedDateStart),
          isToday: isSameLocalDay(timestamp, todayStart),
          isWeekend:
            new Date(timestamp).getDay() === 0 ||
            new Date(timestamp).getDay() === 6,
          eventCount,
        };
      },
    );
  }, [dayEventCountByStart, dayLabelFormatter, selectedDateStart, todayStart]);

  const handleSelectDate = React.useCallback(
    (timestamp: number) => {
      setSelectedDateStart((current) => {
        if (isSameLocalDay(current, timestamp)) return current;
        void Haptics.selectionAsync().catch(() => undefined);
        return timestamp;
      });
    },
    [],
  );

  const getDateRailItemLayout = React.useCallback(
    (_: ArrayLike<DateRailDay> | null | undefined, index: number) => ({
      length: dateRailSnapInterval,
      offset: dateRailSnapInterval * index,
      index,
    }),
    [dateRailSnapInterval],
  );

  const dateRailRef = React.useRef<FlatList<DateRailDay> | null>(null);
  const currentWeekIndexRef = React.useRef(
    Math.floor(dateRailInitialIndex / DATE_RAIL_PAGE_DAYS),
  );
  const dateRailWeekSnapOffsets = React.useMemo(() => {
    const weekCount = Math.ceil(dateRailDays.length / DATE_RAIL_PAGE_DAYS);
    return Array.from({ length: weekCount }, (_, week) => week * dateRailPageInterval);
  }, [dateRailDays.length, dateRailPageInterval]);
  const handleDateRailScrollToIndexFailed = React.useCallback(() => {
    requestAnimationFrame(() => {
      dateRailRef.current?.scrollToIndex({
        index: dateRailInitialIndex,
        animated: false,
        viewPosition: 0,
      });
    });
  }, [dateRailInitialIndex]);

  const handleDateRailMomentumEnd = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = event.nativeEvent.contentOffset.x;
      const maxWeekIndex = Math.max(
        0,
        Math.ceil(dateRailDays.length / DATE_RAIL_PAGE_DAYS) - 1,
      );
      const weekIndex = Math.min(
        Math.max(Math.round(offset / dateRailPageInterval), 0),
        maxWeekIndex,
      );
      const previousWeekIndex = currentWeekIndexRef.current;
      if (weekIndex === previousWeekIndex) return;

      const isBackward = weekIndex < previousWeekIndex;
      const weekStartIndex = weekIndex * DATE_RAIL_PAGE_DAYS;
      const rawIndex = isBackward
        ? weekStartIndex + (DATE_RAIL_PAGE_DAYS - 1)
        : weekStartIndex;
      currentWeekIndexRef.current = weekIndex;
      const nextIndex = Math.min(
        Math.max(rawIndex, 0),
        Math.max(dateRailDays.length - 1, 0),
      );
      const nextDay = dateRailDays[nextIndex];
      if (!nextDay) return;
      handleSelectDate(nextDay.timestamp);
    },
    [dateRailDays, dateRailPageInterval, handleSelectDate],
  );

  const [collapsedSections, setCollapsedSections] = React.useState<
    Record<"today" | "upcoming", boolean>
  >({
    today: false,
    upcoming: false,
  });

  const scrollRef = React.useRef<any>(null);
  const listRef = React.useRef<TaskSwipeDraggableListHandle | null>(null);
  const [isSwipeGestureActive, setIsSwipeGestureActive] = React.useState(false);

  const closeAnyOpen = React.useCallback(() => {
    listRef.current?.closeAnyOpen();
  }, []);

  const handleSwipeStateChange = React.useCallback((isSwiping: boolean) => {
    setIsSwipeGestureActive(isSwiping);
  }, []);

  const projectsById = React.useMemo(
    () => new Map(projects.map((p) => [p.id, p] as const)),
    [projects],
  );

  const visibleTasks = React.useMemo(() => {
    const base = tasks.filter((t) => {
      if (t.deletedAt) return false;
      if (!homeEnabledSections.includes(t.section)) return false;

      const hasDueAt =
        typeof t.dueAt === "number" && Number.isFinite(t.dueAt) && t.dueAt > 0;

      if (!hasDueAt) {
        return t.section === "upcoming";
      }

      return isSameLocalDay(t.dueAt, selectedDateStart);
    });
    if (!withNotesEnabled) return base;
    return base.filter((t) => !!t.subtitle);
  }, [homeEnabledSections, selectedDateStart, tasks, withNotesEnabled]);

  const visibleSections = React.useMemo(() => {
    return SECTION_ORDER.filter((s) =>
      homeEnabledSections.includes(s),
    ) as SectionId[];
  }, [homeEnabledSections]);

  const firstVisibleSection = visibleSections[0] ?? "today";

  const tasksBySection = React.useMemo(() => {
    const grouped: Record<SectionId, Task[]> = {
      today: [],
      upcoming: [],
      completed: [],
    };
    for (const task of visibleTasks) grouped[task.section].push(task);
    for (const sectionId of SECTION_ORDER) {
      grouped[sectionId] = [...grouped[sectionId]].sort(
        (a, b) => a.orderRank - b.orderRank,
      );
    }
    return grouped;
  }, [visibleTasks]);

  type ListItem =
    | { type: "header"; key: string; sectionId: SectionId }
    | { type: "task"; key: string; taskId: string };

  const listData = React.useMemo<ListItem[]>(() => {
    const data: ListItem[] = [];
    for (const sectionId of visibleSections) {
      if (sectionId !== firstVisibleSection) {
        data.push({ type: "header", key: `h-${sectionId}`, sectionId });
      }

      const isCollapsed =
        sectionId === "today"
          ? collapsedSections.today
          : sectionId === "upcoming"
            ? collapsedSections.upcoming
            : false;
      if (isCollapsed) continue;

      for (const task of tasksBySection[sectionId]) {
        data.push({
          type: "task",
          key: `${task.id}:${sectionId}`,
          taskId: task.id,
        });
      }
    }
    return data;
  }, [
    collapsedSections.today,
    collapsedSections.upcoming,
    firstVisibleSection,
    tasksBySection,
    visibleSections,
  ]);

  const swipeListData = React.useMemo<TaskSwipeDraggableListItem[]>(() => {
    return listData.map((item) =>
      item.type === "header"
        ? { kind: "header", key: item.key, sectionId: item.sectionId }
        : { kind: "task", key: item.key, taskId: item.taskId },
    );
  }, [listData]);

  const applyOrderFromListData = React.useCallback(
    (data: ListItem[]) => {
      if (visibleSections.length === 0) return;

      const bySection: Record<SectionId, string[]> = {
        today: [],
        upcoming: [],
        completed: [],
      };
      let currentSection: SectionId = firstVisibleSection;

      for (const item of data) {
        if (item.type === "header") {
          currentSection = item.sectionId;
          continue;
        }
        bySection[currentSection].push(item.taskId);
      }

      setTasks((prev) => {
        const visibleIdSet = new Set(visibleTasks.map((t) => t.id));

        const nextById = new Map<string, Task>();
        for (const task of prev) nextById.set(task.id, task);

        for (const sectionId of SECTION_ORDER) {
          const reorderedVisibleIds = bySection[sectionId];
          const reorderedVisibleSet = new Set(reorderedVisibleIds);

          const stableHidden = prev
            .filter((t) => t.section === sectionId && !visibleIdSet.has(t.id))
            .sort((a, b) => a.orderRank - b.orderRank)
            .map((t) => t.id);

          const finalOrder = [...reorderedVisibleIds, ...stableHidden];
          finalOrder.forEach((id, index) => {
            const existing = nextById.get(id);
            if (!existing) return;
            const moved = reorderedVisibleSet.has(id)
              ? adjustDueAtOnSectionChange(existing, sectionId)
              : existing;
            nextById.set(id, { ...moved, orderRank: (index + 1) * 1000 });
          });
        }

        return prev.map((t) => nextById.get(t.id) ?? t);
      });
    },
    [firstVisibleSection, setTasks, visibleSections, visibleTasks],
  );

  const applyOrderFromSwipeListData = React.useCallback(
    (data: TaskSwipeDraggableListItem[]) => {
      const mapped: ListItem[] = data.map((item) =>
        item.kind === "header"
          ? {
              type: "header",
              key: item.key,
              sectionId: item.sectionId as SectionId,
            }
          : { type: "task", key: item.key, taskId: item.taskId },
      );
      applyOrderFromListData(mapped);
    },
    [applyOrderFromListData],
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

  const renderSectionHeaderRow = React.useCallback(
    (sectionId: string) => {
      const id = sectionId as SectionId;
      const isCollapsible = id === "today" || id === "upcoming";
      const isCollapsed =
        id === "today" ? collapsedSections.today : collapsedSections.upcoming;

      const onToggle = () => {
        if (!isCollapsible) return;
        closeAnyOpen();
        setCollapsedSections((prev) => ({
          ...prev,
          [id]: !prev[id as "today" | "upcoming"],
        }));
      };

      return (
        <View
          style={[
            styles.sectionHeader,
            id === "upcoming" ? styles.sectionHeaderTightTop : null,
          ]}
        >
          <Pressable
            accessibilityRole={isCollapsible ? "button" : undefined}
            accessibilityLabel={
              isCollapsible
                ? t("home.filter.toggleSection", {
                    section: t(SECTION_TITLE_KEYS[id]),
                  })
                : undefined
            }
            onPress={onToggle}
            hitSlop={10}
            style={styles.sectionHeaderButton}
          >
            {isCollapsible ? (
              <MaterialIcons
                name="chevron-right"
                size={16}
                color={withAlpha(Colors[theme].text, 0.55)}
                style={{
                  transform: [{ rotate: isCollapsed ? "0deg" : "90deg" }],
                }}
              />
            ) : null}
            <Text style={styles.sectionTitle}>{t(SECTION_TITLE_KEYS[id])}</Text>
          </Pressable>
        </View>
      );
    },
    [
      closeAnyOpen,
      collapsedSections.today,
      collapsedSections.upcoming,
      styles,
      theme,
    ],
  );

  const listHeader = React.useMemo(() => {
    const sectionId = firstVisibleSection;

    if (sectionId === "today") {
      return (
        <View>
          <QuickNavGrid tiles={quickTiles} styles={styles} theme={quickNavTheme} />
          <View style={styles.dateRailWrap}>
            <FlatList
              ref={dateRailRef}
              data={dateRailDays}
              keyExtractor={(day) => day.key}
              renderItem={({ item: day }) => {
                const dayContainerStyle = [styles.dateRailDay];
                const dayBubbleStyle = [
                  styles.dateRailDayBubble,
                  day.isSelected ? styles.dateRailDayBubbleSelected : null,
                ];
                const dayNumStyle = [
                  styles.dateRailDayNum,
                  day.isWeekend ? styles.dateRailDayNumWeekend : null,
                  day.isToday ? styles.dateRailDayNumToday : null,
                  day.isSelected ? styles.dateRailDayNumSelected : null,
                ];
                const dayDowStyle = [
                  styles.dateRailDow,
                  day.isWeekend ? styles.dateRailDowWeekend : null,
                ];

                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${day.weekday} ${day.dayOfMonth}`}
                    onPress={() => {
                      closeAnyOpen();
                      handleSelectDate(day.timestamp);
                    }}
                    style={dayContainerStyle}
                  >
                    <Text style={dayDowStyle}>{day.weekday}</Text>
                    <View style={dayBubbleStyle}>
                      <Text style={dayNumStyle}>{day.dayOfMonth}</Text>
                    </View>
                    {day.eventCount > 0 ? (
                      <View style={styles.dateRailEventIndicator} />
                    ) : (
                      <View style={styles.dateRailEventIndicatorSpacer} />
                    )}
                  </Pressable>
                );
              }}
              horizontal
              style={styles.dateRailList}
              contentContainerStyle={styles.dateRailRow}
              initialScrollIndex={dateRailInitialIndex}
              getItemLayout={getDateRailItemLayout}
              onScrollToIndexFailed={handleDateRailScrollToIndexFailed}
              onMomentumScrollEnd={handleDateRailMomentumEnd}
              showsHorizontalScrollIndicator={false}
              snapToOffsets={dateRailWeekSnapOffsets}
              snapToAlignment="start"
              decelerationRate="fast"
              disableIntervalMomentum
              bounces={false}
            />
            {selectedDayEventCount === 0 ? (
              <View style={styles.dateRailNoEventsHint}>
                <MaterialIcons
                  name="event-busy"
                  size={14}
                  color={withAlpha(Colors[theme].text, 0.52)}
                />
                <Text style={styles.dateRailNoEventsHintText}>
                  {`${t("home.empty.noTasks")} · ${selectedDateHintLabel}`}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      );
    }

    const isCollapsible = sectionId === "today" || sectionId === "upcoming";
    const isCollapsed =
      sectionId === "today"
        ? collapsedSections.today
        : collapsedSections.upcoming;

    const onToggle = () => {
      if (!isCollapsible) return;
      closeAnyOpen();
      setCollapsedSections((prev) => ({
        ...prev,
        [sectionId]: !prev[sectionId as "today" | "upcoming"],
      }));
    };

    return (
      <View>
        <View
          style={[
            styles.sectionHeader,
            sectionId === "upcoming" ? styles.sectionHeaderTightTop : null,
          ]}
        >
          <Pressable
            accessibilityRole={isCollapsible ? "button" : undefined}
            accessibilityLabel={
              isCollapsible
                ? t("home.filter.toggleSection", {
                    section: t(SECTION_TITLE_KEYS[sectionId]),
                  })
                : undefined
            }
            onPress={onToggle}
            hitSlop={10}
            style={styles.sectionHeaderButton}
          >
            {isCollapsible ? (
              <MaterialIcons
                name="chevron-right"
                size={16}
                color={withAlpha(Colors[theme].text, 0.55)}
                style={{
                  transform: [{ rotate: isCollapsed ? "0deg" : "90deg" }],
                }}
              />
            ) : null}
            <Text style={styles.sectionTitle}>
              {t(SECTION_TITLE_KEYS[sectionId])}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }, [
    closeAnyOpen,
    collapsedSections.today,
    collapsedSections.upcoming,
    dateRailDays,
    dateRailInitialIndex,
    dateRailWeekSnapOffsets,
    handleDateRailMomentumEnd,
    firstVisibleSection,
    getDateRailItemLayout,
    handleDateRailScrollToIndexFailed,
    handleSelectDate,
    quickNavTheme,
    quickTiles,
    selectedDateHintLabel,
    selectedDayEventCount,
    styles,
    theme,
  ]);

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
      <NestableScrollContainer
        ref={scrollRef}
        scrollEnabled={!isSwipeGestureActive}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content]}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <TaskSwipeDraggableList
          ref={listRef}
          theme={theme}
          tasks={visibleTasks}
          projectsById={projectsById}
          rowStyles={styles}
          enabledTags={enabledTags}
          showTaskIcons={showTagIcons}
          showCompactSubtasks={withSubtasksEnabled}
          data={swipeListData}
          renderHeaderRow={renderSectionHeaderRow}
          header={listHeader}
          footer={archivePill}
          empty={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>{t("home.empty.noTasks")}</Text>
            </View>
          }
          onPressTask={handlePressTask}
          toggleComplete={handleToggleComplete}
          toggleSubtask={handleToggleSubtask}
          deleteTask={handleDeleteTask}
          onReorderData={applyOrderFromSwipeListData}
          onSwipeStateChange={handleSwipeStateChange}
          renderMode="nestable"
          scrollRef={scrollRef}
        />

        <View
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={styles.minimizeProbeWrap}
        >
          {minimizeProbeRows.map((row) => (
            <View key={`probe-${row}`} style={styles.minimizeProbeRow} />
          ))}
        </View>
      </NestableScrollContainer>

      {showFloatingAddButton ? <FloatingAddButton onPress={handleAddTask} /> : null}
    </View>
  );
}
