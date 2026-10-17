import { usePageDimensions } from "@/components/navigation/vertical-bar-safe-area";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import SwipeableItem, {
  OpenDirection,
  type SwipeableItemImperativeRef,
  type UnderlayParams,
} from "react-native-swipeable-item";
import Reanimated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
} from "react-native-reanimated";

import { GlassSurface, withAlpha } from "@/components/ui/glass-surface";
import { rippleBorderless } from "@/components/ui/ripple";
import {
  type TagId,
} from "@/context/home-filters-store";
import type { Project, Task } from "@/context/tasks-store";
import { getIntlLocale, t } from "@/i18n";
import {
  triggerImpactHaptic,
  triggerNotificationHaptic,
} from "@/utils/haptics";

const SWIPE_STOP = 76;
const SWIPE_TRIGGER_SNAP = 152;
const SWIPE_ACTIVATION_THRESHOLD = 10;
const SWIPE_DAMPING = 7;
const SWIPE_OVER_SWIPE = 480;
const SWIPE_SNAP_PROGRESS = SWIPE_STOP / SWIPE_TRIGGER_SNAP;
const COMPACT_SUBTASK_ICON_SIZE = 18;
const COMPACT_SUBTASK_TEXT_SIZE = 14;
const DRAG_LONG_PRESS_DELAY_MS = 260;
const DRAG_COMPACT_PREVIEW_SIZE = 52;
const TASK_POP_IN_DURATION_MS = 196;
const SWIPE_COMMIT_EXIT_DURATION_MS = 118;
const SWIPE_COMMIT_EXIT_FADE_DURATION_MS = 96;
const SWIPE_COMMIT_COLLAPSE_DURATION_MS = 164;
const TASK_ROW_HEIGHT_CACHE = new Map<string, number>();
// Cross-list drop "landing": the row mounts in its new list and springs from
// the spot where the finger released it into its final slot.
const TASK_LANDING_START_SCALE = 1.03;
const TASK_LANDING_SPRING = {
  damping: 24,
  stiffness: 280,
  mass: 0.9,
  restDisplacementThreshold: 0.5,
  restSpeedThreshold: 0.5,
} as const;

export type TaskRowWindowFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type TaskRowMeasure = (
  callback: (frame: TaskRowWindowFrame | null) => void,
) => void;
export type TaskRowLanding = {
  /** Window position of the row's top-left corner at the moment of the drop. */
  x: number;
  y: number;
  token: number;
};

/** Convert a hex color to an rgba pastel tint. */
function hexToPastel(
  hex: string | undefined,
  isDark: boolean,
): string | undefined {
  if (!hex || hex.length < 4) return undefined;
  const cleaned = hex.replace("#", "");
  const r = parseInt(
    cleaned.length === 3 ? cleaned[0] + cleaned[0] : cleaned.substring(0, 2),
    16,
  );
  const g = parseInt(
    cleaned.length === 3 ? cleaned[1] + cleaned[1] : cleaned.substring(2, 4),
    16,
  );
  const b = parseInt(
    cleaned.length === 3 ? cleaned[2] + cleaned[2] : cleaned.substring(4, 6),
    16,
  );
  if (isNaN(r) || isNaN(g) || isNaN(b)) return undefined;
  const alpha = isDark ? 0.22 : 0.15;
  return `rgba(${r},${g},${b},${alpha})`;
}

type TagChipModel = {
  key: string;
  label: string;
};

type SwipeActionUnderlayProps = {
  params: UnderlayParams<Task>;
  styles: SwipeTaskRowStyles;
  side: "left" | "right";
  backgroundColor: string;
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  onPress: () => void;
};

function SwipeActionUnderlay({
  params,
  styles,
  side,
  backgroundColor,
  icon,
  onPress,
}: SwipeActionUnderlayProps) {
  const underlayColorStops = React.useMemo(
    () => ({
      soft: withAlpha(backgroundColor, 0.18),
      medium: withAlpha(backgroundColor, 0.58),
    }),
    [backgroundColor],
  );

  const fillAnimatedStyle = useAnimatedStyle(() => {
    const progress = Math.max(0, Math.min(1.08, params.percentOpen.value));
    return {
      backgroundColor: interpolateColor(
        progress,
        [0, 0.12, 0.28, SWIPE_SNAP_PROGRESS],
        [
          "rgba(0,0,0,0)",
          underlayColorStops.soft,
          underlayColorStops.medium,
          backgroundColor,
        ],
      ),
    };
  }, [
    backgroundColor,
    params.percentOpen,
    underlayColorStops.medium,
    underlayColorStops.soft,
  ]);

  const actionAnimatedStyle = useAnimatedStyle(() => {
    const progress = Math.max(0, Math.min(1.12, params.percentOpen.value));
    const directionOffset = side === "left" ? 14 : -14;
    return {
      opacity: interpolate(
        progress,
        [0, 0.08, 0.16, SWIPE_SNAP_PROGRESS],
        [0, 0.22, 0.92, 1],
        Extrapolation.CLAMP,
      ),
      transform: [
        {
          translateX: interpolate(
            progress,
            [0, 1],
            [0, directionOffset],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  }, [params.percentOpen, side]);

  return (
    <View style={styles.underlay} pointerEvents="box-none">
      <Reanimated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, fillAnimatedStyle]}
      />
      <Pressable
        style={[
          styles.actionSlot,
          {
            left: 0,
            right: 0,
            paddingLeft: side === "left" ? 18 : 0,
            paddingRight: side === "right" ? 18 : 0,
            alignItems: side === "left" ? "flex-start" : "flex-end",
          },
        ]}
        onPress={onPress}
        hitSlop={10}
      >
        <Reanimated.View
          style={[
            {
              width: 36,
              height: 36,
              alignItems: "center",
              justifyContent: "center",
              alignSelf: side === "left" ? "flex-start" : "flex-end",
            },
            actionAnimatedStyle,
          ]}
        >
          <MaterialIcons
            name={icon}
            size={28}
            color="#FFFFFF"
            style={{
              textShadowColor: "rgba(0,0,0,0.12)",
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 4,
            }}
          />
        </Reanimated.View>
      </Pressable>
    </View>
  );
}

const formatRowTimeLabel = (dueAt: number, dueHasTime?: boolean) => {
  if (!Number.isFinite(dueAt) || dueAt <= 0 || !dueHasTime) return null;
  return new Intl.DateTimeFormat(getIntlLocale(), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(dueAt));
};

const formatRowDateLabel = (dueAt: number) => {
  if (!Number.isFinite(dueAt) || dueAt <= 0) return null;
  return new Intl.DateTimeFormat(getIntlLocale(), {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(dueAt));
};

const isTaskOverdue = (
  section: Task["section"],
  dueAt: number,
  dueHasTime: boolean | undefined,
  nowMs: number,
): boolean => {
  if (section === "completed") return false;
  if (!Number.isFinite(dueAt) || dueAt <= 0) return false;

  if (dueHasTime === false) {
    const due = new Date(dueAt);
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

  return dueAt < nowMs;
};

const getRoutineChipLabel = (
  routineType: Task["routineType"] | Task["routineInterval"],
): string | null => {
  if (!routineType) return null;

  switch (routineType) {
    case "hourly":
      return t("taskDetail.routine.hourly");
    case "daily":
      return t("taskDetail.routine.daily");
    case "weekdays":
      return t("taskDetail.routine.weekdays");
    case "weekends":
      return t("taskDetail.routine.weekends");
    case "weekly":
      return t("taskDetail.routine.weekly");
    case "biweekly":
      return t("taskDetail.routine.biweekly");
    case "monthly":
      return t("taskDetail.routine.monthly");
    case "quarterly":
      return t("taskDetail.routine.quarterly");
    case "biannually":
      return t("taskDetail.routine.biannually");
    case "yearly":
      return t("taskDetail.routine.yearly");
    case "custom":
      return t("taskDetail.routine.custom");
    default:
      return t("taskDetail.property.routine");
  }
};

export type SwipeTaskRowStyles = {
  itemSpacer: any;
  swipeClip: any;
  underlay: any;
  actionSlot: any;
  actionSlotLeft: any;
  actionSlotRight: any;
  actionSlotInner: any;
  row: any;
  dragRow: any;
  rowInner: any;
  emojiTile: any;
  emojiText: any;
  textStack: any;
  titleRow: any;
  rowTitle: any;
  rowMeta: any;
  rowSubtitle: any;
  tagRow: any;
  tagChip: any;
  tagChipDanger: any;
  tagChipText: any;
};

export type SwipeTaskRowProps = {
  task: Task;
  project?: Project;
  drag: () => void;
  isActive: boolean;
  styles: SwipeTaskRowStyles;
  isDark: boolean;
  itemSpacing?: number;
  emojiTint: string;
  emojiFallback: string;
  swipeCompleteBg: string;
  swipeDeleteBg: string;
  leftAction?: {
    icon?: React.ComponentProps<typeof MaterialIcons>["name"];
    backgroundColor?: string;
    onTrigger: (taskId: string) => void;
    haptic?: Haptics.NotificationFeedbackType;
  };
  rightAction?: {
    icon?: React.ComponentProps<typeof MaterialIcons>["name"];
    backgroundColor?: string;
    onTrigger: (taskId: string) => void;
    haptic?: Haptics.NotificationFeedbackType;
  };
  enabledTags: Set<TagId>;
  showTaskIcons: boolean;
  showProjectNames?: boolean;
  showCompactSubtasks?: boolean;
  beginSwipe: (taskId: string) => void;
  endSwipe: (taskId: string) => void;
  registerClose: (taskId: string, close: () => void) => void;
  unregisterClose: (taskId: string) => void;
  closeAnyOpen: () => void;
  onPressTask: (taskId: string) => void;
  toggleComplete: (taskId: string) => void;
  toggleSubtask?: (taskId: string, subtaskId: string) => void;
  deleteTask: (taskId: string) => void;
  onSwipeGestureActiveChange?: (taskId: string, active: boolean) => void;
  onTouchInteractionChange?: (taskId: string, active: boolean) => void;
  shouldPopIn?: boolean;
  onPopInAnimationEnd?: (taskId: string) => void;
  /** When set, datetime tags matching this day are suppressed (avoids redundant "Heute" chips). */
  selectedDateStart?: number;
  showOverdueDatePrefix?: boolean;
  itemSpacerStyle?: StyleProp<ViewStyle>;
  swipeClipStyle?: StyleProp<ViewStyle>;
  rowStyle?: StyleProp<ViewStyle>;
  dragCompactPreview?: boolean;
  activeDragTranslateX?:
    | Animated.Value
    | Animated.AnimatedAddition<number>
    | null;
  revealTranslateX?:
    | Animated.Value
    | Animated.AnimatedAddition<number>
    | Animated.AnimatedInterpolation<number>
    | null;
  followHorizontalDrag?: boolean;
  swipeActivationThreshold?: number;
  /** When set on mount, the row springs from this window position into its slot. */
  landingFrom?: TaskRowLanding | null;
  onLandingEnd?: (taskId: string) => void;
  /** Lets the owning list measure this row in window coordinates. */
  registerMeasure?: (taskId: string, measure: TaskRowMeasure) => () => void;
};

export const SwipeTaskRow = React.memo(function SwipeTaskRow({
  task,
  project,
  drag,
  isActive,
  styles,
  isDark,
  itemSpacing = 0,
  emojiTint,
  emojiFallback,
  swipeCompleteBg,
  swipeDeleteBg,
  leftAction,
  rightAction,
  enabledTags,
  showTaskIcons,
  showProjectNames = false,
  showCompactSubtasks = false,
  beginSwipe,
  endSwipe,
  registerClose,
  unregisterClose,
  onPressTask,
  toggleComplete,
  toggleSubtask,
  deleteTask,
  onSwipeGestureActiveChange,
  onTouchInteractionChange,
  shouldPopIn = false,
  onPopInAnimationEnd,
  showOverdueDatePrefix = false,
  itemSpacerStyle,
  swipeClipStyle,
  rowStyle,
  dragCompactPreview = false,
  activeDragTranslateX = null,
  revealTranslateX = null,
  followHorizontalDrag = false,
  swipeActivationThreshold,
  landingFrom = null,
  onLandingEnd,
  registerMeasure,
}: SwipeTaskRowProps) {
  const { width: viewportWidth } = usePageDimensions();
  const swipeRef = React.useRef<SwipeableItemImperativeRef | null>(null);
  const longPressTriggeredRef = React.useRef(false);
  const committedSwipeActionDirectionRef = React.useRef<OpenDirection | null>(
    null,
  );
  const thresholdHapticDirectionRef = React.useRef<OpenDirection | null>(null);
  const isMountedRef = React.useRef(true);
  const [isSwipeCommitAnimating, setIsSwipeCommitAnimating] =
    React.useState(false);
  const [dragPressInLocalX, setDragPressInLocalX] = React.useState<
    number | null
  >(null);
  const dragPressPageXRef = React.useRef<number | null>(null);
  const cachedRowHeight = TASK_ROW_HEIGHT_CACHE.get(task.id) ?? 0;
  const [measuredRowHeight, setMeasuredRowHeight] = React.useState(
    cachedRowHeight,
  );
  const swipeCommitTranslateX = React.useRef(new Animated.Value(0)).current;
  const swipeCommitOpacity = React.useRef(new Animated.Value(1)).current;
  const swipeCommitScale = React.useRef(new Animated.Value(1)).current;
  const swipeCommitCollapseProgress = React.useRef(
    new Animated.Value(1),
  ).current;
  const popInExpandProgress = React.useRef(
    new Animated.Value(shouldPopIn && cachedRowHeight > 0 ? 0 : 1),
  ).current;
  const popInAppearanceKeyRef = React.useRef<string | null>(null);
  const swipeCommitAppearanceKeyRef = React.useRef<string | null>(null);
  const swipeCommitExitAnimationRef =
    React.useRef<Animated.CompositeAnimation | null>(null);
  const swipeCommitCollapseAnimationRef =
    React.useRef<Animated.CompositeAnimation | null>(null);
  const popInAnimationRef =
    React.useRef<Animated.CompositeAnimation | null>(null);
  const popInStartFrameRef = React.useRef<number | null>(null);
  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const landingWrapperRef = React.useRef<View | null>(null);
  const [landingTranslateX] = React.useState(() => new Animated.Value(0));
  const [landingTranslateY] = React.useState(() => new Animated.Value(0));
  const [landingScale] = React.useState(() => new Animated.Value(1));
  // Hidden until measured so the row never flashes in its final slot first.
  const [landingOpacity] = React.useState(
    () => new Animated.Value(landingFrom ? 0 : 1),
  );
  const landingTokenRef = React.useRef<number | null>(null);
  const landingAnimationRef =
    React.useRef<Animated.CompositeAnimation | null>(null);
  const canUseCompactDragPreview =
    showTaskIcons && !!task.emoji && task.emoji.trim().length > 0;
  const shouldUseCompactDragPreview =
    isActive && dragCompactPreview && canUseCompactDragPreview;
  const isCompletedTask = task.section === "completed";
  const taskAppearanceKey = React.useMemo(
    () =>
      `${task.id}:${task.section}:${task.completedAt ?? 0}:${task.deletedAt ?? 0}`,
    [task.completedAt, task.deletedAt, task.id, task.section],
  );
  const shouldApplySwipeCommitState =
    isSwipeCommitAnimating &&
    swipeCommitAppearanceKeyRef.current === taskAppearanceKey;

  const taskBgColor = React.useMemo(
    () => hexToPastel(task.color, isDark),
    [isDark, task.color],
  );
  const taskEmojiBorderColor = React.useMemo<string | undefined>(
    () =>
      task.color ? withAlpha(task.color, isDark ? 0.42 : 0.28) : undefined,
    [isDark, task.color],
  );
  const projectBgColor = React.useMemo(
    () => hexToPastel(project?.color, isDark),
    [project?.color, isDark],
  );
  const projectEmojiBorderColor = React.useMemo<string | undefined>(
    () =>
      project?.color
        ? withAlpha(project.color, isDark ? 0.42 : 0.28)
        : undefined,
    [isDark, project?.color],
  );

  React.useEffect(() => {
    if (!isActive) {
      longPressTriggeredRef.current = false;
    }
  }, [isActive]);

  React.useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (popInStartFrameRef.current != null) {
        cancelAnimationFrame(popInStartFrameRef.current);
        popInStartFrameRef.current = null;
      }
      popInAnimationRef.current?.stop();
      swipeCommitExitAnimationRef.current?.stop();
      swipeCommitCollapseAnimationRef.current?.stop();
      landingAnimationRef.current?.stop();
    };
  }, []);

  const measureInWindow = React.useCallback<TaskRowMeasure>((callback) => {
    const node = landingWrapperRef.current;
    if (!node || typeof node.measureInWindow !== "function") {
      callback(null);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(height) ||
        height <= 0
      ) {
        callback(null);
        return;
      }
      callback({ x, y, width, height });
    });
  }, []);

  React.useEffect(() => {
    if (!registerMeasure) return;
    return registerMeasure(task.id, measureInWindow);
  }, [measureInWindow, registerMeasure, task.id]);

  React.useLayoutEffect(() => {
    if (!landingFrom) return;
    if (landingTokenRef.current === landingFrom.token) return;
    landingTokenRef.current = landingFrom.token;
    landingAnimationRef.current?.stop();

    measureInWindow((frame) => {
      if (!isMountedRef.current) return;
      if (!frame) {
        landingOpacity.setValue(1);
        onLandingEnd?.(task.id);
        return;
      }

      landingTranslateX.setValue(landingFrom.x - frame.x);
      landingTranslateY.setValue(landingFrom.y - frame.y);
      landingScale.setValue(TASK_LANDING_START_SCALE);
      landingOpacity.setValue(1);

      const animation = Animated.parallel([
        Animated.spring(landingTranslateX, {
          toValue: 0,
          ...TASK_LANDING_SPRING,
          useNativeDriver: true,
        }),
        Animated.spring(landingTranslateY, {
          toValue: 0,
          ...TASK_LANDING_SPRING,
          useNativeDriver: true,
        }),
        Animated.spring(landingScale, {
          toValue: 1,
          ...TASK_LANDING_SPRING,
          useNativeDriver: true,
        }),
      ]);
      landingAnimationRef.current = animation;
      animation.start(() => {
        if (landingAnimationRef.current === animation) {
          landingAnimationRef.current = null;
        }
        if (!isMountedRef.current) return;
        onLandingEnd?.(task.id);
      });
    });
  }, [
    landingFrom,
    landingOpacity,
    landingScale,
    landingTranslateX,
    landingTranslateY,
    measureInWindow,
    onLandingEnd,
    task.id,
  ]);

  const landingMotionStyle = React.useMemo(
    () => ({
      opacity: landingOpacity,
      transform: [
        { translateX: landingTranslateX },
        { translateY: landingTranslateY },
        { scale: landingScale },
      ],
    }),
    [landingOpacity, landingScale, landingTranslateX, landingTranslateY],
  );

  React.useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };
  }, []);

  const resetPopInAnimationValues = React.useCallback(() => {
    if (popInStartFrameRef.current != null) {
      cancelAnimationFrame(popInStartFrameRef.current);
      popInStartFrameRef.current = null;
    }
    popInAnimationRef.current?.stop();
    popInAnimationRef.current = null;
    popInExpandProgress.stopAnimation();
    popInExpandProgress.setValue(1);
  }, [popInExpandProgress]);

  React.useEffect(() => {
    if (!shouldPopIn) return;
    if (shouldApplySwipeCommitState) return;
    if (popInAppearanceKeyRef.current === taskAppearanceKey) return;
    if (measuredRowHeight <= 0) return;

    popInAppearanceKeyRef.current = taskAppearanceKey;
    popInAnimationRef.current?.stop();
    popInExpandProgress.setValue(0);

    if (popInStartFrameRef.current != null) {
      cancelAnimationFrame(popInStartFrameRef.current);
      popInStartFrameRef.current = null;
    }

    popInStartFrameRef.current = requestAnimationFrame(() => {
      popInStartFrameRef.current = null;
      if (!isMountedRef.current) return;
      if (popInAppearanceKeyRef.current !== taskAppearanceKey) return;

      popInAnimationRef.current = Animated.timing(popInExpandProgress, {
        toValue: 1,
        duration: TASK_POP_IN_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      });

      popInAnimationRef.current.start(({ finished }) => {
        popInAnimationRef.current = null;
        if (!finished || !isMountedRef.current) return;
        if (popInAppearanceKeyRef.current === taskAppearanceKey) {
          popInAppearanceKeyRef.current = null;
        }
        onPopInAnimationEnd?.(task.id);
      });
    });
  }, [
    measuredRowHeight,
    onPopInAnimationEnd,
    popInExpandProgress,
    shouldApplySwipeCommitState,
    shouldPopIn,
    task.id,
    taskAppearanceKey,
  ]);

  React.useEffect(() => {
    if (shouldPopIn) return;
    if (popInAppearanceKeyRef.current && popInAppearanceKeyRef.current !== taskAppearanceKey) {
      popInAppearanceKeyRef.current = null;
    }
    resetPopInAnimationValues();
  }, [resetPopInAnimationValues, shouldPopIn, taskAppearanceKey]);

  const resetSwipeCommitAnimationValues = React.useCallback(() => {
    swipeCommitExitAnimationRef.current?.stop();
    swipeCommitCollapseAnimationRef.current?.stop();
    swipeCommitExitAnimationRef.current = null;
    swipeCommitCollapseAnimationRef.current = null;
    swipeCommitTranslateX.stopAnimation();
    swipeCommitOpacity.stopAnimation();
    swipeCommitScale.stopAnimation();
    swipeCommitCollapseProgress.stopAnimation();
    swipeCommitTranslateX.setValue(0);
    swipeCommitOpacity.setValue(1);
    swipeCommitScale.setValue(1);
    swipeCommitCollapseProgress.setValue(1);
  }, [
    swipeCommitCollapseProgress,
    swipeCommitOpacity,
    swipeCommitScale,
    swipeCommitTranslateX,
  ]);

  React.useEffect(() => {
    if (!isSwipeCommitAnimating) {
      resetSwipeCommitAnimationValues();
      thresholdHapticDirectionRef.current = null;
      committedSwipeActionDirectionRef.current = null;
      swipeCommitAppearanceKeyRef.current = null;
    }
  }, [isSwipeCommitAnimating, resetSwipeCommitAnimationValues]);

  React.useEffect(() => {
    if (!isSwipeCommitAnimating) return;
    if (swipeCommitAppearanceKeyRef.current === taskAppearanceKey) return;
    setIsSwipeCommitAnimating(false);
  }, [isSwipeCommitAnimating, taskAppearanceKey]);

  const handleRowLayout = React.useCallback((event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    if (!Number.isFinite(nextHeight) || nextHeight <= 0) return;
    TASK_ROW_HEIGHT_CACHE.set(task.id, nextHeight);
    setMeasuredRowHeight((current) =>
      Math.abs(current - nextHeight) < 0.5 ? current : nextHeight,
    );
  }, [task.id]);

  const closeSelf = React.useCallback(() => {
    void swipeRef.current?.close({ animated: true }).catch(() => undefined);
    onSwipeGestureActiveChange?.(task.id, false);
    endSwipe(task.id);
  }, [endSwipe, onSwipeGestureActiveChange, task.id]);

  React.useEffect(() => {
    registerClose(task.id, closeSelf);
    return () => {
      unregisterClose(task.id);
    };
  }, [closeSelf, registerClose, task.id, unregisterClose]);

  const fireLeftConfirmationHaptic = React.useCallback(() => {
    triggerNotificationHaptic(
      leftAction?.haptic ?? Haptics.NotificationFeedbackType.Success,
    );
  }, [leftAction?.haptic]);

  const fireRightConfirmationHaptic = React.useCallback(() => {
    triggerNotificationHaptic(
      rightAction?.haptic ?? Haptics.NotificationFeedbackType.Warning,
    );
  }, [rightAction?.haptic]);

  const performLeftAction = React.useCallback(() => {
    if (leftAction) {
      leftAction.onTrigger(task.id);
      return;
    }
    toggleComplete(task.id);
  }, [leftAction, task.id, toggleComplete]);

  const performRightAction = React.useCallback(() => {
    if (rightAction) {
      rightAction.onTrigger(task.id);
      return;
    }
    deleteTask(task.id);
  }, [deleteTask, rightAction, task.id]);

  const handleLongPressDrag = React.useCallback(() => {
    if (isActive || longPressTriggeredRef.current) return;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressTriggeredRef.current = true;
    onTouchInteractionChange?.(task.id, false);
    const pressPageX = dragPressPageXRef.current;
    measureInWindow((frame) => {
      if (!isMountedRef.current) return;
      setDragPressInLocalX(
        frame && pressPageX != null ? pressPageX - frame.x : null,
      );
    });
    drag();
  }, [drag, isActive, measureInWindow, onTouchInteractionChange, task.id]);

  const armLongPressDrag = React.useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      handleLongPressDrag();
    }, DRAG_LONG_PRESS_DELAY_MS);
  }, [handleLongPressDrag]);

  const clearLongPressDrag = React.useCallback(() => {
    if (!longPressTimerRef.current) return;
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }, []);

  const animateSwipeCommit = React.useCallback(
    (
      direction: OpenDirection.LEFT | OpenDirection.RIGHT,
      performAction: () => void,
      fireConfirmationHaptic: () => void,
    ) => {
      if (isSwipeCommitAnimating) return;

      setIsSwipeCommitAnimating(true);
      swipeCommitAppearanceKeyRef.current = taskAppearanceKey;
      committedSwipeActionDirectionRef.current = direction;
      thresholdHapticDirectionRef.current = null;
      clearLongPressDrag();
      onTouchInteractionChange?.(task.id, false);
      beginSwipe(task.id);
      onSwipeGestureActiveChange?.(task.id, false);
      endSwipe(task.id);
      fireConfirmationHaptic();

      const exitDistance = Math.max(viewportWidth + 56, 260);
      const translateTarget =
        direction === OpenDirection.LEFT ? -exitDistance : exitDistance;

      swipeCommitExitAnimationRef.current?.stop();
      swipeCommitCollapseAnimationRef.current?.stop();
      swipeCommitExitAnimationRef.current = Animated.parallel([
        Animated.timing(swipeCommitTranslateX, {
          toValue: translateTarget,
          duration: SWIPE_COMMIT_EXIT_DURATION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(swipeCommitOpacity, {
          toValue: 0,
          duration: SWIPE_COMMIT_EXIT_FADE_DURATION_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(swipeCommitScale, {
          toValue: 0.985,
          duration: SWIPE_COMMIT_EXIT_DURATION_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]);

      swipeCommitExitAnimationRef.current.start(({ finished }) => {
        swipeCommitExitAnimationRef.current = null;
        if (!finished) {
          if (!isMountedRef.current) return;
          setIsSwipeCommitAnimating(false);
          return;
        }

        if (measuredRowHeight <= 0) {
          void swipeRef.current?.close({ animated: false }).catch(
            () => undefined,
          );
          performAction();

          if (!isMountedRef.current) return;
          requestAnimationFrame(() => {
            if (!isMountedRef.current) return;
            setIsSwipeCommitAnimating(false);
          });
          return;
        }

        swipeCommitCollapseAnimationRef.current = Animated.timing(
          swipeCommitCollapseProgress,
          {
            toValue: 0,
            duration: SWIPE_COMMIT_COLLAPSE_DURATION_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          },
        );
        swipeCommitCollapseAnimationRef.current.start(
          ({ finished: collapseFinished }) => {
            swipeCommitCollapseAnimationRef.current = null;
            if (!collapseFinished) {
              if (!isMountedRef.current) return;
              setIsSwipeCommitAnimating(false);
              return;
            }

            void swipeRef.current?.close({ animated: false }).catch(
              () => undefined,
            );
            performAction();

            if (!isMountedRef.current) return;
            requestAnimationFrame(() => {
              if (!isMountedRef.current) return;
              setIsSwipeCommitAnimating(false);
            });
          },
        );
      });
    },
    [
      beginSwipe,
      clearLongPressDrag,
      endSwipe,
      isSwipeCommitAnimating,
      measuredRowHeight,
      onSwipeGestureActiveChange,
      onTouchInteractionChange,
      swipeCommitCollapseProgress,
      swipeCommitOpacity,
      swipeCommitScale,
      swipeCommitTranslateX,
      taskAppearanceKey,
      task.id,
      viewportWidth,
    ],
  );

  const onPressComplete = React.useCallback(() => {
    animateSwipeCommit(
      OpenDirection.RIGHT,
      performLeftAction,
      fireLeftConfirmationHaptic,
    );
  }, [animateSwipeCommit, fireLeftConfirmationHaptic, performLeftAction]);

  const onPressDelete = React.useCallback(() => {
    animateSwipeCommit(
      OpenDirection.LEFT,
      performRightAction,
      fireRightConfirmationHaptic,
    );
  }, [animateSwipeCommit, fireRightConfirmationHaptic, performRightAction]);

  const handleSwipeChange = React.useCallback(
    ({
      openDirection,
      snapPoint,
    }: {
      openDirection: OpenDirection;
      snapPoint: number;
    }) => {
      if (committedSwipeActionDirectionRef.current) {
        if (openDirection === OpenDirection.NONE || snapPoint <= 0) {
          committedSwipeActionDirectionRef.current = null;
          thresholdHapticDirectionRef.current = null;
        }
        return;
      }

      const isOpen = openDirection !== OpenDirection.NONE && snapPoint > 0;
      if (isOpen) {
        beginSwipe(task.id);
      } else {
        endSwipe(task.id);
      }
      onSwipeGestureActiveChange?.(task.id, isOpen);
    },
    [
      beginSwipe,
      endSwipe,
      onSwipeGestureActiveChange,
      task.id,
    ],
  );

  const handleSwipeWillChange = React.useCallback(
    ({
      openDirection,
      snapPoint,
    }: {
      openDirection: OpenDirection;
      snapPoint: number;
    }) => {
      if (
        openDirection === OpenDirection.NONE ||
        snapPoint < SWIPE_TRIGGER_SNAP
      ) {
        if (openDirection === OpenDirection.NONE || snapPoint <= 0) {
          committedSwipeActionDirectionRef.current = null;
          thresholdHapticDirectionRef.current = null;
        }
        return;
      }

      if (committedSwipeActionDirectionRef.current === openDirection) {
        return;
      }

      if (openDirection === OpenDirection.LEFT) {
        animateSwipeCommit(
          OpenDirection.LEFT,
          performRightAction,
          fireRightConfirmationHaptic,
        );
        return;
      }

      if (openDirection === OpenDirection.RIGHT) {
        animateSwipeCommit(
          OpenDirection.RIGHT,
          performLeftAction,
          fireLeftConfirmationHaptic,
        );
      }
    },
    [
      animateSwipeCommit,
      fireLeftConfirmationHaptic,
      fireRightConfirmationHaptic,
      performLeftAction,
      performRightAction,
    ],
  );

  const handleSwipeTriggerStateChange = React.useCallback(
    ({
      openDirection,
      isTriggerReached,
    }: {
      openDirection: OpenDirection;
      snapPoint: number;
      isTriggerReached: boolean;
    }) => {
      if (shouldApplySwipeCommitState) return;

      if (!isTriggerReached || openDirection === OpenDirection.NONE) {
        if (
          thresholdHapticDirectionRef.current === openDirection ||
          openDirection === OpenDirection.NONE
        ) {
          thresholdHapticDirectionRef.current = null;
        }
        return;
      }

      if (thresholdHapticDirectionRef.current === openDirection) {
        return;
      }

      thresholdHapticDirectionRef.current = openDirection;
      triggerImpactHaptic(Haptics.ImpactFeedbackStyle.Medium);
    },
    [shouldApplySwipeCommitState],
  );

  const clipStyle = React.useMemo(
    () => [
      styles.swipeClip,
      swipeClipStyle,
      measuredRowHeight > 0 ? { minHeight: measuredRowHeight } : null,
      isActive ? { overflow: "visible" as const } : null,
    ],
    [isActive, measuredRowHeight, styles.swipeClip, swipeClipStyle],
  );

  const spacerStyle = React.useMemo(
    () => [
      styles.itemSpacer,
      itemSpacerStyle,
      measuredRowHeight > 0 ? { minHeight: measuredRowHeight } : null,
      {
        // Same spacing on every row (including the last): the drag list
        // measures cells with their margin, so a smaller last cell made
        // neighbours shift too little while dragging and jump after the drop.
        marginBottom: itemSpacing,
        overflow: "visible" as const,
      },
    ],
    [itemSpacing, itemSpacerStyle, measuredRowHeight, styles.itemSpacer],
  );
  const swipeCommitSpacerStyle = React.useMemo(() => {
    if (!shouldApplySwipeCommitState) return null;

    return {
      minHeight: 0,
      marginBottom: swipeCommitCollapseProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, itemSpacing],
      }),
    };
  }, [
    itemSpacing,
    shouldApplySwipeCommitState,
    swipeCommitCollapseProgress,
  ]);
  const shouldApplyPopInLayoutState =
    shouldPopIn && !shouldApplySwipeCommitState && measuredRowHeight > 0;
  const popInSpacerStyle = React.useMemo(() => {
    if (!shouldApplyPopInLayoutState) return null;

    if (measuredRowHeight <= 0) {
      return {
        minHeight: 0,
        marginBottom: 0,
      };
    }

    return {
      minHeight: 0,
      marginBottom: popInExpandProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, itemSpacing],
      }),
    };
  }, [
    itemSpacing,
    measuredRowHeight,
    popInExpandProgress,
    shouldApplyPopInLayoutState,
  ]);
  const swipeCommitClipStyle = React.useMemo(() => {
    if (!shouldApplySwipeCommitState || measuredRowHeight <= 0) return null;

    return {
      minHeight: 0,
      height: swipeCommitCollapseProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, measuredRowHeight],
      }),
      opacity: swipeCommitCollapseProgress.interpolate({
        inputRange: [0, 0.12, 1],
        outputRange: [0, 0.86, 1],
      }),
    };
  }, [
    measuredRowHeight,
    shouldApplySwipeCommitState,
    swipeCommitCollapseProgress,
  ]);
  const popInClipStyle = React.useMemo(() => {
    if (!shouldApplyPopInLayoutState) return null;

    if (measuredRowHeight <= 0) {
      return {
        minHeight: 0,
        height: 0,
        opacity: 0,
      };
    }

    return {
      minHeight: 0,
      height: popInExpandProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, measuredRowHeight],
      }),
    };
  }, [
    measuredRowHeight,
    popInExpandProgress,
    shouldApplyPopInLayoutState,
  ]);

  // dragRow styles drop the hairline border; keep its width (just hide it) so
  // lifting/dropping a row never changes its height by a sub-pixel amount,
  // which would re-measure the cell mid-drag and nudge the row on release.
  const dragRowBorderLock = React.useMemo(() => {
    const base = StyleSheet.flatten(styles.row) ?? {};
    const lock: ViewStyle = {};
    const widthKeys = [
      "borderWidth",
      "borderTopWidth",
      "borderBottomWidth",
      "borderLeftWidth",
      "borderRightWidth",
    ] as const;
    let hasBorder = false;
    for (const key of widthKeys) {
      const value = base[key];
      if (typeof value === "number" && value > 0) {
        lock[key] = value;
        hasBorder = true;
      }
    }
    if (!hasBorder) return null;
    lock.borderColor = "transparent";
    lock.borderTopColor = "transparent";
    lock.borderBottomColor = "transparent";
    lock.borderLeftColor = "transparent";
    lock.borderRightColor = "transparent";
    return lock;
  }, [styles.row]);
  const rowContentStyle = React.useMemo(
    () => [
      styles.row,
      rowStyle,
      isActive ? styles.dragRow : undefined,
      isActive ? dragRowBorderLock : undefined,
      shouldUseCompactDragPreview
        ? {
            width: DRAG_COMPACT_PREVIEW_SIZE,
            minHeight: DRAG_COMPACT_PREVIEW_SIZE,
            maxWidth: DRAG_COMPACT_PREVIEW_SIZE,
            borderRadius: 14,
            paddingHorizontal: 4,
            paddingVertical: 4,
            alignSelf: "flex-start" as const,
          }
        : undefined,
    ],
    [
      dragRowBorderLock,
      isActive,
      rowStyle,
      shouldUseCompactDragPreview,
      styles.dragRow,
      styles.row,
    ],
  );
  const rowSurfaceColor = React.useMemo(() => {
    // Keep row tint independent from per-item styles (for example task colors).
    const flattenedBase = StyleSheet.flatten([
      styles.row,
      isActive ? styles.dragRow : undefined,
    ]);
    const resolved = flattenedBase?.backgroundColor;
    if (typeof resolved === "string" && resolved.length > 0) return resolved;
    return isDark ? "#2C2C2E" : "#FFFFFF";
  }, [isActive, isDark, styles.dragRow, styles.row]);
  const rowTintColor = React.useMemo(
    () => {
      if (rowSurfaceColor.startsWith("#")) {
        return withAlpha(rowSurfaceColor, isDark ? 0.88 : 0.28);
      }
      if (
        rowSurfaceColor.startsWith("rgb(") ||
        rowSurfaceColor.startsWith("rgba(")
      ) {
        return isDark ? rowSurfaceColor : "rgba(255,255,255,0.28)";
      }
      return isDark ? "rgba(44,44,46,0.92)" : "rgba(255,255,255,0.28)";
    },
    [isDark, rowSurfaceColor],
  );
  const rowFallbackBackgroundColor = React.useMemo(() => {
    if (isDark) return rowSurfaceColor;
    if (rowSurfaceColor.startsWith("#")) {
      return withAlpha(rowSurfaceColor, 0.82);
    }
    if (
      rowSurfaceColor.startsWith("rgb(") ||
      rowSurfaceColor.startsWith("rgba(")
    ) {
      return "rgba(255,255,255,0.82)";
    }
    return "rgba(255,255,255,0.82)";
  }, [isDark, rowSurfaceColor]);
  const completedContentStyle = React.useMemo(
    () => (isCompletedTask ? { opacity: 0.72 } : null),
    [isCompletedTask],
  );
  const completedTitleStyle = React.useMemo(
    () =>
      isCompletedTask
        ? ({
            textDecorationLine: "line-through",
          } as const)
        : null,
    [isCompletedTask],
  );
  const completedMetaStyle = React.useMemo(
    () => (isCompletedTask ? { opacity: 0.82 } : null),
    [isCompletedTask],
  );
  // The drag offset is JS-driven (it follows the finger), while the reveal and
  // swipe-commit values are native-driven. Animated turns every node in one
  // transform native once any of them is, so on a shared view the next JS
  // spring on the drag offset threw. They live on separate views.
  const dragMotionStyle = React.useMemo(() => {
    const transforms: {
      translateX: number | Animated.Value | Animated.AnimatedAddition<number>;
    }[] = [];

    if (isActive && followHorizontalDrag && activeDragTranslateX) {
      transforms.push({ translateX: activeDragTranslateX });
      if (
        shouldUseCompactDragPreview &&
        typeof dragPressInLocalX === "number" &&
        Number.isFinite(dragPressInLocalX)
      ) {
        transforms.push({
          translateX: dragPressInLocalX - DRAG_COMPACT_PREVIEW_SIZE / 2,
        });
      }
    }

    return {
      transform: transforms,
    };
  }, [
    activeDragTranslateX,
    dragPressInLocalX,
    followHorizontalDrag,
    isActive,
    shouldUseCompactDragPreview,
  ]);
  const contentMotionStyle = React.useMemo(
    () => {
      const transforms: (
        | {
            translateX:
              | Animated.Value
              | Animated.AnimatedAddition<number>
              | Animated.AnimatedInterpolation<number>;
          }
        | { scale: Animated.Value }
      )[] = [];

      if (revealTranslateX) {
        transforms.push({ translateX: revealTranslateX });
      }

      if (shouldApplySwipeCommitState) {
        transforms.push({ translateX: swipeCommitTranslateX });
        transforms.push({ scale: swipeCommitScale });
      }

      return {
        transform: transforms,
      };
    },
    [
      revealTranslateX,
      shouldApplySwipeCommitState,
      swipeCommitScale,
      swipeCommitTranslateX,
    ],
  );
  const surfaceContentMotionStyle = React.useMemo(
    () =>
      shouldApplySwipeCommitState
        ? {
            opacity: swipeCommitOpacity,
          }
        : null,
    [shouldApplySwipeCommitState, swipeCommitOpacity],
  );
  const isOverdue = React.useMemo(
    () => isTaskOverdue(task.section, task.dueAt, task.dueHasTime, Date.now()),
    [task.dueAt, task.dueHasTime, task.section],
  );
  const routineType = React.useMemo(
    () => task.routineType ?? task.routineInterval,
    [task.routineInterval, task.routineType],
  );
  const routineLabel = React.useMemo(
    () => getRoutineChipLabel(routineType),
    [routineType],
  );

  const tagChips = React.useMemo<TagChipModel[]>(() => {
    const chips: TagChipModel[] = [];
    if (showProjectNames && project) {
      chips.push({
        key: `proj-${project.id}`,
        label: project.name,
      });
    }

    if (enabledTags.has("location") && task.location) {
      chips.push({
        key: `loc-${task.location}`,
        label: task.location,
      });
    }

    return chips;
  }, [
    enabledTags,
    project,
    showProjectNames,
    task.location,
  ]);

  const tagsView = tagChips.length ? (
    <View style={styles.tagRow}>
      {tagChips.map((chip) => (
        <View
          key={chip.key}
          style={styles.tagChip}
        >
          <Text style={styles.tagChipText} numberOfLines={1}>
            {chip.label}
          </Text>
        </View>
      ))}
    </View>
  ) : null;

  const compactSubtasks = React.useMemo(() => {
    if (!showCompactSubtasks) return [];

    const source = task.subtasks ?? [];
    return source
      .map((subtask) => ({ ...subtask, title: subtask.title.trim() }))
      .filter((subtask) => subtask.title.length > 0);
  }, [showCompactSubtasks, task.subtasks]);

  const compactSubtasksView = compactSubtasks.length ? (
    <View style={{ marginTop: 2, gap: 4 }}>
      {compactSubtasks.map((subtask) => (
        <Pressable
          key={subtask.id}
          disabled={!toggleSubtask}
          android_ripple={rippleBorderless(16)}
          onPress={(event) => {
            event.stopPropagation();
            if (!toggleSubtask) return;
            toggleSubtask(task.id, subtask.id);
          }}
          hitSlop={6}
          style={({ pressed }) => [
            {
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              opacity: pressed && toggleSubtask ? 0.75 : 1,
            },
          ]}
        >
          <MaterialIcons
            name={subtask.done ? "check-box" : "check-box-outline-blank"}
            size={COMPACT_SUBTASK_ICON_SIZE}
            color={
              subtask.done ? "rgba(52,199,89,0.92)" : "rgba(127,127,127,0.72)"
            }
          />
          <Text
            numberOfLines={1}
            style={[
              styles.rowSubtitle,
              {
                flex: 1,
                fontSize: COMPACT_SUBTASK_TEXT_SIZE,
                lineHeight: 18,
                fontWeight: "600",
                textDecorationLine: subtask.done ? "line-through" : "none",
                opacity: subtask.done ? 0.5 : 0.74,
              },
            ]}
          >
            {subtask.title}
          </Text>
        </Pressable>
      ))}
    </View>
  ) : null;

  const timeLabel = React.useMemo(
    () => formatRowTimeLabel(task.dueAt, task.dueHasTime),
    [task.dueAt, task.dueHasTime],
  );
  const overdueDateLabel = React.useMemo(
    () =>
      showOverdueDatePrefix && timeLabel && isOverdue
        ? formatRowDateLabel(task.dueAt)
        : null,
    [isOverdue, showOverdueDatePrefix, task.dueAt, timeLabel],
  );
  const overdueTimeStyle = React.useMemo(
    () =>
      timeLabel && isOverdue && !isCompletedTask
        ? ({
            color: isDark ? "rgba(255,107,107,0.96)" : "rgba(196,42,28,0.96)",
            fontWeight: "700",
          } as const)
        : null,
    [isCompletedTask, isDark, isOverdue, timeLabel],
  );
  const routineMetaColor = React.useMemo(
    () => (isDark ? "rgba(191,122,240,0.96)" : "rgba(175,82,222,0.96)"),
    [isDark],
  );
  const hasRightMeta = Boolean(timeLabel || routineLabel);
  const rightMetaView = hasRightMeta ? (
    <View
      style={{
        alignItems: "flex-end",
        justifyContent: "center",
        gap: timeLabel && routineLabel ? 2 : 0,
        flexShrink: 1,
        maxWidth: Math.min(160, viewportWidth * 0.42),
      }}
    >
      {timeLabel ? (
        <Text
          style={[styles.rowMeta, completedMetaStyle]}
          numberOfLines={1}
        >
          {overdueDateLabel ? `${overdueDateLabel} ` : null}
          <Text style={overdueTimeStyle}>{timeLabel}</Text>
        </Text>
      ) : null}
      {routineLabel ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <MaterialIcons name="repeat" size={11} color={routineMetaColor} />
          <Text
            style={[styles.rowMeta, completedMetaStyle, { color: routineMetaColor }]}
            numberOfLines={1}
          >
            {routineLabel}
          </Text>
        </View>
      ) : null}
    </View>
  ) : null;

  const hasSubtitle = React.useMemo(
    () => !!task.subtitle?.trim(),
    [task.subtitle],
  );

  const hasExtraInfo =
    hasSubtitle || tagChips.length > 0 || compactSubtasks.length > 0;

  const emojiTileView = showTaskIcons ? (
    <View style={{ position: "relative", overflow: "visible" }}>
      <View
        style={[
          styles.emojiTile,
          shouldUseCompactDragPreview
            ? { width: 30, height: 30, borderRadius: 9 }
            : null,
          {
            backgroundColor: taskBgColor ?? projectBgColor ?? emojiTint,
            borderColor:
              taskEmojiBorderColor ?? projectEmojiBorderColor ?? emojiFallback,
            borderWidth: StyleSheet.hairlineWidth,
          },
        ]}
      >
        <Text
          style={[
            styles.emojiText,
            { opacity: taskBgColor || projectBgColor ? 1 : 0.92 },
          ]}
        >
          {task.emoji}
        </Text>
      </View>
      {isCompletedTask ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -4,
            right: -4,
            width: 16,
            height: 16,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: isDark
              ? "rgba(24,24,26,0.92)"
              : "rgba(255,255,255,0.92)",
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: isDark
              ? "rgba(255,255,255,0.16)"
              : "rgba(0,0,0,0.08)",
          }}
        >
          <MaterialIcons
            name="check"
            size={11}
            color={isDark ? "rgba(255,255,255,0.82)" : "rgba(0,0,0,0.62)"}
          />
        </View>
      ) : null}
    </View>
  ) : null;

  const renderUnderlayLeft = React.useCallback(
    (params: UnderlayParams<Task>) => (
      <SwipeActionUnderlay
        params={params}
        styles={styles}
        side="right"
        backgroundColor={rightAction?.backgroundColor ?? swipeDeleteBg}
        icon={rightAction?.icon ?? "delete"}
        onPress={onPressDelete}
      />
    ),
    [
      onPressDelete,
      rightAction?.backgroundColor,
      rightAction?.icon,
      styles,
      swipeDeleteBg,
    ],
  );

  const renderUnderlayRight = React.useCallback(
    (params: UnderlayParams<Task>) => (
      <SwipeActionUnderlay
        params={params}
        styles={styles}
        side="left"
        backgroundColor={leftAction?.backgroundColor ?? swipeCompleteBg}
        icon={
          leftAction?.icon ?? (task.section === "completed" ? "undo" : "check")
        }
        onPress={onPressComplete}
      />
    ),
    [
      leftAction?.backgroundColor,
      leftAction?.icon,
      onPressComplete,
      styles,
      swipeCompleteBg,
      task.section,
    ],
  );

  return (
    <Animated.View
      ref={landingWrapperRef}
      collapsable={false}
      style={landingMotionStyle}
    >
      <Animated.View style={[spacerStyle, popInSpacerStyle, swipeCommitSpacerStyle]}>
        <Animated.View style={[clipStyle, popInClipStyle, swipeCommitClipStyle]}>
          <SwipeableItem
            ref={swipeRef}
            item={task}
            swipeEnabled={!isActive && !shouldApplySwipeCommitState}
            activationThreshold={
              typeof swipeActivationThreshold === "number"
                ? swipeActivationThreshold
                : SWIPE_ACTIVATION_THRESHOLD
            }
            swipeDamping={SWIPE_DAMPING}
            overSwipe={SWIPE_OVER_SWIPE}
            snapPointsLeft={[SWIPE_STOP, SWIPE_TRIGGER_SNAP]}
            snapPointsRight={[SWIPE_STOP, SWIPE_TRIGGER_SNAP]}
            onTriggerStateChange={handleSwipeTriggerStateChange}
            onWillChange={handleSwipeWillChange}
            onChange={handleSwipeChange}
            renderUnderlayLeft={renderUnderlayLeft}
            renderUnderlayRight={renderUnderlayRight}
          >
            <Animated.View style={contentMotionStyle}>
              <Animated.View style={dragMotionStyle}>
                <TouchableOpacity
                  testID={`task-row-${task.id}`}
                  accessibilityActions={[
                    {
                      name: "activate",
                    },
                    {
                      name: "complete",
                      label:
                        task.section === "completed"
                          ? t("a11y.task.reopen")
                          : t("a11y.task.complete"),
                    },
                    { name: "delete", label: t("common.delete") },
                  ]}
                  onAccessibilityAction={(event) => {
                    switch (event.nativeEvent.actionName) {
                      case "complete":
                        onPressComplete();
                        break;
                      case "delete":
                        onPressDelete();
                        break;
                      case "activate":
                        onPressTask(task.id);
                        break;
                    }
                  }}
                  onLongPress={handleLongPressDrag}
                  delayLongPress={DRAG_LONG_PRESS_DELAY_MS}
                  activeOpacity={0.9}
                  disabled={shouldApplySwipeCommitState}
                  onLayout={handleRowLayout}
                  style={
                    shouldUseCompactDragPreview
                      ? {
                          width: DRAG_COMPACT_PREVIEW_SIZE,
                          alignSelf: "flex-start",
                        }
                      : { width: "100%", alignSelf: "stretch" }
                  }
                  onPressIn={(event) => {
                    // locationX is relative to the innermost touched view (the
                    // title text, the emoji), not the row, so keep pageX and
                    // resolve it against the row frame when the drag starts.
                    const pageX = event.nativeEvent.pageX;
                    dragPressPageXRef.current = Number.isFinite(pageX)
                      ? pageX
                      : null;
                    onTouchInteractionChange?.(task.id, true);
                    armLongPressDrag();
                  }}
                  onPressOut={() => {
                    clearLongPressDrag();
                    onTouchInteractionChange?.(task.id, false);
                  }}
                  onPress={() => {
                    if (longPressTriggeredRef.current) {
                      longPressTriggeredRef.current = false;
                      return;
                    }
                    onPressTask(task.id);
                  }}
                >
                  <GlassSurface
                    style={rowContentStyle}
                    glassEffectStyle="regular"
                    tintColor={rowTintColor}
                    fallbackBackgroundColor={rowFallbackBackgroundColor}
                    isInteractive
                  >
                    <Animated.View style={surfaceContentMotionStyle}>
                      <View
                        style={[
                          styles.rowInner,
                          completedContentStyle,
                          shouldUseCompactDragPreview
                            ? {
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 0,
                              }
                            : !hasExtraInfo
                              ? { alignItems: "center" }
                              : null,
                        ]}
                      >
                        {emojiTileView}
                        {shouldUseCompactDragPreview ? null : (
                          <View
                            style={[
                              styles.textStack,
                              !hasExtraInfo ? { justifyContent: "center" } : null,
                            ]}
                          >
                            <View style={styles.titleRow}>
                              <Text
                                style={[styles.rowTitle, completedTitleStyle]}
                                numberOfLines={1}
                              >
                                {task.title}
                              </Text>
                              {rightMetaView}
                            </View>
                            {task.subtitle ? (
                              <Text
                                style={[
                                  styles.rowSubtitle,
                                  completedTitleStyle,
                                  completedMetaStyle,
                                ]}
                              >
                                {task.subtitle}
                              </Text>
                            ) : null}
                            {tagsView}
                            {compactSubtasksView}
                          </View>
                        )}
                      </View>
                    </Animated.View>
                  </GlassSurface>
                </TouchableOpacity>
              </Animated.View>
            </Animated.View>
          </SwipeableItem>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
});
