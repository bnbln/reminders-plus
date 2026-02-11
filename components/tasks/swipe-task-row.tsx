import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  runOnUI,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

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
const SWIPE_FAIL_OFFSET_Y = 18;
const AXIS_LOCK_THRESHOLD = 4;
const MIN_SWIPE_X = 12;
const MIN_SCROLL_Y = 10;
const COMPACT_SUBTASK_ICON_SIZE = 21;
const COMPACT_SUBTASK_TEXT_SIZE = 17;
// Small delay to separate horizontal swipe intent from long-press drag.
const SWIPE_ARM_DELAY_MS = 170;
const DRAG_LONG_PRESS_DELAY_MS = 560;

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
  shouldPopIn?: boolean;
  onPopInAnimationEnd?: (taskId: string) => void;
};

export const SwipeTaskRow = React.memo(function SwipeTaskRow({
  task,
  project,
  drag,
  isActive,
  styles,
  itemSpacing = 12,
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
  shouldPopIn = false,
  onPopInAnimationEnd,
}: SwipeTaskRowProps) {
  const translateX = useSharedValue(0);
  const direction = useSharedValue<-1 | 0 | 1>(0);
  const startOffsetX = useSharedValue(0);
  const rowWidth = useSharedValue(0);
  const rowHeight = useSharedValue(0);
  const rowOpacity = useSharedValue(1);
  const rowScale = useSharedValue(1);
  const entryOpacity = useSharedValue(1);
  const entryScale = useSharedValue(1);
  const swipeVisualAlpha = useSharedValue(1);
  const collapse = useSharedValue(0);
  const touchStartX = useSharedValue(0);
  const touchStartY = useSharedValue(0);
  const touchStartAt = useSharedValue(0);
  const axisDecision = useSharedValue<0 | 1>(0);
  const swipeGestureActive = useSharedValue(0);
  const thresholdHapticSent = useSharedValue(0);

  const reportSwipeGestureActive = React.useCallback(
    (active: boolean) => {
      onSwipeGestureActiveChange?.(task.id, active);
    },
    [onSwipeGestureActiveChange, task.id],
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
    if (!shouldPopIn) return;

    entryOpacity.value = 0.78;
    entryScale.value = 1.22;

    entryOpacity.value = withTiming(1, {
      duration: 230,
      easing: Easing.inOut(Easing.exp),
    });

    entryScale.value = withSequence(
      withTiming(0.94, {
        duration: 220,
        easing: Easing.inOut(Easing.exp),
      }),
      withSpring(
        1,
        {
          damping: 5.8,
          stiffness: 260,
          mass: 0.52,
          overshootClamping: false,
        },
        (finished) => {
          if (!finished) return;
          if (onPopInAnimationEnd) runOnJS(onPopInAnimationEnd)(task.id);
        },
      ),
    );
  }, [entryOpacity, entryScale, onPopInAnimationEnd, shouldPopIn, task.id]);

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

  const gesture = React.useMemo(() => {
    const nativeScroll = Gesture.Native();

    let pan = Gesture.Pan()
      .enabled(!isActive)
      .manualActivation(true)
      .activeOffsetX([-SWIPE_ACTIVE_OFFSET_X, SWIPE_ACTIVE_OFFSET_X])
      .failOffsetY([-SWIPE_FAIL_OFFSET_Y, SWIPE_FAIL_OFFSET_Y]);

    pan = pan.onTouchesDown((event) => {
      "worklet";
      const touch = event.allTouches[0];
      if (!touch) return;
      touchStartX.value = touch.x;
      touchStartY.value = touch.y;
      touchStartAt.value = Date.now();
      axisDecision.value = 0;
      swipeGestureActive.value = 0;
      thresholdHapticSent.value = 0;
    });

    pan = pan.onTouchesMove((event, state) => {
      "worklet";
      if (axisDecision.value === 1) return;
      const touch = event.allTouches[0];
      if (!touch) return;
      const dx = touch.x - touchStartX.value;
      const dy = touch.y - touchStartY.value;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const touchAgeMs = Date.now() - touchStartAt.value;

      const horizontalIntent =
        touchAgeMs >= SWIPE_ARM_DELAY_MS &&
        absX > MIN_SWIPE_X &&
        absX > absY * 1.15 + AXIS_LOCK_THRESHOLD;
      const verticalIntent =
        absY > MIN_SCROLL_Y && absY > absX * 1.1 + AXIS_LOCK_THRESHOLD;

      if (verticalIntent) {
        axisDecision.value = 1;
        state.fail();
        return;
      }

      if (horizontalIntent) {
        axisDecision.value = 1;
        if (swipeGestureActive.value === 0) {
          swipeGestureActive.value = 1;
          runOnJS(reportSwipeGestureActive)(true);
        }
        state.activate();
      }
    });

    pan = pan.onStart(() => {
      "worklet";
      thresholdHapticSent.value = 0;
      if (swipeGestureActive.value === 0) {
        swipeGestureActive.value = 1;
        runOnJS(reportSwipeGestureActive)(true);
      }
      startOffsetX.value = translateX.value;
      // If we previously dismissed and the key was reused, ensure we're back to a clean state.
      rowOpacity.value = 1;
      rowScale.value = 1;
      swipeVisualAlpha.value = 1;
      collapse.value = 0;
      runOnJS(beginSwipe)(task.id);
    });

    pan = pan.onUpdate((event) => {
      "worklet";
      let raw = startOffsetX.value + event.translationX;
      // Safety: if we're closing an already-open side, don't allow crossing through
      // to the opposite side in the same gesture.
      if (startOffsetX.value > 0) raw = Math.max(0, raw);
      if (startOffsetX.value < 0) raw = Math.min(0, raw);
      const sign: -1 | 0 | 1 = raw > 0 ? 1 : raw < 0 ? -1 : 0;
      direction.value = sign;

      const abs = Math.abs(raw);
      const beyond = Math.max(0, abs - SWIPE_STOP);
      // Gentle resistance to avoid wobble.
      const resisted = SWIPE_STOP + beyond * SWIPE_ELASTIC;
      const nextAbs = abs <= SWIPE_STOP ? abs : resisted;
      // Slight smoothing for a softer feel.
      const target = nextAbs * sign;
      translateX.value = translateX.value + (target - translateX.value) * 0.55;

      if (
        thresholdHapticSent.value === 0 &&
        sign !== 0 &&
        Math.abs(raw) >= SWIPE_HAPTIC_AND_ACTION_FINGER
      ) {
        thresholdHapticSent.value = 1;
        runOnJS(emitThresholdHaptic)();
      }
    });

    pan = pan.onEnd((event) => {
      "worklet";
      let raw = startOffsetX.value + event.translationX;
      if (startOffsetX.value > 0) raw = Math.max(0, raw);
      if (startOffsetX.value < 0) raw = Math.min(0, raw);

      const sign: -1 | 0 | 1 = raw > 0 ? 1 : raw < 0 ? -1 : 0;
      const abs = Math.abs(translateX.value);
      const absFinger = Math.abs(raw);
      const v = Math.max(-1200, Math.min(1200, event.velocityX));

      const springCfg = {
        damping: 34,
        stiffness: 420,
        mass: 0.9,
        overshootClamping: true,
        velocity: v,
      };

      // Also allow triggering based on finger travel to make "through the stop" easier,
      // even with resistance/smoothing.
      if (abs >= SWIPE_TRIGGER || absFinger >= SWIPE_HAPTIC_AND_ACTION_FINGER) {
        // Trigger action, animate row off before committing.
        direction.value = 0;
        if (sign !== 0) dismiss(sign as -1 | 1);
        return;
      }

      // Snap logic tuned to make returning to "closed" easy from the stop state.
      const CLOSE_SNAP = SWIPE_STOP * 0.72;
      if (abs < CLOSE_SNAP) {
        translateX.value = withSpring(0, springCfg);
        direction.value = 0;
        return;
      }

      if (abs >= SWIPE_OPEN_THRESHOLD) {
        translateX.value = withSpring(SWIPE_STOP * sign, springCfg);
        direction.value = sign;
        return;
      }

      translateX.value = withSpring(0, springCfg);
      direction.value = 0;
    });

    pan = pan.onFinalize(() => {
      "worklet";
      thresholdHapticSent.value = 0;
      if (swipeGestureActive.value === 1) {
        swipeGestureActive.value = 0;
        runOnJS(reportSwipeGestureActive)(false);
      }
      runOnJS(endSwipe)(task.id);
    });

    // Keep native scroll and row pan simultaneous, then let offsets decide intent.
    if (typeof (pan as any).simultaneousWithExternalGesture === "function") {
      return externalScrollRef
        ? (pan as any).simultaneousWithExternalGesture(
            nativeScroll,
            externalScrollRef,
          )
        : (pan as any).simultaneousWithExternalGesture(nativeScroll);
    }
    return Gesture.Simultaneous(nativeScroll, pan);
  }, [
    axisDecision,
    beginSwipe,
    collapse,
    dismiss,
    direction,
    endSwipe,
    externalScrollRef,
    isActive,
    rowOpacity,
    rowScale,
    reportSwipeGestureActive,
    startOffsetX,
    swipeGestureActive,
    swipeVisualAlpha,
    task.id,
    thresholdHapticSent,
    touchStartX,
    touchStartY,
    touchStartAt,
    translateX,
    emitThresholdHaptic,
  ]);

  const spacerAnimatedStyle = useAnimatedStyle(() => {
    const p = 1 - collapse.value;
    if (rowHeight.value <= 0) return {};
    return {
      height: rowHeight.value * p,
      marginBottom: itemSpacing * p,
      overflow: isActive ? "visible" : "hidden",
    };
  }, [isActive, itemSpacing]);

  const clipStyle = React.useMemo(
    () => [styles.swipeClip, isActive ? { overflow: "visible" as const } : null],
    [isActive, styles.swipeClip],
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

  const rowAnimatedStyle = useAnimatedStyle(() => ({
    opacity: rowOpacity.value * entryOpacity.value,
    transform: [
      { translateX: translateX.value },
      { scale: rowScale.value * entryScale.value },
    ],
  }));

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
    <View style={{ marginTop: 4, gap: 6 }}>
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
              gap: 8,
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
                lineHeight: Math.round(COMPACT_SUBTASK_TEXT_SIZE * 1.2),
                fontWeight: "500",
                textDecorationLine: subtask.done ? "line-through" : "none",
                opacity: subtask.done ? 0.55 : 0.82,
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

  const emojiTileView = showTaskIcons ? (
    <View
      style={[
        styles.emojiTile,
        {
          backgroundColor: emojiTint,
          borderColor: emojiFallback,
        },
      ]}
    >
      <Text style={styles.emojiText}>{task.emoji}</Text>
    </View>
  ) : null;

  return (
    <Animated.View style={[styles.itemSpacer, spacerAnimatedStyle]}>
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
          <Animated.View style={[styles.actionSlotInner, leftIconStyle]}>
            <MaterialIcons
              name={
                leftAction?.icon ??
                (task.section === "completed" ? "undo" : "check")
              }
              size={22}
              color="white"
            />
          </Animated.View>
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
          <Animated.View style={[styles.actionSlotInner, rightIconStyle]}>
            <MaterialIcons
              name={rightAction?.icon ?? "delete"}
              size={22}
              color="white"
            />
          </Animated.View>
        </Pressable>

        <GestureDetector gesture={gesture}>
          <Animated.View style={rowAnimatedStyle}>
            <Pressable
              onLongPress={drag}
              delayLongPress={DRAG_LONG_PRESS_DELAY_MS}
              pressRetentionOffset={{ top: 8, bottom: 8, left: 6, right: 6 }}
              onPressIn={() => {
                onTouchInteractionChange?.(task.id, true);
              }}
              onPressOut={() => {
                onTouchInteractionChange?.(task.id, false);
              }}
              onLayout={(e) => {
                rowWidth.value = e.nativeEvent.layout.width;
                rowHeight.value = e.nativeEvent.layout.height;
              }}
              onPress={() => {
                onPressTask(task.id);
              }}
            >
              <View style={[styles.row, isActive ? styles.dragRow : undefined]}>
                <View style={styles.rowInner}>
                  {emojiTileView}
                  <View style={styles.textStack}>
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
              </View>
            </Pressable>
          </Animated.View>
        </GestureDetector>
      </View>
    </Animated.View>
  );
});
