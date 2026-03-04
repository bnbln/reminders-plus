import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { type MenuAction } from "@react-native-menu/menu";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import React from "react";
import {
  Animated,
  Easing,
  FlatList,
  type GestureResponderEvent,
  LayoutAnimation,
  type LayoutChangeEvent,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { NestableScrollContainer } from "react-native-draggable-flatlist";

import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";

import {
  TaskSwipeDraggableList,
  type TaskSwipeDraggableListHandle,
  type TaskSwipeDraggableListItem,
} from "@/components/tasks/task-swipe-draggable-list";
import { FloatingAddButton } from "@/components/ui/floating-add-button";
import { GlassSurface, withAlpha } from "@/components/ui/glass-surface";
import { SFSymbol } from "@/components/ui/sfsymbol";
import { Colors } from "@/constants/theme";
import { useHomeFilters } from "@/context/home-filters-store";
import { useTaskCreateContext } from "@/context/task-create-context";
import {
  getDueAtForSection,
  getNextRoutineDate,
  SectionId,
  type Task,
  useTasksStore,
} from "@/context/tasks-store";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useStreaks } from "@/hooks/use-streaks";
import { getIntlLocale, t } from "@/i18n";
import { isIOS26OrNewer } from "@/utils/ios-version";
import {
  alignDueAtToLocalDay,
  deriveActiveSectionFromDueAt,
  getStartOfLocalDayMs,
  hasValidDueAt,
  isSameLocalDay,
} from "@/utils/task-dates";

type ThemeName = keyof typeof Colors;
const GRID_HORIZONTAL_PADDING = 16;
const GRID_GAP = 10;
const SECTION_SIDE_INSET = 0;
const DATE_RAIL_HORIZONTAL_PADDING = 6;
const DATE_RAIL_PAST_DAYS = 119;
const DATE_RAIL_FUTURE_DAYS = 365;
const DATE_RAIL_MIN_ITEM_WIDTH = 40;
const DATE_RAIL_ITEM_GAP = 6;
const DATE_RAIL_PAGE_DAYS = 7;
const DATE_DROP_VERTICAL_PADDING = 16;
const DATE_DROP_INTENT_DWELL_MS_FROM_TODAY = 260;
const DATE_DROP_INTENT_DWELL_MS_FROM_UPCOMING = 180;
const DATE_DROP_INTENT_HORIZONTAL_TRAVEL_FROM_TODAY = 28;
const DATE_DROP_INTENT_HORIZONTAL_TRAVEL_FROM_UPCOMING = 18;
const STREAK_PROGRESS_DAYS = 7;
const HOME_TASK_ITEM_SPACING = 8;
const TASK_ROW_SIDE_BLEED = 8;
const HERO_HEADER_OVERLAP = 268;
const TASK_ROW_HORIZONTAL_PADDING = 12;
const CONTENT_STACK_GAP = 10;
const DATE_TRANSITION_DURATION = 250;
const DATE_TRANSITION_FALLBACK_DELAY_MS = 140;
const IOS_LIGHT_BASE_BACKGROUND = "#F2F2F7"; // systemGroupedBackground
const IOS_LIGHT_ELEVATED_SURFACE = "#FFFFFF"; // secondarySystemGroupedBackground
const IOS_LIGHT_INSET_SURFACE = "#EBEBF0"; // tertiarySystemFill-like
const IOS_LIGHT_SEPARATOR = "rgba(60, 60, 67, 0.22)"; // separator
const IOS_LIGHT_TINT_FILL = "rgba(118, 118, 128, 0.2)"; // quaternarySystemFill-like
const HOME_ONBOARDING_KEYS = {
  gestures: "reminds.home.onboarding.gestures.v1",
  dragDropTargets: "reminds.home.onboarding.dragDropTargets.v1",
} as const;

const SECTION_ORDER: SectionId[] = ["today", "upcoming", "completed"];

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

// Month Year Picker styles
const CALENDAR_POPOVER_WIDTH = 310;
const CALENDAR_POPOVER_HEIGHT = 220;

async function readOnboardingSeen(key: string): Promise<boolean> {
  try {
    if (Platform.OS === "web") {
      if (typeof localStorage === "undefined") return false;
      return localStorage.getItem(key) === "1";
    }
    const value = await AsyncStorage.getItem(key);
    return value === "1";
  } catch {
    return false;
  }
}

async function markOnboardingSeen(key: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(key, "1");
      }
      return;
    }
    await AsyncStorage.setItem(key, "1");
  } catch {
    // ignore
  }
}

const configureSmoothListLayoutTransition = () => {
  LayoutAnimation.configureNext({
    duration: 280,
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
      duration: 220,
    },
    update: {
      type: LayoutAnimation.Types.spring,
      springDamping: 0.86,
      duration: 280,
    },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
      duration: 170,
    },
  });
};

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

const getStartOfDay = (timestamp: number) => getStartOfLocalDayMs(timestamp);

const getStartOfToday = () => getStartOfLocalDayMs();

const addDays = (timestamp: number, days: number) => {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + days);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const getStartOfWeekMonday = (timestamp: number) => {
  const date = new Date(timestamp);
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diffToMonday);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const deriveHomeDisplaySection = (
  task: Pick<Task, "section" | "dueAt">,
  targetDayStart: number,
): SectionId => {
  if (task.section === "completed") return "completed";
  if (hasValidDueAt(task.dueAt) && isSameLocalDay(task.dueAt, targetDayStart)) {
    return "today";
  }
  return "upcoming";
};

const adjustDueAtOnSectionChange = (
  task: Task,
  nextSection: SectionId,
  targetDayStart: number,
): Task => {
  if (nextSection === "completed") {
    return {
      ...task,
      section: "completed",
      completedAt: task.completedAt ?? Date.now(),
    };
  }

  if (nextSection === "today") {
    const keepTime =
      task.dueHasTime === true ||
      (task.dueHasTime !== false && hasValidDueAt(task.dueAt));
    const nextDueAt = alignDueAtToLocalDay(targetDayStart, {
      sourceDueAt: task.dueAt,
      keepTime,
    });
    return {
      ...task,
      section: deriveActiveSectionFromDueAt(nextDueAt),
      dueAt: nextDueAt,
      dueHasTime: keepTime,
      completedAt: undefined,
    };
  }

  return {
    ...task,
    section: "upcoming",
    dueAt: 0,
    dueHasTime: false,
    completedAt: undefined,
  };
};

type HomeMetricsProps = {
  completionPercentage: number;
  currentStreak: number;
  onPress: () => void;
};

type HomeMetricsTheme = {
  topSurface: string;
  cardBackgroundColor: string;
  borderColor: string;
  primaryText: string;
  mutedText: string;
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

type DateRailMonthOption = {
  key: string;
  monthStart: number;
  title: string;
};

type DateListTransitionState = {
  fromDateStart: number;
  toDateStart: number;
  direction: 1 | -1;
};

type DateRailTitleTransitionState = {
  fromTitle: string;
  toTitle: string;
  direction: 1 | -1;
};
type DateSelectionSource =
  | "press"
  | "swipe"
  | "momentum"
  | "picker"
  | "programmatic";

type DragSurfaceId = "today" | "upcoming";
type DragBounds = { x: number; y: number; width: number; height: number };

const isPointNearBounds = (
  bounds: DragBounds | null,
  x: number,
  y: number,
  inset: { top: number; right: number; bottom: number; left: number },
) => {
  if (!bounds) return false;
  return (
    x >= bounds.x - inset.left &&
    x <= bounds.x + bounds.width + inset.right &&
    y >= bounds.y - inset.top &&
    y <= bounds.y + bounds.height + inset.bottom
  );
};

const isSameLocalMonth = (left: number, right: number) => {
  const l = new Date(left);
  const r = new Date(right);
  return l.getFullYear() === r.getFullYear() && l.getMonth() === r.getMonth();
};

function HomeMetricsGrid({
  metrics,
  styles,
  theme,
}: {
  metrics: HomeMetricsProps;
  styles: ReturnType<typeof createStyles>;
  theme: HomeMetricsTheme;
}) {
  return (
    <View style={styles.metricsGridWrap}>
      <View style={styles.metricsGrid}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`status: ${metrics.completionPercentage}%`}
          onPress={metrics.onPress}
          hitSlop={8}
          style={({ pressed }) => [
            styles.metricsCardPressable,
            pressed && { opacity: 0.9 },
            { transform: [{ scale: pressed ? 0.98 : 1 }] },
          ]}
        >
          <GlassSurface
            style={styles.metricsCard}
            glassEffectStyle="regular"
            tintColor={theme.cardBackgroundColor}
            fallbackBackgroundColor={theme.cardBackgroundColor}
            isInteractive
          >
            <View style={styles.metricsCardInner}>
              <View style={styles.metricsHeaderRow}>
                <SFSymbol
                  name="arrow.up.right"
                  size={16}
                  color="#22C55E"
                  weight="bold"
                />
                <Text
                  style={[
                    styles.metricsHeaderLabel,
                    { color: theme.mutedText },
                  ]}
                >
                  STATUS
                </Text>
              </View>
              <Text
                style={[
                  styles.metricsPrimaryValue,
                  { color: theme.primaryText },
                ]}
              >
                {metrics.completionPercentage}%
              </Text>
            </View>
          </GlassSurface>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`streak: ${metrics.currentStreak}`}
          onPress={metrics.onPress}
          hitSlop={8}
          style={({ pressed }) => [
            styles.metricsCardPressable,
            pressed && { opacity: 0.9 },
            { transform: [{ scale: pressed ? 0.98 : 1 }] },
          ]}
        >
          <GlassSurface
            style={styles.metricsCard}
            glassEffectStyle="regular"
            tintColor={theme.cardBackgroundColor}
            fallbackBackgroundColor={theme.cardBackgroundColor}
            isInteractive
          >
            <View style={styles.metricsCardInner}>
              <View style={styles.metricsHeaderRow}>
                <SFSymbol name="flame.fill" size={16} color="#F97316" />
                <Text
                  style={[
                    styles.metricsHeaderLabel,
                    { color: theme.mutedText },
                  ]}
                >
                  STREAK
                </Text>
              </View>
              <Text
                style={[
                  styles.metricsPrimaryValue,
                  { color: theme.primaryText },
                ]}
              >
                {metrics.currentStreak}
              </Text>
            </View>
          </GlassSurface>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (theme: ThemeName, dateRailItemWidth: number) => {
  const isDark = theme === "dark";
  const useAppleLightPalette = !isDark && Platform.OS === "ios";
  const text = Colors[theme].text;

  // ─── Design Tokens ─────────────────────────────────
  const ACCENT = "#F4512C";
  const ALPHA_2 = 0.72; // secondary: subtitles, meta, icons
  const ALPHA_3 = 0.48; // tertiary: labels, section headers, hints
  const ALPHA_4 = 0.28; // quaternary: dividers, faint borders
  const WEIGHT_HERO = "900" as const;
  const WEIGHT_HEADING = "700" as const;
  const WEIGHT_BODY = "600" as const;
  const WEIGHT_SUBTLE = "500" as const;
  const RADIUS_CARD = 12;
  const RADIUS_TILE = 10;
  const RADIUS_CHIP = 6;
  const RADIUS_PILL = 999;
  // ───────────────────────────────────────────────────

  const screenBackground = useAppleLightPalette
    ? IOS_LIGHT_BASE_BACKGROUND
    : Colors[theme].background;
  const hairline = isDark
    ? withAlpha(text, ALPHA_4)
    : useAppleLightPalette
      ? IOS_LIGHT_SEPARATOR
      : withAlpha(text, ALPHA_4);
  const rowCardSurface = isDark
    ? "rgba(89, 89, 89, 0.2)"
    : IOS_LIGHT_ELEVATED_SURFACE;
  const insetSurface = isDark
    ? "rgba(255,255,255,0.06)"
    : useAppleLightPalette
      ? IOS_LIGHT_INSET_SURFACE
      : "rgba(0,0,0,0.04)";
  const tagBg = withAlpha(text, isDark ? 0.1 : 0.08);
  const tagText = withAlpha(text, ALPHA_2);
  const dangerBg = isDark ? "rgba(255,69,58,0.18)" : "rgba(255,59,48,0.14)";
  const dangerBorder = isDark ? "rgba(255,69,58,0.32)" : "rgba(255,59,48,0.26)";
  const rowMetaText = withAlpha(text, ALPHA_3);
  const dayBubbleSize = Math.max(30, Math.min(40, dateRailItemWidth - 14));
  const heroCardBorder = isDark
    ? "rgba(255,255,255,0.09)"
    : useAppleLightPalette
      ? "rgba(60,60,67,0.18)"
      : "rgba(17,24,28,0.09)";
  const heroCardRadius = 18;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: screenBackground,
    },
    content: {
      paddingHorizontal: GRID_HORIZONTAL_PADDING,
      paddingTop: 8,
      paddingBottom: 184,
      gap: CONTENT_STACK_GAP,
    },
    topHeroWrap: {
      marginHorizontal: -GRID_HORIZONTAL_PADDING,
      marginTop: -HERO_HEADER_OVERLAP,
      paddingTop: HERO_HEADER_OVERLAP,
      paddingBottom: 0,
      marginBottom: 0,
    },
    topHeroSurface: {
      paddingTop: 0,
      // Keep vertical spacing between streak card and the shared day panel.
      paddingBottom: CONTENT_STACK_GAP,
    },
    metricsGridWrap: {
      marginTop: 0,
      marginBottom: 0,
      paddingHorizontal: GRID_HORIZONTAL_PADDING,
    },
    metricsGrid: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 16,
    },
    metricsCardPressable: {
      flex: 1,
    },
    metricsCard: {
      borderRadius: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: heroCardBorder,
      overflow: "hidden",
      minHeight: 110,
    },
    metricsCardInner: {
      paddingHorizontal: 20,
      paddingVertical: 20,
      justifyContent: "center",
      gap: 8,
    },
    metricsHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    metricsHeaderLabel: {
      fontSize: 13,
      fontWeight: WEIGHT_HEADING,
      letterSpacing: 0.5,
    },
    metricsPrimaryValue: {
      fontSize: 40,
      fontWeight: WEIGHT_HERO,
      letterSpacing: -0.5,
    },
    streakStatsValueRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    streakStatsCell: {
      flex: 1,
      alignItems: "flex-end",
      justifyContent: "center",
      minWidth: 0,
    },
    streakStatLabel: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: WEIGHT_BODY,
      letterSpacing: 0.2,
      opacity: ALPHA_3,
      flexShrink: 1,
      textAlign: "right",
    },
    streakStatValue: {
      fontSize: 20,
      lineHeight: 24,
      fontWeight: WEIGHT_HERO,
      letterSpacing: -0.4,
      flexShrink: 0,
      textAlign: "right",
    },
    streakProgressWrap: {
      gap: 0,
    },
    streakProgressTrackInset: {
      paddingHorizontal: 4,
    },
    streakProgressTrack: {
      width: "100%",
      height: 28,
      borderRadius: RADIUS_TILE,
      overflow: "hidden",
      justifyContent: "center",
    },
    streakProgressFill: {
      height: "100%",
      borderRadius: RADIUS_TILE,
    },
    streakProgressLabelsRow: {
      ...StyleSheet.absoluteFillObject,
      flexDirection: "row",
      alignItems: "center",
    },
    streakProgressLabelCell: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    streakProgressLabelText: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: "800",
      letterSpacing: 0.15,
    },
    dateRailWrap: {
      paddingHorizontal: 0,
      paddingTop: 10,
      paddingBottom: 6,
      marginHorizontal: 10,
      marginTop: 0,
      marginBottom: 6,
      zIndex: 100,
    },
    dateRailWrapCollapsed: {
      paddingBottom: 2,
      marginBottom: 2,
    },
    dateRailMotionContent: {
      position: "relative",
      zIndex: 100,
    },
    dateRailTitleHost: {
      position: "relative",
      minHeight: 36,
      marginBottom: 12,
      justifyContent: "center",
      zIndex: 100,
    },
    dateRailTitleHostCollapsed: {
      marginBottom: 2,
    },
    dateRailTitlePressable: {
      width: "100%",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 8,
      paddingHorizontal: 16,
    },
    dateRailTitleViewport: {
      width: "100%",
      overflow: "visible",
      alignItems: "center",
      justifyContent: "center",
    },
    dateRailTitleTextViewport: {
      height: 24,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
    },
    dateRailTitleTextTransitionHost: {
      height: 24,
      alignItems: "center",
      justifyContent: "center",
    },
    dateRailTitleTextMeasure: {
      opacity: 0,
    },
    dateRailTitleTextTransitionText: {
      position: "absolute",
      left: 0,
      right: 0,
    },
    dateRailTitleCenterHost: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },
    dateRailTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: RADIUS_PILL,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hairline,
    },
    calendarButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      marginLeft: 8,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: heroCardBorder,
    },
    calendarPopover: {
      width: CALENDAR_POPOVER_WIDTH,
      height: CALENDAR_POPOVER_HEIGHT,
      borderRadius: RADIUS_CARD,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: heroCardBorder,
      overflow: "hidden",
      shadowColor: "#000000",
      shadowOpacity: isDark ? 0.4 : 0.18,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 14 },
    },
    calendarPopoverHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: heroCardBorder,
    },
    calendarPopoverTitle: {
      fontSize: 14,
      fontWeight: WEIGHT_HEADING,
      color: text,
      opacity: ALPHA_2,
    },
    calendarPopoverDone: {
      fontSize: 14,
      fontWeight: WEIGHT_HEADING,
      color: ACCENT,
    },
    dateRailTitle: {
      fontSize: 18,
      lineHeight: 24,
      fontWeight: WEIGHT_HEADING,
      color: text,
      letterSpacing: 0.2,
      textAlign: "center",
      marginBottom: 0,
    },
    dateRailList: {
      flexGrow: 0,
    },
    dateRailRow: {
      gap: DATE_RAIL_ITEM_GAP,
    },
    dateRailDay: {
      width: dateRailItemWidth,
      height: 64,
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
      paddingHorizontal: 0,
      paddingTop: 6,
      paddingBottom: 6,
      borderRadius: 12,
      backgroundColor: insetSurface,
    },
    dateRailDaySelected: {
      backgroundColor: ACCENT,
    },
    dateRailDayNum: {
      color: isDark ? "rgba(255,255,255,0.92)" : "#475569",
      fontSize: 20,
      lineHeight: 24,
      fontWeight: WEIGHT_HEADING,
      letterSpacing: -0.15,
    },
    dateRailDayNumSelected: {
      color: "#FFFFFF",
    },
    dateRailDayNumToday: {
      color: ACCENT,
    },
    dateRailDayNumWeekend: {
      color: withAlpha(text, ALPHA_3),
    },
    dateRailDow: {
      color: isDark ? "rgba(255,255,255,0.8)" : "#64748B",
      fontSize: 10,
      lineHeight: 12,
      fontWeight: WEIGHT_BODY,
      letterSpacing: 0.35,
      textTransform: "uppercase",
    },
    dateRailDowSelected: {
      color: "#FFFFFF",
    },
    dateRailDowWeekend: {
      color: withAlpha(text, ALPHA_3),
    },
    dateRailEventIndicator: {
      position: "absolute",
      bottom: 6,
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: isDark
        ? withAlpha("#FFFFFF", ALPHA_2)
        : withAlpha("#000000", 0.5),
    },
    dateRailEventIndicatorSpacer: {
      display: "none",
    },
    dateTasksSurface: {
      position: "relative",
      borderRadius: heroCardRadius,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: heroCardBorder,
      backgroundColor: "transparent",
      overflow: "hidden",
    },
    dateTasksSurfaceHeightFrame: {
      overflow: "hidden",
    },
    dateTasksSurfaceHeightFrameCollapsed: {
      overflow: "visible",
    },
    dateTasksSurfaceHeightFrameDragActive: {
      overflow: "visible",
    },
    upcomingTasksSurface: {
      marginTop: CONTENT_STACK_GAP,
      position: "relative",
      borderRadius: heroCardRadius,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: heroCardBorder,
      backgroundColor: "transparent",
      overflow: "hidden",
    },
    upcomingTasksSurfaceCollapsed: {
      marginTop: 4,
    },
    segmentSurfaceCollapsed: {
      borderWidth: 0,
      borderColor: "transparent",
      overflow: "visible",
    },
    segmentSurfaceDragActive: {
      overflow: "visible",
      zIndex: 200,
      elevation: 24,
    },
    segmentSurfaceDragInactive: {
      zIndex: 10,
    },
    segmentSurfaceDropHover: {
      borderWidth: 2,
      borderColor: ACCENT,
      backgroundColor: isDark
        ? "rgba(244, 81, 44, 0.08)"
        : "rgba(244, 81, 44, 0.05)",
    },
    taskListInset: {
      paddingHorizontal: TASK_ROW_SIDE_BLEED,
      paddingTop: 0,
      paddingBottom: 0,
      overflow: "visible",
    },
    taskListInsetNoContent: {
      paddingTop: 0,
      paddingBottom: 0,
    },
    taskContentSolid: {
      marginHorizontal: 4,
      marginTop: 0,
      marginBottom: 0,
      borderRadius: 18,
      backgroundColor: insetSurface,
      overflow: "hidden",
      paddingHorizontal: 0,
      paddingVertical: 8,
    },
    todayTaskContentTransparent: {
      backgroundColor: "transparent",
    },
    dateListTransitionHost: {
      position: "relative",
      overflow: "hidden",
    },
    dateListTransitionHostDragActive: {
      overflow: "visible",
    },
    dateListTransitionTrack: {
      flexDirection: "row",
      alignItems: "flex-start",
    },
    dateListTransitionPage: {
      flexShrink: 0,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 12,
      marginBottom: 6,
      paddingHorizontal: SECTION_SIDE_INSET,
    },
    sectionHeaderCollapsed: {
      marginTop: 4,
      marginBottom: 2,
    },
    sectionHeaderButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      width: "100%",
      paddingVertical: 6,
      paddingHorizontal: TASK_ROW_HORIZONTAL_PADDING,
    },
    sectionHeaderButtonCollapsed: {
      paddingVertical: 4,
    },
    sectionTitle: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: WEIGHT_HEADING,
      letterSpacing: 0.8,
      textTransform: "uppercase" as const,
      color: text,
      opacity: ALPHA_3,
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
    sectionCountBadgeText: {
      fontSize: 12,
      lineHeight: 14,
      fontWeight: WEIGHT_HEADING,
      color: withAlpha(text, isDark ? 0.84 : 0.66),
      textAlign: "center",
    },
    itemSpacer: {
      marginBottom: 0,
    },
    swipeClip: {
      borderRadius: 12,
      overflow: "hidden",
      backgroundColor: "transparent",
      marginHorizontal: 0,
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
      borderRadius: 12,
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
      textTransform: "uppercase" as const,
      color: isDark ? withAlpha(text, 0.7) : withAlpha(text, 0.5),
      maxWidth: 220,
    },
    emptyState: {
      paddingVertical: 28,
      alignItems: "center",
      justifyContent: "center",
    },
    upcomingEmptyDropZone: {
      minHeight: 86,
      justifyContent: "center",
    },
    emptyText: {
      fontSize: 14,
      lineHeight: 18,
      fontWeight: WEIGHT_BODY,
      color: withAlpha(text, ALPHA_3),
    },
    archivePillFooter: {
      paddingTop: 16,
      paddingBottom: 24,
      alignItems: "center",
    },
    archivePillFooterCollapsed: {
      paddingTop: 4,
    },
    archivePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: RADIUS_PILL,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hairline,
    },
    archivePillText: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: WEIGHT_BODY,
      color: text,
      opacity: ALPHA_2,
    },
    minimizeProbeWrap: {
      marginTop: 0,
    },
    minimizeProbeRow: {
      height: 70,
      opacity: 0,
    },
    calendarPickerContainer: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    },
    calendarPickerOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.4)",
    },
    calendarPickerContent: {
      width: CALENDAR_POPOVER_WIDTH,
      height: CALENDAR_POPOVER_HEIGHT,
      borderRadius: RADIUS_CARD,
      overflow: "hidden",
    },
    calendarPickerButton: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: RADIUS_PILL,
      backgroundColor: withAlpha(text, 0.1),
    },
    calendarPickerButtonText: {
      fontSize: 14,
      fontWeight: WEIGHT_BODY,
      color: text,
    },
  });
};

export default function HomeScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const theme = useColorScheme() ?? "light";
  const isDark = theme === "dark";
  const useAppleLightPalette = !isDark && Platform.OS === "ios";
  const { width: viewportWidth } = useWindowDimensions();

  const [isCalendarPickerOpen, setIsCalendarPickerOpen] = React.useState(false);
  const [calendarPickerDate, setCalendarPickerDate] = React.useState(() => {
    const d = new Date();
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  });

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
  const dateRailItemWidth = React.useMemo(() => {
    // The date rail lives inside a container with marginHorizontal: 10 from the surface,
    // the surface itself has GRID_HORIZONTAL_PADDING from screen edges.
    const railContainerMargin = 10; // matches taskContentSolid marginHorizontal
    const availableWidth = Math.max(
      0,
      viewportWidth - GRID_HORIZONTAL_PADDING * 2 - railContainerMargin * 2,
    );
    return Math.max(
      DATE_RAIL_MIN_ITEM_WIDTH,
      Math.floor((availableWidth - DATE_RAIL_ITEM_GAP * 6) / 7),
    );
  }, [viewportWidth]);
  const styles = React.useMemo(
    () => createStyles(theme, dateRailItemWidth),
    [dateRailItemWidth, theme],
  );
  const { tasks, setTasks, projects } = useTasksStore();
  const { queueTaskPopIn } = useTaskCreateContext();
  const { enabledTags, showTagIcons, showCompactSubtasks } = useHomeFilters();
  const locale = React.useMemo(() => getIntlLocale().toLowerCase(), []);
  const isGermanLocale = locale.startsWith("de");
  const withSubtasksEnabled =
    params.withSubtasks === undefined
      ? showCompactSubtasks
      : params.withSubtasks === "1";
  const [showGestureHint, setShowGestureHint] = React.useState(false);
  const [
    shouldHighlightDropTargetsOnFirstDrag,
    setShouldHighlightDropTargetsOnFirstDrag,
  ] = React.useState(false);
  const [showDragDropTargetsHint, setShowDragDropTargetsHint] =
    React.useState(false);
  const gesturesHintSeenRef = React.useRef(true);
  const dragDropTargetsHintSeenRef = React.useRef(true);
  const gestureHintCopy = React.useMemo(
    () =>
      isGermanLocale
        ? {
          title: "Gesten-Tipp",
          body: "Wische horizontal über die Liste für den Tagwechsel. Halte eine Aufgabe zum Verschieben.",
          dismissLabel: "Schließen",
          dragToDate: "Auf Datum ziehen",
          dragToUndated: "Oder in Ohne Datum ablegen",
          monthPickerLabel: "Monat wählen",
        }
        : {
          title: "Gesture tip",
          body: "Swipe horizontally over the list to change day. Long-press a task to drag it.",
          dismissLabel: "Dismiss",
          dragToDate: "Drag to a day",
          dragToUndated: "Or drop into Without date",
          monthPickerLabel: "Pick month",
        },
    [isGermanLocale],
  );
  const markGesturesHintSeen = React.useCallback(() => {
    if (gesturesHintSeenRef.current) return;
    gesturesHintSeenRef.current = true;
    setShowGestureHint(false);
    void markOnboardingSeen(HOME_ONBOARDING_KEYS.gestures);
  }, []);
  const markDragDropTargetsHintSeen = React.useCallback(() => {
    if (dragDropTargetsHintSeenRef.current) return;
    dragDropTargetsHintSeenRef.current = true;
    setShouldHighlightDropTargetsOnFirstDrag(false);
    void markOnboardingSeen(HOME_ONBOARDING_KEYS.dragDropTargets);
  }, []);
  React.useEffect(() => {
    let cancelled = false;
    const hydrateHints = async () => {
      const [gesturesSeen, dragTargetsSeen] = await Promise.all([
        readOnboardingSeen(HOME_ONBOARDING_KEYS.gestures),
        readOnboardingSeen(HOME_ONBOARDING_KEYS.dragDropTargets),
      ]);
      if (cancelled) return;
      gesturesHintSeenRef.current = gesturesSeen;
      dragDropTargetsHintSeenRef.current = dragTargetsSeen;
      setShowGestureHint(!gesturesSeen);
      setShouldHighlightDropTargetsOnFirstDrag(!dragTargetsSeen);
    };
    void hydrateHints();
    return () => {
      cancelled = true;
    };
  }, []);
  const { currentStreak } = useStreaks();
  const [selectedDateStart, setSelectedDateStart] = React.useState(() =>
    getStartOfToday(),
  );
  const [listDateStart, setListDateStart] = React.useState(() =>
    getStartOfToday(),
  );
  const dateListTranslateX = React.useRef(new Animated.Value(0)).current;
  const dateListTransitionProgress = React.useRef(
    new Animated.Value(1),
  ).current;
  const dateListTransitionItemRevealProgress = React.useRef(
    new Animated.Value(1),
  ).current;
  const dateListTransitionHeight = React.useRef(new Animated.Value(0)).current;
  const dateRailTitleTransitionProgress = React.useRef(
    new Animated.Value(0),
  ).current;
  const [isDateListTransitioning, setIsDateListTransitioning] =
    React.useState(false);
  const [dateListTransitionState, setDateListTransitionState] =
    React.useState<DateListTransitionState | null>(null);
  const [dateRailTitleTransition, setDateRailTitleTransition] =
    React.useState<DateRailTitleTransitionState | null>(null);
  const dateRailTitleTransitionRef =
    React.useRef<DateRailTitleTransitionState | null>(null);
  const dateRailResolvedTitleRef = React.useRef<string>(t("common.today"));
  const [dateListHostWidth, setDateListHostWidth] =
    React.useState(viewportWidth);
  const dateListHostWidthRef = React.useRef(viewportWidth);
  const dateListHostHeightRef = React.useRef(0);
  const dateListTransitionHeightsRef = React.useRef({ from: 0, to: 0 });
  const dateListTransitionReadyRef = React.useRef({ from: false, to: false });
  const dateListTransitionStartedRef = React.useRef(false);
  const dateListTransitionActiveTargetDateRef = React.useRef<number | null>(
    null,
  );
  const dateListTransitionConfigRef = React.useRef({
    startX: 0,
    endX: 0,
    fromHeight: 1,
    toHeight: 1,
  });
  const dateListTransitionStartHandlerRef = React.useRef<
    ((allowFallback: boolean) => void) | null
  >(null);
  const dateListTransitionStartRafRef = React.useRef<number | null>(null);
  const dateListTransitionStartTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const dateListTransitionSettleRafRef = React.useRef<number | null>(null);
  const dateRailTitleAnimationRef =
    React.useRef<Animated.CompositeAnimation | null>(null);
  const dateListTransitionProgressAnimationRef =
    React.useRef<Animated.CompositeAnimation | null>(null);
  const listTransitionRunningRef = React.useRef(false);
  const queuedDateStartRef = React.useRef<number | null>(null);
  const queuedDirectionRef = React.useRef<1 | -1>(1);
  const listDateStartRef = React.useRef(listDateStart);
  const selectedDateStartRef = React.useRef(selectedDateStart);
  const lastDateSelectionRequestRef = React.useRef<{
    dateStart: number;
    source: DateSelectionSource;
    at: number;
  } | null>(null);
  React.useEffect(() => {
    listDateStartRef.current = listDateStart;
  }, [listDateStart]);
  React.useEffect(() => {
    selectedDateStartRef.current = selectedDateStart;
  }, [selectedDateStart]);
  React.useEffect(() => {
    dateListHostWidthRef.current = viewportWidth;
    setDateListHostWidth((current) =>
      Math.abs(current - viewportWidth) < 1 ? current : viewportWidth,
    );
  }, [viewportWidth]);
  const dayLabelFormatter = React.useMemo(
    () => new Intl.DateTimeFormat(undefined, { weekday: "narrow" }),
    [],
  );
  const monthActionFormatter = React.useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }),
    [],
  );
  const todayStart = getStartOfToday();
  const currentWeekStart = React.useMemo(
    () => getStartOfWeekMonday(todayStart),
    [todayStart],
  );
  const minimizeProbeRows = React.useMemo(
    () => Array.from({ length: 6 }, (_, index) => index),
    [],
  );
  const [dragHoveredDateStart, setDragHoveredDateStart] = React.useState<
    number | null
  >(null);
  const [activeDragSurface, setActiveDragSurface] =
    React.useState<DragSurfaceId | null>(null);
  const showDropTargetGuides =
    showDragDropTargetsHint && activeDragSurface !== null;
  const dragContextRef = React.useRef<{
    taskId: string;
    sourceSection: SectionId;
    sourceHasDueAt: boolean;
  } | null>(null);
  const dragHoverDateStartRef = React.useRef<number | null>(null);
  const dragLastRailDateStartRef = React.useRef<number | null>(null);
  const dragStartPointRef = React.useRef<{
    absoluteX: number;
    absoluteY: number;
  } | null>(null);
  const dragRailHoverIntentRef = React.useRef<{
    dateStart: number | null;
    enteredAt: number;
  }>({
    dateStart: null,
    enteredAt: 0,
  });
  const upcomingExpandTimerRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const dragSurfaceResetFrameRef = React.useRef<number | null>(null);
  const dropCommitFrameRef = React.useRef<number | null>(null);
  const upcomingSurfaceRef = React.useRef<View | null>(null);
  const upcomingSurfaceBoundsRef = React.useRef<DragBounds | null>(null);
  const todaySurfaceRef = React.useRef<View | null>(null);
  const todaySurfaceBoundsRef = React.useRef<DragBounds | null>(null);
  const [isHoveringUpcomingDropZone, setIsHoveringUpcomingDropZone] =
    React.useState(false);
  const [isHoveringTodayDropZone, setIsHoveringTodayDropZone] =
    React.useState(false);
  const dragLastTouchPointRef = React.useRef<{
    absoluteX: number;
    absoluteY: number;
  } | null>(null);

  const completionPercentage = React.useMemo(() => {
    let todayTotal = 0;
    let todayCompleted = 0;
    const todayStartMs = getStartOfToday();

    for (const task of tasks) {
      if (task.deletedAt) continue;

      const isDueToday =
        hasValidDueAt(task.dueAt) && isSameLocalDay(task.dueAt, todayStartMs);
      const isCompletedToday =
        task.completedAt && isSameLocalDay(task.completedAt, todayStartMs);

      if (isDueToday || isCompletedToday) {
        todayTotal++;
        if (task.completedAt) {
          todayCompleted++;
        }
      }
    }

    if (todayTotal === 0) return 0;
    return Math.round((todayCompleted / todayTotal) * 100);
  }, [tasks]);

  const homeMetricsProps = React.useMemo<HomeMetricsProps>(() => {
    return {
      completionPercentage,
      currentStreak,
      onPress: () => router.push("/home/streaks"),
    };
  }, [completionPercentage, currentStreak, router]);

  const glassSurfacePalette = React.useMemo(() => {
    if (isDark) {
      return {
        chipTint: withAlpha(Colors[theme].background, 0.18),
        chipFallback: withAlpha(Colors[theme].background, 0.86),
        calendarTint: withAlpha(Colors[theme].background, 0.3),
        calendarFallback: withAlpha(Colors[theme].background, 0.86),
        popoverTint: withAlpha(Colors[theme].background, 0.22),
        popoverFallback: withAlpha(Colors[theme].background, 0.88),
      };
    }

    if (useAppleLightPalette) {
      return {
        chipTint: IOS_LIGHT_TINT_FILL,
        chipFallback: IOS_LIGHT_INSET_SURFACE,
        calendarTint: "rgba(118, 118, 128, 0.24)",
        calendarFallback: IOS_LIGHT_INSET_SURFACE,
        popoverTint: "rgba(118, 118, 128, 0.22)",
        popoverFallback: IOS_LIGHT_ELEVATED_SURFACE,
      };
    }

    return {
      chipTint: withAlpha(Colors[theme].background, 0.28),
      chipFallback: withAlpha(Colors[theme].background, 0.92),
      calendarTint: withAlpha(Colors[theme].background, 0.4),
      calendarFallback: withAlpha(Colors[theme].background, 0.92),
      popoverTint: withAlpha(Colors[theme].background, 0.32),
      popoverFallback: withAlpha(Colors[theme].background, 0.94),
    };
  }, [isDark, theme, useAppleLightPalette]);

  const homeMetricsTheme = React.useMemo<HomeMetricsTheme>(() => {
    return {
      topSurface: useAppleLightPalette
        ? IOS_LIGHT_BASE_BACKGROUND
        : Colors[theme].background,
      cardBackgroundColor: isDark ? "#1C1C1E" : IOS_LIGHT_ELEVATED_SURFACE,
      borderColor: isDark
        ? "rgba(255,255,255,0.14)"
        : useAppleLightPalette
          ? IOS_LIGHT_SEPARATOR
          : "rgba(0,0,0,0.12)",
      primaryText: isDark ? "#FFFFFF" : "#000000",
      mutedText: isDark
        ? "#94A3B8"
        : useAppleLightPalette
          ? "#8E8E93"
          : "#94A3B8",
    };
  }, [isDark, theme, useAppleLightPalette]);

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
      const normalizedSection: SectionId =
        task.section === "completed"
          ? "completed"
          : deriveActiveSectionFromDueAt(task.dueAt);
      if (!homeEnabledSections.includes(normalizedSection)) continue;
      if (withNotesEnabled && !task.subtitle) continue;
      if (!hasValidDueAt(task.dueAt)) continue;

      const dayStart = getStartOfDay(task.dueAt);
      counts.set(dayStart, (counts.get(dayStart) ?? 0) + 1);
    }
    return counts;
  }, [homeEnabledSections, tasks, withNotesEnabled]);

  const weekdayTitleFormatter = React.useMemo(
    () => new Intl.DateTimeFormat(undefined, { weekday: "long" }),
    [],
  );
  const dateTitleFormatter = React.useMemo(
    () => new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long" }),
    [],
  );
  const getDynamicHeaderTitle = React.useCallback(
    (targetDateStart: number) => {
      if (isSameLocalDay(targetDateStart, todayStart)) {
        return t("common.today");
      }

      const currentWeekEnd = addDays(currentWeekStart, 6);
      const isCurrentWeek =
        targetDateStart >= currentWeekStart &&
        targetDateStart <= currentWeekEnd;

      if (isCurrentWeek) {
        const weekday = weekdayTitleFormatter.format(targetDateStart);
        return weekday.charAt(0).toUpperCase() + weekday.slice(1);
      }
      return dateTitleFormatter.format(targetDateStart);
    },
    [currentWeekStart, dateTitleFormatter, todayStart, weekdayTitleFormatter],
  );
  const dynamicHeaderTitle = React.useMemo(
    () => getDynamicHeaderTitle(selectedDateStart),
    [getDynamicHeaderTitle, selectedDateStart],
  );
  React.useEffect(() => {
    if (dateRailTitleTransition) return;
    dateRailResolvedTitleRef.current = dynamicHeaderTitle;
  }, [dateRailTitleTransition, dynamicHeaderTitle]);
  React.useEffect(() => {
    dateRailTitleTransitionRef.current = dateRailTitleTransition;
  }, [dateRailTitleTransition]);
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: t("tabs.tasks") });
  }, [navigation]);
  const activeDateSelectionStart = dragHoveredDateStart ?? selectedDateStart;

  const dateRailInitialIndex = DATE_RAIL_PAST_DAYS;
  const dateRailSnapInterval = React.useMemo(
    () => dateRailItemWidth + DATE_RAIL_ITEM_GAP,
    [dateRailItemWidth],
  );
  const dateRailPageInterval = React.useMemo(
    () => dateRailSnapInterval * DATE_RAIL_PAGE_DAYS,
    [dateRailSnapInterval],
  );
  const dateRailRangeStart = React.useMemo(
    () => addDays(currentWeekStart, -DATE_RAIL_PAST_DAYS),
    [currentWeekStart],
  );
  const dateRailDays = React.useMemo<DateRailDay[]>(() => {
    return Array.from(
      { length: DATE_RAIL_PAST_DAYS + DATE_RAIL_FUTURE_DAYS + 1 },
      (_, index) => {
        const timestamp = addDays(dateRailRangeStart, index);
        const eventCount = dayEventCountByStart.get(timestamp) ?? 0;
        return {
          key: `d-${timestamp}`,
          timestamp,
          dayOfMonth: String(new Date(timestamp).getDate()),
          weekday: dayLabelFormatter
            .format(timestamp)
            .replace(".", "")
            .toUpperCase(),
          isSelected: isSameLocalDay(timestamp, activeDateSelectionStart),
          isToday: isSameLocalDay(timestamp, todayStart),
          isWeekend:
            new Date(timestamp).getDay() === 0 ||
            new Date(timestamp).getDay() === 6,
          eventCount,
        };
      },
    );
  }, [
    activeDateSelectionStart,
    dateRailRangeStart,
    dayEventCountByStart,
    dayLabelFormatter,
    todayStart,
  ]);
  const dateRailMonthOptions = React.useMemo<DateRailMonthOption[]>(() => {
    const firstDay = dateRailDays[0]?.timestamp;
    const lastDay = dateRailDays[dateRailDays.length - 1]?.timestamp;
    if (!firstDay || !lastDay) return [];

    const options: DateRailMonthOption[] = [];
    const cursor = new Date(firstDay);
    cursor.setDate(1);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(lastDay);
    end.setDate(1);
    end.setHours(0, 0, 0, 0);

    while (cursor.getTime() <= end.getTime()) {
      const monthStart = cursor.getTime();
      options.push({
        key: `m-${monthStart}`,
        monthStart,
        title: monthActionFormatter.format(monthStart),
      });
      cursor.setMonth(cursor.getMonth() + 1);
      cursor.setDate(1);
      cursor.setHours(0, 0, 0, 0);
    }
    return options;
  }, [dateRailDays, monthActionFormatter]);
  const monthPickerActions = React.useMemo<MenuAction[]>(
    () =>
      dateRailMonthOptions.map((option) => ({
        id: option.key,
        title: option.title,
        state:
          Platform.OS === "ios" &&
            isSameLocalMonth(option.monthStart, selectedDateStart)
            ? "on"
            : undefined,
      })),
    [dateRailMonthOptions, selectedDateStart],
  );
  const monthPickerButtonLabel = React.useMemo(
    () => monthActionFormatter.format(selectedDateStart),
    [monthActionFormatter, selectedDateStart],
  );
  const cancelDateListTransitionStart = React.useCallback(() => {
    if (dateListTransitionStartRafRef.current != null) {
      cancelAnimationFrame(dateListTransitionStartRafRef.current);
      dateListTransitionStartRafRef.current = null;
    }
    if (dateListTransitionStartTimeoutRef.current != null) {
      clearTimeout(dateListTransitionStartTimeoutRef.current);
      dateListTransitionStartTimeoutRef.current = null;
    }
  }, []);
  const cancelDateListTransitionSettle = React.useCallback(() => {
    if (dateListTransitionSettleRafRef.current == null) return;
    cancelAnimationFrame(dateListTransitionSettleRafRef.current);
    dateListTransitionSettleRafRef.current = null;
  }, []);
  const stopDateRailTitleAnimation = React.useCallback(() => {
    const runningAnimation = dateRailTitleAnimationRef.current;
    if (!runningAnimation) return;
    runningAnimation.stop();
    dateRailTitleAnimationRef.current = null;
  }, []);
  const resetDateRailTitleMotion = React.useCallback(() => {
    stopDateRailTitleAnimation();
    dateRailTitleTransitionRef.current = null;
    dateRailTitleTransitionProgress.setValue(0);
    setDateRailTitleTransition(null);
  }, [
    dateRailTitleTransitionProgress,
    dateRailTitleTransitionRef,
    stopDateRailTitleAnimation,
  ]);
  const animateDateRailTitleTransition = React.useCallback(
    (fromDateStart: number, toDateStart: number) => {
      const toTitle = getDynamicHeaderTitle(toDateStart);
      const activeTransition = dateRailTitleTransitionRef.current;
      const fromTitle =
        activeTransition?.toTitle ??
        dateRailResolvedTitleRef.current ??
        getDynamicHeaderTitle(fromDateStart);

      if (activeTransition && activeTransition.toTitle === toTitle) {
        return;
      }

      if (fromTitle === toTitle) {
        dateRailResolvedTitleRef.current = toTitle;
        resetDateRailTitleMotion();
        return;
      }

      stopDateRailTitleAnimation();
      const direction: 1 | -1 = toDateStart >= fromDateStart ? 1 : -1;
      const nextTransition = { fromTitle, toTitle, direction } as const;
      dateRailTitleTransitionRef.current = nextTransition;
      setDateRailTitleTransition(nextTransition);
      dateRailTitleTransitionProgress.setValue(0);
      const animation = Animated.timing(dateRailTitleTransitionProgress, {
        toValue: 1,
        duration: DATE_TRANSITION_DURATION,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      });
      dateRailTitleAnimationRef.current = animation;
      animation.start(({ finished }) => {
        if (dateRailTitleAnimationRef.current !== animation) return;
        dateRailTitleAnimationRef.current = null;
        if (!finished) return;
        dateRailResolvedTitleRef.current = toTitle;
        dateRailTitleTransitionRef.current = null;
        dateRailTitleTransitionProgress.setValue(0);
        setDateRailTitleTransition(null);
      });
    },
    [
      dateRailResolvedTitleRef,
      dateRailTitleTransitionProgress,
      dateRailTitleTransitionRef,
      getDynamicHeaderTitle,
      resetDateRailTitleMotion,
      stopDateRailTitleAnimation,
    ],
  );
  const resetDateListMotion = React.useCallback(() => {
    dateListTranslateX.stopAnimation();
    dateListTranslateX.setValue(0);
  }, [dateListTranslateX]);
  const stopDateListTransitionProgressAnimation = React.useCallback(() => {
    const runningAnimation = dateListTransitionProgressAnimationRef.current;
    if (!runningAnimation) return;
    runningAnimation.stop();
    dateListTransitionProgressAnimationRef.current = null;
  }, []);
  const applyDateListTransitionProgress = React.useCallback(
    (rawValue: number) => {
      const value = clamp(rawValue, 0, 1);
      const { startX, endX, fromHeight, toHeight } =
        dateListTransitionConfigRef.current;

      dateListTranslateX.setValue(startX + (endX - startX) * value);
      dateListTransitionHeight.setValue(
        Math.max(1, fromHeight + (toHeight - fromHeight) * value),
      );

      const revealStart = 0.14;
      const revealEnd = 0.98;
      const revealLinear =
        value <= revealStart
          ? 0
          : value >= revealEnd
            ? 1
            : (value - revealStart) / (revealEnd - revealStart);

      dateListTransitionItemRevealProgress.setValue(clamp(revealLinear, 0, 1));
    },
    [
      dateListTranslateX,
      dateListTransitionHeight,
      dateListTransitionItemRevealProgress,
    ],
  );
  React.useEffect(() => {
    const listenerId = dateListTransitionProgress.addListener(({ value }) => {
      applyDateListTransitionProgress(value);
    });
    return () => {
      dateListTransitionProgress.removeListener(listenerId);
    };
  }, [applyDateListTransitionProgress, dateListTransitionProgress]);
  const resetDateListTransitionMotion = React.useCallback(() => {
    cancelDateListTransitionStart();
    cancelDateListTransitionSettle();
    stopDateListTransitionProgressAnimation();
    dateListTransitionProgress.setValue(1);
    dateListTransitionReadyRef.current = { from: false, to: false };
    dateListTransitionStartedRef.current = false;
    dateListTransitionActiveTargetDateRef.current = null;
    dateListTransitionStartHandlerRef.current = null;
    const stableHeight = Math.max(1, dateListHostHeightRef.current || 1);
    dateListTransitionConfigRef.current = {
      startX: 0,
      endX: 0,
      fromHeight: stableHeight,
      toHeight: stableHeight,
    };
    applyDateListTransitionProgress(1);
  }, [
    applyDateListTransitionProgress,
    cancelDateListTransitionStart,
    cancelDateListTransitionSettle,
    dateListTransitionProgress,
    stopDateListTransitionProgressAnimation,
  ]);
  const handleDateListHostLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      const nextWidth = event.nativeEvent.layout.width;
      if (!Number.isFinite(nextWidth) || nextWidth <= 0) return;
      dateListHostWidthRef.current = nextWidth;
      setDateListHostWidth((current) =>
        Math.abs(current - nextWidth) < 1 ? current : nextWidth,
      );

      const nextHeight = Math.max(
        0,
        Math.ceil(event.nativeEvent.layout.height),
      );
      if (nextHeight <= 0) return;
      dateListHostHeightRef.current = nextHeight;
      if (!listTransitionRunningRef.current) {
        dateListTransitionConfigRef.current = {
          startX: 0,
          endX: 0,
          fromHeight: nextHeight,
          toHeight: nextHeight,
        };
        applyDateListTransitionProgress(1);
      }
    },
    [applyDateListTransitionProgress],
  );
  const handleDateListTransitionPageLayout = React.useCallback(
    (kind: "from" | "to", event: LayoutChangeEvent) => {
      if (!listTransitionRunningRef.current || !dateListTransitionState) return;

      const nextHeight = Math.max(
        0,
        Math.ceil(event.nativeEvent.layout.height),
      );
      if (nextHeight <= 0) return;

      const previousHeight = dateListTransitionHeightsRef.current[kind];
      dateListTransitionReadyRef.current[kind] = true;
      if (Math.abs(previousHeight - nextHeight) < 1) {
        dateListTransitionStartHandlerRef.current?.(false);
        return;
      }

      dateListTransitionHeightsRef.current[kind] = nextHeight;

      if (!dateListTransitionStartedRef.current) {
        if (kind === "from") {
          dateListTransitionConfigRef.current = {
            ...dateListTransitionConfigRef.current,
            fromHeight: nextHeight,
          };
          applyDateListTransitionProgress(0);
        } else {
          dateListTransitionConfigRef.current = {
            ...dateListTransitionConfigRef.current,
            toHeight: nextHeight,
          };
        }
      }

      dateListTransitionStartHandlerRef.current?.(false);
    },
    [applyDateListTransitionProgress, dateListTransitionState],
  );
  const handleDateListFromPageLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      handleDateListTransitionPageLayout("from", event);
    },
    [handleDateListTransitionPageLayout],
  );
  const handleDateListToPageLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      handleDateListTransitionPageLayout("to", event);
    },
    [handleDateListTransitionPageLayout],
  );

  const runDateListTransition = React.useCallback(
    (nextDateStart: number, direction: 1 | -1) => {
      if (nextDateStart === listDateStartRef.current) return;

      queuedDateStartRef.current = nextDateStart;
      queuedDirectionRef.current = direction;

      if (listTransitionRunningRef.current) return;

      const runCycle = () => {
        cancelDateListTransitionSettle();
        const targetDate = queuedDateStartRef.current;
        if (targetDate == null) {
          cancelDateListTransitionStart();
          listTransitionRunningRef.current = false;
          setIsDateListTransitioning(false);
          setDateListTransitionState(null);
          resetDateListMotion();
          resetDateRailTitleMotion();
          resetDateListTransitionMotion();
          return;
        }

        const fromDateStart = listDateStartRef.current;
        if (targetDate === fromDateStart) {
          cancelDateListTransitionStart();
          queuedDateStartRef.current = null;
          listTransitionRunningRef.current = false;
          setIsDateListTransitioning(false);
          setDateListTransitionState(null);
          resetDateListMotion();
          resetDateRailTitleMotion();
          resetDateListTransitionMotion();
          return;
        }

        queuedDateStartRef.current = null;
        listTransitionRunningRef.current = true;
        setIsDateListTransitioning(true);
        const dir = queuedDirectionRef.current;
        const travel = Math.max(1, dateListHostWidthRef.current);
        const startX = dir === 1 ? 0 : -travel;
        const endX = dir === 1 ? -travel : 0;
        const fallbackHeight = Math.max(
          1,
          dateListHostHeightRef.current ||
          dateListTransitionConfigRef.current.toHeight,
        );
        dateListTransitionActiveTargetDateRef.current = targetDate;
        dateListTransitionStartedRef.current = false;
        dateListTransitionReadyRef.current = { from: false, to: false };
        dateListTransitionHeightsRef.current = { from: 0, to: 0 };
        dateListTransitionConfigRef.current = {
          startX,
          endX,
          fromHeight: fallbackHeight,
          toHeight: fallbackHeight,
        };
        dateListTransitionProgress.setValue(0);
        applyDateListTransitionProgress(0);
        setDateListTransitionState({
          fromDateStart,
          toDateStart: targetDate,
          direction: dir,
        });

        const startTransitionMotion = (allowFallback: boolean) => {
          if (!listTransitionRunningRef.current) return;
          if (dateListTransitionStartedRef.current) return;
          if (dateListTransitionActiveTargetDateRef.current !== targetDate)
            return;

          const hasFrom = dateListTransitionReadyRef.current.from;
          const hasTo = dateListTransitionReadyRef.current.to;
          if (!(hasFrom && hasTo) && !allowFallback) return;

          const measuredFrom = hasFrom
            ? Math.max(1, dateListTransitionHeightsRef.current.from)
            : fallbackHeight;
          const measuredTo = hasTo
            ? Math.max(1, dateListTransitionHeightsRef.current.to)
            : Math.max(1, dateListHostHeightRef.current || measuredFrom);

          cancelDateListTransitionStart();
          dateListTransitionConfigRef.current = {
            startX,
            endX,
            fromHeight: measuredFrom,
            toHeight: measuredTo,
          };
          applyDateListTransitionProgress(0);
          dateListTransitionStartedRef.current = true;

          stopDateListTransitionProgressAnimation();
          const animation = Animated.timing(dateListTransitionProgress, {
            toValue: 1,
            duration: DATE_TRANSITION_DURATION + 90,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: false,
          });
          dateListTransitionProgressAnimationRef.current = animation;
          animation.start(({ finished }) => {
            if (dateListTransitionProgressAnimationRef.current === animation) {
              dateListTransitionProgressAnimationRef.current = null;
            }
            if (!finished) return;
            if (dateListTransitionActiveTargetDateRef.current !== targetDate)
              return;

            setListDateStart(targetDate);
            listDateStartRef.current = targetDate;
            dateListHostHeightRef.current = Math.max(
              1,
              dateListTransitionConfigRef.current.toHeight,
            );
            applyDateListTransitionProgress(1);

            if (
              queuedDateStartRef.current !== null &&
              queuedDateStartRef.current !== targetDate
            ) {
              cancelDateListTransitionSettle();
              listTransitionRunningRef.current = false;
              setIsDateListTransitioning(false);
              setDateListTransitionState(null);
              resetDateListTransitionMotion();
              runCycle();
              return;
            }

            listTransitionRunningRef.current = false;
            setDateListTransitionState(null);
            cancelDateListTransitionSettle();
            dateListTransitionSettleRafRef.current = requestAnimationFrame(
              () => {
                dateListTransitionSettleRafRef.current = requestAnimationFrame(
                  () => {
                    dateListTransitionSettleRafRef.current = null;
                    setIsDateListTransitioning(false);
                    resetDateListTransitionMotion();
                  },
                );
              },
            );
          });
        };
        dateListTransitionStartHandlerRef.current = startTransitionMotion;

        cancelDateListTransitionStart();
        dateListTransitionStartRafRef.current = requestAnimationFrame(() => {
          dateListTransitionStartRafRef.current = null;
          dateListTransitionStartHandlerRef.current?.(false);
        });
        dateListTransitionStartTimeoutRef.current = setTimeout(() => {
          dateListTransitionStartTimeoutRef.current = null;
          dateListTransitionStartHandlerRef.current?.(true);
        }, DATE_TRANSITION_FALLBACK_DELAY_MS);
      };

      runCycle();
    },
    [
      applyDateListTransitionProgress,
      cancelDateListTransitionSettle,
      cancelDateListTransitionStart,
      dateListTransitionProgress,
      resetDateListMotion,
      resetDateListTransitionMotion,
      resetDateRailTitleMotion,
      stopDateListTransitionProgressAnimation,
    ],
  );
  const setListDateWithoutTransition = React.useCallback(
    (
      nextDateStart: number,
      animateLayout = true,
      preserveTitleMotion = false,
    ) => {
      if (nextDateStart === listDateStartRef.current) return;
      cancelDateListTransitionStart();
      queuedDateStartRef.current = null;
      listTransitionRunningRef.current = false;
      setIsDateListTransitioning(false);
      setDateListTransitionState(null);
      resetDateListMotion();
      if (!preserveTitleMotion) {
        resetDateRailTitleMotion();
      }
      resetDateListTransitionMotion();
      if (animateLayout) {
        configureSmoothListLayoutTransition();
      }
      setListDateStart(nextDateStart);
      listDateStartRef.current = nextDateStart;
    },
    [
      cancelDateListTransitionStart,
      resetDateListMotion,
      resetDateListTransitionMotion,
      resetDateRailTitleMotion,
    ],
  );
  const hasTodayTasksForDateStart = React.useCallback(
    (targetDateStart: number) => {
      for (const task of tasks) {
        if (task.deletedAt) continue;
        const normalizedSection: SectionId =
          task.section === "completed"
            ? "completed"
            : deriveActiveSectionFromDueAt(task.dueAt);
        if (!homeEnabledSections.includes(normalizedSection)) continue;
        if (normalizedSection === "completed") continue;
        if (withNotesEnabled && !task.subtitle) continue;
        if (!hasValidDueAt(task.dueAt)) continue;
        if (isSameLocalDay(task.dueAt, targetDateStart)) {
          return true;
        }
      }
      return false;
    },
    [homeEnabledSections, tasks, withNotesEnabled],
  );
  const selectDateWithTransition = React.useCallback(
    (
      nextDateStart: number,
      directionHint?: 1 | -1,
      source: DateSelectionSource = "programmatic",
    ) => {
      const current = selectedDateStartRef.current;
      if (isSameLocalDay(current, nextDateStart)) return;
      const now = Date.now();
      const lastRequest = lastDateSelectionRequestRef.current;
      if (
        source === "momentum" &&
        (dateRailTitleAnimationRef.current || listTransitionRunningRef.current)
      ) {
        return;
      }
      if (
        source === "momentum" &&
        lastRequest &&
        lastRequest.source !== "momentum" &&
        now - lastRequest.at < DATE_TRANSITION_DURATION + 220 &&
        !isSameLocalDay(lastRequest.dateStart, nextDateStart)
      ) {
        return;
      }
      if (
        source === "momentum" &&
        listTransitionRunningRef.current &&
        isSameLocalDay(nextDateStart, listDateStartRef.current)
      ) {
        return;
      }
      lastDateSelectionRequestRef.current = {
        dateStart: nextDateStart,
        source,
        at: now,
      };
      const fromHasTodayTasks = hasTodayTasksForDateStart(
        listDateStartRef.current,
      );
      const toHasTodayTasks = hasTodayTasksForDateStart(nextDateStart);
      const direction: 1 | -1 =
        directionHint ?? (nextDateStart > current ? 1 : -1);
      animateDateRailTitleTransition(current, nextDateStart);
      selectedDateStartRef.current = nextDateStart;
      setSelectedDateStart(nextDateStart);
      if (!fromHasTodayTasks && !toHasTodayTasks) {
        setListDateWithoutTransition(nextDateStart, false, true);
        void Haptics.selectionAsync().catch(() => undefined);
        return;
      }
      runDateListTransition(nextDateStart, direction);
      void Haptics.selectionAsync().catch(() => undefined);
    },
    [
      animateDateRailTitleTransition,
      hasTodayTasksForDateStart,
      runDateListTransition,
      setListDateWithoutTransition,
    ],
  );
  const selectDateWithoutTransition = React.useCallback(
    (nextDateStart: number) => {
      const current = selectedDateStartRef.current;
      if (isSameLocalDay(current, nextDateStart)) return;
      lastDateSelectionRequestRef.current = {
        dateStart: nextDateStart,
        source: "programmatic",
        at: Date.now(),
      };
      selectedDateStartRef.current = nextDateStart;
      setSelectedDateStart(nextDateStart);
      setListDateWithoutTransition(nextDateStart, false);
    },
    [setListDateWithoutTransition],
  );
  React.useEffect(
    () => () => {
      cancelDateListTransitionStart();
      resetDateListMotion();
      resetDateRailTitleMotion();
      resetDateListTransitionMotion();
      todayCollapseAnimationRef.current?.stop();
      upcomingCollapseAnimationRef.current?.stop();
    },
    [
      cancelDateListTransitionStart,
      resetDateListMotion,
      resetDateRailTitleMotion,
      resetDateListTransitionMotion,
    ],
  );
  const handleSelectDate = React.useCallback(
    (timestamp: number, source: DateSelectionSource = "press") => {
      selectDateWithTransition(timestamp, undefined, source);
    },
    [selectDateWithTransition],
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
  const dateRailWrapRef = React.useRef<View | null>(null);
  const dateRailBoundsRef = React.useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const dateRailScrollOffsetRef = React.useRef(
    dateRailInitialIndex * dateRailSnapInterval,
  );
  const dateRailDraggedRef = React.useRef(false);
  const currentWeekIndexRef = React.useRef(
    Math.floor(dateRailInitialIndex / DATE_RAIL_PAGE_DAYS),
  );
  const dateRailWeekSnapOffsets = React.useMemo(() => {
    const weekCount = Math.ceil(dateRailDays.length / DATE_RAIL_PAGE_DAYS);
    return Array.from(
      { length: weekCount },
      (_, week) => week * dateRailPageInterval,
    );
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
  const measureDateRailBounds = React.useCallback(() => {
    const node =
      // @ts-ignore - some refs expose getNode
      dateRailWrapRef.current?.getNode?.() ?? dateRailWrapRef.current;
    if (!node || typeof node.measureInWindow !== "function") return;
    node.measureInWindow(
      (x: number, y: number, width: number, height: number) => {
        if (
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          !Number.isFinite(width) ||
          !Number.isFinite(height)
        ) {
          return;
        }
        dateRailBoundsRef.current = { x, y, width, height };
      },
    );
  }, []);
  const handleDateRailScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nextOffset = event.nativeEvent.contentOffset.x;
      if (typeof nextOffset !== "number" || !Number.isFinite(nextOffset))
        return;
      dateRailScrollOffsetRef.current = nextOffset;
    },
    [],
  );
  const handleDateRailScrollBeginDrag = React.useCallback(() => {
    dateRailDraggedRef.current = true;
  }, []);

  const handleDateRailMomentumEnd = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const shouldSelectFromMomentum = dateRailDraggedRef.current;
      dateRailDraggedRef.current = false;
      const offset = event.nativeEvent.contentOffset.x;
      dateRailScrollOffsetRef.current = offset;
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
      if (!shouldSelectFromMomentum) {
        currentWeekIndexRef.current = weekIndex;
        return;
      }

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
      selectDateWithTransition(nextDay.timestamp, undefined, "momentum");
    },
    [dateRailDays, dateRailPageInterval, selectDateWithTransition],
  );
  React.useEffect(() => {
    const rafId = requestAnimationFrame(measureDateRailBounds);
    return () => cancelAnimationFrame(rafId);
  }, [measureDateRailBounds, viewportWidth]);

  const [collapsedSections, setCollapsedSections] = React.useState<
    Record<"today" | "upcoming", boolean>
  >({
    today: false,
    upcoming: true,
  });
  const todayCollapseProgress = React.useRef(
    new Animated.Value(collapsedSections.today ? 1 : 0),
  ).current;
  const upcomingCollapseProgress = React.useRef(
    new Animated.Value(collapsedSections.upcoming ? 1 : 0),
  ).current;
  const todaySectionRevealProgress = React.useMemo(
    () =>
      todayCollapseProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0],
      }),
    [todayCollapseProgress],
  );
  const upcomingSectionRevealProgress = React.useMemo(
    () =>
      upcomingCollapseProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0],
      }),
    [upcomingCollapseProgress],
  );
  const upcomingSectionRevealTranslateY = React.useMemo(
    () =>
      upcomingCollapseProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -8],
      }),
    [upcomingCollapseProgress],
  );
  const upcomingSectionRevealScale = React.useMemo(
    () =>
      upcomingCollapseProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0.985],
      }),
    [upcomingCollapseProgress],
  );
  const todayCollapseAnimationRef =
    React.useRef<Animated.CompositeAnimation | null>(null);
  const upcomingCollapseAnimationRef =
    React.useRef<Animated.CompositeAnimation | null>(null);
  const animateCollapseProgress = React.useCallback(
    (
      value: Animated.Value,
      toCollapsed: boolean,
      animationRef: React.MutableRefObject<Animated.CompositeAnimation | null>,
    ) => {
      animationRef.current?.stop();
      const animation = Animated.spring(value, {
        toValue: toCollapsed ? 1 : 0,
        friction: 10,
        tension: 120,
        useNativeDriver: true,
      });
      animationRef.current = animation;
      animation.start(({ finished }) => {
        if (!finished) return;
        if (animationRef.current === animation) {
          animationRef.current = null;
        }
      });
    },
    [],
  );
  React.useEffect(() => {
    if (!collapsedSections.today || !isCalendarPickerOpen) return;
    setIsCalendarPickerOpen(false);
  }, [collapsedSections.today, isCalendarPickerOpen]);
  React.useEffect(() => {
    animateCollapseProgress(
      todayCollapseProgress,
      collapsedSections.today,
      todayCollapseAnimationRef,
    );
  }, [animateCollapseProgress, collapsedSections.today, todayCollapseProgress]);
  React.useEffect(() => {
    animateCollapseProgress(
      upcomingCollapseProgress,
      collapsedSections.upcoming,
      upcomingCollapseAnimationRef,
    );
  }, [
    animateCollapseProgress,
    collapsedSections.upcoming,
    upcomingCollapseProgress,
  ]);

  const scrollRef = React.useRef<any>(null);
  const todayListRef = React.useRef<TaskSwipeDraggableListHandle | null>(null);
  const upcomingListRef = React.useRef<TaskSwipeDraggableListHandle | null>(
    null,
  );
  const listDragActiveRef = React.useRef(false);
  const swipeGestureActiveRef = React.useRef(false);
  const rowTouchActiveRef = React.useRef(false);
  const listTouchStartRef = React.useRef<{
    x: number;
    y: number;
    at: number;
    active: boolean;
    startedOnRow: boolean;
  }>({ x: 0, y: 0, at: 0, active: false, startedOnRow: false });
  const cancelDragSurfaceResetFrame = React.useCallback(() => {
    if (dragSurfaceResetFrameRef.current == null) return;
    cancelAnimationFrame(dragSurfaceResetFrameRef.current);
    dragSurfaceResetFrameRef.current = null;
  }, []);
  const cancelDropCommitFrame = React.useCallback(() => {
    if (dropCommitFrameRef.current == null) return;
    cancelAnimationFrame(dropCommitFrameRef.current);
    dropCommitFrameRef.current = null;
  }, []);
  const queueDropCommit = React.useCallback(
    (commit: () => void) => {
      cancelDropCommitFrame();
      commit();
    },
    [cancelDropCommitFrame],
  );
  const measureUpcomingSurfaceBounds = React.useCallback(() => {
    const node =
      // @ts-ignore - some refs expose getNode
      upcomingSurfaceRef.current?.getNode?.() ?? upcomingSurfaceRef.current;
    if (!node || typeof node.measureInWindow !== "function") return;
    node.measureInWindow(
      (x: number, y: number, width: number, height: number) => {
        if (
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          !Number.isFinite(width) ||
          !Number.isFinite(height)
        ) {
          return;
        }
        upcomingSurfaceBoundsRef.current = { x, y, width, height };
      },
    );
  }, []);

  const measureTodaySurfaceBounds = React.useCallback(() => {
    const node =
      // @ts-ignore - some refs expose getNode
      todaySurfaceRef.current?.getNode?.() ?? todaySurfaceRef.current;
    if (!node || typeof node.measureInWindow !== "function") return;
    node.measureInWindow(
      (x: number, y: number, width: number, height: number) => {
        if (
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          !Number.isFinite(width) ||
          !Number.isFinite(height)
        ) {
          return;
        }
        todaySurfaceBoundsRef.current = { x, y, width, height };
      },
    );
  }, []);
  React.useEffect(
    () => () => {
      cancelDragSurfaceResetFrame();
      cancelDropCommitFrame();
    },
    [cancelDragSurfaceResetFrame, cancelDropCommitFrame],
  );
  const clearUpcomingExpandTimer = React.useCallback(() => {
    if (upcomingExpandTimerRef.current == null) return;
    clearTimeout(upcomingExpandTimerRef.current);
    upcomingExpandTimerRef.current = null;
  }, []);
  const clearDateDragHover = React.useCallback(() => {
    dragRailHoverIntentRef.current = { dateStart: null, enteredAt: 0 };
    dragHoverDateStartRef.current = null;
    setDragHoveredDateStart((current) => (current == null ? current : null));
  }, []);

  const closeAnyOpen = React.useCallback(() => {
    todayListRef.current?.closeAnyOpen();
    upcomingListRef.current?.closeAnyOpen();
  }, []);
  const scheduleUpcomingExpandOnHover = React.useCallback(() => {
    if (!collapsedSections.upcoming) {
      clearUpcomingExpandTimer();
      return;
    }
    if (upcomingExpandTimerRef.current != null) return;
    upcomingExpandTimerRef.current = setTimeout(() => {
      upcomingExpandTimerRef.current = null;
      setCollapsedSections((prev) =>
        prev.upcoming ? { ...prev, upcoming: false } : prev,
      );
    }, 160);
  }, [clearUpcomingExpandTimer, collapsedSections.upcoming]);
  React.useEffect(
    () => () => clearUpcomingExpandTimer(),
    [clearUpcomingExpandTimer],
  );

  const handleSwipeStateChange = React.useCallback((isSwiping: boolean) => {
    swipeGestureActiveRef.current = isSwiping;
  }, []);

  const handleRowTouchStateChange = React.useCallback((isTouchingRow: boolean) => {
    rowTouchActiveRef.current = isTouchingRow;
    if (isTouchingRow && listTouchStartRef.current.active) {
      listTouchStartRef.current.startedOnRow = true;
    }
  }, []);

  const handleDragStateChange = React.useCallback(
    (isDragging: boolean) => {
      listDragActiveRef.current = isDragging;
      if (isDragging) {
        cancelDragSurfaceResetFrame();
        clearUpcomingExpandTimer();
        measureUpcomingSurfaceBounds();
        measureDateRailBounds();
        return;
      }
      cancelDragSurfaceResetFrame();
      clearUpcomingExpandTimer();
      dragSurfaceResetFrameRef.current = requestAnimationFrame(() => {
        dragSurfaceResetFrameRef.current = null;
        setActiveDragSurface(null);
      });
      if (!dragContextRef.current) {
        clearDateDragHover();
      }
    },
    [
      cancelDragSurfaceResetFrame,
      clearDateDragHover,
      clearUpcomingExpandTimer,
      measureDateRailBounds,
      measureUpcomingSurfaceBounds,
    ],
  );

  const shiftSelectedDateBySwipe = React.useCallback(
    (delta: 1 | -1) => {
      const next = addDays(selectedDateStartRef.current, delta);
      selectDateWithTransition(next, delta > 0 ? 1 : -1, "swipe");
    },
    [selectDateWithTransition],
  );

  const onListTouchStart = React.useCallback((event: GestureResponderEvent) => {
    const touch = event.nativeEvent.touches?.[0];
    if (!touch) return;
    listTouchStartRef.current = {
      x: touch.pageX,
      y: touch.pageY,
      at: Date.now(),
      active: true,
      startedOnRow: rowTouchActiveRef.current,
    };
  }, []);

  const onListTouchEnd = React.useCallback(
    (event: GestureResponderEvent) => {
      const start = listTouchStartRef.current;
      listTouchStartRef.current.active = false;
      if (!start.active) return;

      const touch = event.nativeEvent.changedTouches?.[0];
      if (!touch) return;
      dragLastTouchPointRef.current = {
        absoluteX: touch.pageX,
        absoluteY: touch.pageY,
      };
      if (
        start.startedOnRow ||
        swipeGestureActiveRef.current ||
        listDragActiveRef.current
      ) {
        return;
      }

      const dx = touch.pageX - start.x;
      const dy = touch.pageY - start.y;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const dt = Math.max(1, Date.now() - start.at);
      const vx = (dx / dt) * 1000;

      const horizontalIntent = absX > 72 && absX > absY * 1.45 + 8;
      const shouldTrigger = absX > 96 || Math.abs(vx) > 880;
      if (!horizontalIntent || !shouldTrigger) return;

      closeAnyOpen();
      shiftSelectedDateBySwipe(dx < 0 ? 1 : -1);
    },
    [closeAnyOpen, shiftSelectedDateBySwipe],
  );

  const onListTouchCancel = React.useCallback(() => {
    listTouchStartRef.current.active = false;
    listTouchStartRef.current.startedOnRow = false;
  }, []);

  const projectsById = React.useMemo(
    () => new Map(projects.map((p) => [p.id, p] as const)),
    [projects],
  );

  const getVisibleTasksForDateStart = React.useCallback(
    (targetDateStart: number) => {
      const base = tasks.filter((t) => {
        if (t.deletedAt) return false;
        const normalizedSection: SectionId =
          t.section === "completed"
            ? "completed"
            : deriveActiveSectionFromDueAt(t.dueAt);
        if (!homeEnabledSections.includes(normalizedSection)) return false;

        const dueAtIsValid = hasValidDueAt(t.dueAt);

        if (!dueAtIsValid) {
          return normalizedSection === "upcoming";
        }

        return isSameLocalDay(t.dueAt, targetDateStart);
      });
      const normalizedBase = base.map((task) => {
        if (task.section === "completed") return task;
        const normalizedSection = deriveActiveSectionFromDueAt(task.dueAt);
        return task.section === normalizedSection
          ? task
          : { ...task, section: normalizedSection };
      });
      if (!withNotesEnabled) return normalizedBase;
      return normalizedBase.filter((t) => !!t.subtitle);
    },
    [homeEnabledSections, tasks, withNotesEnabled],
  );
  const visibleTasks = React.useMemo(
    () => getVisibleTasksForDateStart(listDateStart),
    [getVisibleTasksForDateStart, listDateStart],
  );
  const visibleTasksById = React.useMemo(
    () => new Map(visibleTasks.map((task) => [task.id, task] as const)),
    [visibleTasks],
  );
  const visibleTaskDisplaySectionById = React.useMemo(
    () =>
      new Map(
        visibleTasks.map(
          (task) =>
            [task.id, deriveHomeDisplaySection(task, listDateStart)] as const,
        ),
      ),
    [listDateStart, visibleTasks],
  );

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
    for (const task of visibleTasks) {
      const displaySection =
        visibleTaskDisplaySectionById.get(task.id) ?? "upcoming";
      grouped[displaySection].push(task);
    }
    for (const sectionId of SECTION_ORDER) {
      grouped[sectionId] = [...grouped[sectionId]].sort(
        (a, b) => a.orderRank - b.orderRank,
      );
    }
    return grouped;
  }, [visibleTaskDisplaySectionById, visibleTasks]);

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
          key: `task-${task.id}`,
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
  const hasTodaySection = visibleSections.includes("today");
  const hasUpcomingSection = visibleSections.includes("upcoming");
  React.useEffect(() => {
    const rafId = requestAnimationFrame(measureUpcomingSurfaceBounds);
    return () => cancelAnimationFrame(rafId);
  }, [
    collapsedSections.upcoming,
    hasUpcomingSection,
    measureUpcomingSurfaceBounds,
    viewportWidth,
  ]);
  const todaySwipeListData = React.useMemo<TaskSwipeDraggableListItem[]>(() => {
    if (!hasTodaySection) return [];
    return swipeListData.filter(
      (item) =>
        item.kind === "task" &&
        (visibleTaskDisplaySectionById.get(item.taskId) ?? "upcoming") ===
        "today",
    );
  }, [hasTodaySection, swipeListData, visibleTaskDisplaySectionById]);
  const hasTodayTasks = todaySwipeListData.length > 0;
  const dateListTransitionData = React.useMemo(() => {
    if (!dateListTransitionState) return null;
    const fromVisibleTasks = getVisibleTasksForDateStart(
      dateListTransitionState.fromDateStart,
    );
    const toVisibleTasks = getVisibleTasksForDateStart(
      dateListTransitionState.toDateStart,
    );
    const fromTodayData: TaskSwipeDraggableListItem[] = fromVisibleTasks
      .filter(
        (task) =>
          deriveHomeDisplaySection(
            task,
            dateListTransitionState.fromDateStart,
          ) === "today",
      )
      .sort((a, b) => a.orderRank - b.orderRank)
      .map((task) => ({
        kind: "task",
        key: `task-${task.id}`,
        taskId: task.id,
      }));
    const toTodayData: TaskSwipeDraggableListItem[] = toVisibleTasks
      .filter(
        (task) =>
          deriveHomeDisplaySection(
            task,
            dateListTransitionState.toDateStart,
          ) === "today",
      )
      .sort((a, b) => a.orderRank - b.orderRank)
      .map((task) => ({
        kind: "task",
        key: `task-${task.id}`,
        taskId: task.id,
      }));
    return {
      fromVisibleTasks,
      toVisibleTasks,
      fromTodayData,
      toTodayData,
    };
  }, [dateListTransitionState, getVisibleTasksForDateStart]);
  const dateListTransitionPageWidth = React.useMemo(
    () => Math.max(1, dateListHostWidth),
    [dateListHostWidth],
  );
  const upcomingSwipeListData = React.useMemo<
    TaskSwipeDraggableListItem[]
  >(() => {
    if (!hasUpcomingSection) return [];
    const upcomingTasks = swipeListData.filter(
      (item) =>
        item.kind === "task" &&
        (visibleTaskDisplaySectionById.get(item.taskId) ?? "upcoming") ===
        "upcoming",
    );
    return upcomingTasks;
  }, [hasUpcomingSection, swipeListData, visibleTaskDisplaySectionById]);
  const hasUpcomingTasks = tasksBySection.upcoming.length > 0;
  const withoutDateCount = tasksBySection.upcoming.length;

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
            .filter(
              (t) =>
                deriveHomeDisplaySection(t, listDateStart) === sectionId &&
                !visibleIdSet.has(t.id),
            )
            .sort((a, b) => a.orderRank - b.orderRank)
            .map((t) => t.id);

          const finalOrder = [...reorderedVisibleIds, ...stableHidden];
          finalOrder.forEach((id, index) => {
            const existing = nextById.get(id);
            if (!existing) return;
            const moved = reorderedVisibleSet.has(id)
              ? adjustDueAtOnSectionChange(existing, sectionId, listDateStart)
              : existing;
            nextById.set(id, { ...moved, orderRank: (index + 1) * 1000 });
          });
        }

        return prev.map((t) => nextById.get(t.id) ?? t);
      });
    },
    [
      firstVisibleSection,
      listDateStart,
      setTasks,
      visibleSections,
      visibleTasks,
    ],
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
  const applyOrderFromTodaySegment = React.useCallback(
    (data: TaskSwipeDraggableListItem[]) => {
      applyOrderFromSwipeListData([...data, ...upcomingSwipeListData]);
    },
    [applyOrderFromSwipeListData, upcomingSwipeListData],
  );
  const applyOrderFromUpcomingSegment = React.useCallback(
    (data: TaskSwipeDraggableListItem[]) => {
      applyOrderFromSwipeListData([...todaySwipeListData, ...data]);
    },
    [applyOrderFromSwipeListData, todaySwipeListData],
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
  const handleDragBeginTask = React.useCallback(
    (taskId: string) => {
      const sourceTask = visibleTasksById.get(taskId);
      const sourceSection =
        visibleTaskDisplaySectionById.get(taskId) ??
        sourceTask?.section ??
        ("upcoming" as SectionId);
      dragLastRailDateStartRef.current = null;
      dragContextRef.current = {
        taskId,
        sourceSection,
        sourceHasDueAt: hasValidDueAt(sourceTask?.dueAt),
      };
      dragStartPointRef.current = null;
      dragRailHoverIntentRef.current = { dateStart: null, enteredAt: 0 };
      dragLastTouchPointRef.current = null;
      cancelDragSurfaceResetFrame();
      clearUpcomingExpandTimer();
      setActiveDragSurface(sourceSection === "today" ? "today" : "upcoming");
      measureUpcomingSurfaceBounds();
      measureTodaySurfaceBounds();
      clearDateDragHover();
      measureDateRailBounds();
    },
    [
      cancelDragSurfaceResetFrame,
      clearDateDragHover,
      clearUpcomingExpandTimer,
      measureDateRailBounds,
      measureTodaySurfaceBounds,
      measureUpcomingSurfaceBounds,
      visibleTaskDisplaySectionById,
      visibleTasksById,
    ],
  );

  const handleDragTouchPoint = React.useCallback(
    (params: {
      absoluteX: number;
      absoluteY: number;
      translationX: number;
      translationY: number;
    }) => {
      if (!dragContextRef.current) return;

      const { absoluteX, absoluteY } = params;
      if (!dragStartPointRef.current) {
        dragStartPointRef.current = { absoluteX, absoluteY };
      }
      dragLastTouchPointRef.current = { absoluteX, absoluteY };
      const isHoveringUpcomingSurface =
        dragContextRef.current.sourceSection === "today" &&
        isPointNearBounds(
          upcomingSurfaceBoundsRef.current,
          absoluteX,
          absoluteY,
          {
            top: 36,
            right: 20,
            bottom: 64,
            left: 20,
          },
        );
      if (isHoveringUpcomingSurface) {
        setIsHoveringUpcomingDropZone(true);
        scheduleUpcomingExpandOnHover();
      } else {
        setIsHoveringUpcomingDropZone(false);
        clearUpcomingExpandTimer();
      }

      const isHoveringTodaySurface =
        dragContextRef.current.sourceSection === "upcoming" &&
        isPointNearBounds(todaySurfaceBoundsRef.current, absoluteX, absoluteY, {
          top: 36,
          right: 20,
          bottom: 64,
          left: 20,
        });
      setIsHoveringTodayDropZone(isHoveringTodaySurface);
      const bounds = dateRailBoundsRef.current;
      if (!bounds) return;

      const inRailBounds =
        absoluteX >= bounds.x &&
        absoluteX <= bounds.x + bounds.width &&
        absoluteY >= bounds.y - DATE_DROP_VERTICAL_PADDING &&
        absoluteY <= bounds.y + bounds.height + DATE_DROP_VERTICAL_PADDING;

      if (!inRailBounds) {
        dragLastRailDateStartRef.current = null;
        dragRailHoverIntentRef.current = { dateStart: null, enteredAt: 0 };
        if (dragHoverDateStartRef.current != null) {
          clearDateDragHover();
        }
        return;
      }

      const localX = clamp(absoluteX - bounds.x, 0, bounds.width);
      const contentX = dateRailScrollOffsetRef.current + localX;
      const rawIndex = Math.round(contentX / dateRailSnapInterval);
      const dayIndex = clamp(rawIndex, 0, Math.max(dateRailDays.length - 1, 0));
      const targetDay = dateRailDays[dayIndex];
      if (!targetDay) return;
      const now = Date.now();
      const currentIntent = dragRailHoverIntentRef.current;
      if (currentIntent.dateStart !== targetDay.timestamp) {
        dragRailHoverIntentRef.current = {
          dateStart: targetDay.timestamp,
          enteredAt: now,
        };
      }

      const dragStartPoint = dragStartPointRef.current;
      const horizontalTravel = dragStartPoint
        ? Math.abs(absoluteX - dragStartPoint.absoluteX)
        : 0;
      const dwellMs = now - dragRailHoverIntentRef.current.enteredAt;
      const minDwellMs =
        dragContextRef.current.sourceSection === "today"
          ? DATE_DROP_INTENT_DWELL_MS_FROM_TODAY
          : DATE_DROP_INTENT_DWELL_MS_FROM_UPCOMING;
      const minHorizontalTravel =
        dragContextRef.current.sourceSection === "today"
          ? DATE_DROP_INTENT_HORIZONTAL_TRAVEL_FROM_TODAY
          : DATE_DROP_INTENT_HORIZONTAL_TRAVEL_FROM_UPCOMING;
      const isDifferentDay = !isSameLocalDay(
        targetDay.timestamp,
        listDateStartRef.current,
      );
      const hasIntentForDateDrop =
        isDifferentDay &&
        (horizontalTravel >= minHorizontalTravel || dwellMs >= minDwellMs);

      if (!hasIntentForDateDrop) {
        dragLastRailDateStartRef.current = null;
        if (dragHoverDateStartRef.current != null) {
          clearDateDragHover();
        }
        return;
      }

      dragLastRailDateStartRef.current = targetDay.timestamp;
      if (targetDay.timestamp !== dragHoverDateStartRef.current) {
        dragHoverDateStartRef.current = targetDay.timestamp;
        setDragHoveredDateStart(targetDay.timestamp);
      }
    },
    [
      clearDateDragHover,
      clearUpcomingExpandTimer,
      dateRailDays,
      dateRailSnapInterval,
      scheduleUpcomingExpandOnHover,
    ],
  );

  const resolveOpenDayDropDateStart = React.useCallback(
    (
      meta: { data: TaskSwipeDraggableListItem[]; from: number; to: number },
      dragContext: {
        taskId: string;
        sourceSection: SectionId;
        sourceHasDueAt: boolean;
      },
    ) => {
      if (dragContext.sourceSection !== "upcoming") return null;
      if (dragContext.sourceHasDueAt) return null;

      const targetDateStart = listDateStartRef.current;
      if (isSameLocalDay(targetDateStart, todayStart)) return null;
      if (meta.to < meta.from) return targetDateStart;

      let currentSection: SectionId = firstVisibleSection;
      const orderedUpcomingTaskIds: string[] = [];
      for (const item of meta.data) {
        if (item.kind === "header") {
          currentSection = item.sectionId as SectionId;
          continue;
        }
        if (currentSection === "upcoming") {
          orderedUpcomingTaskIds.push(item.taskId);
        }
      }

      const draggedIndex = orderedUpcomingTaskIds.indexOf(dragContext.taskId);
      if (draggedIndex < 0) return null;

      const firstUndatedOtherIndex = orderedUpcomingTaskIds.findIndex(
        (taskId) => {
          if (taskId === dragContext.taskId) return false;
          const task = visibleTasksById.get(taskId);
          return !task || !hasValidDueAt(task.dueAt);
        },
      );

      if (
        firstUndatedOtherIndex === -1 ||
        draggedIndex < firstUndatedOtherIndex
      ) {
        return targetDateStart;
      }

      return null;
    },
    [firstVisibleSection, todayStart, visibleTasksById],
  );

  const shouldDropIntoUpcomingSurface = React.useCallback(
    (dragContext: {
      taskId: string;
      sourceSection: SectionId;
      sourceHasDueAt: boolean;
    }) => {
      if (dragContext.sourceSection !== "today") return false;
      const point = dragLastTouchPointRef.current;
      if (!point) return false;
      const extraBottomInset =
        collapsedSections.upcoming || !hasUpcomingTasks ? 120 : 64;
      return isPointNearBounds(
        upcomingSurfaceBoundsRef.current,
        point.absoluteX,
        point.absoluteY,
        {
          // Allow dropping slightly above/around the "Ohne Datum" card,
          // which feels more natural when releasing near the section boundary.
          top: 68,
          right: 28,
          bottom: extraBottomInset + 18,
          left: 28,
        },
      );
    },
    [collapsedSections.upcoming, hasUpcomingTasks],
  );

  const shouldDropIntoTodaySurface = React.useCallback(
    (dragContext: {
      taskId: string;
      sourceSection: SectionId;
      sourceHasDueAt: boolean;
    }) => {
      if (dragContext.sourceSection !== "upcoming") return false;
      const point = dragLastTouchPointRef.current;
      if (!point) return false;
      return isPointNearBounds(
        todaySurfaceBoundsRef.current,
        point.absoluteX,
        point.absoluteY,
        {
          // Allow dropping slightly around the bounds
          top: 68,
          right: 28,
          bottom: 18,
          left: 28,
        },
      );
    },
    [],
  );

  const applyDraggedTaskToUpcomingUndated = React.useCallback(
    (taskId: string) => {
      setTasks((prev) => {
        const task = prev.find((candidate) => candidate.id === taskId);
        if (!task || task.deletedAt || task.section === "completed") {
          return prev;
        }

        const fromSection = deriveActiveSectionFromDueAt(task.dueAt);
        if (fromSection === "upcoming" && !hasValidDueAt(task.dueAt)) {
          return prev;
        }

        const next = prev.map((candidate) =>
          candidate.id === taskId
            ? {
              ...candidate,
              section: "upcoming" as const,
              dueAt: 0,
              dueHasTime: false,
              completedAt: undefined,
            }
            : candidate,
        );

        if (fromSection === "upcoming") {
          return reseedSection(next, "upcoming");
        }

        const reseededFrom = reseedSection(next, fromSection);
        return reseedSection(reseededFrom, "upcoming");
      });
    },
    [reseedSection, setTasks],
  );

  const applyDraggedTaskToDate = React.useCallback(
    (taskId: string, targetDateStart: number) => {
      setTasks((prev) => {
        const task = prev.find((candidate) => candidate.id === taskId);
        if (!task || task.deletedAt || task.section === "completed") {
          return prev;
        }

        const fromSection = deriveActiveSectionFromDueAt(task.dueAt);
        const toSection: SectionId = isSameLocalDay(targetDateStart, todayStart)
          ? "today"
          : "upcoming";
        const keepTime =
          task.dueHasTime === true ||
          (task.dueHasTime !== false && hasValidDueAt(task.dueAt));
        const nextDueAt = alignDueAtToLocalDay(targetDateStart, {
          sourceDueAt: task.dueAt,
          keepTime,
        });

        const next = prev.map((candidate) =>
          candidate.id === taskId
            ? {
              ...candidate,
              section: toSection,
              dueAt: nextDueAt,
              dueHasTime: keepTime,
              completedAt: undefined,
            }
            : candidate,
        );

        if (fromSection === toSection) {
          return reseedSection(next, toSection);
        }

        const reseededFrom = reseedSection(next, fromSection);
        return reseedSection(reseededFrom, toSection);
      });
    },
    [reseedSection, setTasks, todayStart],
  );

  const handleDragEndMeta = React.useCallback(
    (meta: {
      data: TaskSwipeDraggableListItem[];
      from: number;
      to: number;
    }) => {
      const dragContext = dragContextRef.current;
      const hoveredDateStart = dragHoverDateStartRef.current;
      const lastRailDateStart = dragLastRailDateStartRef.current;
      dragContextRef.current = null;
      dragLastRailDateStartRef.current = null;
      clearUpcomingExpandTimer();
      clearDateDragHover();
      setIsHoveringUpcomingDropZone(false);
      setIsHoveringTodayDropZone(false);

      if (!dragContext) {
        dragLastTouchPointRef.current = null;
        return false;
      }

      if (shouldDropIntoUpcomingSurface(dragContext)) {
        const droppedTaskId = dragContext.taskId;
        dragLastTouchPointRef.current = null;
        queueDropCommit(() => {
          setCollapsedSections((prev) =>
            prev.upcoming ? { ...prev, upcoming: false } : prev,
          );
          applyDraggedTaskToUpcomingUndated(droppedTaskId);
        });
        return true;
      }

      if (shouldDropIntoTodaySurface(dragContext)) {
        const droppedTaskId = dragContext.taskId;
        dragLastTouchPointRef.current = null;
        queueDropCommit(() => {
          applyDraggedTaskToDate(droppedTaskId, listDateStartRef.current);
          selectDateWithoutTransition(selectedDateStartRef.current);
        });
        return true;
      }

      const targetDateStart =
        hoveredDateStart ??
        lastRailDateStart ??
        resolveOpenDayDropDateStart(meta, dragContext);
      dragLastTouchPointRef.current = null;
      if (targetDateStart == null) return false;

      const droppedTaskId = dragContext.taskId;
      queueDropCommit(() => {
        applyDraggedTaskToDate(droppedTaskId, targetDateStart);
        selectDateWithoutTransition(targetDateStart);
      });
      return true;
    },
    [
      applyDraggedTaskToUpcomingUndated,
      applyDraggedTaskToDate,
      clearDateDragHover,
      clearUpcomingExpandTimer,
      queueDropCommit,
      queueTaskPopIn,
      resolveOpenDayDropDateStart,
      selectDateWithoutTransition,
      shouldDropIntoUpcomingSurface,
      shouldDropIntoTodaySurface,
    ],
  );

  const handlePressTask = React.useCallback(
    (taskId: string) => {
      router.push({ pathname: "/task/[id]", params: { id: taskId } });
    },
    [router],
  );

  const handleToggleComplete = React.useCallback(
    (taskId: string) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
            const hasDueAt = hasValidDueAt(t.dueAt);
            toSection = hasDueAt
              ? deriveActiveSectionFromDueAt(t.dueAt)
              : "today";
            return {
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
            toSection = deriveActiveSectionFromDueAt(
              nextDue,
              nowDate.getTime(),
            );
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
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
      const collapseProgress =
        id === "today" ? todayCollapseProgress : upcomingCollapseProgress;
      const chevronRotate = collapseProgress.interpolate({
        inputRange: [0, 1],
        outputRange: ["90deg", "0deg"],
      });
      const chipScale = collapseProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0.985],
      });
      const chipOpacity = collapseProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0.94],
      });

      const onToggle = () => {
        if (!isCollapsible) return;
        closeAnyOpen();
        if (id === "upcoming") {
          configureSmoothListLayoutTransition();
        }
        setCollapsedSections((prev) => ({
          ...prev,
          [id]: !prev[id as "today" | "upcoming"],
        }));
      };

      const isUpcoming = id === "upcoming";

      const headerButton = (
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
          style={[
            styles.sectionHeaderButton,
            isUpcoming && { justifyContent: "center", gap: 8 },
          ]}
        >
          {isUpcoming ? (
            <Animated.View
              style={{
                transform: [{ scale: chipScale }],
                opacity: chipOpacity,
              }}
            >
              <GlassSurface
                tintColor={glassSurfacePalette.chipTint}
                fallbackBackgroundColor={glassSurfacePalette.chipFallback}
                style={styles.dateRailTitleRow}
              >
                <Text style={styles.dateRailTitle}>
                  {t(SECTION_TITLE_KEYS[id])}
                </Text>
                <View style={styles.sectionCountBadge}>
                  <Text style={styles.sectionCountBadgeText}>
                    {withoutDateCount}
                  </Text>
                </View>
                {isCollapsible ? (
                  <Animated.View
                    style={{
                      transform: [{ rotate: chevronRotate }],
                      marginTop: 2,
                    }}
                  >
                    <MaterialIcons
                      name="chevron-right"
                      size={24}
                      color={Colors[theme].text}
                      style={[styles.sectionChevron, { opacity: 1 }]}
                    />
                  </Animated.View>
                ) : null}
              </GlassSurface>
            </Animated.View>
          ) : (
            <>
              <Text style={styles.sectionTitle}>
                {t(SECTION_TITLE_KEYS[id])}
              </Text>
              {isCollapsible ? (
                <Animated.View
                  style={{
                    transform: [{ rotate: chevronRotate }],
                    marginTop: 0,
                  }}
                >
                  <MaterialIcons
                    name="chevron-right"
                    size={18}
                    color={withAlpha(Colors[theme].text, 0.48)}
                    style={[styles.sectionChevron, { opacity: 0.48 }]}
                  />
                </Animated.View>
              ) : null}
            </>
          )}
        </Pressable>
      );

      return <View style={styles.sectionHeader}>{headerButton}</View>;
    },
    [
      closeAnyOpen,
      glassSurfacePalette,
      todayCollapseProgress,
      upcomingCollapseProgress,
      withoutDateCount,
      styles,
      theme,
    ],
  );

  const dateRailPanel = React.useMemo(() => {
    if (firstVisibleSection !== "today") return null;
    const todayChevronRotate = todayCollapseProgress.interpolate({
      inputRange: [0, 1],
      outputRange: ["90deg", "0deg"],
    });
    const todayChipScale = todayCollapseProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0.985],
    });
    const todayChipOpacity = todayCollapseProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0.94],
    });
    const calendarButtonOpacity = todayCollapseProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0],
    });
    const calendarButtonScale = todayCollapseProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0.9],
    });
    const calendarButtonTranslateY = todayCollapseProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -4],
    });
    const titleTransitionDirection = dateRailTitleTransition?.direction ?? 1;
    const titleOutTranslateY = dateRailTitleTransitionProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -10 * titleTransitionDirection],
    });
    const titleInTranslateY = dateRailTitleTransitionProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [10 * titleTransitionDirection, 0],
    });
    return (
      <View
        ref={dateRailWrapRef}
        onLayout={measureDateRailBounds}
        style={styles.dateRailWrap}
      >
        <View style={styles.dateRailMotionContent}>
          <View style={styles.dateRailTitleHost}>
            <Pressable
              onPress={() => {
                closeAnyOpen();
                configureSmoothListLayoutTransition();
                setCollapsedSections((prev) => ({
                  ...prev,
                  today: !prev.today,
                }));
              }}
              disabled={isDateListTransitioning}
              hitSlop={20}
              style={styles.dateRailTitlePressable}
            >
              <View style={styles.dateRailTitleViewport}>
                <Animated.View
                  style={{
                    transform: [{ scale: todayChipScale }],
                    opacity: todayChipOpacity,
                  }}
                >
                  <GlassSurface
                    tintColor={glassSurfacePalette.chipTint}
                    fallbackBackgroundColor={glassSurfacePalette.chipFallback}
                    style={styles.dateRailTitleRow}
                  >
                    <View style={styles.dateRailTitleTextViewport}>
                      {dateRailTitleTransition ? (
                        <View style={styles.dateRailTitleTextTransitionHost}>
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.dateRailTitle,
                              styles.dateRailTitleTextMeasure,
                            ]}
                          >
                            {dateRailTitleTransition.fromTitle.length >=
                              dateRailTitleTransition.toTitle.length
                              ? dateRailTitleTransition.fromTitle
                              : dateRailTitleTransition.toTitle}
                          </Text>
                          <Animated.Text
                            numberOfLines={1}
                            style={[
                              styles.dateRailTitle,
                              styles.dateRailTitleTextTransitionText,
                              {
                                opacity:
                                  dateRailTitleTransitionProgress.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [1, 0],
                                  }),
                                transform: [{ translateY: titleOutTranslateY }],
                              },
                            ]}
                          >
                            {dateRailTitleTransition.fromTitle}
                          </Animated.Text>
                          <Animated.Text
                            numberOfLines={1}
                            style={[
                              styles.dateRailTitle,
                              styles.dateRailTitleTextTransitionText,
                              {
                                opacity: dateRailTitleTransitionProgress,
                                transform: [{ translateY: titleInTranslateY }],
                              },
                            ]}
                          >
                            {dateRailTitleTransition.toTitle}
                          </Animated.Text>
                        </View>
                      ) : (
                        <Text style={styles.dateRailTitle} numberOfLines={1}>
                          {dynamicHeaderTitle}
                        </Text>
                      )}
                    </View>
                    <Animated.View
                      style={{
                        transform: [{ rotate: todayChevronRotate }],
                        marginTop: 2,
                      }}
                    >
                      <MaterialIcons
                        name="chevron-right"
                        size={24}
                        color={Colors[theme].text}
                        style={[styles.sectionChevron, { opacity: 1 }]}
                      />
                    </Animated.View>
                  </GlassSurface>
                </Animated.View>
              </View>
            </Pressable>

            <Animated.View
              pointerEvents={collapsedSections.today ? "none" : "auto"}
              style={{
                position: "absolute",
                right: 24,
                top: 0,
                bottom: 0,
                justifyContent: "center",
                zIndex: 10,
                opacity: calendarButtonOpacity,
                transform: [
                  { scale: calendarButtonScale },
                  { translateY: calendarButtonTranslateY },
                ],
              }}
            >
              <GlassSurface
                tintColor={glassSurfacePalette.calendarTint}
                fallbackBackgroundColor={glassSurfacePalette.calendarFallback}
                style={styles.calendarButton}
                isInteractive={true}
              >
                <Pressable
                  accessibilityRole="button"
                  hitSlop={16}
                  style={StyleSheet.absoluteFillObject}
                  onPress={() => {
                    setIsCalendarPickerOpen((prev) => !prev);
                  }}
                >
                  <View
                    style={{
                      flex: 1,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <SFSymbol
                      name="calendar"
                      size={16}
                      color={Colors[theme].text}
                    />
                  </View>
                </Pressable>
              </GlassSurface>
            </Animated.View>
          </View>

          {/* Calendar picker rendered as top-level Modal to avoid clipping */}
          <Modal
            visible={isCalendarPickerOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setIsCalendarPickerOpen(false)}
          >
            {/* Backdrop */}
            <Pressable
              style={[
                StyleSheet.absoluteFillObject,
                { backgroundColor: "transparent" },
              ]}
              onPress={() => setIsCalendarPickerOpen(false)}
            />
            {/* Popover card — centered horizontally near top */}
            <View
              pointerEvents="box-none"
              style={{
                position: "absolute",
                top: 120,
                left: 0,
                right: 0,
                alignItems: "center",
              }}
            >
              <GlassSurface
                tintColor={glassSurfacePalette.popoverTint}
                fallbackBackgroundColor={glassSurfacePalette.popoverFallback}
                style={styles.calendarPopover}
                isInteractive={true}
              >
                {/* Clip container to hide the Day column (leftmost ~88px) */}
                <View style={{ width: "100%", overflow: "hidden" }}>
                  <DateTimePicker
                    value={
                      new Date(
                        calendarPickerDate.year,
                        calendarPickerDate.month - 1,
                        1,
                      )
                    }
                    mode="date"
                    display="spinner"
                    onChange={(_: any, date?: Date) => {
                      if (date) {
                        const month = date.getMonth() + 1;
                        const year = date.getFullYear();
                        setCalendarPickerDate({ month, year });
                        handleSelectDate(
                          new Date(year, month - 1, 1).getTime(),
                          "picker",
                        );
                      }
                    }}
                    style={{
                      width: CALENDAR_POPOVER_WIDTH + 88,
                      height: CALENDAR_POPOVER_HEIGHT,
                      marginLeft: -88,
                    }}
                    textColor={isDark ? "#ffffff" : "#000000"}
                    themeVariant={isDark ? "dark" : "light"}
                  />
                </View>
              </GlassSurface>
            </View>
          </Modal>

          {!collapsedSections.today ? (
            <FlatList
              ref={dateRailRef}
              data={dateRailDays}
              keyExtractor={(day) => day.key}
              renderItem={({ item: day }) => {
                const isSelected = day.isSelected;
                const isToday = day.isToday;

                const dayContainerStyle = [
                  styles.dateRailDay,
                  isSelected ? styles.dateRailDaySelected : null,
                ];

                const dayNumStyle = [
                  styles.dateRailDayNum,
                  day.isWeekend ? styles.dateRailDayNumWeekend : null,
                  isToday ? styles.dateRailDayNumToday : null,
                  isSelected ? styles.dateRailDayNumSelected : null,
                ];

                const dayDowStyle = [
                  styles.dateRailDow,
                  day.isWeekend ? styles.dateRailDowWeekend : null,
                  isSelected ? styles.dateRailDowSelected : null,
                ];

                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${day.weekday} ${day.dayOfMonth}`}
                    onPress={() => {
                      dateRailDraggedRef.current = false;
                      closeAnyOpen();
                      handleSelectDate(day.timestamp);
                    }}
                    style={({ pressed }) => [
                      dayContainerStyle,
                      { opacity: pressed ? 0.8 : 1 },
                    ]}
                  >
                    <Text style={dayDowStyle}>{day.weekday}</Text>
                    <Text style={dayNumStyle}>{day.dayOfMonth}</Text>
                    {day.eventCount > 0 && (
                      <View style={styles.dateRailEventIndicator} />
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
              onScroll={handleDateRailScroll}
              onScrollBeginDrag={handleDateRailScrollBeginDrag}
              onMomentumScrollEnd={handleDateRailMomentumEnd}
              showsHorizontalScrollIndicator={false}
              snapToOffsets={dateRailWeekSnapOffsets}
              snapToAlignment="start"
              decelerationRate="fast"
              disableIntervalMomentum
              bounces={false}
              scrollEventThrottle={16}
            />
          ) : null}
        </View>
      </View>
    );
  }, [
    calendarPickerDate,
    closeAnyOpen,
    collapsedSections.today,
    dateRailDays,
    dateRailInitialIndex,
    dateRailTitleTransitionProgress,
    dateRailTitleTransition,
    dateRailWeekSnapOffsets,
    dynamicHeaderTitle,
    firstVisibleSection,
    getDateRailItemLayout,
    handleDateRailMomentumEnd,
    handleDateRailScroll,
    handleDateRailScrollBeginDrag,
    handleDateRailScrollToIndexFailed,
    glassSurfacePalette,
    handleSelectDate,
    isCalendarPickerOpen,
    isDateListTransitioning,
    isDark,
    measureDateRailBounds,
    styles,
    theme,
    todayCollapseProgress,
  ]);

  const listHeader = React.useMemo(() => {
    const sectionId = firstVisibleSection;

    if (sectionId === "today") {
      return (
        <View style={styles.topHeroWrap}>
          <View
            style={[
              styles.topHeroSurface,
              {
                backgroundColor: homeMetricsTheme.topSurface,
              },
            ]}
          >
            <HomeMetricsGrid
              metrics={homeMetricsProps}
              styles={styles}
              theme={homeMetricsTheme}
            />
          </View>
        </View>
      );
    }
    return null;
  }, [firstVisibleSection, homeMetricsProps, homeMetricsTheme, styles]);
  const areCollapsibleSectionsCollapsed =
    (!hasTodaySection || collapsedSections.today) &&
    (!hasUpcomingSection || collapsedSections.upcoming);

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
      <View
        style={[
          styles.archivePillFooter,
          areCollapsibleSectionsCollapsed
            ? styles.archivePillFooterCollapsed
            : null,
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("home.openArchive")}
          onPress={() => router.push("/home/archive")}
          style={({ pressed }) => [pressed && { opacity: 0.92 }]}
        >
          <GlassSurface
            tintColor={glassSurfacePalette.chipTint}
            fallbackBackgroundColor={glassSurfacePalette.chipFallback}
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
  }, [
    areCollapsibleSectionsCollapsed,
    glassSurfacePalette,
    router,
    styles,
    tasks,
    theme,
  ]);

  return (
    <View style={styles.container}>
      <NestableScrollContainer
        ref={scrollRef}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content]}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {listHeader}

        {hasTodaySection ? (
          <GlassSurface
            ref={todaySurfaceRef}
            onLayout={measureTodaySurfaceBounds}
            disabled={collapsedSections.today}
            style={[
              styles.dateTasksSurface,
              activeDragSurface === "today"
                ? styles.segmentSurfaceDragActive
                : null,
              activeDragSurface === "upcoming"
                ? styles.segmentSurfaceDragInactive
                : null,
              isHoveringTodayDropZone ? styles.segmentSurfaceDropHover : null,
              collapsedSections.today ? styles.segmentSurfaceCollapsed : null,
            ]}
            glassEffectStyle="regular"
            tintColor={homeMetricsTheme.cardBackgroundColor}
            fallbackBackgroundColor={
              collapsedSections.today
                ? "transparent"
                : homeMetricsTheme.cardBackgroundColor
            }
          >
            <View
              style={[
                styles.dateTasksSurfaceHeightFrame,
                activeDragSurface === "today"
                  ? styles.dateTasksSurfaceHeightFrameDragActive
                  : null,
                collapsedSections.today
                  ? styles.dateTasksSurfaceHeightFrameCollapsed
                  : null,
              ]}
            >
              <View>
                {dateRailPanel}

                {!collapsedSections.today ? (
                  <Animated.View
                    style={[
                      styles.taskContentSolid,
                      styles.todayTaskContentTransparent,
                      {
                        opacity: todaySectionRevealProgress,
                      },
                    ]}
                  >
                    <View style={styles.taskListInset}>
                      <Animated.View
                        style={[
                          styles.dateListTransitionHost,
                          activeDragSurface === "today"
                            ? styles.dateListTransitionHostDragActive
                            : null,
                          isDateListTransitioning
                            ? { height: dateListTransitionHeight }
                            : null,
                        ]}
                        onLayout={handleDateListHostLayout}
                      >
                        {isDateListTransitioning &&
                          dateListTransitionState &&
                          dateListTransitionData ? (
                          <Animated.View
                            pointerEvents="none"
                            style={[
                              styles.dateListTransitionTrack,
                              {
                                transform: [{ translateX: dateListTranslateX }],
                              },
                            ]}
                          >
                            {dateListTransitionState.direction === 1 ? (
                              <>
                                <View
                                  style={[
                                    styles.dateListTransitionPage,
                                    { width: dateListTransitionPageWidth },
                                  ]}
                                  onLayout={handleDateListFromPageLayout}
                                >
                                  <TaskSwipeDraggableList
                                    theme={theme}
                                    tasks={
                                      dateListTransitionData.fromVisibleTasks
                                    }
                                    projectsById={projectsById}
                                    isDark={isDark}
                                    rowStyles={styles}
                                    itemSpacing={HOME_TASK_ITEM_SPACING}
                                    enabledTags={enabledTags}
                                    showTaskIcons={showTagIcons}
                                    showCompactSubtasks={withSubtasksEnabled}
                                    selectedDateStart={
                                      dateListTransitionState.fromDateStart
                                    }
                                    data={dateListTransitionData.fromTodayData}
                                    empty={
                                      dateListTransitionData.fromTodayData
                                        .length === 0 ? (
                                        <View style={styles.emptyState}>
                                          <Text style={styles.emptyText}>
                                            {t("home.empty.noTasks")}
                                          </Text>
                                        </View>
                                      ) : null
                                    }
                                    onPressTask={handlePressTask}
                                    toggleComplete={handleToggleComplete}
                                    toggleSubtask={handleToggleSubtask}
                                    deleteTask={handleDeleteTask}
                                    renderMode="static"
                                    animateDataLayoutChanges={false}
                                  />
                                </View>
                                <View
                                  style={[
                                    styles.dateListTransitionPage,
                                    { width: dateListTransitionPageWidth },
                                  ]}
                                  onLayout={handleDateListToPageLayout}
                                >
                                  <TaskSwipeDraggableList
                                    theme={theme}
                                    tasks={
                                      dateListTransitionData.toVisibleTasks
                                    }
                                    projectsById={projectsById}
                                    isDark={isDark}
                                    rowStyles={styles}
                                    itemSpacing={HOME_TASK_ITEM_SPACING}
                                    enabledTags={enabledTags}
                                    showTaskIcons={showTagIcons}
                                    showCompactSubtasks={withSubtasksEnabled}
                                    selectedDateStart={
                                      dateListTransitionState.toDateStart
                                    }
                                    data={dateListTransitionData.toTodayData}
                                    empty={
                                      dateListTransitionData.toTodayData
                                        .length === 0 ? (
                                        <View style={styles.emptyState}>
                                          <Text style={styles.emptyText}>
                                            {t("home.empty.noTasks")}
                                          </Text>
                                        </View>
                                      ) : null
                                    }
                                    onPressTask={handlePressTask}
                                    toggleComplete={handleToggleComplete}
                                    toggleSubtask={handleToggleSubtask}
                                    deleteTask={handleDeleteTask}
                                    renderMode="static"
                                    animateDataLayoutChanges={false}
                                    revealProgress={
                                      dateListTransitionItemRevealProgress
                                    }
                                    revealStaggerStep={0.04}
                                    revealTranslateY={-6}
                                  />
                                </View>
                              </>
                            ) : (
                              <>
                                <View
                                  style={[
                                    styles.dateListTransitionPage,
                                    { width: dateListTransitionPageWidth },
                                  ]}
                                  onLayout={handleDateListToPageLayout}
                                >
                                  <TaskSwipeDraggableList
                                    theme={theme}
                                    tasks={
                                      dateListTransitionData.toVisibleTasks
                                    }
                                    projectsById={projectsById}
                                    isDark={isDark}
                                    rowStyles={styles}
                                    itemSpacing={HOME_TASK_ITEM_SPACING}
                                    enabledTags={enabledTags}
                                    showTaskIcons={showTagIcons}
                                    showCompactSubtasks={withSubtasksEnabled}
                                    selectedDateStart={
                                      dateListTransitionState.toDateStart
                                    }
                                    data={dateListTransitionData.toTodayData}
                                    empty={
                                      dateListTransitionData.toTodayData
                                        .length === 0 ? (
                                        <View style={styles.emptyState}>
                                          <Text style={styles.emptyText}>
                                            {t("home.empty.noTasks")}
                                          </Text>
                                        </View>
                                      ) : null
                                    }
                                    onPressTask={handlePressTask}
                                    toggleComplete={handleToggleComplete}
                                    toggleSubtask={handleToggleSubtask}
                                    deleteTask={handleDeleteTask}
                                    renderMode="static"
                                    animateDataLayoutChanges={false}
                                    revealProgress={
                                      dateListTransitionItemRevealProgress
                                    }
                                    revealStaggerStep={0.04}
                                    revealTranslateY={-6}
                                  />
                                </View>
                                <View
                                  style={[
                                    styles.dateListTransitionPage,
                                    { width: dateListTransitionPageWidth },
                                  ]}
                                  onLayout={handleDateListFromPageLayout}
                                >
                                  <TaskSwipeDraggableList
                                    theme={theme}
                                    tasks={
                                      dateListTransitionData.fromVisibleTasks
                                    }
                                    projectsById={projectsById}
                                    isDark={isDark}
                                    rowStyles={styles}
                                    itemSpacing={HOME_TASK_ITEM_SPACING}
                                    enabledTags={enabledTags}
                                    showTaskIcons={showTagIcons}
                                    showCompactSubtasks={withSubtasksEnabled}
                                    selectedDateStart={
                                      dateListTransitionState.fromDateStart
                                    }
                                    data={dateListTransitionData.fromTodayData}
                                    empty={
                                      dateListTransitionData.fromTodayData
                                        .length === 0 ? (
                                        <View style={styles.emptyState}>
                                          <Text style={styles.emptyText}>
                                            {t("home.empty.noTasks")}
                                          </Text>
                                        </View>
                                      ) : null
                                    }
                                    onPressTask={handlePressTask}
                                    toggleComplete={handleToggleComplete}
                                    toggleSubtask={handleToggleSubtask}
                                    deleteTask={handleDeleteTask}
                                    renderMode="static"
                                    animateDataLayoutChanges={false}
                                  />
                                </View>
                              </>
                            )}
                          </Animated.View>
                        ) : (
                          <View
                            onTouchStart={onListTouchStart}
                            onTouchEnd={onListTouchEnd}
                            onTouchCancel={onListTouchCancel}
                            pointerEvents={
                              isDateListTransitioning ? "none" : "auto"
                            }
                          >
                            <TaskSwipeDraggableList
                              ref={todayListRef}
                              theme={theme}
                              tasks={visibleTasks}
                              projectsById={projectsById}
                              isDark={isDark}
                              rowStyles={styles}
                              itemSpacing={HOME_TASK_ITEM_SPACING}
                              enabledTags={enabledTags}
                              showTaskIcons={showTagIcons}
                              showCompactSubtasks={withSubtasksEnabled}
                              selectedDateStart={listDateStart}
                              data={todaySwipeListData}
                              empty={
                                !hasTodayTasks ? (
                                  <View style={styles.emptyState}>
                                    <Text style={styles.emptyText}>
                                      {t("home.empty.noTasks")}
                                    </Text>
                                  </View>
                                ) : null
                              }
                              onPressTask={handlePressTask}
                              toggleComplete={handleToggleComplete}
                              toggleSubtask={handleToggleSubtask}
                              deleteTask={handleDeleteTask}
                              onReorderData={applyOrderFromTodaySegment}
                              onDragBeginTask={handleDragBeginTask}
                              onDragTouchPoint={handleDragTouchPoint}
                              onDragEndMeta={handleDragEndMeta}
                              onDragStateChange={handleDragStateChange}
                              onSwipeStateChange={handleSwipeStateChange}
                              onRowTouchStateChange={handleRowTouchStateChange}
                              dragAxisMode="free"
                              renderMode="nestable"
                              scrollRef={scrollRef}
                              animateDataLayoutChanges={false}
                              revealProgress={todaySectionRevealProgress}
                              revealStaggerStep={0.05}
                              revealTranslateY={10}
                            />
                          </View>
                        )}
                      </Animated.View>
                    </View>
                  </Animated.View>
                ) : null}
              </View>
            </View>
          </GlassSurface>
        ) : null}

        {hasUpcomingSection ? (
          <GlassSurface
            ref={upcomingSurfaceRef}
            onLayout={measureUpcomingSurfaceBounds}
            disabled={collapsedSections.upcoming}
            style={[
              styles.upcomingTasksSurface,
              activeDragSurface === "upcoming"
                ? styles.segmentSurfaceDragActive
                : null,
              activeDragSurface === "today"
                ? styles.segmentSurfaceDragInactive
                : null,
              isHoveringUpcomingDropZone
                ? styles.segmentSurfaceDropHover
                : null,
              collapsedSections.upcoming ? styles.segmentSurfaceCollapsed : null,
            ]}
            glassEffectStyle="regular"
            tintColor={homeMetricsTheme.cardBackgroundColor}
            fallbackBackgroundColor={
              collapsedSections.upcoming
                ? "transparent"
                : homeMetricsTheme.cardBackgroundColor
            }
          >
            {renderSectionHeaderRow("upcoming")}
            {!collapsedSections.upcoming ? (
              <Animated.View
                style={[
                  styles.taskContentSolid,
                  {
                    opacity: upcomingSectionRevealProgress,
                    transform: [
                      { translateY: upcomingSectionRevealTranslateY },
                      { scale: upcomingSectionRevealScale },
                    ],
                  },
                ]}
              >
                <View style={styles.taskListInset}>
                  <View
                    onTouchStart={onListTouchStart}
                    onTouchEnd={onListTouchEnd}
                    onTouchCancel={onListTouchCancel}
                  >
                    <TaskSwipeDraggableList
                      ref={upcomingListRef}
                      theme={theme}
                      tasks={visibleTasks}
                      projectsById={projectsById}
                      isDark={isDark}
                      rowStyles={styles}
                      itemSpacing={HOME_TASK_ITEM_SPACING}
                      enabledTags={enabledTags}
                      showTaskIcons={showTagIcons}
                      showCompactSubtasks={withSubtasksEnabled}
                      selectedDateStart={listDateStart}
                      data={upcomingSwipeListData}
                      empty={
                        !hasUpcomingTasks ? (
                          <View style={styles.emptyState}>
                            <Text style={styles.emptyText}>
                              {t("home.empty.noTasks")}
                            </Text>
                          </View>
                        ) : null
                      }
                      onPressTask={handlePressTask}
                      toggleComplete={handleToggleComplete}
                      toggleSubtask={handleToggleSubtask}
                      deleteTask={handleDeleteTask}
                      onReorderData={applyOrderFromUpcomingSegment}
                      onDragBeginTask={handleDragBeginTask}
                      onDragTouchPoint={handleDragTouchPoint}
                      onDragEndMeta={handleDragEndMeta}
                      onDragStateChange={handleDragStateChange}
                      onSwipeStateChange={handleSwipeStateChange}
                      onRowTouchStateChange={handleRowTouchStateChange}
                      dragAxisMode="free"
                      renderMode="nestable"
                      scrollRef={scrollRef}
                      animateDataLayoutChanges={false}
                      revealProgress={upcomingSectionRevealProgress}
                      revealStaggerStep={0.05}
                      revealTranslateY={10}
                    />
                  </View>
                </View>
              </Animated.View>
            ) : null}
          </GlassSurface>
        ) : null}

        {archivePill}

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

      {showFloatingAddButton ? (
        <FloatingAddButton onPress={handleAddTask} />
      ) : null}
    </View>
  );
}
