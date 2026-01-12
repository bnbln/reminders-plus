import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
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

import { GlassSurface, withAlpha } from '@/components/ui/glass-surface';
import { Colors } from '@/constants/theme';
import { getDueAtForSection, SectionId, Task, useTasksStore } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';

// filter params are parsed locally in this file

const SWIPE_STOP = 76;
const SWIPE_OPEN_THRESHOLD = 22;
// Trigger should require a deliberate, stronger swipe.
const SWIPE_TRIGGER = 132;
const SWIPE_ELASTIC = 0.55;

type SwipeTaskRowProps = {
  task: Task;
  drag: () => void;
  isActive: boolean;
  styles: ReturnType<typeof createStyles>;
  glassDragTint: string;
  glassDragFallback: string;
  emojiTint: string;
  emojiFallback: string;
  swipeCompleteBg: string;
  swipeDeleteBg: string;
  beginSwipe: (taskId: string) => void;
  endSwipe: (taskId: string) => void;
  registerClose: (taskId: string, close: () => void) => void;
  unregisterClose: (taskId: string) => void;
  closeAnyOpen: () => void;
  onPressTask: (taskId: string) => void;
  toggleComplete: (taskId: string) => void;
  deleteTask: (taskId: string) => void;
};

const SwipeTaskRow = React.memo(function SwipeTaskRow({
  task,
  drag,
  isActive,
  styles,
  glassDragTint,
  glassDragFallback,
  emojiTint,
  emojiFallback,
  swipeCompleteBg,
  swipeDeleteBg,
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

  return (
    <Animated.View style={[styles.itemSpacer, spacerAnimatedStyle]}>
      <View style={clipStyle}>
        <Animated.View style={[styles.underlay, underlayGreenStyle]} />
        <Animated.View style={[styles.underlay, underlayRedStyle]} />

        <Pressable
          style={[styles.actionSlot, styles.actionSlotLeft, { width: SWIPE_STOP }]}
          onPress={onPressComplete}
          hitSlop={10}
        >
          <Animated.View style={[styles.actionSlotInner, leftIconStyle]}>
            <MaterialIcons name={task.section === 'completed' ? 'undo' : 'check'} size={22} color="white" />
          </Animated.View>
        </Pressable>
        <Pressable
          style={[styles.actionSlot, styles.actionSlotRight, { width: SWIPE_STOP }]}
          onPress={onPressDelete}
          hitSlop={10}
        >
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
                    <GlassSurface
                      style={styles.emojiTile}
                      glassEffectStyle="regular"
                      tintColor={emojiTint}
                      fallbackBackgroundColor={emojiFallback}
                    >
                      <Text style={styles.emojiText}>{task.emoji}</Text>
                    </GlassSurface>
                    <View style={styles.textStack}>
                      <Text style={styles.rowTitle}>{task.title}</Text>
                      {task.subtitle ? <Text style={styles.rowSubtitle}>{task.subtitle}</Text> : null}
                    </View>
                  </View>
                </GlassSurface>
              ) : (
                <View style={styles.row}>
                  <View style={styles.rowInner}>
                    <GlassSurface
                      style={styles.emojiTile}
                      glassEffectStyle="regular"
                      tintColor={emojiTint}
                      fallbackBackgroundColor={emojiFallback}
                    >
                      <Text style={styles.emojiText}>{task.emoji}</Text>
                    </GlassSurface>
                    <View style={styles.textStack}>
                      <Text style={styles.rowTitle}>{task.title}</Text>
                      {task.subtitle ? <Text style={styles.rowSubtitle}>{task.subtitle}</Text> : null}
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
const SECTION_ORDER: SectionId[] = ['today', 'upcoming', 'completed'];

const parseSectionsParam = (value: unknown): SectionId[] => {
  if (typeof value !== 'string' || value.trim().length === 0) return SECTION_ORDER;
  const parts = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const enabled = parts.filter((p): p is SectionId => p === 'today' || p === 'upcoming' || p === 'completed');
  return enabled.length ? Array.from(new Set(enabled)) : SECTION_ORDER;
};

const SECTION_TITLES: Record<SectionId, string> = {
  today: 'Today',
  upcoming: 'Upcoming',
  completed: 'Completed',
};

const adjustDueAtOnSectionChange = (task: Task, nextSection: SectionId): Task => {
  // Only auto-adjust between Today <-> Upcoming as requested.
  if (
    (task.section === 'today' && nextSection === 'upcoming') ||
    (task.section === 'upcoming' && nextSection === 'today')
  ) {
    return {
      ...task,
      section: nextSection,
      dueAt: getDueAtForSection(nextSection),
    };
  }

  return {
    ...task,
    section: nextSection,
  };
};

type ThemeName = keyof typeof Colors;

export default function HomeScreen() {
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const isDark = theme === 'dark';
  const params = useLocalSearchParams<{ sections?: string; withNotes?: string }>();
  const enabledSections = React.useMemo(() => parseSectionsParam(params.sections), [params.sections]);
  const withNotesEnabled = params.withNotes === '1';

  const styles = React.useMemo(() => createStyles(theme), [theme]);

  const { tasks, setTasks } = useTasksStore();
  const isDraggingRef = React.useRef(false);
  const placeholderIndexRef = React.useRef<number>(-1);
  const openSwipeIdRef = React.useRef<string | null>(null);
  const closeByIdRef = React.useRef(new Map<string, () => void>());

  const registerClose = React.useCallback((taskId: string, close: () => void) => {
    closeByIdRef.current.set(taskId, close);
  }, []);

  const unregisterClose = React.useCallback((taskId: string) => {
    closeByIdRef.current.delete(taskId);
    if (openSwipeIdRef.current === taskId) openSwipeIdRef.current = null;
  }, []);

  const closeAnyOpen = React.useCallback(() => {
    const openId = openSwipeIdRef.current;
    if (!openId) return;
    closeByIdRef.current.get(openId)?.();
    openSwipeIdRef.current = null;
  }, []);

  const onPressTask = React.useCallback(
    (taskId: string) => {
      // First tap closes swipe if anything is open.
      if (openSwipeIdRef.current) {
        closeAnyOpen();
        return;
      }
      router.push({ pathname: '/task/[id]', params: { id: taskId } });
    },
    [closeAnyOpen, router]
  );

  const beginSwipe = React.useCallback(
    (taskId: string) => {
      // Ensure only one row is open anywhere in the list.
      for (const [id, close] of closeByIdRef.current.entries()) {
        if (id !== taskId) close();
      }
      openSwipeIdRef.current = taskId;
    },
    []
  );

  const endSwipe = React.useCallback((taskId: string) => {
    if (openSwipeIdRef.current === taskId) openSwipeIdRef.current = null;
  }, []);

  const visibleTasks = React.useMemo(() => {
    const base = tasks.filter((t) => enabledSections.includes(t.section));
    if (!withNotesEnabled) return base;
    return base.filter((t) => !!t.subtitle);
  }, [enabledSections, tasks, withNotesEnabled]);

  const visibleSections = React.useMemo(() => {
    return SECTION_ORDER.filter((s) => enabledSections.includes(s));
  }, [enabledSections]);

  const firstVisibleSection = visibleSections[0] ?? 'today';

  const tasksById = React.useMemo(() => new Map(visibleTasks.map((task) => [task.id, task])), [visibleTasks]);

  const tasksBySection = React.useMemo(() => {
    const grouped: Record<SectionId, Task[]> = { today: [], upcoming: [], completed: [] };
    for (const task of visibleTasks) grouped[task.section].push(task);
    for (const sectionId of SECTION_ORDER) {
      grouped[sectionId] = [...grouped[sectionId]].sort((a, b) => a.orderRank - b.orderRank);
    }
    return grouped;
  }, [visibleTasks]);

  const glassDragTint = React.useMemo(() => withAlpha(Colors[theme].background, isDark ? 0.18 : 0.28), [isDark, theme]);
  const glassDragFallback = React.useMemo(
    () => withAlpha(Colors[theme].background, isDark ? 0.86 : 0.92),
    [isDark, theme]
  );

  const emojiTint = React.useMemo(() => withAlpha(Colors[theme].background, isDark ? 0.12 : 0.22), [isDark, theme]);
  const emojiFallback = React.useMemo(() => withAlpha(Colors[theme].background, isDark ? 0.52 : 0.74), [isDark, theme]);

  const swipeCompleteBg = React.useMemo(() => (isDark ? '#30D158' : '#34C759'), [isDark]);
  const swipeDeleteBg = React.useMemo(() => (isDark ? '#FF453A' : '#FF3B30'), [isDark]);

  type ListItem =
    | { type: 'header'; key: string; sectionId: SectionId }
    | { type: 'task'; key: string; taskId: string };

  const listData = React.useMemo<ListItem[]>(() => {
    const data: ListItem[] = [];
    for (const sectionId of visibleSections) {
      if (sectionId !== firstVisibleSection) {
        data.push({ type: 'header', key: `h-${sectionId}`, sectionId });
      }
      for (const task of tasksBySection[sectionId]) {
        // Section-aware key prevents "pop back" on complete/undo by forcing a remount when section changes.
        data.push({ type: 'task', key: `${task.id}:${sectionId}`, taskId: task.id });
      }
    }
    return data;
  }, [firstVisibleSection, tasksBySection, visibleSections]);

  const [flatListData, setFlatListData] = React.useState<ListItem[]>(() => listData);

  React.useEffect(() => {
    if (!isDraggingRef.current) {
      setFlatListData(listData);
    }
  }, [listData]);

  const applyOrderFromListData = React.useCallback(
    (data: ListItem[]) => {
      if (visibleSections.length === 0) return;

      const bySection: Record<SectionId, string[]> = { today: [], upcoming: [], completed: [] };
      let currentSection: SectionId = firstVisibleSection;

      for (const item of data) {
        if (item.type === 'header') {
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

          // Keep non-visible tasks in this section in their current order.
          const stableHidden = prev
            .filter((t) => t.section === sectionId && !visibleIdSet.has(t.id))
            .sort((a, b) => a.orderRank - b.orderRank)
            .map((t) => t.id);

          const finalOrder = [...reorderedVisibleIds, ...stableHidden];
          finalOrder.forEach((id, index) => {
            const existing = nextById.get(id);
            if (!existing) return;
            const moved = reorderedVisibleSet.has(id) ? adjustDueAtOnSectionChange(existing, sectionId) : existing;
            nextById.set(id, { ...moved, orderRank: (index + 1) * 1000 });
          });
        }

        return prev.map((t) => nextById.get(t.id) ?? t);
      });
    },
    [firstVisibleSection, setTasks, visibleSections, visibleTasks]
  );

  const reseedSection = React.useCallback((items: Task[], sectionId: SectionId) => {
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
  }, []);

  const toggleComplete = React.useCallback(
    (taskId: string) => {
      setTasks((prev) => {
        const task = prev.find((t) => t.id === taskId);
        if (!task) return prev;

        const fromSection = task.section;
        const toSection: SectionId = fromSection === 'completed' ? 'today' : 'completed';

        const next = prev.map((t) => {
          if (t.id !== taskId) return t;
          return {
            ...t,
            section: toSection,
            // Explicitly set a sensible timestamp for complete/undo.
            dueAt: getDueAtForSection(toSection),
          };
        });

        // Put it at the top of the destination section for a native "just completed" feel.
        const moved = next.find((t) => t.id === taskId);
        if (!moved) return next;

        const other = next.filter((t) => t.id !== taskId);
        const dest = other
          .filter((t) => t.section === toSection)
          .sort((a, b) => a.orderRank - b.orderRank);
        const rest = other.filter((t) => t.section !== toSection);

        const withInserted = [
          ...rest,
          moved,
          ...dest,
        ];

        // Reseed only affected sections.
        const reseededFrom = reseedSection(withInserted, fromSection);
        const reseededBoth = reseedSection(reseededFrom, toSection);
        return reseededBoth;
      });
    },
    [reseedSection, setTasks]
  );

  const deleteTask = React.useCallback(
    (taskId: string) => {
      setTasks((prev) => {
        const task = prev.find((t) => t.id === taskId);
        if (!task) return prev;
        const sectionId = task.section;
        const remaining = prev.filter((t) => t.id !== taskId);
        return reseedSection(remaining, sectionId);
      });
    },
    [reseedSection, setTasks]
  );

  const renderListItem = React.useCallback(
    ({ item, drag, isActive }: RenderItemParams<ListItem>) => {
      if (item.type === 'header') {
        return (
          <View style={styles.sectionHeader}>
            <View style={styles.sectionLine} />
            <Text style={styles.sectionTitle}>{SECTION_TITLES[item.sectionId]}</Text>
            <View style={styles.sectionLine} />
          </View>
        );
      }

      const task = tasksById.get(item.taskId);
      if (!task) return null;

      return (
        <SwipeTaskRow
          task={task}
          drag={drag}
          isActive={isActive}
          styles={styles}
          glassDragTint={glassDragTint}
          glassDragFallback={glassDragFallback}
          emojiTint={emojiTint}
          emojiFallback={emojiFallback}
          swipeCompleteBg={swipeCompleteBg}
          swipeDeleteBg={swipeDeleteBg}
          beginSwipe={beginSwipe}
          endSwipe={endSwipe}
          registerClose={registerClose}
          unregisterClose={unregisterClose}
          closeAnyOpen={closeAnyOpen}
          onPressTask={onPressTask}
          toggleComplete={toggleComplete}
          deleteTask={deleteTask}
        />
      );
    },
    [
      glassDragFallback,
      glassDragTint,
      emojiFallback,
      emojiTint,
      styles,
      tasksById,
      deleteTask,
      beginSwipe,
      closeAnyOpen,
      endSwipe,
      registerClose,
      unregisterClose,
      swipeCompleteBg,
      swipeDeleteBg,
      toggleComplete,
      onPressTask,
    ]
  );

  return (
    <>
      <DraggableFlatList
        data={flatListData}
        keyExtractor={(item) => item.key}
        renderItem={renderListItem}
        ListHeaderComponent={
          <View style={styles.sectionHeader}>
            <View style={styles.sectionLine} />
            <Text style={styles.sectionTitle}>{SECTION_TITLES[firstVisibleSection]}</Text>
            <View style={styles.sectionLine} />
          </View>
        }
        containerStyle={{ backgroundColor: Colors[theme].background }}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        activationDistance={12}
        autoscrollSpeed={22}
        animationConfig={{
          damping: 32,
          stiffness: 420,
          mass: 0.22,
          overshootClamping: true,
        }}
        dragItemOverflow
        onDragBegin={(fromIndex) => {
          isDraggingRef.current = true;
          placeholderIndexRef.current = fromIndex;
          closeAnyOpen();
          setFlatListData(listData);
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
        }}
        onPlaceholderIndexChange={(index) => {
          placeholderIndexRef.current = index;
        }}
        onRelease={(fromIndex) => {
          // `onDragEnd` fires after animation completion; this runs immediately on finger-up.
          // Also update `data` immediately to avoid any transient render of the old ordering
          // when the dragged cell transitions back to the list.
          const toIndex = placeholderIndexRef.current;
          if (toIndex >= 0 && fromIndex >= 0 && toIndex !== fromIndex) {
            setFlatListData((prev) => {
              if (fromIndex >= prev.length || toIndex >= prev.length) return prev;
              const next = [...prev];
              const [moved] = next.splice(fromIndex, 1);
              if (!moved) return prev;
              next.splice(toIndex, 0, moved);
              return next;
            });
          }
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        }}
        onDragEnd={({ data }) => {
          // Prevent any transient render of the old ordering when the library clears its activeKey.
          setFlatListData(data);
          isDraggingRef.current = false;
          applyOrderFromListData(data);
        }}
        showsVerticalScrollIndicator={false}
      />
    </>
  );
}

const createStyles = (theme: ThemeName) => {
  const isDark = theme === 'dark';
  const text = Colors[theme].text;

  const hairline = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)';
  // Opaque row background so swipe actions don't "shine through" before reveal.
  const cardBg = isDark ? '#1C1C1E' : '#F2F2F7';

  return StyleSheet.create({
    content: {
      paddingHorizontal: 16,
      paddingTop: 0,
      paddingBottom: 120,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 8,
      marginBottom: 4,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.9,
      textTransform: 'uppercase',
      color: text,
      opacity: 0.55,
    },
    sectionLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: hairline,
    },
    row: {
      minHeight: 56,
      borderRadius: 12,
      backgroundColor: cardBg,
      justifyContent: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 4,
    },
    rowInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    emojiTile: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    emojiText: {
      fontSize: 18,
    },
    textStack: {
      flex: 1,
      gap: 4,
    },
    dragRow: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hairline,
      shadowColor: '#000',
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
    },
    rowTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: text,
    },
    rowSubtitle: {
      fontSize: 13,
      color: text,
      opacity: 0.7,
    },
    itemSpacer: {
      marginBottom: 12,
    },

    swipeClip: {
      borderRadius: 12,
      overflow: 'hidden',
    },

    underlay: {
      ...StyleSheet.absoluteFillObject,
    },
    actionSlot: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      justifyContent: 'center',
    },
    actionSlotLeft: {
      left: 0,
      alignItems: 'center',
    },
    actionSlotRight: {
      right: 0,
      alignItems: 'center',
    },
    actionSlotInner: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
};
