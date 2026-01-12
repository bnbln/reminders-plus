
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
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
import { Project, useTasksStore } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';

const SWIPE_STOP = 76;
const SWIPE_OPEN_THRESHOLD = 22;
const SWIPE_TRIGGER = 132;
const SWIPE_ELASTIC = 0.55;

type SwipeProjectRowProps = {
  project: Project;
  taskCount: number;
  isActive: boolean;
  styles: ReturnType<typeof createStyles>;
  glassDragTint: string;
  glassDragFallback: string;
  emojiTint: string;
  emojiFallback: string;
  swipeCompleteBg: string;
  swipeDeleteBg: string;
  beginSwipe: (id: string) => void;
  endSwipe: (id: string) => void;
  registerClose: (id: string, close: () => void) => void;
  unregisterClose: (id: string) => void;
  closeAnyOpen: () => void;
  onPressProject: (id: string) => void;
  toggleComplete: (id: string) => void;
  deleteProject: (id: string) => void;
  drag: () => void;
};

const SwipeProjectRow = React.memo(function SwipeProjectRow({
  project,
  taskCount,
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
  onPressProject,
  toggleComplete,
  deleteProject,
  drag,
}: SwipeProjectRowProps) {
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
    registerClose(project.id, closeSelf);
    return () => {
      unregisterClose(project.id);
    };
  }, [closeSelf, project.id, registerClose, unregisterClose]);

  const commitComplete = React.useCallback(() => {
    toggleComplete(project.id);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, [project.id, toggleComplete]);

  const commitDelete = React.useCallback(() => {
    deleteProject(project.id);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
  }, [deleteProject, project.id]);

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
          runOnJS(endSwipe)(project.id);
        })
      );
    },
    [collapse, commitComplete, commitDelete, endSwipe, project.id, rowOpacity, rowScale, rowWidth, swipeVisualAlpha, translateX]
  );

  const onPressComplete = React.useCallback(() => {
    beginSwipe(project.id);
    runOnUI(dismiss)(1);
  }, [beginSwipe, dismiss, project.id]);

  const onPressDelete = React.useCallback(() => {
    beginSwipe(project.id);
    runOnUI(dismiss)(-1);
  }, [beginSwipe, dismiss, project.id]);

  const gesture = React.useMemo(() => {
    const pan = Gesture.Pan()
      .enabled(!isActive)
      .activeOffsetX([-6, 6])
      .failOffsetY([-12, 12])
      .onStart(() => {
        startOffsetX.value = translateX.value;
        rowOpacity.value = 1;
        rowScale.value = 1;
        swipeVisualAlpha.value = 1;
        collapse.value = 0;
        runOnJS(beginSwipe)(project.id);
      })
      .onUpdate((event) => {
        let raw = startOffsetX.value + event.translationX;
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

        const triggerFinger = SWIPE_STOP + (SWIPE_TRIGGER - SWIPE_STOP) / SWIPE_ELASTIC;
        if (abs >= SWIPE_TRIGGER || absFinger >= triggerFinger) {
          direction.value = 0;
          if (sign !== 0) dismiss(sign as -1 | 1);
          return;
        }

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
        runOnJS(endSwipe)(project.id);
      });

    const tap = Gesture.Tap()
      .enabled(Platform.OS === 'ios' && !isActive)
      .maxDistance(8)
      .onEnd(() => {
        runOnJS(onPressProject)(project.id);
      });

    return Gesture.Race(pan, tap);
  }, [beginSwipe, collapse, dismiss, direction, endSwipe, isActive, onPressProject, project.id, rowOpacity, rowScale, startOffsetX, swipeVisualAlpha, translateX]);

  const spacerAnimatedStyle = useAnimatedStyle(() => {
    const p = 1 - collapse.value;
    if (rowHeight.value <= 0) return {};
    return {
      height: rowHeight.value * p,
      marginBottom: 16 * p,
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
            <MaterialIcons name={project.completed ? 'undo' : 'check'} size={24} color="white" />
          </Animated.View>
        </Pressable>
        <Pressable
          style={[styles.actionSlot, styles.actionSlotRight, { width: SWIPE_STOP }]}
          onPress={onPressDelete}
          hitSlop={10}
        >
          <Animated.View style={[styles.actionSlotInner, rightIconStyle]}>
            <MaterialIcons name="delete" size={24} color="white" />
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
                onPressProject(project.id);
              }}
            >
              {isActive ? (
                <GlassSurface
                  style={[styles.row, styles.dragRow, { minHeight: 88 }]}
                  glassEffectStyle="regular"
                  tintColor={glassDragTint}
                  fallbackBackgroundColor={glassDragFallback}
                >
                  <ProjectContent project={project} taskCount={taskCount} styles={styles} emojiTint={emojiTint} emojiFallback={emojiFallback} />
                </GlassSurface>
              ) : (
                <View style={[styles.row, { minHeight: 88 }]}>
                  <View style={styles.rowInner}>
                    <ProjectContent project={project} taskCount={taskCount} styles={styles} emojiTint={emojiTint} emojiFallback={emojiFallback} />
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

function ProjectContent({ project, taskCount, styles, emojiTint, emojiFallback }: { project: Project, taskCount: number, styles: any, emojiTint: string, emojiFallback: string }) {
  return (
    <>
      <GlassSurface
        style={[styles.emojiTile, { width: 56, height: 56, borderRadius: 20 }]}
        glassEffectStyle="regular"
        tintColor={emojiTint}
        fallbackBackgroundColor={emojiFallback}
      >
        <Text style={[styles.emojiText, { fontSize: 32 }]}>{project.icon}</Text>
      </GlassSurface>
      <View style={styles.textStack}>
        <Text style={[styles.rowTitle, { fontSize: 19 }]}>{project.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: project.color }} />
          <Text style={styles.rowSubtitle}>{taskCount} task{taskCount !== 1 ? 's' : ''} remaining</Text>
        </View>
      </View>
    </>
  );
}

export default function ExploreScreen() {
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const isDark = theme === 'dark';
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  const { projects, setProjects, tasks } = useTasksStore();

  const taskCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      // Only count active tasks in non-completed sections (optional: if you want to count completed projects tasks too, remove section check)
      // Assuming "remaining" means active tasks.
      if (!task.deletedAt && task.section !== 'completed') {
        counts.set(task.projectId, (counts.get(task.projectId) || 0) + 1);
      }
    }
    return counts;
  }, [tasks]);

  const visibleProjects = React.useMemo(() => {
    return projects.filter((p) => !p.deletedAt && !p.completed);
  }, [projects]);

  const openSwipeIdRef = React.useRef<string | null>(null);
  const closeByIdRef = React.useRef(new Map<string, () => void>());

  const registerClose = React.useCallback((id: string, close: () => void) => {
    closeByIdRef.current.set(id, close);
  }, []);

  const unregisterClose = React.useCallback((id: string) => {
    closeByIdRef.current.delete(id);
    if (openSwipeIdRef.current === id) openSwipeIdRef.current = null;
  }, []);

  const closeAnyOpen = React.useCallback(() => {
    const openId = openSwipeIdRef.current;
    if (!openId) return;
    closeByIdRef.current.get(openId)?.();
    openSwipeIdRef.current = null;
  }, []);

  const onPressProject = React.useCallback(
    (id: string) => {
      if (openSwipeIdRef.current) {
        closeAnyOpen();
        return;
      }
      console.log("Project pressed:", id);
    },
    [closeAnyOpen]
  );

  const beginSwipe = React.useCallback(
    (id: string) => {
      for (const [rowId, close] of closeByIdRef.current.entries()) {
        if (rowId !== id) close();
      }
      openSwipeIdRef.current = id;
    },
    []
  );

  const endSwipe = React.useCallback((id: string) => {
    if (openSwipeIdRef.current === id) openSwipeIdRef.current = null;
  }, []);

  const toggleComplete = React.useCallback(
    (id: string) => {
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, completed: !p.completed } : p))
      );
    },
    [setProjects]
  );

  const deleteProject = React.useCallback(
    (id: string) => {
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, deletedAt: Date.now() } : p))
      );
    },
    [setProjects]
  );

  const glassDragTint = React.useMemo(() => withAlpha(Colors[theme].background, isDark ? 0.18 : 0.28), [isDark, theme]);
  const glassDragFallback = React.useMemo(
    () => withAlpha(Colors[theme].background, isDark ? 0.86 : 0.92),
    [isDark, theme]
  );

  const emojiTint = React.useMemo(() => withAlpha(Colors[theme].background, isDark ? 0.12 : 0.22), [isDark, theme]);
  const emojiFallback = React.useMemo(() => withAlpha(Colors[theme].background, isDark ? 0.52 : 0.74), [isDark, theme]);

  const swipeCompleteBg = React.useMemo(() => (isDark ? '#30D158' : '#34C759'), [isDark]);
  const swipeDeleteBg = React.useMemo(() => (isDark ? '#FF453A' : '#FF3B30'), [isDark]);

  const renderItem = React.useCallback(
    ({ item, drag, isActive }: RenderItemParams<Project>) => {
      return (
        <SwipeProjectRow
          project={item}
          taskCount={taskCounts.get(item.id) || 0}
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
          onPressProject={onPressProject}
          toggleComplete={toggleComplete}
          deleteProject={deleteProject}
        />
      );
    },
    [
      glassDragFallback,
      glassDragTint,
      emojiFallback,
      emojiTint,
      styles,
      taskCounts,
      deleteProject,
      beginSwipe,
      closeAnyOpen,
      endSwipe,
      registerClose,
      unregisterClose,
      swipeCompleteBg,
      swipeDeleteBg,
      toggleComplete,
      onPressProject,
    ]
  );

  return (
    <View style={styles.container}>
      <GlassSurface
        style={styles.headerGlass}
        glassEffectStyle="regular"
        tintColor={withAlpha(Colors[theme].background, isDark ? 0.7 : 0.8)}
        fallbackBackgroundColor={Colors[theme].background}
      >
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Projects</Text>
        </View>
      </GlassSurface>

      <DraggableFlatList
        data={visibleProjects}
        onDragEnd={() => { }}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        activationDistance={20}
        autoscrollThreshold={50}
        autoscrollSpeed={100}
      />
    </View>
  );
}

const createStyles = (theme: 'light' | 'dark') =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors[theme].background,
    },
    headerGlass: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
      paddingTop: 60,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(Colors[theme].text, 0.08),
    },
    headerContent: {
      paddingHorizontal: 20,
    },
    headerTitle: {
      fontSize: 34,
      fontWeight: '700',
      color: Colors[theme].text,
      letterSpacing: 0.3,
    },
    listContent: {
      paddingTop: 130,
      paddingBottom: 40,
      paddingHorizontal: 16,
    },
    itemSpacer: {
      marginBottom: 16,
    },
    swipeClip: {
      borderRadius: 24,
      overflow: 'hidden',
      position: 'relative',
    },
    underlay: {
      ...StyleSheet.absoluteFillObject,
      flexDirection: 'row',
      alignItems: 'center',
    },
    actionSlot: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      justifyContent: 'center',
      zIndex: 1,
    },
    actionSlotLeft: {
      left: 0,
      alignItems: 'flex-start',
      paddingLeft: 24,
    },
    actionSlotRight: {
      right: 0,
      alignItems: 'flex-end',
      paddingRight: 24,
    },
    actionSlotInner: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    row: {
      borderRadius: 24,
      backgroundColor: theme === 'dark' ? '#2C2C2E' : '#FFFFFF',
      minHeight: 88,
      justifyContent: 'center',
    },
    dragRow: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
      elevation: 6,
      transform: [{ scale: 1.02 }],
    },
    rowInner: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 16,
      gap: 16,
    },
    emojiTile: {
      width: 56,
      height: 56,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme === 'dark' ? '#3A3A3C' : '#F2F2F7',
    },
    emojiText: {
      fontSize: 32,
    },
    textStack: {
      flex: 1,
      justifyContent: 'center',
      gap: 2,
    },
    rowTitle: {
      fontSize: 19,
      fontWeight: '600',
      color: Colors[theme].text,
    },
    rowSubtitle: {
      fontSize: 15,
      color: withAlpha(Colors[theme].text, 0.6),
    },
  });
