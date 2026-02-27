import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  runOnUI,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { GlassSurface, withAlpha } from "@/components/ui/glass-surface";
import {
  getTagTitle,
  TAG_ORDER,
  type TagId,
} from "@/context/home-filters-store";
import type { Project, Task } from "@/context/tasks-store";
import { getIntlLocale, t } from "@/i18n";

const SWIPE_STOP = 76;
const SWIPE_OPEN_THRESHOLD = 22;
// Trigger should require a deliberate, stronger swipe.
const SWIPE_TRIGGER = 132;
const SWIPE_ELASTIC = 0.55;
const SWIPE_HAPTIC_EARLY_RATIO = 0;
const SWIPE_TRIGGER_FINGER =
  SWIPE_STOP + (SWIPE_TRIGGER - SWIPE_STOP) / SWIPE_ELASTIC;
const SWIPE_HAPTIC_AND_ACTION_RATIO = Math.max(
  0,
  Math.min(1, SWIPE_HAPTIC_EARLY_RATIO),
);
const SWIPE_HAPTIC_AND_ACTION_FINGER =
  SWIPE_STOP +
  (SWIPE_TRIGGER_FINGER - SWIPE_STOP) * SWIPE_HAPTIC_AND_ACTION_RATIO;
const SWIPE_ACTIVE_OFFSET_X = 10;
const SWIPE_FAIL_OFFSET_Y = 10;
const SWIPE_MIN_DRAG_X = 12;
const SWIPE_AXIS_LOCK_BIAS = 2;
const COMPACT_SUBTASK_ICON_SIZE = 18;
const COMPACT_SUBTASK_TEXT_SIZE = 14;
const DRAG_LONG_PRESS_DELAY_MS = 280;

/** Convert a hex color to an rgba pastel tint. */
function hexToPastel(hex: string | undefined, isDark: boolean): string | undefined {
  if (!hex || hex.length < 4) return undefined;
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.length === 3 ? cleaned[0] + cleaned[0] : cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.length === 3 ? cleaned[1] + cleaned[1] : cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.length === 3 ? cleaned[2] + cleaned[2] : cleaned.substring(4, 6), 16);
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
  externalScrollRef?: React.RefObject<any>;
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
  onBeforeDrag?: () => void;
  shouldPopIn?: boolean;
  onPopInAnimationEnd?: (taskId: string) => void;
  /** When set, datetime tags matching this day are suppressed (avoids redundant "Heute" chips). */
  selectedDateStart?: number;
  itemSpacerStyle?: StyleProp<ViewStyle>;
  swipeClipStyle?: StyleProp<ViewStyle>;
  rowStyle?: StyleProp<ViewStyle>;
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
  externalScrollRef,
  leftAction,
  rightAction,
  enabledTags,
  showTaskIcons,
  showCompactSubtasks = false,
  beginSwipe,
  endSwipe,
  registerClose,
  unregisterClose,
  closeAnyOpen,
  onPressTask,
  toggleComplete,
  toggleSubtask,
  deleteTask,
  onSwipeGestureActiveChange,
  onTouchInteractionChange,
  onBeforeDrag,
  shouldPopIn = false,
  onPopInAnimationEnd,
  selectedDateStart,
  itemSpacerStyle,
  swipeClipStyle,
  rowStyle,
}: SwipeTaskRowProps) {
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
  const translateX = useSharedValue(0);
  const direction = useSharedValue<-1 | 0 | 1>(0);
  const startOffsetX = useSharedValue(0);
  const rowWidth = useSharedValue(0);
  const rowHeight = useSharedValue(0);
  const rowOpacity = useSharedValue(1);
  const rowScale = useSharedValue(1);
  const entryOpacity = useSharedValue(1);
  const entryScale = useSharedValue(1);
  const entryTranslateY = useSharedValue(0);
  const swipeVisualAlpha = useSharedValue(1);
  const collapse = useSharedValue(0);
  const touchStartX = useSharedValue(0);
  const touchStartY = useSharedValue(0);
  const axisDecision = useSharedValue<0 | 1>(0);
  const swipeGestureActive = useSharedValue(0);
  const thresholdHapticSent = useSharedValue(0);
  const dragArmed = useSharedValue(0);
  const isPressed = useSharedValue(0);
  const suppressNextPressRef = React.useRef(false);

  const reportSwipeGestureActive = React.useCallback(
    (active: boolean) => {
      onSwipeGestureActiveChange?.(task.id, active);
    },
    [onSwipeGestureActiveChange, task.id],
  );

  const reportRowTouchInteraction = React.useCallback(
    (taskId: string, active: boolean) => {
      onTouchInteractionChange?.(taskId, active);
    },
    [onTouchInteractionChange],
  );

  const closeSelf = React.useCallback(() => {
    translateX.value = withSpring(0, {
      damping: 34,
      stiffness: 420,
      mass: 0.9,
      overshootClamping: true,
    });
    direction.value = 0;
  }, [direction, translateX]);

  React.useEffect(() => {
    registerClose(task.id, closeSelf);
    return () => {
      unregisterClose(task.id);
    };
  }, [closeSelf, registerClose, task.id, unregisterClose]);

  React.useEffect(() => {
    if (isActive) return;
    dragArmed.value = 0;
    suppressNextPressRef.current = false;
  }, [dragArmed, isActive]);

  React.useEffect(() => {
    if (!shouldPopIn) return;

    entryOpacity.value = 0;
    entryScale.value = 0.985;
    entryTranslateY.value = 12;

    entryOpacity.value = withTiming(1, {
      duration: 180,
      easing: Easing.out(Easing.quad),
    });

    entryScale.value = withTiming(1, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });

    entryTranslateY.value = withTiming(
      0,
      {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      },
      (finished) => {
        if (!finished) return;
        if (onPopInAnimationEnd) runOnJS(onPopInAnimationEnd)(task.id);
      },
    );
  }, [
    entryOpacity,
    entryScale,
    entryTranslateY,
    onPopInAnimationEnd,
    shouldPopIn,
    task.id,
  ]);

  const commitLeft = React.useCallback(() => {
    if (leftAction) {
      leftAction.onTrigger(task.id);
      void Haptics.notificationAsync(
        leftAction.haptic ?? Haptics.NotificationFeedbackType.Success,
      ).catch(() => undefined);
      return;
    }
    toggleComplete(task.id);
    void Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success,
    ).catch(() => undefined);
  }, [leftAction, task.id, toggleComplete]);

  const commitRight = React.useCallback(() => {
    if (rightAction) {
      rightAction.onTrigger(task.id);
      void Haptics.notificationAsync(
        rightAction.haptic ?? Haptics.NotificationFeedbackType.Warning,
      ).catch(() => undefined);
      return;
    }
    deleteTask(task.id);
    void Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Warning,
    ).catch(() => undefined);
  }, [deleteTask, rightAction, task.id]);

  const emitThresholdHaptic = React.useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
      () => undefined,
    );
  }, []);

  const dismiss = React.useCallback(
    (sign: -1 | 1) => {
      "worklet";
      const width = rowWidth.value > 0 ? rowWidth.value : 420;
      const target = (width + 96) * sign;

      swipeVisualAlpha.value = withTiming(0, {
        duration: 140,
        easing: Easing.out(Easing.cubic),
      });
      rowOpacity.value = withTiming(0, {
        duration: 170,
        easing: Easing.out(Easing.cubic),
      });
      rowScale.value = withTiming(0.985, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });
      translateX.value = withTiming(target, {
        duration: 240,
        easing: Easing.out(Easing.cubic),
      });
      collapse.value = withDelay(
        40,
        withTiming(
          1,
          { duration: 220, easing: Easing.out(Easing.cubic) },
          (finished) => {
            if (!finished) return;
            if (sign > 0) {
              runOnJS(commitLeft)();
            } else {
              runOnJS(commitRight)();
            }
            runOnJS(endSwipe)(task.id);
          },
        ),
      );
    },
    [
      collapse,
      commitLeft,
      commitRight,
      endSwipe,
      rowOpacity,
      rowScale,
      rowWidth,
      swipeVisualAlpha,
      task.id,
      translateX,
    ],
  );

  const onPressComplete = React.useCallback(() => {
    // Close any other open rows before acting.
    beginSwipe(task.id);
    runOnUI(dismiss)(1);
  }, [beginSwipe, dismiss, task.id]);

  const onPressDelete = React.useCallback(() => {
    beginSwipe(task.id);
    runOnUI(dismiss)(-1);
  }, [beginSwipe, dismiss, task.id]);

  const handleLongPressDrag = React.useCallback(() => {
    suppressNextPressRef.current = true;
    runOnUI(() => {
      "worklet";
      dragArmed.value = 1;
    })();
    onTouchInteractionChange?.(task.id, false);
    // Disable scrolling at the native level BEFORE calling drag().
    // This forces the scroll handler to release the current touch,
    // allowing the library's Pan gesture to activate on the SAME touch.
    onBeforeDrag?.();
    drag();
  }, [drag, dragArmed, onBeforeDrag, onTouchInteractionChange, task.id]);

  // ---------- JS timer approach for long-press (does NOT block native gestures) ----------
  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelLongPressTimer = React.useCallback(() => {
    if (longPressTimerRef.current != null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const startLongPressTimer = React.useCallback(() => {
    cancelLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      handleLongPressDrag();
    }, DRAG_LONG_PRESS_DELAY_MS);
  }, [cancelLongPressTimer, handleLongPressDrag]);

  // Cleanup timer on unmount
  React.useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (longPressTimerRef.current != null) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // ---------- Raw touch event handlers for Tap + LongPress ----------
  // These DON'T capture the JS responder (unlike Pressable) and DON'T create
  // native gesture handlers (unlike RNGH Tap/LongPress). They coexist peacefully
  // with both ScrollView and react-native-draggable-flatlist's internal handlers.
  const rowTouchRef = React.useRef<{
    startX: number;
    startY: number;
    at: number;
    moved: boolean;
    ended: boolean;
  }>({ startX: 0, startY: 0, at: 0, moved: false, ended: false });

  const handleRowTouchStart = React.useCallback(
    (e: GestureResponderEvent) => {
      if (isActive) return;
      const touch = e.nativeEvent;
      rowTouchRef.current = {
        startX: touch.pageX,
        startY: touch.pageY,
        at: Date.now(),
        moved: false,
        ended: false,
      };
      isPressed.value = 1;
      onTouchInteractionChange?.(task.id, true);
      startLongPressTimer();
    },
    [isActive, isPressed, onTouchInteractionChange, startLongPressTimer, task.id],
  );

  const handleRowTouchMove = React.useCallback(
    (e: GestureResponderEvent) => {
      if (rowTouchRef.current.ended) return;
      const touch = e.nativeEvent;
      const dx = Math.abs(touch.pageX - rowTouchRef.current.startX);
      const dy = Math.abs(touch.pageY - rowTouchRef.current.startY);
      if (dx > 10 || dy > 10) {
        rowTouchRef.current.moved = true;
        isPressed.value = 0;
        // Don't cancel the long press timer here — only cancel for fast movements
        // (scroll/swipe). The pan gesture's own handlers cancel it for swipes.
        // For vertical scroll, the scroll takes over but the timer should still fire
        // if the user hasn't moved too far.
        if (dx > 20 || dy > 20) {
          cancelLongPressTimer();
        }
      }
    },
    [cancelLongPressTimer, isPressed],
  );

  const handleRowTouchEnd = React.useCallback(
    (e: GestureResponderEvent) => {
      if (rowTouchRef.current.ended) return;
      rowTouchRef.current.ended = true;
      isPressed.value = 0;
      onTouchInteractionChange?.(task.id, false);
      cancelLongPressTimer();

      // Detect tap: quick release, minimal movement, not after a drag
      const dt = Date.now() - rowTouchRef.current.at;
      if (
        !rowTouchRef.current.moved &&
        dt < DRAG_LONG_PRESS_DELAY_MS &&
        !suppressNextPressRef.current &&
        !isActive &&
        dragArmed.value !== 1
      ) {
        onPressTask(task.id);
      }
      // Reset suppress flag after the event loop
      requestAnimationFrame(() => {
        suppressNextPressRef.current = false;
      });
    },
    [cancelLongPressTimer, dragArmed, isActive, isPressed, onPressTask, onTouchInteractionChange, task.id],
  );

  const handleRowTouchCancel = React.useCallback(() => {
    if (rowTouchRef.current.ended) return;
    rowTouchRef.current.ended = true;
    isPressed.value = 0;
    onTouchInteractionChange?.(task.id, false);
    cancelLongPressTimer();
  }, [cancelLongPressTimer, isPressed, onTouchInteractionChange, task.id]);

  // ---------- Swipe via raw touch events ----------
  // NO GestureDetector = no RNGH handlers on the row = library's drag Pan
  // has full, unblocked control. Raw touch events don't capture the JS responder
  // either, so RNGH scroll works freely.
  const swipeRef = React.useRef<{
    startX: number;
    startY: number;
    startAt: number;
    axisLocked: "none" | "horizontal" | "vertical";
    swiping: boolean;
    ended: boolean;
  }>({ startX: 0, startY: 0, startAt: 0, axisLocked: "none", swiping: false, ended: false });

  const handleSwipeTouchStart = React.useCallback(
    (e: GestureResponderEvent) => {
      if (isActive) return;
      const t = e.nativeEvent;
      swipeRef.current = {
        startX: t.pageX,
        startY: t.pageY,
        startAt: Date.now(),
        axisLocked: "none",
        swiping: false,
        ended: false,
      };
      startOffsetX.value = translateX.value;
      onTouchInteractionChange?.(task.id, true);
      startLongPressTimer();
    },
    [isActive, onTouchInteractionChange, startLongPressTimer, startOffsetX, task.id, translateX],
  );

  const handleSwipeTouchMove = React.useCallback(
    (e: GestureResponderEvent) => {
      if (swipeRef.current.ended || isActive) return;
      const t = e.nativeEvent;
      const dx = t.pageX - swipeRef.current.startX;
      const dy = t.pageY - swipeRef.current.startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      // Axis lock decision
      if (swipeRef.current.axisLocked === "none") {
        if (absY >= SWIPE_FAIL_OFFSET_Y && absY > absX + SWIPE_AXIS_LOCK_BIAS) {
          // Vertical scroll — cancel everything, let scroll take over
          swipeRef.current.axisLocked = "vertical";
          cancelLongPressTimer();
          return;
        }
        if (absX >= SWIPE_MIN_DRAG_X && absX > absY + SWIPE_AXIS_LOCK_BIAS) {
          // Horizontal swipe — start swiping
          swipeRef.current.axisLocked = "horizontal";
          swipeRef.current.swiping = true;
          cancelLongPressTimer();
          thresholdHapticSent.value = 0;
          if (swipeGestureActive.value === 0) {
            swipeGestureActive.value = 1;
            reportSwipeGestureActive(true);
          }
          rowOpacity.value = 1;
          rowScale.value = 1;
          swipeVisualAlpha.value = 1;
          collapse.value = 0;
          beginSwipe(task.id);
        }
        // If movement > 20px in any direction and no long press yet, cancel timer
        if (absX > 20 || absY > 20) {
          cancelLongPressTimer();
        }
        return;
      }

      if (swipeRef.current.axisLocked === "vertical") return;

      // Drive swipe animation from JS — sets shared value which animates on UI thread
      let raw = startOffsetX.value + dx;
      if (startOffsetX.value > 0) raw = Math.max(0, raw);
      if (startOffsetX.value < 0) raw = Math.min(0, raw);
      const sign: -1 | 0 | 1 = raw > 0 ? 1 : raw < 0 ? -1 : 0;
      direction.value = sign;

      const abs = Math.abs(raw);
      const beyond = Math.max(0, abs - SWIPE_STOP);
      const resisted = SWIPE_STOP + beyond * SWIPE_ELASTIC;
      const nextAbs = abs <= SWIPE_STOP ? abs : resisted;
      const target = nextAbs * sign;
      translateX.value = translateX.value + (target - translateX.value) * 0.55;

      if (
        thresholdHapticSent.value === 0 &&
        sign !== 0 &&
        Math.abs(raw) >= SWIPE_HAPTIC_AND_ACTION_FINGER
      ) {
        thresholdHapticSent.value = 1;
        emitThresholdHaptic();
      }
    },
    [
      beginSwipe,
      cancelLongPressTimer,
      collapse,
      direction,
      emitThresholdHaptic,
      isActive,
      reportSwipeGestureActive,
      rowOpacity,
      rowScale,
      startOffsetX,
      swipeGestureActive,
      swipeVisualAlpha,
      task.id,
      thresholdHapticSent,
      translateX,
    ],
  );

  const handleSwipeTouchEnd = React.useCallback(
    (e: GestureResponderEvent) => {
      if (swipeRef.current.ended) return;
      swipeRef.current.ended = true;
      onTouchInteractionChange?.(task.id, false);
      cancelLongPressTimer();

      if (swipeRef.current.swiping) {
        // End swipe — snap/dismiss logic
        const t = e.nativeEvent;
        const dx = t.pageX - swipeRef.current.startX;
        let raw = startOffsetX.value + dx;
        if (startOffsetX.value > 0) raw = Math.max(0, raw);
        if (startOffsetX.value < 0) raw = Math.min(0, raw);
        const sign: -1 | 0 | 1 = raw > 0 ? 1 : raw < 0 ? -1 : 0;
        const abs = Math.abs(translateX.value);
        const absFinger = Math.abs(raw);
        const springCfg = { damping: 34, stiffness: 420, mass: 0.9, overshootClamping: true };

        if (abs >= SWIPE_TRIGGER || absFinger >= SWIPE_HAPTIC_AND_ACTION_FINGER) {
          direction.value = 0;
          if (sign !== 0) dismiss(sign as -1 | 1);
        } else {
          const CLOSE_SNAP = SWIPE_STOP * 0.72;
          if (abs < CLOSE_SNAP) {
            translateX.value = withSpring(0, springCfg);
            direction.value = 0;
          } else if (abs >= SWIPE_OPEN_THRESHOLD) {
            translateX.value = withSpring(SWIPE_STOP * sign, springCfg);
            direction.value = sign;
          } else {
            translateX.value = withSpring(0, springCfg);
            direction.value = 0;
          }
        }
        if (swipeGestureActive.value === 1) {
          swipeGestureActive.value = 0;
          reportSwipeGestureActive(false);
        }
        thresholdHapticSent.value = 0;
        endSwipe(task.id);
        return;
      }

      // Not swiping — detect tap
      const dt = Date.now() - swipeRef.current.startAt;
      if (
        swipeRef.current.axisLocked === "none" &&
        dt < DRAG_LONG_PRESS_DELAY_MS &&
        !isActive
      ) {
        onPressTask(task.id);
      }
      endSwipe(task.id);
    },
    [
      cancelLongPressTimer,
      direction,
      dismiss,
      endSwipe,
      isActive,
      onPressTask,
      onTouchInteractionChange,
      reportSwipeGestureActive,
      startOffsetX,
      swipeGestureActive,
      task.id,
      thresholdHapticSent,
      translateX,
    ],
  );

  const handleSwipeTouchCancel = React.useCallback(() => {
    if (swipeRef.current.ended) return;
    swipeRef.current.ended = true;
    onTouchInteractionChange?.(task.id, false);
    cancelLongPressTimer();
    if (swipeRef.current.swiping) {
      translateX.value = withSpring(0, { damping: 34, stiffness: 420, mass: 0.9, overshootClamping: true });
      direction.value = 0;
      if (swipeGestureActive.value === 1) {
        swipeGestureActive.value = 0;
        reportSwipeGestureActive(false);
      }
      thresholdHapticSent.value = 0;
      endSwipe(task.id);
    }
  }, [cancelLongPressTimer, direction, endSwipe, onTouchInteractionChange, reportSwipeGestureActive, swipeGestureActive, task.id, thresholdHapticSent, translateX]);

  const spacerAnimatedStyle = useAnimatedStyle(() => {
    const p = 1 - collapse.value;
    const measuredRowHeight = rowHeight.value;
    return {
      height: measuredRowHeight > 0 ? measuredRowHeight * p : undefined,
      marginBottom: isLast ? 0 : itemSpacing * p,
      overflow: isActive ? "visible" : "hidden",
    };
  }, [isActive, itemSpacing, isLast]);

  const clipStyle = React.useMemo(
    () => [
      styles.swipeClip,
      swipeClipStyle,
      isActive ? { overflow: "visible" as const } : null,
    ],
    [isActive, styles.swipeClip, swipeClipStyle],
  );

  const underlayGreenStyle = useAnimatedStyle(() => {
    const tx = translateX.value;
    const visible = tx > 0 ? Math.min(1, tx / SWIPE_STOP) : 0;
    const boost =
      tx > SWIPE_STOP
        ? Math.min(1, (tx - SWIPE_STOP) / (SWIPE_TRIGGER - SWIPE_STOP))
        : 0;
    return {
      opacity: visible * swipeVisualAlpha.value,
      backgroundColor: leftAction?.backgroundColor ?? swipeCompleteBg,
      transform: [{ scaleX: 1 + boost * 0.03 }],
    };
  }, [leftAction?.backgroundColor, swipeCompleteBg]);

  const underlayRedStyle = useAnimatedStyle(() => {
    const tx = translateX.value;
    const visible = tx < 0 ? Math.min(1, -tx / SWIPE_STOP) : 0;
    const boost =
      tx < -SWIPE_STOP
        ? Math.min(1, (-tx - SWIPE_STOP) / (SWIPE_TRIGGER - SWIPE_STOP))
        : 0;
    return {
      opacity: visible * swipeVisualAlpha.value,
      backgroundColor: rightAction?.backgroundColor ?? swipeDeleteBg,
      transform: [{ scaleX: 1 + boost * 0.03 }],
    };
  }, [rightAction?.backgroundColor, swipeDeleteBg]);

  const leftIconStyle = useAnimatedStyle(() => {
    const tx = translateX.value;
    if (tx <= 0) return { opacity: 0 };
    const p = Math.min(1, tx / SWIPE_STOP);
    const armed =
      tx >= SWIPE_TRIGGER
        ? 1
        : Math.max(0, (tx - SWIPE_STOP) / (SWIPE_TRIGGER - SWIPE_STOP));
    const scale = interpolate(p, [0, 1], [0.92, 1], Extrapolation.CLAMP);
    const bump = interpolate(armed, [0, 1], [0, 0.08], Extrapolation.CLAMP);
    return {
      opacity:
        interpolate(p, [0, 0.12, 1], [0, 1, 1], Extrapolation.CLAMP) *
        swipeVisualAlpha.value,
      transform: [{ scale: scale + bump }],
    };
  });

  const rightIconStyle = useAnimatedStyle(() => {
    const tx = translateX.value;
    if (tx >= 0) return { opacity: 0 };
    const abs = Math.min(1, -tx / SWIPE_STOP);
    const armed =
      -tx >= SWIPE_TRIGGER
        ? 1
        : Math.max(0, (-tx - SWIPE_STOP) / (SWIPE_TRIGGER - SWIPE_STOP));
    const scale = interpolate(abs, [0, 1], [0.92, 1], Extrapolation.CLAMP);
    const bump = interpolate(armed, [0, 1], [0, 0.08], Extrapolation.CLAMP);
    return {
      opacity:
        interpolate(abs, [0, 0.12, 1], [0, 1, 1], Extrapolation.CLAMP) *
        swipeVisualAlpha.value,
      transform: [{ scale: scale + bump }],
    };
  });

  const rowAnimatedStyle = useAnimatedStyle(() => {
    // When pressed, gracefully shrink the scale slightly and drop opacity
    const pressedScale = isPressed.value === 1 ? 0.98 : 1;
    const pressedOpacity = isPressed.value === 1 ? 0.9 : 1;

    return {
      opacity: rowOpacity.value * entryOpacity.value * pressedOpacity,
      transform: [
        { translateX: translateX.value },
        { translateY: entryTranslateY.value },
        { scale: rowScale.value * entryScale.value * pressedScale },
      ],
    };
  });

  const tagChips = React.useMemo<TagChipModel[]>(() => {
    if (enabledTags.size === 0) return [];

    const chips: TagChipModel[] = [];

    const now = Date.now();
    const isOverdue = (() => {
      if (task.section === "completed") return false;
      if (!Number.isFinite(task.dueAt) || task.dueAt <= 0) return false;

      // If the task has no explicit time, treat it as due "by end of day".
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

      // Has time (or unknown): overdue once the timestamp passed.
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
        // Suppress redundant date chip when it matches the currently viewed day.
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
    task.location,
    task.notes,
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
              subtask.done
                ? "rgba(52,199,89,0.92)"
                : "rgba(127,127,127,0.72)"
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
  const hasExtraInfo = hasSubtitle || tagChips.length > 0 || compactSubtasks.length > 0;
  const rowContentStyle = React.useMemo(
    () => [styles.row, rowStyle, isActive ? styles.dragRow : undefined],
    [isActive, rowStyle, styles.dragRow, styles.row],
  );
  const rowSurfaceColor = React.useMemo(() => {
    const flattened = StyleSheet.flatten(rowContentStyle);
    const resolved = flattened?.backgroundColor;
    if (typeof resolved === "string" && resolved.length > 0) return resolved;
    return isDark ? "#1C1C1E" : "#FFFFFF";
  }, [isDark, rowContentStyle]);
  const rowTintColor = React.useMemo(
    () =>
      rowSurfaceColor.startsWith("#")
        ? withAlpha(rowSurfaceColor, isDark ? 0.88 : 0.9)
        : rowSurfaceColor,
    [isDark, rowSurfaceColor],
  );

  const emojiTileView = showTaskIcons ? (
    <View
      style={[
        styles.emojiTile,
        {
          backgroundColor: projectBgColor ?? emojiTint,
          borderColor: projectBgColor ? projectEmojiBorderColor ?? emojiFallback : emojiFallback,
          borderWidth: StyleSheet.hairlineWidth,
        },
      ]}
    >
      <Text style={[styles.emojiText, { opacity: projectBgColor ? 1 : 0.92 }]}>
        {task.emoji}
      </Text>
    </View>
  ) : null;

  return (
    <Animated.View style={[styles.itemSpacer, itemSpacerStyle, spacerAnimatedStyle]}>
      <View style={clipStyle}>
        <Animated.View style={[styles.underlay, underlayGreenStyle]} />
        <Animated.View style={[styles.underlay, underlayRedStyle]} />

        <Pressable
          style={[
            styles.actionSlot,
            styles.actionSlotLeft,
            { width: SWIPE_STOP },
          ]}
          onPress={onPressComplete}
          hitSlop={10}
        >
          <View style={styles.actionSlotInner}>
            <Animated.View style={leftIconStyle}>
              <MaterialIcons
                name={
                  leftAction?.icon ??
                  (task.section === "completed" ? "undo" : "check")
                }
                size={26}
                color="#FFFFFF"
              />
            </Animated.View>
          </View>
        </Pressable>

        <Pressable
          style={[
            styles.actionSlot,
            styles.actionSlotRight,
            { width: SWIPE_STOP },
          ]}
          onPress={onPressDelete}
          hitSlop={10}
        >
          <View style={styles.actionSlotInner}>
            <Animated.View style={rightIconStyle}>
              <MaterialIcons
                name={rightAction?.icon ?? "delete"}
                size={26}
                color="#FFFFFF"
              />
            </Animated.View>
          </View>
        </Pressable>

        <Animated.View
          style={rowAnimatedStyle}
          onTouchStart={handleSwipeTouchStart}
          onTouchMove={handleSwipeTouchMove}
          onTouchEnd={handleSwipeTouchEnd}
          onTouchCancel={handleSwipeTouchCancel}
        >
          <Animated.View
            onLayout={(e) => {
              rowWidth.value = e.nativeEvent.layout.width;
              rowHeight.value = e.nativeEvent.layout.height;
            }}
          >
            <GlassSurface
              style={rowContentStyle}
              glassEffectStyle="regular"
              tintColor={rowTintColor}
              fallbackBackgroundColor={rowSurfaceColor}
              isInteractive
            >
              <View style={[styles.rowInner, !hasExtraInfo ? { alignItems: "center" } : null]}>
                {emojiTileView}
                <View style={[styles.textStack, !hasExtraInfo ? { justifyContent: "center" } : null]}>
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
              </View>
            </GlassSurface>
          </Animated.View>
        </Animated.View>
      </View>
    </Animated.View>
  );
});
