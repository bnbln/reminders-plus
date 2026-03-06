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
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import SwipeableItem, {
  OpenDirection,
  type UnderlayParams,
  type SwipeableItemImperativeRef,
} from "react-native-swipeable-item";
import Reanimated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
} from "react-native-reanimated";

import { GlassSurface, withAlpha } from "@/components/ui/glass-surface";
import {
  getTagTitle,
  TAG_ORDER,
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
const COMPACT_SUBTASK_ICON_SIZE = 18;
const COMPACT_SUBTASK_TEXT_SIZE = 14;
const DRAG_LONG_PRESS_DELAY_MS = 260;
const DRAG_COMPACT_PREVIEW_SIZE = 65;
const SWIPE_COMMIT_EXIT_DURATION_MS = 118;
const SWIPE_COMMIT_ENTRY_DURATION_MS = 176;
const SWIPE_COMMIT_EXIT_FADE_DURATION_MS = 96;
const SWIPE_COMMIT_ENTRY_FADE_DURATION_MS = 144;

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
  tagId: TagId;
  label: string;
  tone?: "neutral" | "danger";
};

type SwipeActionUnderlayProps = {
  params: UnderlayParams<Task>;
  styles: SwipeTaskRowStyles;
  side: "left" | "right";
  isDark: boolean;
  backgroundColor: string;
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  onPress: () => void;
};

function SwipeActionUnderlay({
  params,
  styles,
  side,
  isDark,
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
    if (!isDark) {
      return {
        backgroundColor,
      };
    }

    const progress = Math.max(0, Math.min(1.08, params.percentOpen.value));
    return {
      backgroundColor: interpolateColor(
        progress,
        [0, 0.12, 0.32, 1],
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
    isDark,
    params.percentOpen,
    underlayColorStops.medium,
    underlayColorStops.soft,
  ]);

  const actionAnimatedStyle = useAnimatedStyle(() => {
    const progress = Math.max(0, Math.min(1.12, params.percentOpen.value));
    const directionOffset = side === "left" ? 14 : -14;
    return {
      opacity: isDark
        ? interpolate(
            progress,
            [0, 0.08, 0.18, 1],
            [0, 0.22, 0.92, 1],
            Extrapolation.CLAMP,
          )
        : 1,
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
  }, [isDark, params.percentOpen, side]);

  return (
    <View style={styles.underlay} pointerEvents="box-none">
      <Reanimated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, fillAnimatedStyle]}
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

const extractHashtags = (value: string | undefined): string[] => {
  if (!value) return [];
  const matches = value.match(/#[\p{L}0-9_]+/gu) ?? [];
  const unique: string[] = [];
  for (const m of matches) {
    const norm = m.toLowerCase();
    if (!unique.some((x) => x.toLowerCase() === norm)) unique.push(m);
  }
  return unique;
};

const formatDueLabel = (dueAt: number, dueHasTime?: boolean) => {
  if (!Number.isFinite(dueAt) || dueAt <= 0) return t("taskDetail.due.none");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const due = new Date(dueAt);
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());

  const dayLabel =
    dueDay.getTime() === today.getTime()
      ? t("taskDetail.relative.today")
      : dueDay.getTime() === tomorrow.getTime()
        ? t("taskDetail.relative.tomorrow")
        : new Intl.DateTimeFormat(getIntlLocale(), {
            weekday: "short",
            day: "2-digit",
            month: "2-digit",
          }).format(due);

  if (!dueHasTime) return dayLabel;

  const timeLabel = new Intl.DateTimeFormat(getIntlLocale(), {
    hour: "2-digit",
    minute: "2-digit",
  }).format(due);
  return `${dayLabel} ${timeLabel}`;
};

const formatRowTimeLabel = (dueAt: number, dueHasTime?: boolean) => {
  if (!Number.isFinite(dueAt) || dueAt <= 0 || !dueHasTime) return null;
  return new Intl.DateTimeFormat(getIntlLocale(), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(dueAt));
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
  isLast?: boolean;
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
  itemSpacerStyle?: StyleProp<ViewStyle>;
  swipeClipStyle?: StyleProp<ViewStyle>;
  rowStyle?: StyleProp<ViewStyle>;
  dragCompactPreview?: boolean;
  activeDragTranslateX?:
    | Animated.Value
    | Animated.AnimatedAddition<number>
    | null;
  followHorizontalDrag?: boolean;
  swipeActivationThreshold?: number;
};

export const SwipeTaskRow = React.memo(function SwipeTaskRow({
  task,
  project,
  drag,
  isActive,
  styles,
  isDark,
  isLast = false,
  itemSpacing = 0,
  emojiTint,
  emojiFallback,
  swipeCompleteBg,
  swipeDeleteBg,
  leftAction,
  rightAction,
  enabledTags,
  showTaskIcons,
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
  selectedDateStart,
  itemSpacerStyle,
  swipeClipStyle,
  rowStyle,
  dragCompactPreview = false,
  activeDragTranslateX = null,
  followHorizontalDrag = false,
  swipeActivationThreshold,
}: SwipeTaskRowProps) {
  const { width: viewportWidth } = useWindowDimensions();
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
  const [measuredRowHeight, setMeasuredRowHeight] = React.useState(0);
  const swipeCommitTranslateX = React.useRef(new Animated.Value(0)).current;
  const swipeCommitOpacity = React.useRef(new Animated.Value(1)).current;
  const swipeCommitScale = React.useRef(new Animated.Value(1)).current;
  const swipeCommitExitAnimationRef =
    React.useRef<Animated.CompositeAnimation | null>(null);
  const swipeCommitEntryAnimationRef =
    React.useRef<Animated.CompositeAnimation | null>(null);
  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const canUseCompactDragPreview =
    showTaskIcons && !!task.emoji && task.emoji.trim().length > 0;
  const shouldUseCompactDragPreview =
    isActive && dragCompactPreview && canUseCompactDragPreview;

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
      swipeCommitExitAnimationRef.current?.stop();
      swipeCommitEntryAnimationRef.current?.stop();
    };
  }, []);

  React.useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };
  }, []);
  React.useEffect(() => {
    if (shouldPopIn) {
      onPopInAnimationEnd?.(task.id);
    }
  }, [onPopInAnimationEnd, shouldPopIn, task.id]);

  const resetSwipeCommitAnimationValues = React.useCallback(() => {
    swipeCommitExitAnimationRef.current?.stop();
    swipeCommitEntryAnimationRef.current?.stop();
    swipeCommitExitAnimationRef.current = null;
    swipeCommitEntryAnimationRef.current = null;
    swipeCommitTranslateX.stopAnimation();
    swipeCommitOpacity.stopAnimation();
    swipeCommitScale.stopAnimation();
    swipeCommitTranslateX.setValue(0);
    swipeCommitOpacity.setValue(1);
    swipeCommitScale.setValue(1);
  }, [swipeCommitOpacity, swipeCommitScale, swipeCommitTranslateX]);

  React.useEffect(() => {
    if (!isSwipeCommitAnimating) {
      resetSwipeCommitAnimationValues();
      thresholdHapticDirectionRef.current = null;
      committedSwipeActionDirectionRef.current = null;
    }
  }, [isSwipeCommitAnimating, resetSwipeCommitAnimationValues]);

  const handleRowLayout = React.useCallback((event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    if (!Number.isFinite(nextHeight) || nextHeight <= 0) return;
    setMeasuredRowHeight((current) =>
      Math.abs(current - nextHeight) < 0.5 ? current : nextHeight,
    );
  }, []);

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
    drag();
  }, [drag, isActive, onTouchInteractionChange, task.id]);

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
      swipeCommitEntryAnimationRef.current?.stop();
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

        void swipeRef.current?.close({ animated: false }).catch(() => undefined);
        performAction();

        if (!isMountedRef.current) return;

        const entryStartOffset = translateTarget * 0.18;
        swipeCommitTranslateX.setValue(entryStartOffset);
        swipeCommitOpacity.setValue(0);
        swipeCommitScale.setValue(0.992);

        requestAnimationFrame(() => {
          if (!isMountedRef.current) return;
          swipeCommitEntryAnimationRef.current = Animated.parallel([
            Animated.timing(swipeCommitTranslateX, {
              toValue: 0,
              duration: SWIPE_COMMIT_ENTRY_DURATION_MS,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(swipeCommitOpacity, {
              toValue: 1,
              duration: SWIPE_COMMIT_ENTRY_FADE_DURATION_MS,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(swipeCommitScale, {
              toValue: 1,
              duration: SWIPE_COMMIT_ENTRY_DURATION_MS,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]);
          swipeCommitEntryAnimationRef.current.start(() => {
            swipeCommitEntryAnimationRef.current = null;
            if (!isMountedRef.current) return;
            setIsSwipeCommitAnimating(false);
          });
        });
      });
    },
    [
      beginSwipe,
      clearLongPressDrag,
      endSwipe,
      isSwipeCommitAnimating,
      onSwipeGestureActiveChange,
      onTouchInteractionChange,
      swipeCommitOpacity,
      swipeCommitScale,
      swipeCommitTranslateX,
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
      if (isSwipeCommitAnimating) return;

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
    [isSwipeCommitAnimating],
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
        marginBottom: isLast ? 0 : itemSpacing,
        overflow: "visible" as const,
      },
    ],
    [isLast, itemSpacing, itemSpacerStyle, measuredRowHeight, styles.itemSpacer],
  );

  const rowContentStyle = React.useMemo(
    () => [
      styles.row,
      rowStyle,
      isActive ? styles.dragRow : undefined,
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
        return withAlpha(rowSurfaceColor, isDark ? 0.88 : 0.9);
      }
      if (
        rowSurfaceColor.startsWith("rgb(") ||
        rowSurfaceColor.startsWith("rgba(")
      ) {
        return rowSurfaceColor;
      }
      return isDark ? "rgba(44,44,46,0.92)" : "rgba(255,255,255,0.9)";
    },
    [isDark, rowSurfaceColor],
  );
  const contentMotionStyle = React.useMemo(
    () => {
      const transforms: Array<
        | { translateX: number | Animated.Value | Animated.AnimatedAddition<number> }
        | { scale: Animated.Value }
      > = [];

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

      transforms.push({ translateX: swipeCommitTranslateX });
      transforms.push({ scale: swipeCommitScale });

      return {
        opacity: swipeCommitOpacity,
        transform: transforms,
      };
    },
    [
      activeDragTranslateX,
      dragPressInLocalX,
      followHorizontalDrag,
      isActive,
      shouldUseCompactDragPreview,
      swipeCommitOpacity,
      swipeCommitScale,
      swipeCommitTranslateX,
    ],
  );

  const tagChips = React.useMemo<TagChipModel[]>(() => {
    if (enabledTags.size === 0) return [];

    const chips: TagChipModel[] = [];
    const now = Date.now();

    const isOverdue = (() => {
      if (task.section === "completed") return false;
      if (!Number.isFinite(task.dueAt) || task.dueAt <= 0) return false;

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
        return now >= startOfNextDay;
      }

      return task.dueAt < now;
    })();

    const hashtags = extractHashtags(
      [task.title, task.subtitle, task.notes].filter(Boolean).join(" "),
    );

    for (const tagId of TAG_ORDER) {
      if (!enabledTags.has(tagId)) continue;

      if (tagId === "overdue") {
        if (!isOverdue) continue;
        chips.push({
          key: "overdue",
          tagId,
          label: getTagTitle("overdue"),
          tone: "danger",
        });
        continue;
      }

      if (tagId === "datetime") {
        if (!Number.isFinite(task.dueAt) || task.dueAt <= 0) continue;
        if (selectedDateStart != null && selectedDateStart > 0) {
          const dueDay = new Date(task.dueAt);
          const selDay = new Date(selectedDateStart);
          if (
            dueDay.getFullYear() === selDay.getFullYear() &&
            dueDay.getMonth() === selDay.getMonth() &&
            dueDay.getDate() === selDay.getDate()
          ) {
            continue;
          }
        }
        chips.push({
          key: `dt-${task.dueAt}`,
          tagId,
          label: formatDueLabel(task.dueAt, task.dueHasTime),
        });
        continue;
      }

      if (tagId === "location") {
        if (!task.location) continue;
        chips.push({
          key: `loc-${task.location}`,
          tagId,
          label: task.location,
        });
        continue;
      }

      if (tagId === "project") {
        if (!project) continue;
        chips.push({ key: `proj-${project.id}`, tagId, label: project.name });
        continue;
      }

      if (tagId === "routine") {
        const routineType = task.routineType ?? task.routineInterval;
        const routineLabel = getRoutineChipLabel(routineType);
        if (!routineLabel) continue;
        chips.push({
          key: `routine-${task.id}-${routineType ?? "default"}`,
          tagId,
          label: routineLabel,
        });
        continue;
      }

      if (tagId === "keywords") {
        if (hashtags.length === 0) continue;
        for (const h of hashtags.slice(0, 3)) {
          chips.push({ key: `kw-${h}`, tagId, label: h });
        }
      }
    }

    return chips;
  }, [
    enabledTags,
    project,
    selectedDateStart,
    task.dueAt,
    task.dueHasTime,
    task.id,
    task.location,
    task.notes,
    task.routineInterval,
    task.routineType,
    task.section,
    task.subtitle,
    task.title,
  ]);

  const tagsView = tagChips.length ? (
    <View style={styles.tagRow}>
      {tagChips.map((chip) => (
        <View
          key={chip.key}
          style={[
            styles.tagChip,
            chip.tone === "danger" ? styles.tagChipDanger : undefined,
          ]}
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

  const hasSubtitle = React.useMemo(
    () => !!task.subtitle?.trim(),
    [task.subtitle],
  );

  const hasExtraInfo =
    hasSubtitle || tagChips.length > 0 || compactSubtasks.length > 0;

  const emojiTileView = showTaskIcons ? (
    <View
      style={[
        styles.emojiTile,
        shouldUseCompactDragPreview
          ? { width: 36, height: 36, borderRadius: 10 }
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
  ) : null;

  const renderUnderlayLeft = React.useCallback(
    (params: UnderlayParams<Task>) => (
      <SwipeActionUnderlay
        params={params}
        styles={styles}
        side="right"
        isDark={isDark}
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
      isDark,
      swipeDeleteBg,
    ],
  );

  const renderUnderlayRight = React.useCallback(
    (params: UnderlayParams<Task>) => (
      <SwipeActionUnderlay
        params={params}
        styles={styles}
        side="left"
        isDark={isDark}
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
      isDark,
      swipeCompleteBg,
      task.section,
    ],
  );

  return (
    <View style={spacerStyle}>
      <View style={clipStyle}>
        <SwipeableItem
          ref={swipeRef}
          item={task}
          swipeEnabled={!isActive && !isSwipeCommitAnimating}
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
            <TouchableOpacity
              onLongPress={handleLongPressDrag}
              delayLongPress={DRAG_LONG_PRESS_DELAY_MS}
              activeOpacity={0.9}
              disabled={isSwipeCommitAnimating}
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
                const localX = event.nativeEvent.locationX;
                setDragPressInLocalX(
                  Number.isFinite(localX) ? localX : null,
                );
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
                fallbackBackgroundColor={rowSurfaceColor}
                isInteractive
              >
                <View
                  style={[
                    styles.rowInner,
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
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {task.title}
                        </Text>
                        {timeLabel ? (
                          <Text style={styles.rowMeta} numberOfLines={1}>
                            {timeLabel}
                          </Text>
                        ) : null}
                      </View>
                      {task.subtitle ? (
                        <Text style={styles.rowSubtitle}>{task.subtitle}</Text>
                      ) : null}
                      {tagsView}
                      {compactSubtasksView}
                    </View>
                  )}
                </View>
              </GlassSurface>
            </TouchableOpacity>
          </Animated.View>
        </SwipeableItem>
      </View>
    </View>
  );
});
