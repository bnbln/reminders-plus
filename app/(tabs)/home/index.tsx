import { TaskWorkspace } from "@/components/tasks/task-workspace";
import { useOpenTask } from "@/context/task-workspace-context";
import { usePageDimensions } from "@/components/navigation/vertical-bar-safe-area";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { type MenuAction } from "@react-native-menu/menu";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useFocusEffect } from "expo-router";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import React from "react";
import {
  Animated,
  AppState,
  Easing,
  FlatList,
  type GestureResponderEvent,
  LayoutAnimation,
  type LayoutChangeEvent,
  NativeModules,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";

import {
  type TaskDragGestureUpdateParams,
  TaskSwipeDraggableList,
  type TaskSwipeDraggableListHandle,
  type TaskSwipeDraggableListItem,
} from "@/components/tasks/task-swipe-draggable-list";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { FloatingAddButton } from "@/components/ui/floating-add-button";
import { GlassSurface, withAlpha } from "@/components/ui/glass-surface";
import { SFSymbol } from "@/components/ui/sfsymbol";
import { StreakAccentBackground } from "@/components/ui/streak-accent-background";
import { Colors } from "@/constants/theme";
import {
  parseShowCompletedTasksParam,
  parseShowProjectTasksParam,
  parseShowRoutineTasksParam,
  useHomeFilters,
} from "@/context/home-filters-store";
import { setHomeDayPickerHandler } from "@/context/home-day-picker-bridge";
import { getAccentColorValue, useAppSettings } from "@/context/settings-store";
import { useTaskCreateContext } from "@/context/task-create-context";
import {
  createRoutineCompletionTransition,
  getDueAtForSection,
  getNextRoutineDate,
  SectionId,
  type Task,
  useTasksStore,
} from "@/context/tasks-store";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useStreaks } from "@/hooks/use-streaks";
import { getIntlLocale, t } from "@/i18n";
import { triggerSelectionHaptic } from "@/utils/haptics";
import { isIOS26OrNewer } from "@/utils/ios-version";
import { ripple, rippleBorderless } from "@/components/ui/ripple";
import {
  alignDueAtToLocalDay,
  deriveActiveSectionFromDueAt,
  getStartOfLocalDayMs,
  hasValidDueAt,
  isSameLocalDay,
} from "@/utils/task-dates";

type ThemeName = keyof typeof Colors;
type TaskAccessoryContextBridge = {
  setContext?: (
    mode: "task" | "today" | "routine" | "project" | "inProject",
    projectId?: string | null,
    projectLabel?: string | null,
    selectedDateStart?: number | null,
  ) => void;
};

const GRID_HORIZONTAL_PADDING = 16;
const GRID_GAP = 10;
const SECTION_SIDE_INSET = 0;
const DATE_RAIL_HORIZONTAL_PADDING = 6;
const DATE_RAIL_PAST_DAYS = 119;
const DATE_RAIL_FUTURE_DAYS = 365;
const DATE_RAIL_MIN_ITEM_WIDTH = 40;
const DATE_RAIL_ITEM_GAP = 6;
const DATE_RAIL_FADE_WIDTH = 64;
const STREAK_PROGRESS_DAYS = 7;
const HOME_TASK_ITEM_SPACING = 8;
const HOME_METRICS_BOTTOM_GAP = 16;
const HOME_TASK_LIST_TOP_GAP = 16;
const HOME_CALENDAR_LIST_GAP = 20;
const HOME_ARCHIVE_PILL_TOP_GAP = 24;
const TASK_ROW_SIDE_BLEED = 8;
const HERO_HEADER_OVERLAP = 268;
const TASK_ROW_HORIZONTAL_PADDING = 12;
const CONTENT_STACK_GAP = 10;
const DATE_TRANSITION_DURATION = 250;
const DATE_RAIL_TITLE_TRANSITION_DURATION = 300;
const DATE_RAIL_TITLE_SCRUB_DURATION = 190;
const DATE_RAIL_TITLE_TRANSITION_DISTANCE = 10;
const DRAG_RAIL_HOVER_INTENT_MS = 80;
const HOME_TASK_INITIAL_REVEAL_DURATION_MS = 340;
const IOS_LIGHT_BASE_BACKGROUND = "#F2F2F7"; // systemGroupedBackground
const IOS_LIGHT_ELEVATED_SURFACE = "#FFFFFF"; // secondarySystemGroupedBackground
const IOS_LIGHT_INSET_SURFACE = "#EBEBF0"; // tertiarySystemFill-like
const IOS_LIGHT_SEPARATOR = "rgba(60, 60, 67, 0.22)"; // separator
const IOS_LIGHT_TINT_FILL = "rgba(118, 118, 128, 0.2)"; // quaternarySystemFill-like
// Customize task row surfaces here:
const HOME_TASK_ROW_SURFACE_LIGHT = IOS_LIGHT_ELEVATED_SURFACE;
const HOME_TASK_ROW_SURFACE_DARK = "rgba(35, 35, 35, 0.2)";
const HOME_ONBOARDING_KEYS = {
  gestures: "reminds.home.onboarding.gestures.v1",
  dragDropTargets: "reminds.home.onboarding.dragDropTargets.v1",
} as const;

let hasPlayedHomeInitialRevealThisSession = false;

const SECTION_ORDER: SectionId[] = ["today", "upcoming", "completed"];

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

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

const configureSmoothListLayoutTransition = (enabled: boolean = true) => {
  if (!enabled) return;
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
    if (task.section === "completed") {
      return task;
    }
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
  onPressStatus: () => void;
  onPressStreak: () => void;
};

type HomeMetricsTheme = {
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
  currentText: string;
  previousText: string | null;
  direction: 1 | -1;
  animationToken: number;
  phase: "idle" | "preparing" | "animating";
};
type DateSelectionSource =
  | "press"
  | "rail"
  | "swipe"
  | "momentum"
  | "picker"
  | "programmatic";

type DragSurfaceId = "today" | "upcoming";
type DragBounds = { x: number; y: number; width: number; height: number };

const isSameLocalMonth = (left: number, right: number) => {
  const l = new Date(left);
  const r = new Date(right);
  return l.getFullYear() === r.getFullYear() && l.getMonth() === r.getMonth();
};

function HomeMetricsGrid({
  animateValues,
  metricsAnimationCycle,
  metrics,
  styles,
  theme,
}: {
  animateValues: boolean;
  metricsAnimationCycle: number;
  metrics: HomeMetricsProps;
  styles: ReturnType<typeof createStyles>;
  theme: HomeMetricsTheme;
}) {
  const statusLabel = t("screen.status");
  const streakLabel = t("home.quick.streaks");
  const upperLocale = getIntlLocale();
  const statusLabelUpper = statusLabel.toLocaleUpperCase(upperLocale);
  const streakLabelUpper = streakLabel.toLocaleUpperCase(upperLocale);

  return (
    <View style={styles.metricsGridWrap}>
      <View style={styles.metricsGrid}>
        <Pressable
          android_ripple={ripple()}
          accessibilityRole="button"
          accessibilityLabel={`${statusLabel}: ${metrics.completionPercentage}%`}
          onPress={metrics.onPressStatus}
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
                  {statusLabelUpper}
                </Text>
              </View>
              <AnimatedNumber
                animateFromZeroOnMount
                formattedNumber={`${metrics.completionPercentage}%`}
                replayKey={metricsAnimationCycle}
                shouldAnimate={animateValues}
                textStyle={[
                  styles.metricsPrimaryValue,
                  { color: theme.primaryText },
                ]}
              />
            </View>
          </GlassSurface>
        </Pressable>

        <Pressable
          android_ripple={ripple()}
          accessibilityRole="button"
          accessibilityLabel={`${streakLabel}: ${metrics.currentStreak}`}
          onPress={metrics.onPressStreak}
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
                  {streakLabelUpper}
                </Text>
              </View>
              <AnimatedNumber
                animateFromZeroOnMount
                formattedNumber={`${metrics.currentStreak}`}
                replayKey={metricsAnimationCycle}
                shouldAnimate={animateValues}
                textStyle={[
                  styles.metricsPrimaryValue,
                  { color: theme.primaryText },
                ]}
              />
            </View>
          </GlassSurface>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (
  theme: ThemeName,
  dateRailItemWidth: number,
  calendarActiveColor: string,
) => {
  const isDark = theme === "dark";
  const useAppleLightPalette = !isDark && Platform.OS === "ios";
  const text = Colors[theme].text;

  // ─── Design Tokens ─────────────────────────────────
  const CALENDAR_ACCENT = calendarActiveColor;
  const DRAG_ACCENT = "#F4512C";
  const ALPHA_2 = 0.72; // secondary: subtitles, meta, icons
  const ALPHA_3 = 0.48; // tertiary: labels, section headers, hints
  const ALPHA_4 = 0.28; // quaternary: dividers, faint borders
  const WEIGHT_HERO = "900" as const;
  const WEIGHT_HEADING = "700" as const;
  const WEIGHT_BODY = "600" as const;
  const WEIGHT_SUBTLE = "500" as const;
  const RADIUS_TILE = 10;
  const RADIUS_CHIP = 6;
  const RADIUS_PILL = 999;
  // ───────────────────────────────────────────────────

  const hairline = isDark
    ? withAlpha(text, ALPHA_4)
    : useAppleLightPalette
      ? IOS_LIGHT_SEPARATOR
      : withAlpha(text, ALPHA_4);
  const rowCardSurface = isDark
    ? HOME_TASK_ROW_SURFACE_DARK
    : HOME_TASK_ROW_SURFACE_LIGHT;
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
      backgroundColor: "transparent",
    },
    content: {
      paddingHorizontal: GRID_HORIZONTAL_PADDING,
      paddingTop: 8,
      paddingBottom: 184,
      gap: CONTENT_STACK_GAP,
    },
    taskListContent: {
      paddingHorizontal: GRID_HORIZONTAL_PADDING,
      paddingTop: 8,
      paddingBottom: 184,
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
      paddingBottom: HOME_METRICS_BOTTOM_GAP,
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
      ...StyleSheet.absoluteFill,
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
      marginHorizontal: 0,
      marginTop: 0,
      marginBottom: HOME_CALENDAR_LIST_GAP,
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
    dateRailListContainer: {
      position: "relative",
    },
    dateRailCenterIndicator: {
      width: dateRailItemWidth,
      height: 64,
      borderRadius: 12,
      backgroundColor: CALENDAR_ACCENT,
    },
    dateRailMask: {
      height: 64,
      overflow: "hidden",
    },
    dateRailMaskedContent: {
      flex: 1,
      position: "relative",
    },
    dateRailTitleHost: {
      position: "relative",
      minHeight: 40,
      marginBottom: 10,
      justifyContent: "center",
      zIndex: 100,
    },
    dateRailTitleHostCollapsed: {
      marginBottom: 2,
    },
    dateRailHeadlineRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      width: "100%",
      paddingHorizontal: 12,
    },
    dateRailHeadlineTextHost: {
      flex: 1,
      minHeight: 24,
      justifyContent: "center",
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
      alignItems: "flex-start",
      justifyContent: "center",
    },
    dateRailTitleTextViewport: {
      height: 24,
      overflow: "hidden",
      alignItems: "flex-start",
      justifyContent: "center",
      position: "relative",
    },
    dateRailTitleTextTransitionHost: {
      height: 24,
      width: "100%",
      alignItems: "flex-start",
      justifyContent: "center",
      position: "relative",
    },
    dateRailTitleTextMeasure: {
      opacity: 0,
    },
    dateRailTitleTextTransitionText: {
      position: "absolute",
      top: 0,
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
    calendarButtonRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    calendarButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: heroCardBorder,
    },
    dateRailTitle: {
      fontSize: 18,
      lineHeight: 24,
      fontWeight: WEIGHT_HEADING,
      color: text,
      letterSpacing: 0.2,
      textAlign: "left",
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
      backgroundColor: "transparent",
    },
    dateRailDayDropCandidate: {
      borderWidth: 1.5,
      borderColor: withAlpha(CALENDAR_ACCENT, 0.92),
      backgroundColor: withAlpha(CALENDAR_ACCENT, isDark ? 0.16 : 0.14),
    },
    dateRailDayDropReady: {
      borderWidth: 2,
      borderColor: CALENDAR_ACCENT,
      backgroundColor: withAlpha(CALENDAR_ACCENT, isDark ? 0.16 : 0.12),
    },
    dateRailDaySelected: {
      backgroundColor: CALENDAR_ACCENT,
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
      color: CALENDAR_ACCENT,
    },
    dateRailDayNumWeekend: {
      color: withAlpha(text, ALPHA_3),
    },
    dateRailDayNumDropCandidate: {
      color: withAlpha(CALENDAR_ACCENT, 0.98),
    },
    dateRailDayNumDropReady: {
      color: withAlpha(CALENDAR_ACCENT, 0.98),
    },
    dateRailDow: {
      color: isDark ? "rgba(255,255,255,0.8)" : "#64748B",
      fontSize: 10,
      lineHeight: 12,
      fontWeight: WEIGHT_BODY,
      letterSpacing: 0.35,
      textTransform: "uppercase",
    },
    dateRailDowDropCandidate: {
      color: withAlpha(CALENDAR_ACCENT, 0.95),
    },
    dateRailDowDropReady: {
      color: withAlpha(CALENDAR_ACCENT, 0.95),
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
      borderColor: DRAG_ACCENT,
      backgroundColor: withAlpha(DRAG_ACCENT, isDark ? 0.08 : 0.05),
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
      marginTop: HOME_TASK_LIST_TOP_GAP,
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
      //letterSpacing: 0.8,
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
      ...StyleSheet.absoluteFill,
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
      textTransform: "uppercase" as const,
      color: isDark ? withAlpha(text, 0.7) : withAlpha(text, 0.5),
      maxWidth: 220,
    },
    emptyState: {
      minHeight: 188,
      paddingVertical: 40,
      paddingHorizontal: 16,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
    },
    emptyStateIcon: {
      opacity: 0.34,
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
      paddingTop: HOME_ARCHIVE_PILL_TOP_GAP,
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
  });
};

export default function HomeScreen() {
  return <TaskWorkspace title={t("common.today")} homeFilters><HomeContent /></TaskWorkspace>;
}

function HomeContent() {
  const openTask = useOpenTask();
  const navigation = useNavigation();
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const theme = useColorScheme() ?? "light";
  const isDark = theme === "dark";
  const useAppleLightPalette = !isDark && Platform.OS === "ios";
  const accessoryBridge = NativeModules.TaskAccessoryContextBridge as
    | TaskAccessoryContextBridge
    | undefined;
  const { setMode, setPresetDateStart, queueTaskPopIn } =
    useTaskCreateContext();
  const { accentColor, reduceMotionEnabled } = useAppSettings();
  const { width: viewportWidth, height: viewportHeight } = usePageDimensions();
  const isScreenFocusedRef = React.useRef(false);

  const [metricsAnimationCycle, setMetricsAnimationCycle] = React.useState(0);

  const showFloatingAddButton = Platform.OS === "ios" && !isIOS26OrNewer();
  const params = useLocalSearchParams<{
    sections?: string;
    withNotes?: string;
    withSubtasks?: string;
    completed?: string;
    projects?: string;
    routines?: string;
  }>();
  const enabledSections = React.useMemo(
    () => parseSectionsParam(params.sections),
    [params.sections],
  );
  const withNotesEnabled = params.withNotes === "1";
  const dateRailItemWidth = 46;
  const dateRailContainerWidthFallback =
    viewportWidth - GRID_HORIZONTAL_PADDING * 2;
  const [dateRailContainerWidth, setDateRailContainerWidth] = React.useState(
    dateRailContainerWidthFallback,
  );
  const dateRailSidePadding = Math.max(
    0,
    (dateRailContainerWidth - dateRailItemWidth) / 2,
  );
  const calendarActiveColor = React.useMemo(
    () => getAccentColorValue(accentColor),
    [accentColor],
  );
  const styles = React.useMemo(
    () => createStyles(theme, dateRailItemWidth, calendarActiveColor),
    [calendarActiveColor, dateRailItemWidth, theme],
  );
  const { tasks, setTasks, projects } = useTasksStore();
  const {
    enabledTags,
    showTagIcons,
    showCompactSubtasks,
    showProjectNames,
    showCompletedTasks,
    showProjectTasks,
    showRoutineTasks,
  } = useHomeFilters();
  const withSubtasksEnabled =
    params.withSubtasks === undefined
      ? showCompactSubtasks
      : params.withSubtasks === "1";
  const showCompletedTasksEnabled =
    params.completed === undefined
      ? showCompletedTasks
      : parseShowCompletedTasksParam(params.completed);
  const showProjectTasksEnabled =
    params.projects === undefined
      ? showProjectTasks
      : parseShowProjectTasksParam(params.projects);
  const showRoutineTasksEnabled =
    params.routines === undefined
      ? showRoutineTasks
      : parseShowRoutineTasksParam(params.routines);
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
    () => ({
      title: t("home.gestureHint.title"),
      body: t("home.gestureHint.body"),
      dismissLabel: t("home.gestureHint.dismiss"),
      dragToDate: t("home.gestureHint.dragToDate"),
      dragToUndated: t("home.gestureHint.dragToUndated"),
      monthPickerLabel: t("home.gestureHint.monthPicker"),
    }),
    [],
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
  const [displayedDateTitleDateStart, setDisplayedDateTitleDateStart] =
    React.useState(() => getStartOfToday());
  const setTodayAccessoryContext = React.useCallback(
    (dateStart: number) => {
      if (Platform.OS !== "ios" || !isIOS26OrNewer()) return;
      const setContext = accessoryBridge?.setContext;
      if (!setContext) return;
      try {
        (setContext as any)("today", null, null, dateStart);
      } catch {
        setContext("today", null, null);
      }
    },
    [accessoryBridge],
  );
  useFocusEffect(
    React.useCallback(() => {
      isScreenFocusedRef.current = true;
      setMode("today");
      setPresetDateStart(selectedDateStart);
      setTodayAccessoryContext(selectedDateStart);
      return () => {
        isScreenFocusedRef.current = false;
      };
    }, [
      selectedDateStart,
      setMode,
      setPresetDateStart,
      setTodayAccessoryContext,
    ]),
  );
  React.useEffect(() => {
    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (nextState !== "active" || !isScreenFocusedRef.current) return;
        setMetricsAnimationCycle((previous) => previous + 1);
      },
    );

    return () => {
      appStateSubscription.remove();
    };
  }, []);
  React.useEffect(() => {
    setPresetDateStart(selectedDateStart);
    setTodayAccessoryContext(selectedDateStart);
  }, [selectedDateStart, setPresetDateStart, setTodayAccessoryContext]);
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
  const homeTaskListRevealProgress = React.useRef(new Animated.Value(1)).current;
  const dateListTransitionHeight = React.useRef(new Animated.Value(0)).current;
  const dateRailTitleMotion = React.useRef(new Animated.Value(1)).current;
  const [, setIsDateListTransitioning] = React.useState(false);
  const [dateListTransitionState, setDateListTransitionState] =
    React.useState<DateListTransitionState | null>(null);
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
  const dateRailTitlePendingDurationRef = React.useRef<number | null>(null);
  const dateRailTitleDeferredRequestRef = React.useRef<{
    dateStart: number;
    title: string;
  } | null>(null);
  const dateRailMomentumActiveRef = React.useRef(false);
  const dateRailTitleAnimationRef =
    React.useRef<Animated.CompositeAnimation | null>(null);
  const dateListTransitionProgressAnimationRef =
    React.useRef<Animated.CompositeAnimation | null>(null);
  const homeTaskListRevealAnimationRef =
    React.useRef<Animated.CompositeAnimation | null>(null);
  const listTransitionRunningRef = React.useRef(false);
  const [homeTaskListRevealPhase, setHomeTaskListRevealPhase] =
    React.useState<"enter" | "exit">("enter");
  const lastAnimatedTitleDateRef = React.useRef(displayedDateTitleDateStart);
  const dateRailTitleTransitionStateRef =
    React.useRef<DateRailTitleTransitionState>({
      currentText: t("common.today"),
      previousText: null,
      direction: 1,
      animationToken: 0,
      phase: "idle",
    });
  const queuedDateStartRef = React.useRef<number | null>(null);
  const listDateStartRef = React.useRef(listDateStart);
  const selectedDateStartRef = React.useRef(selectedDateStart);
  const lastDateSelectionRequestRef = React.useRef<{
    dateStart: number;
    source: DateSelectionSource;
    at: number;
    direction: 1 | -1;
  } | null>(null);
  React.useEffect(() => {
    listDateStartRef.current = listDateStart;
  }, [listDateStart]);
  React.useEffect(() => {
    selectedDateStartRef.current = selectedDateStart;
  }, [selectedDateStart]);
  const stopHomeTaskListRevealAnimation = React.useCallback(() => {
    const runningAnimation = homeTaskListRevealAnimationRef.current;
    if (!runningAnimation) return;
    runningAnimation.stop();
    homeTaskListRevealAnimationRef.current = null;
  }, []);
  const animateHomeTaskListReveal = React.useCallback(
    (
      phase: "enter" | "exit",
      duration: number,
      onEnd?: (finished: boolean) => void,
    ) => {
      stopHomeTaskListRevealAnimation();
      setHomeTaskListRevealPhase(phase);

      if (reduceMotionEnabled) {
        homeTaskListRevealProgress.setValue(1);
        onEnd?.(true);
        return;
      }

      homeTaskListRevealProgress.setValue(0);
      const animation = Animated.timing(homeTaskListRevealProgress, {
        toValue: 1,
        duration,
        easing:
          phase === "enter"
            ? Easing.out(Easing.cubic)
            : Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      });
      homeTaskListRevealAnimationRef.current = animation;
      animation.start(({ finished }) => {
        if (homeTaskListRevealAnimationRef.current === animation) {
          homeTaskListRevealAnimationRef.current = null;
        }
        if (finished) {
          homeTaskListRevealProgress.setValue(1);
        }
        onEnd?.(finished);
      });
    },
    [
      homeTaskListRevealProgress,
      reduceMotionEnabled,
      stopHomeTaskListRevealAnimation,
    ],
  );
  React.useEffect(() => {
    return () => {
      stopHomeTaskListRevealAnimation();
    };
  }, [stopHomeTaskListRevealAnimation]);
  React.useEffect(() => {
    if (reduceMotionEnabled) {
      setHomeTaskListRevealPhase("enter");
      homeTaskListRevealProgress.setValue(1);
      hasPlayedHomeInitialRevealThisSession = true;
      return;
    }

    if (hasPlayedHomeInitialRevealThisSession) {
      homeTaskListRevealProgress.setValue(1);
      return;
    }

    hasPlayedHomeInitialRevealThisSession = true;
    animateHomeTaskListReveal("enter", HOME_TASK_INITIAL_REVEAL_DURATION_MS);
  }, [
    animateHomeTaskListReveal,
    homeTaskListRevealProgress,
    reduceMotionEnabled,
  ]);
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
  const [dragDetectedDateStart, setDragDetectedDateStart] = React.useState<
    number | null
  >(null);
  const [isDragOverCalendarHeader, setIsDragOverCalendarHeader] =
    React.useState(false);
  const [, setDragDropDebugReason] = React.useState("idle");
  const [, setActiveDragSurface] = React.useState<DragSurfaceId | null>(null);
  const dragContextRef = React.useRef<{
    taskId: string;
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
  const dragSurfaceResetFrameRef = React.useRef<number | null>(null);
  const dropCommitFrameRef = React.useRef<number | null>(null);
  const railBoundsMeasureFrameRef = React.useRef<number | null>(null);
  const upcomingSurfaceRef = React.useRef<View | null>(null);
  const upcomingSurfaceBoundsRef = React.useRef<DragBounds | null>(null);
  const todaySurfaceRef = React.useRef<View | null>(null);
  const todaySurfaceBoundsRef = React.useRef<DragBounds | null>(null);
  const isHoveringUpcomingDropZone = false;
  const isHoveringTodayDropZone = false;
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
      onPressStatus: () => router.push("/status"),
      onPressStreak: () => router.push("/home/streaks"),
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
  }, [isDark, useAppleLightPalette]);

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
  const [dateRailTitleTransitionState, setDateRailTitleTransitionState] =
    React.useState<DateRailTitleTransitionState>(() => ({
      currentText: getDynamicHeaderTitle(displayedDateTitleDateStart),
      previousText: null,
      direction: 1,
      animationToken: 0,
      phase: "idle",
    }));
  const updateDateRailTitleTransitionState = React.useCallback(
    (
      updater:
        | DateRailTitleTransitionState
        | ((
            current: DateRailTitleTransitionState,
          ) => DateRailTitleTransitionState),
    ) => {
      setDateRailTitleTransitionState((current) => {
        const next =
          typeof updater === "function"
            ? (
                updater as (
                  current: DateRailTitleTransitionState,
                ) => DateRailTitleTransitionState
              )(current)
            : updater;
        dateRailTitleTransitionStateRef.current = next;
        return current.currentText === next.currentText &&
          current.previousText === next.previousText &&
          current.direction === next.direction &&
          current.animationToken === next.animationToken &&
          current.phase === next.phase
          ? current
          : next;
      });
    },
    [],
  );
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: t("common.today") });
  }, [navigation]);

  const dateRailInitialIndex = DATE_RAIL_PAST_DAYS;
  const dateRailSnapInterval = React.useMemo(
    () => dateRailItemWidth + DATE_RAIL_ITEM_GAP,
    [dateRailItemWidth],
  );
  const dateRailRangeStart = React.useMemo(
    () => addDays(todayStart, -DATE_RAIL_PAST_DAYS),
    [todayStart],
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
          isToday: isSameLocalDay(timestamp, todayStart),
          isWeekend:
            new Date(timestamp).getDay() === 0 ||
            new Date(timestamp).getDay() === 6,
          eventCount,
        };
      },
    );
  }, [
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
  const clearDeferredDateRailTitle = React.useCallback(() => {
    dateRailTitleDeferredRequestRef.current = null;
  }, []);
  const stopDateRailTitleAnimation = React.useCallback(() => {
    const runningAnimation = dateRailTitleAnimationRef.current;
    if (!runningAnimation) return;
    runningAnimation.stop();
    dateRailTitleAnimationRef.current = null;
  }, []);
  const commitDateRailTitle = React.useCallback(
    (title: string, direction: 1 | -1) => {
      dateRailTitlePendingDurationRef.current = null;
      stopDateRailTitleAnimation();
      dateRailTitleMotion.stopAnimation();
      dateRailTitleMotion.setValue(1);
      updateDateRailTitleTransitionState((current) =>
        current.currentText === title &&
        current.previousText == null &&
        current.direction === direction &&
        current.phase === "idle"
          ? current
          : {
              currentText: title,
              previousText: null,
              direction,
              animationToken: current.animationToken,
              phase: "idle",
            },
      );
    },
    [
      dateRailTitleMotion,
      stopDateRailTitleAnimation,
      updateDateRailTitleTransitionState,
    ],
  );
  const resetDateRailTitleMotion = React.useCallback(() => {
    const current = dateRailTitleTransitionStateRef.current;
    commitDateRailTitle(current.currentText, current.direction);
  }, [commitDateRailTitle]);
  const animateDateRailTitle = React.useCallback(
    (nextTitle: string, direction: 1 | -1, source: DateSelectionSource) => {
      if (reduceMotionEnabled) {
        commitDateRailTitle(nextTitle, direction);
        return;
      }

      const duration =
        source === "rail"
          ? DATE_RAIL_TITLE_SCRUB_DURATION
          : source === "swipe"
            ? DATE_RAIL_TITLE_TRANSITION_DURATION - 24
            : DATE_RAIL_TITLE_TRANSITION_DURATION;

      dateRailTitlePendingDurationRef.current = null;
      stopDateRailTitleAnimation();
      dateRailTitleMotion.stopAnimation((motionValue) => {
        const current = dateRailTitleTransitionStateRef.current;
        const progress = clamp(motionValue, 0, 1);
        const outgoingVisibility =
          progress <= 0.78
            ? 1 - (progress / 0.78) * 0.76
            : Math.max(0, 0.24 - ((progress - 0.78) / 0.22) * 0.24);
        const incomingVisibility = progress;
        const visibleTitle =
          current.previousText != null &&
          outgoingVisibility > incomingVisibility
            ? current.previousText
            : current.currentText;

        if (visibleTitle === nextTitle) {
          commitDateRailTitle(nextTitle, direction);
          return;
        }

        dateRailTitlePendingDurationRef.current = duration;
        updateDateRailTitleTransitionState((currentState) => ({
          currentText: nextTitle,
          previousText: visibleTitle,
          direction,
          animationToken: currentState.animationToken + 1,
          phase: "preparing",
        }));
      });
    },
    [
      commitDateRailTitle,
      dateRailTitleMotion,
      reduceMotionEnabled,
      stopDateRailTitleAnimation,
      updateDateRailTitleTransitionState,
    ],
  );
  const flushDeferredDateRailTitle = React.useCallback(() => {
    const deferred = dateRailTitleDeferredRequestRef.current;
    if (!deferred) return;
    dateRailTitleDeferredRequestRef.current = null;

    const currentTitleDateStart = lastAnimatedTitleDateRef.current;
    if (isSameLocalDay(currentTitleDateStart, deferred.dateStart)) {
      commitDateRailTitle(
        deferred.title,
        deferred.dateStart >= currentTitleDateStart ? 1 : -1,
      );
      return;
    }

    const direction: 1 | -1 =
      deferred.dateStart >= currentTitleDateStart ? 1 : -1;
    lastAnimatedTitleDateRef.current = deferred.dateStart;
    animateDateRailTitle(deferred.title, direction, "rail");
  }, [animateDateRailTitle, commitDateRailTitle]);
  React.useLayoutEffect(() => {
    if (
      dateRailTitleTransitionState.phase !== "preparing" ||
      dateRailTitleTransitionState.previousText == null
    ) {
      return;
    }

    dateRailTitleMotion.stopAnimation();
    dateRailTitleMotion.setValue(0);
    updateDateRailTitleTransitionState((current) =>
      current.phase !== "preparing"
        ? current
        : {
            ...current,
            phase: "animating",
          },
    );
  }, [
    dateRailTitleMotion,
    dateRailTitleTransitionState.animationToken,
    dateRailTitleTransitionState.phase,
    dateRailTitleTransitionState.previousText,
    updateDateRailTitleTransitionState,
  ]);

  React.useLayoutEffect(() => {
    const duration = dateRailTitlePendingDurationRef.current;
    if (
      duration == null ||
      dateRailTitleTransitionState.phase !== "animating" ||
      dateRailTitleTransitionState.previousText == null
    ) {
      return;
    }

    stopDateRailTitleAnimation();
    const animation = Animated.timing(dateRailTitleMotion, {
      toValue: 1,
      duration,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    });
    dateRailTitleAnimationRef.current = animation;
    animation.start(({ finished }) => {
      if (dateRailTitleAnimationRef.current === animation) {
        dateRailTitleAnimationRef.current = null;
      }
      if (!finished) return;
      dateRailTitlePendingDurationRef.current = null;
      updateDateRailTitleTransitionState((current) =>
        current.previousText == null
          ? current
          : {
              ...current,
              previousText: null,
              phase: "idle",
            },
      );
    });
    return () => {
      if (dateRailTitleAnimationRef.current === animation) {
        animation.stop();
        dateRailTitleAnimationRef.current = null;
      }
    };
  }, [
    dateRailTitleMotion,
    dateRailTitleTransitionState.animationToken,
    dateRailTitleTransitionState.phase,
    dateRailTitleTransitionState.previousText,
    stopDateRailTitleAnimation,
    updateDateRailTitleTransitionState,
  ]);
  React.useEffect(() => {
    const nextTitle = getDynamicHeaderTitle(displayedDateTitleDateStart);
    if (
      isSameLocalDay(
        lastAnimatedTitleDateRef.current,
        displayedDateTitleDateStart,
      )
    ) {
      clearDeferredDateRailTitle();
      const current = dateRailTitleTransitionStateRef.current;
      if (current.currentText !== nextTitle || current.previousText != null) {
        commitDateRailTitle(nextTitle, current.direction);
      }
      return;
    }
    const lastRequest = lastDateSelectionRequestRef.current;
    const source =
      lastRequest &&
      isSameLocalDay(lastRequest.dateStart, displayedDateTitleDateStart)
        ? lastRequest.source
        : "programmatic";
    if (source === "rail") {
      dateRailTitleDeferredRequestRef.current = {
        dateStart: displayedDateTitleDateStart,
        title: nextTitle,
      };
      return;
    }

    const previousDateStart = lastAnimatedTitleDateRef.current;
    lastAnimatedTitleDateRef.current = displayedDateTitleDateStart;
    const direction =
      lastRequest &&
      isSameLocalDay(lastRequest.dateStart, displayedDateTitleDateStart)
        ? lastRequest.direction
        : displayedDateTitleDateStart >= previousDateStart
          ? 1
          : -1;
    clearDeferredDateRailTitle();
    animateDateRailTitle(nextTitle, direction, source);
  }, [
    animateDateRailTitle,
    clearDeferredDateRailTitle,
    commitDateRailTitle,
    displayedDateTitleDateStart,
    getDynamicHeaderTitle,
  ]);
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
      stopHomeTaskListRevealAnimation();
      homeTaskListRevealProgress.setValue(1);
      resetDateListMotion();
      if (!preserveTitleMotion) {
        resetDateRailTitleMotion();
      }
      resetDateListTransitionMotion();
      if (animateLayout) {
        configureSmoothListLayoutTransition(!reduceMotionEnabled);
      }
      setListDateStart(nextDateStart);
      listDateStartRef.current = nextDateStart;
    },
    [
      cancelDateListTransitionStart,
      homeTaskListRevealProgress,
      resetDateListMotion,
      resetDateListTransitionMotion,
      resetDateRailTitleMotion,
      reduceMotionEnabled,
      stopHomeTaskListRevealAnimation,
    ],
  );
  const applyDayChangeWithoutTransition = React.useCallback(
    (nextDateStart: number, direction: 1 | -1) => {
      const nextTitle = getDynamicHeaderTitle(nextDateStart);
      clearDeferredDateRailTitle();
      lastAnimatedTitleDateRef.current = nextDateStart;
      commitDateRailTitle(nextTitle, direction);
      setDisplayedDateTitleDateStart(nextDateStart);
      setListDateWithoutTransition(nextDateStart, false, true);
    },
    [
      clearDeferredDateRailTitle,
      commitDateRailTitle,
      getDynamicHeaderTitle,
      setListDateWithoutTransition,
    ],
  );
  const runDateListTransition = React.useCallback(
    (nextDateStart: number, direction: 1 | -1) => {
      if (nextDateStart === listDateStartRef.current) return;
      applyDayChangeWithoutTransition(nextDateStart, direction);
    },
    [applyDayChangeWithoutTransition],
  );
  const isTaskVisibleByTypeToggle = React.useCallback(
    (task: Task) => {
      const hasProject = typeof task.projectId === "string" && task.projectId.trim().length > 0;
      const isRoutineTask =
        task.isRoutine === true ||
        typeof task.routineType === "string" ||
        typeof task.routineInterval === "string";

      if (!showProjectTasksEnabled && hasProject) return false;
      if (!showRoutineTasksEnabled && isRoutineTask) return false;
      return true;
    },
    [showProjectTasksEnabled, showRoutineTasksEnabled],
  );
  const hasVisibleTasksForDateStart = React.useCallback(
    (targetDateStart: number) => {
      const targetIsToday = isSameLocalDay(targetDateStart, todayStart);
      for (const task of tasks) {
        if (task.deletedAt) continue;
        if (withNotesEnabled && !task.subtitle) continue;
        if (!isTaskVisibleByTypeToggle(task)) continue;

        const isCompletedOnTargetDay =
          hasValidDueAt(task.completedAt) &&
          isSameLocalDay(task.completedAt, targetDateStart);
        if (isCompletedOnTargetDay) {
          if (showCompletedTasksEnabled) return true;
          continue;
        }

        const normalizedSection: SectionId =
          task.section === "completed"
            ? "completed"
            : deriveActiveSectionFromDueAt(task.dueAt);
        if (!homeEnabledSections.includes(normalizedSection)) continue;
        if (!hasValidDueAt(task.dueAt)) {
          if (normalizedSection === "today" && targetIsToday) {
            return true;
          }
          continue;
        }
        if (isSameLocalDay(task.dueAt, targetDateStart)) {
          return true;
        }
      }
      return false;
    },
    [
      homeEnabledSections,
      isTaskVisibleByTypeToggle,
      showCompletedTasksEnabled,
      tasks,
      todayStart,
      withNotesEnabled,
    ],
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
      const direction: 1 | -1 =
        directionHint ?? (nextDateStart > current ? 1 : -1);
      lastDateSelectionRequestRef.current = {
        dateStart: nextDateStart,
        source,
        at: now,
        direction,
      };
      const fromHasVisibleTasks = hasVisibleTasksForDateStart(
        listDateStartRef.current,
      );
      const toHasVisibleTasks = hasVisibleTasksForDateStart(nextDateStart);
      selectedDateStartRef.current = nextDateStart;
      setPresetDateStart(nextDateStart);
      setSelectedDateStart(nextDateStart);
      if (reduceMotionEnabled) {
        applyDayChangeWithoutTransition(nextDateStart, direction);
        triggerSelectionHaptic();
        return;
      }
      if (!fromHasVisibleTasks && !toHasVisibleTasks) {
        applyDayChangeWithoutTransition(nextDateStart, direction);
        triggerSelectionHaptic();
        return;
      }
      runDateListTransition(nextDateStart, direction);
      triggerSelectionHaptic();
    },
    [
      applyDayChangeWithoutTransition,
      hasVisibleTasksForDateStart,
      reduceMotionEnabled,
      runDateListTransition,
      setPresetDateStart,
    ],
  );
  const selectDateWithoutTransition = React.useCallback(
    (nextDateStart: number, source: DateSelectionSource = "programmatic") => {
      const current = selectedDateStartRef.current;
      if (isSameLocalDay(current, nextDateStart)) return;
      const direction: 1 | -1 = nextDateStart >= current ? 1 : -1;
      lastDateSelectionRequestRef.current = {
        dateStart: nextDateStart,
        source,
        at: Date.now(),
        direction,
      };
      selectedDateStartRef.current = nextDateStart;
      setPresetDateStart(nextDateStart);
      setSelectedDateStart(nextDateStart);
      applyDayChangeWithoutTransition(nextDateStart, direction);
    },
    [applyDayChangeWithoutTransition, setPresetDateStart],
  );
  React.useEffect(
    () => () => {
      cancelDateListTransitionStart();
      clearDeferredDateRailTitle();
      resetDateListMotion();
      resetDateRailTitleMotion();
      resetDateListTransitionMotion();
      dateRailTitlePendingDurationRef.current = null;
      dateRailMomentumActiveRef.current = false;
      stopDateRailTitleAnimation();
      todayCollapseAnimationRef.current?.stop();
      upcomingCollapseAnimationRef.current?.stop();
    },
    [
      cancelDateListTransitionStart,
      clearDeferredDateRailTitle,
      resetDateListTransitionMotion,
      resetDateListMotion,
      resetDateRailTitleMotion,
      stopDateRailTitleAnimation,
    ],
  );
  const handleSelectDate = React.useCallback(
    (timestamp: number, source: DateSelectionSource = "press") => {
      const current = selectedDateStartRef.current;
      const directionHint: 1 | -1 = timestamp >= current ? 1 : -1;
      selectDateWithTransition(timestamp, directionHint, source);
    },
    [selectDateWithTransition],
  );

  const getDateRailItemLayout = React.useCallback(
    (_: ArrayLike<DateRailDay> | null | undefined, index: number) => ({
      length: dateRailItemWidth,
      offset: dateRailSidePadding + dateRailSnapInterval * index,
      index,
    }),
    [dateRailItemWidth, dateRailSidePadding, dateRailSnapInterval],
  );

  const dateRailScrollX = React.useRef(
    new Animated.Value(dateRailInitialIndex * dateRailSnapInterval),
  ).current;
  const dateRailRef = React.useRef<FlatList<DateRailDay> | any>(null);
  const dateRailWrapRef = React.useRef<View | null>(null);
  const dateRailListRef = React.useRef<View | null>(null);
  const dateRailBoundsRef = React.useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const dateRailListBoundsRef = React.useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const dateRailScrollOffsetRef = React.useRef(
    dateRailInitialIndex * dateRailSnapInterval,
  );
  const dateRailDraggedRef = React.useRef(false);
  const dateRailLastCenterIndexRef = React.useRef(dateRailInitialIndex);
  const dateRailSelectionLockTargetIndexRef = React.useRef<number | null>(null);
  const dateRailSelectionLockUntilRef = React.useRef(0);
  const dateRailSyncPrimaryRafRef = React.useRef<number | null>(null);
  const dateRailSyncSecondaryRafRef = React.useRef<number | null>(null);
  const dateRailSyncTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const getDateRailIndexForDateStart = React.useCallback(
    (targetDateStart: number) => {
      const targetIndex = dateRailDays.findIndex((day) =>
        isSameLocalDay(day.timestamp, targetDateStart),
      );
      return targetIndex >= 0 ? targetIndex : dateRailInitialIndex;
    },
    [dateRailDays, dateRailInitialIndex],
  );
  const scrollDateRailToDateStart = React.useCallback(
    (
      targetDateStart: number,
      animated = false,
      lockSelectionDuringScroll = false,
    ) => {
      const targetIndex = getDateRailIndexForDateStart(targetDateStart);

      const shouldLockSelection =
        lockSelectionDuringScroll &&
        animated &&
        targetIndex !== dateRailLastCenterIndexRef.current;
      if (shouldLockSelection) {
        dateRailSelectionLockTargetIndexRef.current = targetIndex;
        dateRailSelectionLockUntilRef.current = Date.now() + 800;
      } else {
        dateRailSelectionLockTargetIndexRef.current = null;
        dateRailSelectionLockUntilRef.current = 0;
      }

      dateRailLastCenterIndexRef.current = targetIndex;
      const targetOffset = targetIndex * dateRailSnapInterval;
      dateRailScrollOffsetRef.current = targetOffset;
      dateRailRef.current?.scrollToOffset?.({
        offset: targetOffset,
        animated,
      });
      return true;
    },
    [dateRailSnapInterval, getDateRailIndexForDateStart],
  );
  const handleJumpToToday = React.useCallback(
    (source: DateSelectionSource = "programmatic") => {
      const todayDateStart = getStartOfToday();
      scrollDateRailToDateStart(todayDateStart, true, true);
      handleSelectDate(todayDateStart, source);
    },
    [handleSelectDate, scrollDateRailToDateStart],
  );
  const syncDateRailToSelectedDate = React.useCallback(() => {
    // Never fight an active drag or fling; the rail already tracks the finger.
    if (dateRailDraggedRef.current || dateRailMomentumActiveRef.current) return;
    const targetIndex = getDateRailIndexForDateStart(selectedDateStartRef.current);
    const targetOffset = targetIndex * dateRailSnapInterval;
    dateRailSelectionLockTargetIndexRef.current = null;
    dateRailSelectionLockUntilRef.current = 0;
    dateRailLastCenterIndexRef.current = targetIndex;
    dateRailScrollOffsetRef.current = targetOffset;
    dateRailScrollX.stopAnimation();
    dateRailScrollX.setValue(targetOffset);
    dateRailRef.current?.scrollToOffset?.({
      offset: targetOffset,
      animated: false,
    });
  }, [dateRailScrollX, dateRailSnapInterval, getDateRailIndexForDateStart]);
  const clearScheduledDateRailSync = React.useCallback(() => {
    if (dateRailSyncPrimaryRafRef.current != null) {
      cancelAnimationFrame(dateRailSyncPrimaryRafRef.current);
      dateRailSyncPrimaryRafRef.current = null;
    }
    if (dateRailSyncSecondaryRafRef.current != null) {
      cancelAnimationFrame(dateRailSyncSecondaryRafRef.current);
      dateRailSyncSecondaryRafRef.current = null;
    }
    if (dateRailSyncTimeoutRef.current != null) {
      clearTimeout(dateRailSyncTimeoutRef.current);
      dateRailSyncTimeoutRef.current = null;
    }
  }, []);
  const scheduleDateRailSyncToSelectedDate = React.useCallback(() => {
    clearScheduledDateRailSync();
    syncDateRailToSelectedDate();
    dateRailSyncPrimaryRafRef.current = requestAnimationFrame(() => {
      dateRailSyncPrimaryRafRef.current = null;
      syncDateRailToSelectedDate();
      dateRailSyncSecondaryRafRef.current = requestAnimationFrame(() => {
        dateRailSyncSecondaryRafRef.current = null;
        syncDateRailToSelectedDate();
      });
    });
    dateRailSyncTimeoutRef.current = setTimeout(() => {
      dateRailSyncTimeoutRef.current = null;
      syncDateRailToSelectedDate();
    }, 140);
  }, [clearScheduledDateRailSync, syncDateRailToSelectedDate]);
  const handleDateRailScrollToIndexFailed = React.useCallback(() => {
    requestAnimationFrame(() => {
      scheduleDateRailSyncToSelectedDate();
    });
  }, [scheduleDateRailSyncToSelectedDate]);
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
  const measureDateRailListBounds = React.useCallback(() => {
    const node =
      // @ts-ignore - some refs expose getNode
      dateRailListRef.current?.getNode?.() ?? dateRailListRef.current;
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
        dateRailListBoundsRef.current = { x, y, width, height };
      },
    );
  }, []);
  const scheduleMeasureDateRailListBounds = React.useCallback(() => {
    if (railBoundsMeasureFrameRef.current != null) return;
    railBoundsMeasureFrameRef.current = requestAnimationFrame(() => {
      railBoundsMeasureFrameRef.current = null;
      measureDateRailBounds();
      measureDateRailListBounds();
    });
  }, [measureDateRailBounds, measureDateRailListBounds]);
  const handleDateRailScroll = React.useMemo(
    () =>
      Animated.event(
        [{ nativeEvent: { contentOffset: { x: dateRailScrollX } } }],
        {
          useNativeDriver: true,
          listener: (event: any) => {
            const nextOffset = event.nativeEvent.contentOffset.x;
            if (typeof nextOffset !== "number" || !Number.isFinite(nextOffset))
              return;
            dateRailScrollOffsetRef.current = nextOffset;
            const centerIndex = Math.round(nextOffset / dateRailSnapInterval);
            const nextIndex = clamp(centerIndex, 0, dateRailDays.length - 1);
            const isUserDrivenScroll =
              dateRailDraggedRef.current || dateRailMomentumActiveRef.current;
            const lockedTargetIndex =
              dateRailSelectionLockTargetIndexRef.current;
            if (!isUserDrivenScroll && lockedTargetIndex == null) {
              return;
            }
            if (lockedTargetIndex != null) {
              const lockActive =
                Date.now() <= dateRailSelectionLockUntilRef.current;
              if (nextIndex !== lockedTargetIndex && lockActive) {
                return;
              }
              dateRailSelectionLockTargetIndexRef.current = null;
              dateRailSelectionLockUntilRef.current = 0;
            }
            if (nextIndex !== dateRailLastCenterIndexRef.current) {
              dateRailLastCenterIndexRef.current = nextIndex;
              triggerSelectionHaptic();
            }
            const nextDay = dateRailDays[nextIndex];
            if (nextDay) {
              selectDateWithoutTransition(nextDay.timestamp, "rail");
            }
          },
        },
      ),
    [
      dateRailDays,
      dateRailScrollX,
      dateRailSnapInterval,
      selectDateWithoutTransition,
    ],
  );
  const handleDateRailScrollBeginDrag = React.useCallback(() => {
    dateRailDraggedRef.current = true;
    dateRailMomentumActiveRef.current = false;
    dateRailSelectionLockTargetIndexRef.current = null;
    dateRailSelectionLockUntilRef.current = 0;
  }, []);
  const handleDateRailScrollEndDrag = React.useCallback(() => {
    dateRailDraggedRef.current = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (dateRailMomentumActiveRef.current) return;
        flushDeferredDateRailTitle();
      });
    });
  }, [flushDeferredDateRailTitle]);
  const handleDateRailMomentumBegin = React.useCallback(() => {
    dateRailMomentumActiveRef.current = true;
  }, []);

  const handleDateRailMomentumEnd = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      dateRailDraggedRef.current = false;
      dateRailMomentumActiveRef.current = false;
      const offset = event.nativeEvent.contentOffset.x;
      dateRailScrollOffsetRef.current = offset;
      dateRailSelectionLockTargetIndexRef.current = null;
      dateRailSelectionLockUntilRef.current = 0;
      flushDeferredDateRailTitle();
    },
    [flushDeferredDateRailTitle],
  );
  React.useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      measureDateRailBounds();
      measureDateRailListBounds();
      scheduleDateRailSyncToSelectedDate();
    });
    return () => {
      cancelAnimationFrame(rafId);
      clearScheduledDateRailSync();
      if (railBoundsMeasureFrameRef.current != null) {
        cancelAnimationFrame(railBoundsMeasureFrameRef.current);
        railBoundsMeasureFrameRef.current = null;
      }
    };
  }, [
    clearScheduledDateRailSync,
    dateRailContainerWidth,
    dateRailSidePadding,
    measureDateRailBounds,
    measureDateRailListBounds,
    scheduleDateRailSyncToSelectedDate,
    viewportHeight,
    viewportWidth,
  ]);

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
      if (reduceMotionEnabled) {
        value.setValue(toCollapsed ? 1 : 0);
        animationRef.current = null;
        return;
      }
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
    [reduceMotionEnabled],
  );
  React.useEffect(() => {
    setHomeDayPickerHandler((dateStart) => {
      scrollDateRailToDateStart(dateStart, true, true);
      handleSelectDate(dateStart, "picker");
    });
    return () => setHomeDayPickerHandler(null);
  }, [handleSelectDate, scrollDateRailToDateStart]);
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
  const clearDateRailHover = React.useCallback(() => {
    dragRailHoverIntentRef.current = { dateStart: null, enteredAt: 0 };
    dragHoverDateStartRef.current = null;
    setDragHoveredDateStart((current) => (current == null ? current : null));
    setDragDetectedDateStart((current) => (current == null ? current : null));
  }, []);
  const clearDateDragHover = React.useCallback(() => {
    clearDateRailHover();
    setIsDragOverCalendarHeader(false);
    setDragDropDebugReason("idle");
  }, [clearDateRailHover]);
  const getTouchPointFromEvent = React.useCallback(
    (event: GestureResponderEvent) => {
      const touch =
        event.nativeEvent.touches?.[0] ?? event.nativeEvent.changedTouches?.[0];
      if (!touch) return null;
      if (!Number.isFinite(touch.pageX) || !Number.isFinite(touch.pageY)) {
        return null;
      }
      return {
        x: touch.pageX,
        y: touch.pageY,
      };
    },
    [],
  );
  const updateDateRailDragHoverFromPoint = React.useCallback(
    (
      point: { x: number; y: number },
      options?: { force?: boolean; source?: "touch" | "gesture" },
    ) => {
      scheduleMeasureDateRailListBounds();
      const force = options?.force === true;
      const source = options?.source ?? "touch";
      const headerBounds = dateRailBoundsRef.current;
      const shouldTrackHeader =
        !!dragContextRef.current && (force || listDragActiveRef.current);
      const isInsideCalendarHeader =
        shouldTrackHeader &&
        !!headerBounds &&
        point.x >= headerBounds.x &&
        point.x <= headerBounds.x + headerBounds.width &&
        point.y >= headerBounds.y &&
        point.y <= headerBounds.y + headerBounds.height;
      setIsDragOverCalendarHeader((current) =>
        current === isInsideCalendarHeader ? current : isInsideCalendarHeader,
      );
      if (!dragContextRef.current) {
        setDragDropDebugReason(`${source}-no-context`);
        return;
      }
      if (!force && !listDragActiveRef.current) {
        setDragDropDebugReason(`${source}-not-dragging`);
        return;
      }
      const bounds = dateRailListBoundsRef.current;
      if (!bounds) {
        setDragDropDebugReason(`${source}-no-rail-bounds`);
        return;
      }

      const isInsideDayRail =
        point.x >= bounds.x &&
        point.x <= bounds.x + bounds.width &&
        point.y >= bounds.y &&
        point.y <= bounds.y + bounds.height;
      if (!isInsideDayRail) {
        dragLastRailDateStartRef.current = null;
        clearDateRailHover();
        setDragDropDebugReason(`${source}-outside-rail`);
        return;
      }

      const localX = point.x - bounds.x;
      const contentX =
        dateRailScrollOffsetRef.current + localX - dateRailSidePadding;
      const targetIndex = clamp(
        Math.round(contentX / dateRailSnapInterval),
        0,
        dateRailDays.length - 1,
      );
      const targetDateStart = dateRailDays[targetIndex]?.timestamp;
      if (!Number.isFinite(targetDateStart)) {
        setDragDropDebugReason(`${source}-invalid-target`);
        return;
      }

      const previousDateStart = dragLastRailDateStartRef.current;
      if (previousDateStart !== targetDateStart) {
        triggerSelectionHaptic();
      }
      dragLastRailDateStartRef.current = targetDateStart;
      setDragDetectedDateStart((current) =>
        current === targetDateStart ? current : targetDateStart,
      );
      setDragDropDebugReason(
        force ? `${source}-inside-force` : `${source}-inside`,
      );
      const now = Date.now();
      const currentIntent = dragRailHoverIntentRef.current;

      if (force) {
        if (currentIntent.dateStart !== targetDateStart) {
          dragRailHoverIntentRef.current = {
            dateStart: targetDateStart,
            enteredAt: now,
          };
        }
        dragHoverDateStartRef.current = targetDateStart;
        setDragHoveredDateStart((current) =>
          current === targetDateStart ? current : targetDateStart,
        );
        return;
      }

      if (currentIntent.dateStart !== targetDateStart) {
        dragRailHoverIntentRef.current = {
          dateStart: targetDateStart,
          enteredAt: now,
        };
        dragHoverDateStartRef.current = null;
        setDragHoveredDateStart((current) =>
          current == null ? current : null,
        );
        return;
      }

      if (now - currentIntent.enteredAt < DRAG_RAIL_HOVER_INTENT_MS) return;

      dragHoverDateStartRef.current = targetDateStart;
      setDragHoveredDateStart((current) =>
        current === targetDateStart ? current : targetDateStart,
      );
    },
    [
      clearDateRailHover,
      dateRailDays,
      dateRailSidePadding,
      dateRailSnapInterval,
      scheduleMeasureDateRailListBounds,
    ],
  );
  const updateDateRailDragHoverFromTouch = React.useCallback(
    (event: GestureResponderEvent, options?: { force?: boolean }) => {
      const point = getTouchPointFromEvent(event);
      if (!point) {
        setDragDropDebugReason("touch-no-touch-point");
        return;
      }
      updateDateRailDragHoverFromPoint(point, {
        force: options?.force,
        source: "touch",
      });
    },
    [getTouchPointFromEvent, updateDateRailDragHoverFromPoint],
  );
  const handleDragGestureUpdate = React.useCallback(
    (params: TaskDragGestureUpdateParams) => {
      const { absoluteX, absoluteY, phase } = params;
      if (!Number.isFinite(absoluteX) || !Number.isFinite(absoluteY)) {
        setDragDropDebugReason("gesture-invalid-point");
        return;
      }
      updateDateRailDragHoverFromPoint(
        { x: absoluteX, y: absoluteY },
        { source: "gesture", force: phase === "end" },
      );
    },
    [updateDateRailDragHoverFromPoint],
  );
  const handleListDragTouchMove = React.useCallback(
    (event: GestureResponderEvent) => {
      updateDateRailDragHoverFromTouch(event);
    },
    [updateDateRailDragHoverFromTouch],
  );
  const handleListDragTouchEnd = React.useCallback(
    (event: GestureResponderEvent) => {
      updateDateRailDragHoverFromTouch(event, { force: true });
    },
    [updateDateRailDragHoverFromTouch],
  );
  const handleListDragTouchCancel = React.useCallback(() => {
    if (!dragContextRef.current) return;
    dragLastRailDateStartRef.current = null;
    clearDateDragHover();
  }, [clearDateDragHover]);
  const handleGlobalDragTouchMove = React.useCallback(
    (event: GestureResponderEvent) => {
      if (!listDragActiveRef.current || !dragContextRef.current) return;
      updateDateRailDragHoverFromTouch(event);
    },
    [updateDateRailDragHoverFromTouch],
  );
  const handleGlobalDragTouchEnd = React.useCallback(
    (event: GestureResponderEvent) => {
      if (!dragContextRef.current) return;
      updateDateRailDragHoverFromTouch(event, { force: true });
    },
    [updateDateRailDragHoverFromTouch],
  );
  const handleGlobalDragTouchCancel = React.useCallback(() => {
    if (!dragContextRef.current) return;
    dragLastRailDateStartRef.current = null;
    clearDateDragHover();
  }, [clearDateDragHover]);
  const handleTaskListScrollOffsetChange = React.useCallback(
    (_scrollOffset: number) => {
      if (!dragContextRef.current && !listDragActiveRef.current) return;
      scheduleMeasureDateRailListBounds();
    },
    [scheduleMeasureDateRailListBounds],
  );

  const closeAnyOpen = React.useCallback(() => {
    todayListRef.current?.closeAnyOpen();
    upcomingListRef.current?.closeAnyOpen();
  }, []);
  const handleSwipeStateChange = React.useCallback((isSwiping: boolean) => {
    swipeGestureActiveRef.current = isSwiping;
  }, []);

  const handleRowTouchStateChange = React.useCallback(
    (isTouchingRow: boolean) => {
      rowTouchActiveRef.current = isTouchingRow;
      if (isTouchingRow && listTouchStartRef.current.active) {
        listTouchStartRef.current.startedOnRow = true;
      }
    },
    [],
  );

  const handleDragStateChange = React.useCallback(
    (isDragging: boolean) => {
      listDragActiveRef.current = isDragging;
      if (isDragging) {
        cancelDragSurfaceResetFrame();
        measureDateRailBounds();
        measureDateRailListBounds();
        return;
      }
      cancelDragSurfaceResetFrame();
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
      measureDateRailBounds,
      measureDateRailListBounds,
    ],
  );

  const shiftSelectedDateBySwipe = React.useCallback(
    (delta: 1 | -1) => {
      const next = addDays(selectedDateStartRef.current, delta);
      scrollDateRailToDateStart(next, !reduceMotionEnabled, true);
      selectDateWithTransition(next, delta > 0 ? 1 : -1, "swipe");
    },
    [reduceMotionEnabled, scrollDateRailToDateStart, selectDateWithTransition],
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
      const targetIsToday = isSameLocalDay(targetDateStart, todayStart);
      const base = tasks.filter((t) => {
        if (t.deletedAt) return false;
        if (withNotesEnabled && !t.subtitle) return false;
        if (!isTaskVisibleByTypeToggle(t)) return false;

        const isCompletedOnTargetDay =
          hasValidDueAt(t.completedAt) &&
          isSameLocalDay(t.completedAt, targetDateStart);
        if (isCompletedOnTargetDay) return true;

        const normalizedSection: SectionId =
          t.section === "completed"
            ? "completed"
            : deriveActiveSectionFromDueAt(t.dueAt);
        if (!homeEnabledSections.includes(normalizedSection)) return false;

        const dueAtIsValid = hasValidDueAt(t.dueAt);

        if (!dueAtIsValid) {
          // Keep legacy "today" tasks visible on today even if dueAt is missing.
          return normalizedSection === "today" && targetIsToday;
        }

        return isSameLocalDay(t.dueAt, targetDateStart);
      });
      const normalizedBase = base.map((task) => {
        const isCompletedOnTargetDay =
          hasValidDueAt(task.completedAt) &&
          isSameLocalDay(task.completedAt, targetDateStart);
        if (isCompletedOnTargetDay) {
          return task.section === "completed"
            ? task
            : { ...task, section: "completed" as const };
        }
        if (task.section === "completed") return task;
        const normalizedSection = deriveActiveSectionFromDueAt(task.dueAt);
        return task.section === normalizedSection
          ? task
          : { ...task, section: normalizedSection };
      });
      return normalizedBase;
    },
    [homeEnabledSections, isTaskVisibleByTypeToggle, tasks, todayStart, withNotesEnabled],
  );
  const getDisplayedTasksForDateStart = React.useCallback(
    (targetDateStart: number) => {
      const allTasksForDay = getVisibleTasksForDateStart(targetDateStart);
      if (showCompletedTasksEnabled) return allTasksForDay;
      return allTasksForDay.filter((task) => task.section !== "completed");
    },
    [getVisibleTasksForDateStart, showCompletedTasksEnabled],
  );
  const visibleTasks = React.useMemo(
    () => getDisplayedTasksForDateStart(listDateStart),
    [getDisplayedTasksForDateStart, listDateStart],
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
  const visibleSections = React.useMemo(() => {
    const sections: SectionId[] = ["today"];
    if (showCompletedTasksEnabled && tasksBySection.completed.length > 0) {
      sections.push("completed");
    }
    return sections;
  }, [showCompletedTasksEnabled, tasksBySection.completed.length]);

  const firstVisibleSection = visibleSections[0] ?? "today";

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
          // No section in the key: a row dragged into another section must
          // keep its cell, otherwise it remounts (and flashes) on drop.
          key: `task-${task.id}:${task.completedAt ?? 0}:${
            task.deletedAt ?? 0
          }`,
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
  const hasVisibleTasks = visibleTasks.length > 0;
  const calendarEmptyState = React.useMemo(
    () => (
      <View style={styles.emptyState}>
        <MaterialIcons
          name="event-busy"
          size={32}
          color={withAlpha(Colors[theme].text, 0.36)}
          style={styles.emptyStateIcon}
        />
        <Text style={styles.emptyText}>{t("home.empty.noTasks")}</Text>
      </View>
    ),
    [styles, theme],
  );
  const dateListTransitionData = React.useMemo(() => {
    if (!dateListTransitionState) return null;
    const fromVisibleTasks = getDisplayedTasksForDateStart(
      dateListTransitionState.fromDateStart,
    );
    const toVisibleTasks = getDisplayedTasksForDateStart(
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
  }, [dateListTransitionState, getDisplayedTasksForDateStart]);
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
            const shouldAdjustSectionData =
              reorderedVisibleSet.has(id) &&
              deriveHomeDisplaySection(existing, listDateStart) !== sectionId;
            const moved = shouldAdjustSectionData
              ? adjustDueAtOnSectionChange(existing, sectionId, listDateStart)
              : existing;
            const nextOrderRank = (index + 1) * 1000;
            // Keep untouched tasks referentially stable so their rows skip
            // re-rendering in the drop commit.
            if (moved === existing && existing.orderRank === nextOrderRank) {
              return;
            }
            nextById.set(id, { ...moved, orderRank: nextOrderRank });
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
      dragLastRailDateStartRef.current = null;
      dragContextRef.current = {
        taskId,
      };
      dragStartPointRef.current = null;
      dragRailHoverIntentRef.current = { dateStart: null, enteredAt: 0 };
      cancelDragSurfaceResetFrame();
      setActiveDragSurface("today");
      clearDateDragHover();
      measureDateRailBounds();
      measureDateRailListBounds();
    },
    [
      cancelDragSurfaceResetFrame,
      clearDateDragHover,
      measureDateRailBounds,
      measureDateRailListBounds,
    ],
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
    (_meta: {
      data: TaskSwipeDraggableListItem[];
      from: number;
      to: number;
    }) => {
      const dragContext = dragContextRef.current;
      const hoveredDateStart = dragHoverDateStartRef.current;
      const lastRailDateStart = dragLastRailDateStartRef.current;
      dragContextRef.current = null;
      dragLastRailDateStartRef.current = null;
      clearDateDragHover();

      if (!dragContext) {
        return false;
      }

      const targetDateStart = hoveredDateStart ?? lastRailDateStart;
      if (targetDateStart == null) return false;

      const droppedTaskId = dragContext.taskId;
      queueDropCommit(() => {
        applyDraggedTaskToDate(droppedTaskId, targetDateStart);
        selectDateWithoutTransition(targetDateStart);
        scrollDateRailToDateStart(targetDateStart);
      });
      return true;
    },
    [
      applyDraggedTaskToDate,
      clearDateDragHover,
      queueDropCommit,
      selectDateWithoutTransition,
      scrollDateRailToDateStart,
    ],
  );

  const handlePressTask = React.useCallback(
    (taskId: string) => {
      openTask(taskId);
    },
    [openTask],
  );

  const getToggleCompleteTargetSection = React.useCallback(
    (task: Task, now: number): SectionId => {
      if (task.section === "completed") {
        return hasValidDueAt(task.dueAt)
          ? deriveActiveSectionFromDueAt(task.dueAt)
          : "today";
      }

      const routineType = task.isRoutine
        ? (task.routineType ?? task.routineInterval)
        : undefined;
      if (!routineType) return "completed";

      const nextDue = getNextRoutineDate(task.dueAt, routineType, {
        weekday: task.routineWeekday,
        nthWeek: task.routineNthWeek,
        monthDay: task.routineMonthDay,
        month: task.routineMonth,
      });
      return deriveActiveSectionFromDueAt(nextDue, now);
    },
    [],
  );

  const handleToggleComplete = React.useCallback(
    (taskId: string) => {
      const currentTask = tasks.find((task) => task.id === taskId);
      if (!currentTask) return;

      const now = Date.now();
      const targetSection = getToggleCompleteTargetSection(currentTask, now);
      const shouldQueuePopIn =
        !reduceMotionEnabled &&
        targetSection !== currentTask.section &&
        (targetSection !== "completed" || showCompletedTasksEnabled);
      if (shouldQueuePopIn) {
        queueTaskPopIn(taskId);
      }

      if (!reduceMotionEnabled) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
      setTasks((prev) => {
        const task = prev.find((t) => t.id === taskId);
        if (!task) return prev;

        const fromSection = task.section;
        let toSection: SectionId = fromSection;
        let completedRoutineEntry: Task | null = null;
        const existingIds = new Set(prev.map((candidate) => candidate.id));

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

          const routineTransition = createRoutineCompletionTransition(
            t,
            now,
            existingIds,
          );
          if (routineTransition) {
            toSection = routineTransition.nextTask.section;
            completedRoutineEntry = routineTransition.completedTask;
            return routineTransition.nextTask;
          }

          toSection = "completed";
          return {
            ...t,
            section: "completed",
            completedAt: now,
          };
        });

        const nextWithCompletionEntry = completedRoutineEntry
          ? [...next, completedRoutineEntry]
          : next;

        if (toSection === fromSection) {
          if (!completedRoutineEntry) return nextWithCompletionEntry;
          return reseedSection(nextWithCompletionEntry, "completed");
        }

        const moved = nextWithCompletionEntry.find((t) => t.id === taskId);
        if (!moved) return nextWithCompletionEntry;

        const other = nextWithCompletionEntry.filter((t) => t.id !== taskId);
        const dest = other
          .filter((t) => t.section === toSection)
          .sort((a, b) => a.orderRank - b.orderRank);
        const rest = other.filter((t) => t.section !== toSection);

        const withInserted = [...rest, moved, ...dest];

        const reseededFrom = reseedSection(withInserted, fromSection);
        const reseededBoth = reseedSection(reseededFrom, toSection);
        if (completedRoutineEntry && toSection !== "completed") {
          return reseedSection(reseededBoth, "completed");
        }
        return reseededBoth;
      });
    },
    [
      getToggleCompleteTargetSection,
      queueTaskPopIn,
      reduceMotionEnabled,
      reseedSection,
      setTasks,
      showCompletedTasksEnabled,
      tasks,
    ],
  );

  const handleDeleteTask = React.useCallback(
    (taskId: string) => {
      if (!reduceMotionEnabled) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
      setTasks((prev) => {
        const task = prev.find((t) => t.id === taskId);
        if (!task) return prev;
        return prev.map((t) =>
          t.id === taskId ? { ...t, deletedAt: Date.now() } : t,
        );
      });
    },
    [reduceMotionEnabled, setTasks],
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
    const activeDateStart = selectedDateStartRef.current || selectedDateStart;
    setPresetDateStart(activeDateStart);
    router.push({
      pathname: "/task/create-modal",
      params: {
        preset: "today",
        dateStart: String(activeDateStart),
      },
    });
  }, [router, selectedDateStart, setPresetDateStart]);

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
          configureSmoothListLayoutTransition(!reduceMotionEnabled);
        }
        setCollapsedSections((prev) => ({
          ...prev,
          [id]: !prev[id as "today" | "upcoming"],
        }));
      };

      const isUpcoming = id === "upcoming";

      const headerButton = (
        <Pressable
          android_ripple={ripple()}
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
      reduceMotionEnabled,
      todayCollapseProgress,
      upcomingCollapseProgress,
      withoutDateCount,
      styles,
      theme,
    ],
  );

  // The highlighted copy of every rail day is static between day changes;
  // rebuilding it on each selection made dragging across days expensive.
  const dateRailCenterIndicatorDays = React.useMemo(
    () =>
      dateRailDays.map((day) => {
        const isToday = day.isToday;
        const dayNumStyle = [
          styles.dateRailDayNum,
          day.isWeekend ? styles.dateRailDayNumWeekend : null,
          isToday ? styles.dateRailDayNumToday : null,
          { color: "#FFFFFF" },
        ];
        const dayDowStyle = [
          styles.dateRailDow,
          day.isWeekend ? styles.dateRailDowWeekend : null,
          { color: "#FFFFFF" },
        ];
        return (
          <View
            key={day.key}
            style={[
              styles.dateRailDay,
              { backgroundColor: "transparent" },
            ]}
          >
            <Text style={dayDowStyle}>{day.weekday}</Text>
            <Text style={dayNumStyle}>{day.dayOfMonth}</Text>
            {day.eventCount > 0 && (
              <View
                style={[
                  styles.dateRailEventIndicator,
                  { backgroundColor: "#FFFFFF" },
                ]}
              />
            )}
          </View>
        );
      }),
    [dateRailDays, styles],
  );

  const dateRailPanel = React.useMemo(() => {
    if (firstVisibleSection !== "today") return null;
    const edgeFade = Math.min(
      0.22,
      Math.max(0.06, DATE_RAIL_FADE_WIDTH / Math.max(dateRailContainerWidth, 1)),
    );
    const edgeFadeLocations: [number, number, ...number[]] = [
      0,
      edgeFade * 0.28,
      edgeFade * 0.68,
      edgeFade,
      1 - edgeFade,
      1 - edgeFade * 0.68,
      1 - edgeFade * 0.28,
      1,
    ];
    const isPreparingTitleTransition =
      dateRailTitleTransitionState.phase === "preparing";
    const outgoingTitleOpacity = dateRailTitleMotion.interpolate({
      inputRange: [0, 0.78, 1],
      outputRange: [1, 0.24, 0],
    });
    const incomingTitleOpacity = dateRailTitleMotion.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    });
    const outgoingTitleTranslateY = dateRailTitleMotion.interpolate({
      inputRange: [0, 1],
      outputRange: [
        0,
        -DATE_RAIL_TITLE_TRANSITION_DISTANCE *
          dateRailTitleTransitionState.direction,
      ],
    });
    const incomingTitleTranslateY = dateRailTitleMotion.interpolate({
      inputRange: [0, 1],
      outputRange: [
        DATE_RAIL_TITLE_TRANSITION_DISTANCE *
          dateRailTitleTransitionState.direction,
        0,
      ],
    });
    return (
      <View
        ref={dateRailWrapRef}
        onLayout={measureDateRailBounds}
        style={styles.dateRailWrap}
      >
        <View style={styles.dateRailMotionContent}>
          <View style={styles.dateRailTitleHost}>
            <View style={styles.dateRailHeadlineRow}>
              <View style={styles.dateRailHeadlineTextHost}>
                <View style={styles.dateRailTitleTextViewport}>
                  <View style={styles.dateRailTitleTextTransitionHost}>
                    {dateRailTitleTransitionState.previousText ? (
                      <Animated.Text
                        style={[
                          styles.dateRailTitle,
                          styles.dateRailTitleTextTransitionText,
                          isPreparingTitleTransition
                            ? {
                                opacity: 1,
                                transform: [{ translateY: 0 }],
                              }
                            : {
                                opacity: outgoingTitleOpacity,
                                transform: [
                                  { translateY: outgoingTitleTranslateY },
                                ],
                              },
                        ]}
                        numberOfLines={1}
                      >
                        {dateRailTitleTransitionState.previousText}
                      </Animated.Text>
                    ) : null}
                    <Animated.Text
                      style={[
                        styles.dateRailTitle,
                        styles.dateRailTitleTextTransitionText,
                        dateRailTitleTransitionState.previousText
                          ? isPreparingTitleTransition
                            ? {
                                opacity: 0,
                                transform: [
                                  {
                                    translateY:
                                      DATE_RAIL_TITLE_TRANSITION_DISTANCE *
                                      dateRailTitleTransitionState.direction,
                                  },
                                ],
                              }
                            : {
                                opacity: incomingTitleOpacity,
                                transform: [
                                  { translateY: incomingTitleTranslateY },
                                ],
                              }
                          : {
                              opacity: 1,
                              transform: [{ translateY: 0 }],
                            },
                      ]}
                      numberOfLines={1}
                    >
                      {dateRailTitleTransitionState.currentText}
                    </Animated.Text>
                  </View>
                </View>
              </View>
              <View style={styles.calendarButtonRow}>
                <GlassSurface
                  tintColor={glassSurfacePalette.calendarTint}
                  fallbackBackgroundColor={glassSurfacePalette.calendarFallback}
                  style={styles.calendarButton}
                  isInteractive={true}
                >
                  <Pressable
                    android_ripple={rippleBorderless(16)}
                    accessibilityRole="button"
                    accessibilityLabel={t("home.jumpToToday")}
                    hitSlop={16}
                    style={StyleSheet.absoluteFill}
                    onPress={() => {
                      handleJumpToToday("press");
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
                        name="arrow.uturn.backward"
                        size={16}
                        color={Colors[theme].text}
                      />
                    </View>
                  </Pressable>
                </GlassSurface>

                <GlassSurface
                  tintColor={glassSurfacePalette.calendarTint}
                  fallbackBackgroundColor={glassSurfacePalette.calendarFallback}
                  style={styles.calendarButton}
                  isInteractive={true}
                >
                  <Pressable
                    android_ripple={rippleBorderless(16)}
                    accessibilityRole="button"
                    accessibilityLabel={t("a11y.home.pickDate")}
                    hitSlop={16}
                    style={StyleSheet.absoluteFill}
                    onPress={() => {
                      // Android's DateTimePicker has no real inline/embed
                      // mode: rendering it as a JSX child (any `display`)
                      // still pops its own native dialog, which stacked on
                      // top of our custom glass popover as two overlapping
                      // modals. Use the imperative API to show just the one
                      // native dialog Android actually has.
                      if (Platform.OS === "android") {
                        DateTimePickerAndroid.open({
                          value: new Date(selectedDateStart),
                          mode: "date",
                          onChange: (event, date) => {
                            if (event.type !== "set" || !date) return;
                            const nextDateStart = getStartOfDay(
                              date.getTime(),
                            );
                            scrollDateRailToDateStart(
                              nextDateStart,
                              true,
                              true,
                            );
                            handleSelectDate(nextDateStart, "picker");
                          },
                        });
                        return;
                      }
                      router.push({
                        pathname: "/day-picker",
                        params: { date: String(selectedDateStart) },
                      });
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
              </View>
            </View>
          </View>


          <View
            ref={dateRailListRef}
            style={styles.dateRailListContainer}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              if (w > 0 && Math.abs(w - dateRailContainerWidth) > 1) {
                setDateRailContainerWidth(w);
              }
              measureDateRailListBounds();
              scheduleDateRailSyncToSelectedDate();
            }}
            onTouchMove={handleGlobalDragTouchMove}
            onTouchEnd={handleGlobalDragTouchEnd}
            onTouchCancel={handleGlobalDragTouchCancel}
          >
            <MaskedView
              style={styles.dateRailMask}
              maskElement={
                <LinearGradient
                  colors={[
                    "rgba(0,0,0,0)",
                    "rgba(0,0,0,0.38)",
                    "rgba(0,0,0,0.82)",
                    "#000000",
                    "#000000",
                    "rgba(0,0,0,0.82)",
                    "rgba(0,0,0,0.38)",
                    "rgba(0,0,0,0)",
                  ]}
                  locations={edgeFadeLocations}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={StyleSheet.absoluteFill}
                />
              }
            >
              <View style={styles.dateRailMaskedContent}>
            <Animated.FlatList
              ref={dateRailRef}
              data={dateRailDays}
              keyExtractor={(day: DateRailDay) => day.key}
              renderItem={({ item: day }: { item: DateRailDay }) => {
                const isToday = day.isToday;
                const isDragCandidate =
                  dragDetectedDateStart != null &&
                  isSameLocalDay(day.timestamp, dragDetectedDateStart);
                const isDropHover =
                  dragHoveredDateStart != null &&
                  isSameLocalDay(day.timestamp, dragHoveredDateStart);

                const dayNumStyle = [
                  styles.dateRailDayNum,
                  day.isWeekend ? styles.dateRailDayNumWeekend : null,
                  isToday ? styles.dateRailDayNumToday : null,
                  isDragCandidate ? styles.dateRailDayNumDropCandidate : null,
                  isDropHover ? styles.dateRailDayNumDropReady : null,
                ];

                const dayDowStyle = [
                  styles.dateRailDow,
                  day.isWeekend ? styles.dateRailDowWeekend : null,
                  isDragCandidate ? styles.dateRailDowDropCandidate : null,
                  isDropHover ? styles.dateRailDowDropReady : null,
                ];

                return (
                  <Pressable
                    android_ripple={ripple()}
                    accessibilityRole="button"
                    accessibilityLabel={`${day.weekday} ${day.dayOfMonth}`}
                    onPress={() => {
                      dateRailDraggedRef.current = false;
                      closeAnyOpen();
                      scrollDateRailToDateStart(
                        day.timestamp,
                        !reduceMotionEnabled,
                        true,
                      );
                      handleSelectDate(day.timestamp, "press");
                    }}
                    style={({ pressed }) => [
                      styles.dateRailDay,
                      isDragCandidate ? styles.dateRailDayDropCandidate : null,
                      isDropHover ? styles.dateRailDayDropReady : null,
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
              contentContainerStyle={[
                styles.dateRailRow,
                { paddingHorizontal: dateRailSidePadding },
              ]}
              onLayout={() => {
                scheduleDateRailSyncToSelectedDate();
              }}
              getItemLayout={getDateRailItemLayout}
              onScrollToIndexFailed={handleDateRailScrollToIndexFailed}
              onScroll={handleDateRailScroll}
              onScrollBeginDrag={handleDateRailScrollBeginDrag}
              onScrollEndDrag={handleDateRailScrollEndDrag}
              onMomentumScrollBegin={handleDateRailMomentumBegin}
              onMomentumScrollEnd={handleDateRailMomentumEnd}
              showsHorizontalScrollIndicator={false}
              snapToInterval={dateRailSnapInterval}
              snapToAlignment="start"
              decelerationRate="fast"
              bounces={false}
              scrollEventThrottle={16}
            />

            <View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                alignItems: "center",
                justifyContent: "center",
              }}
              pointerEvents="none"
            >
              <View
                style={[styles.dateRailCenterIndicator, { overflow: "hidden" }]}
              >
                <Animated.View
                  style={{
                    flexDirection: "row",
                    gap: DATE_RAIL_ITEM_GAP,
                    transform: [
                      {
                        translateX: dateRailScrollX.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -1],
                        }),
                      },
                    ],
                  }}
                >
                  {dateRailCenterIndicatorDays}
                </Animated.View>
              </View>
            </View>
              </View>
            </MaskedView>
          </View>
        </View>
      </View>
    );
  }, [
    closeAnyOpen,
    dateRailCenterIndicatorDays,
    dateRailDays,
    dateRailSidePadding,
    dateRailSnapInterval,
    dateRailScrollX,
    dateRailTitleMotion,
    dateRailTitleTransitionState,
    dragDetectedDateStart,
    dragHoveredDateStart,
    firstVisibleSection,
    getDateRailItemLayout,
    handleDateRailMomentumEnd,
    handleDateRailMomentumBegin,
    handleDateRailScroll,
    handleDateRailScrollBeginDrag,
    handleDateRailScrollEndDrag,
    handleDateRailScrollToIndexFailed,
    handleGlobalDragTouchCancel,
    handleGlobalDragTouchEnd,
    handleGlobalDragTouchMove,
    glassSurfacePalette,
    handleJumpToToday,
    handleSelectDate,
    scrollDateRailToDateStart,
    measureDateRailBounds,
    measureDateRailListBounds,
    reduceMotionEnabled,
    router,
    selectedDateStart,
    scheduleDateRailSyncToSelectedDate,
    styles,
    theme,
    dateRailContainerWidth,
  ]);

  const listHeader = React.useMemo(() => {
    const sectionId = firstVisibleSection;

    if (sectionId === "today") {
      return (
        <View style={styles.topHeroWrap}>
          <View style={styles.topHeroSurface}>
            <HomeMetricsGrid
              animateValues={!reduceMotionEnabled}
              metricsAnimationCycle={metricsAnimationCycle}
              metrics={homeMetricsProps}
              styles={styles}
              theme={homeMetricsTheme}
            />
          </View>
        </View>
      );
    }
    return null;
  }, [
    firstVisibleSection,
    homeMetricsProps,
    homeMetricsTheme,
    metricsAnimationCycle,
    reduceMotionEnabled,
    styles,
  ]);
  const areCollapsibleSectionsCollapsed =
    (!hasTodaySection || collapsedSections.today) &&
    (!hasUpcomingSection || collapsedSections.upcoming);

  const archivePill = React.useMemo(() => {
    if (showCompletedTasksEnabled) return null;

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
          android_ripple={ripple()}
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
    showCompletedTasksEnabled,
    styles,
    tasks,
    theme,
  ]);

  return (
    <View
      style={[styles.container, { backgroundColor: "transparent" }]}
      onTouchMove={handleGlobalDragTouchMove}
      onTouchEnd={handleGlobalDragTouchEnd}
      onTouchEndCapture={handleGlobalDragTouchEnd}
      onTouchCancel={handleGlobalDragTouchCancel}
    >
      <StreakAccentBackground isDark={isDark} />
      <TaskSwipeDraggableList
        ref={todayListRef}
        theme={theme}
        tasks={visibleTasks}
        data={swipeListData}
        renderHeaderRow={renderSectionHeaderRow}
        projectsById={projectsById}
        isDark={isDark}
        rowStyles={styles}
        itemSpacing={HOME_TASK_ITEM_SPACING}
        enabledTags={enabledTags}
        showTaskIcons={showTagIcons}
        showProjectNames={showProjectNames}
        showCompactSubtasks={withSubtasksEnabled}
        dragCompactPreview={isDragOverCalendarHeader}
        followHorizontalDrag={isDragOverCalendarHeader}
        selectedDateStart={listDateStart}
        empty={!hasVisibleTasks ? calendarEmptyState : null}
        onPressTask={handlePressTask}
        toggleComplete={handleToggleComplete}
        toggleSubtask={handleToggleSubtask}
        deleteTask={handleDeleteTask}
        onReorderData={applyOrderFromSwipeListData}
        onDragBeginTask={handleDragBeginTask}
        onDragEndMeta={handleDragEndMeta}
        onDragStateChange={handleDragStateChange}
        onDragGestureUpdate={handleDragGestureUpdate}
        onScrollOffsetChange={handleTaskListScrollOffsetChange}
        onListTouchMove={handleListDragTouchMove}
        onListTouchEnd={handleListDragTouchEnd}
        onListTouchCancel={handleListDragTouchCancel}
        onSwipeStateChange={handleSwipeStateChange}
        onRowTouchStateChange={handleRowTouchStateChange}
        renderMode="auto"
        syncDataDuringDrag={false}
        animateDataLayoutChanges={false}
        revealProgress={homeTaskListRevealProgress}
        revealPhase={homeTaskListRevealPhase}
        revealStaggerStep={0.035}
        revealTranslateX={48}
        containerStyle={{ backgroundColor: "transparent" }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.taskListContent,
          // The header is transparent so the page background shows through it.
          // iOS insets the content automatically; Android needs it spelled out
          // or the first card slides under the title.
          Platform.OS === "android"
            ? { paddingTop: headerHeight + 8 }
            : null,
        ]}
        header={
          <>
            {listHeader}
            {dateRailPanel}
          </>
        }
        footer={<>{archivePill}</>}
      />

      {showFloatingAddButton ? (
        <FloatingAddButton onPress={handleAddTask} />
      ) : null}
    </View>
  );
}
