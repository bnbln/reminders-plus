import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
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
} from 'react-native-reanimated';

import { GlassSurface } from '@/components/ui/glass-surface';
import { TAG_DEFS, TAG_ORDER, type TagId } from '@/context/home-filters-store';
import type { Project, Task } from '@/context/tasks-store';

const SWIPE_STOP = 76;
const SWIPE_OPEN_THRESHOLD = 22;
// Trigger should require a deliberate, stronger swipe.
const SWIPE_TRIGGER = 132;
const SWIPE_ELASTIC = 0.55;

type TagChipModel = {
  key: string;
  tagId: TagId;
  label: string;
  tone?: 'neutral' | 'danger';
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
  if (!Number.isFinite(dueAt) || dueAt <= 0) return 'Kein Datum';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const due = new Date(dueAt);
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());

  const dayLabel =
    dueDay.getTime() === today.getTime()
      ? 'Heute'
      : dueDay.getTime() === tomorrow.getTime()
        ? 'Morgen'
        : new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(due);

  if (!dueHasTime) return dayLabel;

  const timeLabel = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(due);
  return `${dayLabel} ${timeLabel}`;
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
  rowTitle: any;
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
  glassDragTint: string;
  glassDragFallback: string;
  emojiTint: string;
  emojiFallback: string;
  swipeCompleteBg: string;
  swipeDeleteBg: string;
  enabledTags: Set<TagId>;
  showTaskIcons: boolean;
  beginSwipe: (taskId: string) => void;
  endSwipe: (taskId: string) => void;
  registerClose: (taskId: string, close: () => void) => void;
  unregisterClose: (taskId: string) => void;
  closeAnyOpen: () => void;
  onPressTask: (taskId: string) => void;
  toggleComplete: (taskId: string) => void;
  deleteTask: (taskId: string) => void;
};

export const SwipeTaskRow = React.memo(function SwipeTaskRow({
  task,
  project,
  drag,
  isActive,
  styles,
  glassDragTint,
  glassDragFallback,
  emojiTint,
  emojiFallback,
  swipeCompleteBg,
  swipeDeleteBg,
  enabledTags,
  showTaskIcons,
  beginSwipe,
  endSwipe,
  registerClose,
  unregisterClose,
  closeAnyOpen,
  onPressTask,
  toggleComplete,
  deleteTask,
}: SwipeTaskRowProps) {
  const translateX = useSharedValue(0);
  const direction = useSharedValue<-1 | 0 | 1>(0);
  const startOffsetX = useSharedValue(0);
  const rowWidth = useSharedValue(0);
  const rowHeight = useSharedValue(0);
  const rowOpacity = useSharedValue(1);
  const rowScale = useSharedValue(1);
  const swipeVisualAlpha = useSharedValue(1);
  const collapse = useSharedValue(0);

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

  const commitComplete = React.useCallback(() => {
    toggleComplete(task.id);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, [task.id, toggleComplete]);

  const commitDelete = React.useCallback(() => {
    deleteTask(task.id);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
  }, [deleteTask, task.id]);

  const dismiss = React.useCallback(
    (sign: -1 | 1) => {
      'worklet';
      const width = rowWidth.value > 0 ? rowWidth.value : 420;
      const target = (width + 96) * sign;

      swipeVisualAlpha.value = withTiming(0, { duration: 140, easing: Easing.out(Easing.cubic) });
      rowOpacity.value = withTiming(0, { duration: 170, easing: Easing.out(Easing.cubic) });
      rowScale.value = withTiming(0.985, { duration: 220, easing: Easing.out(Easing.cubic) });
      translateX.value = withTiming(target, { duration: 240, easing: Easing.out(Easing.cubic) });
      collapse.value = withDelay(
        40,
        withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }, (finished) => {
          if (!finished) return;
          if (sign > 0) {
            runOnJS(commitComplete)();
          } else {
            runOnJS(commitDelete)();
          }
          runOnJS(endSwipe)(task.id);
        })
      );
    },
    [collapse, commitComplete, commitDelete, endSwipe, rowOpacity, rowScale, rowWidth, swipeVisualAlpha, task.id, translateX]
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
    const pan = Gesture.Pan()
      .enabled(!isActive)
      .activeOffsetX([-6, 6])
      .failOffsetY([-12, 12])
      .onStart(() => {
        startOffsetX.value = translateX.value;
        // If we previously dismissed and the key was reused, ensure we're back to a clean state.
        rowOpacity.value = 1;
        rowScale.value = 1;
        swipeVisualAlpha.value = 1;
        collapse.value = 0;
        runOnJS(beginSwipe)(task.id);
      })
      .onUpdate((event) => {
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
      })
      .onEnd((event) => {
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
        const triggerFinger = SWIPE_STOP + (SWIPE_TRIGGER - SWIPE_STOP) / SWIPE_ELASTIC;
        if (abs >= SWIPE_TRIGGER || absFinger >= triggerFinger) {
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
      })
      .onFinalize(() => {
        runOnJS(endSwipe)(task.id);
      });

    const tap = Gesture.Tap()
      .enabled(Platform.OS === 'ios' && !isActive)
      .maxDistance(8)
      .onEnd(() => {
        runOnJS(onPressTask)(task.id);
      });

    return Gesture.Race(pan, tap);
  }, [beginSwipe, collapse, dismiss, direction, endSwipe, isActive, onPressTask, rowOpacity, rowScale, startOffsetX, swipeVisualAlpha, task.id, translateX]);

  const spacerAnimatedStyle = useAnimatedStyle(() => {
    const p = 1 - collapse.value;
    if (rowHeight.value <= 0) return {};
    return {
      height: rowHeight.value * p,
      marginBottom: 12 * p,
      overflow: 'hidden',
    };
  });

  const clipStyle = React.useMemo(() => styles.swipeClip, [styles.swipeClip]);

  const underlayGreenStyle = useAnimatedStyle(() => {
    const tx = translateX.value;
    const visible = tx > 0 ? Math.min(1, tx / SWIPE_STOP) : 0;
    const boost = tx > SWIPE_STOP ? Math.min(1, (tx - SWIPE_STOP) / (SWIPE_TRIGGER - SWIPE_STOP)) : 0;
    return {
      opacity: visible * swipeVisualAlpha.value,
      backgroundColor: swipeCompleteBg,
      transform: [{ scaleX: 1 + boost * 0.03 }],
    };
  }, [swipeCompleteBg]);

  const underlayRedStyle = useAnimatedStyle(() => {
    const tx = translateX.value;
    const visible = tx < 0 ? Math.min(1, -tx / SWIPE_STOP) : 0;
    const boost = tx < -SWIPE_STOP ? Math.min(1, (-tx - SWIPE_STOP) / (SWIPE_TRIGGER - SWIPE_STOP)) : 0;
    return {
      opacity: visible * swipeVisualAlpha.value,
      backgroundColor: swipeDeleteBg,
      transform: [{ scaleX: 1 + boost * 0.03 }],
    };
  }, [swipeDeleteBg]);

  const leftIconStyle = useAnimatedStyle(() => {
    const tx = translateX.value;
    if (tx <= 0) return { opacity: 0 };
    const p = Math.min(1, tx / SWIPE_STOP);
    const armed = tx >= SWIPE_TRIGGER ? 1 : Math.max(0, (tx - SWIPE_STOP) / (SWIPE_TRIGGER - SWIPE_STOP));
    const scale = interpolate(p, [0, 1], [0.92, 1], Extrapolation.CLAMP);
    const bump = interpolate(armed, [0, 1], [0, 0.08], Extrapolation.CLAMP);
    return {
      opacity: interpolate(p, [0, 0.12, 1], [0, 1, 1], Extrapolation.CLAMP) * swipeVisualAlpha.value,
      transform: [{ scale: scale + bump }],
    };
  });

  const rightIconStyle = useAnimatedStyle(() => {
    const tx = translateX.value;
    if (tx >= 0) return { opacity: 0 };
    const abs = Math.min(1, -tx / SWIPE_STOP);
    const armed = -tx >= SWIPE_TRIGGER ? 1 : Math.max(0, (-tx - SWIPE_STOP) / (SWIPE_TRIGGER - SWIPE_STOP));
    const scale = interpolate(abs, [0, 1], [0.92, 1], Extrapolation.CLAMP);
    const bump = interpolate(armed, [0, 1], [0, 0.08], Extrapolation.CLAMP);
    return {
      opacity: interpolate(abs, [0, 0.12, 1], [0, 1, 1], Extrapolation.CLAMP) * swipeVisualAlpha.value,
      transform: [{ scale: scale + bump }],
    };
  });

  const rowAnimatedStyle = useAnimatedStyle(() => ({
    opacity: rowOpacity.value,
    transform: [{ translateX: translateX.value }, { scale: rowScale.value }],
  }));

  const tagChips = React.useMemo<TagChipModel[]>(() => {
    if (enabledTags.size === 0) return [];

    const chips: TagChipModel[] = [];

    const now = Date.now();
    const isOverdue = task.section !== 'completed' && task.dueAt < now;
    const hashtags = extractHashtags([task.title, task.subtitle, task.notes].filter(Boolean).join(' '));

    for (const tagId of TAG_ORDER) {
      if (!enabledTags.has(tagId)) continue;

      if (tagId === 'overdue') {
        if (!isOverdue) continue;
        chips.push({ key: 'overdue', tagId, label: TAG_DEFS.overdue.title, tone: 'danger' });
        continue;
      }

      if (tagId === 'datetime') {
        chips.push({ key: `dt-${task.dueAt}`, tagId, label: formatDueLabel(task.dueAt, task.dueHasTime) });
        continue;
      }

      if (tagId === 'location') {
        if (!task.location) continue;
        chips.push({ key: `loc-${task.location}`, tagId, label: task.location });
        continue;
      }

      if (tagId === 'project') {
        if (!project) continue;
        chips.push({ key: `proj-${project.id}`, tagId, label: project.name });
        continue;
      }

      if (tagId === 'keywords') {
        if (hashtags.length === 0) continue;
        for (const h of hashtags.slice(0, 3)) {
          chips.push({ key: `kw-${h}`, tagId, label: h });
        }
      }
    }

    return chips;
  }, [enabledTags, project, task.dueAt, task.dueHasTime, task.location, task.notes, task.section, task.subtitle, task.title]);

  const tagsView = tagChips.length ? (
    <View style={styles.tagRow}>
      {tagChips.map((chip) => (
        <View key={chip.key} style={[styles.tagChip, chip.tone === 'danger' ? styles.tagChipDanger : undefined]}>
          <Text style={styles.tagChipText} numberOfLines={1}>
            {chip.label}
          </Text>
        </View>
      ))}
    </View>
  ) : null;

  const emojiTileView = showTaskIcons ? (
    <GlassSurface style={styles.emojiTile} glassEffectStyle="regular" tintColor={emojiTint} fallbackBackgroundColor={emojiFallback}>
      <Text style={styles.emojiText}>{task.emoji}</Text>
    </GlassSurface>
  ) : null;

  return (
    <Animated.View style={[styles.itemSpacer, spacerAnimatedStyle]}>
      <View style={clipStyle}>
        <Animated.View style={[styles.underlay, underlayGreenStyle]} />
        <Animated.View style={[styles.underlay, underlayRedStyle]} />

        <Pressable style={[styles.actionSlot, styles.actionSlotLeft, { width: SWIPE_STOP }]} onPress={onPressComplete} hitSlop={10}>
          <Animated.View style={[styles.actionSlotInner, leftIconStyle]}>
            <MaterialIcons name={task.section === 'completed' ? 'undo' : 'check'} size={22} color="white" />
          </Animated.View>
        </Pressable>
        <Pressable style={[styles.actionSlot, styles.actionSlotRight, { width: SWIPE_STOP }]} onPress={onPressDelete} hitSlop={10}>
          <Animated.View style={[styles.actionSlotInner, rightIconStyle]}>
            <MaterialIcons name="delete" size={22} color="white" />
          </Animated.View>
        </Pressable>

        <GestureDetector gesture={gesture}>
          <Animated.View style={rowAnimatedStyle}>
            <Pressable
              onLongPress={drag}
              delayLongPress={220}
              onLayout={(e) => {
                rowWidth.value = e.nativeEvent.layout.width;
                rowHeight.value = e.nativeEvent.layout.height;
              }}
              onPress={() => {
                if (Platform.OS !== 'ios') onPressTask(task.id);
              }}
            >
              {isActive ? (
                <GlassSurface
                  style={[styles.row, styles.dragRow]}
                  glassEffectStyle="regular"
                  tintColor={glassDragTint}
                  fallbackBackgroundColor={glassDragFallback}
                >
                  <View style={styles.rowInner}>
                    {emojiTileView}
                    <View style={styles.textStack}>
                      <Text style={styles.rowTitle}>{task.title}</Text>
                      {task.subtitle ? <Text style={styles.rowSubtitle}>{task.subtitle}</Text> : null}
                      {tagsView}
                    </View>
                  </View>
                </GlassSurface>
              ) : (
                <View style={styles.row}>
                  <View style={styles.rowInner}>
                    {emojiTileView}
                    <View style={styles.textStack}>
                      <Text style={styles.rowTitle}>{task.title}</Text>
                      {task.subtitle ? <Text style={styles.rowSubtitle}>{task.subtitle}</Text> : null}
                      {tagsView}
                    </View>
                  </View>
                </View>
              )}
            </Pressable>
          </Animated.View>
        </GestureDetector>
      </View>
    </Animated.View>
  );
});
