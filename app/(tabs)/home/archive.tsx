import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { getDueAtForSection, type Task, useTasksStore } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';

type TabId = 'completed' | 'trash';

const SWIPE_STOP = 76;
const SWIPE_TRIGGER = 132;
const SWIPE_ELASTIC = 0.55;

type SwipeAction = {
  label: string;
  iconAndroid: React.ComponentProps<typeof MaterialIcons>['name'];
  iconIOS: string;
  backgroundColor: string;
  onTrigger: () => void;
  haptic?: 'success' | 'warning' | 'error';
};

type SwipeTaskRowProps = {
  task: Task;
  styles: ReturnType<typeof createStyles>;
  glassTint: string;
  glassFallback: string;
  beginSwipe: (taskId: string) => void;
  endSwipe: (taskId: string) => void;
  registerClose: (taskId: string, close: () => void) => void;
  unregisterClose: (taskId: string) => void;
  closeAnyOpen: () => void;
  onPressTask: (taskId: string) => void;
  leftAction: SwipeAction;
  rightAction: SwipeAction;
};

const SwipeTaskRow = React.memo(function SwipeTaskRow({
  task,
  styles,
  glassTint,
  glassFallback,
  beginSwipe,
  endSwipe,
  registerClose,
  unregisterClose,
  closeAnyOpen,
  onPressTask,
  leftAction,
  rightAction,
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

  const runHaptic = React.useCallback((kind: SwipeAction['haptic']) => {
    if (!kind) return;
    const map: Record<NonNullable<SwipeAction['haptic']>, Haptics.NotificationFeedbackType> = {
      success: Haptics.NotificationFeedbackType.Success,
      warning: Haptics.NotificationFeedbackType.Warning,
      error: Haptics.NotificationFeedbackType.Error,
    };
    void Haptics.notificationAsync(map[kind]).catch(() => undefined);
  }, []);

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
            runOnJS(leftAction.onTrigger)();
            runOnJS(runHaptic)(leftAction.haptic);
          } else {
            runOnJS(rightAction.onTrigger)();
            runOnJS(runHaptic)(rightAction.haptic);
          }
          runOnJS(endSwipe)(task.id);
        })
      );
    },
    [collapse, endSwipe, leftAction, rightAction, rowOpacity, rowScale, rowWidth, runHaptic, swipeVisualAlpha, task.id, translateX]
  );

  const onPressLeft = React.useCallback(() => {
    beginSwipe(task.id);
    runOnUI(dismiss)(1);
  }, [beginSwipe, dismiss, task.id]);

  const onPressRight = React.useCallback(() => {
    beginSwipe(task.id);
    runOnUI(dismiss)(-1);
  }, [beginSwipe, dismiss, task.id]);

  const gesture = React.useMemo(() => {
    const pan = Gesture.Pan()
      .activeOffsetX([-6, 6])
      .failOffsetY([-12, 12])
      .onStart(() => {
        startOffsetX.value = translateX.value;
        rowOpacity.value = 1;
        rowScale.value = 1;
        swipeVisualAlpha.value = 1;
        collapse.value = 0;
        runOnJS(beginSwipe)(task.id);
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
          runOnJS(endSwipe)(task.id);
          return;
        }

        translateX.value = withSpring(SWIPE_STOP * sign, springCfg);
        direction.value = sign;
      })
      .onFinalize(() => {
        // Keep it open if snapped, otherwise mark swipe ended.
        if (Math.abs(translateX.value) < 1) {
          runOnJS(endSwipe)(task.id);
        }
      });

    return pan;
  }, [beginSwipe, collapse, direction, dismiss, endSwipe, rowOpacity, rowScale, startOffsetX, swipeVisualAlpha, task.id, translateX]);

  const underlayStyle = useAnimatedStyle(() => {
    return {
      opacity: swipeVisualAlpha.value,
    };
  });

  const leftActionStyle = useAnimatedStyle(() => {
    const x = Math.max(0, translateX.value);
    const a = interpolate(x, [0, SWIPE_STOP], [0, 1], Extrapolation.CLAMP);
    return { opacity: a, transform: [{ scale: 0.98 + a * 0.02 }] };
  });

  const rightActionStyle = useAnimatedStyle(() => {
    const x = Math.max(0, -translateX.value);
    const a = interpolate(x, [0, SWIPE_STOP], [0, 1], Extrapolation.CLAMP);
    return { opacity: a, transform: [{ scale: 0.98 + a * 0.02 }] };
  });

  const rowStyle = useAnimatedStyle(() => {
    const h = rowHeight.value;
    const collapsedHeight = interpolate(collapse.value, [0, 1], [h, 0], Extrapolation.CLAMP);
    return {
      height: h > 0 ? collapsedHeight : undefined,
      opacity: rowOpacity.value,
      transform: [{ translateX: translateX.value }, { scale: rowScale.value }],
    };
  });

  return (
    <View
      style={styles.rowWrap}
      onLayout={(e) => {
        rowWidth.value = e.nativeEvent.layout.width;
        rowHeight.value = e.nativeEvent.layout.height;
      }}>
      <Animated.View style={[styles.underlay, underlayStyle]} pointerEvents="box-none">
        <Animated.View style={[styles.underlaySide, { backgroundColor: leftAction.backgroundColor, left: 0 }, leftActionStyle]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={leftAction.label}
            onPress={onPressLeft}
            hitSlop={10}
            style={({ pressed }) => [styles.underlayBtn, pressed && { opacity: 0.9 }]}>
            {Platform.OS === 'ios' ? (
              <SymbolView name={leftAction.iconIOS as any} tintColor="#fff" style={{ width: 18, height: 18 }} />
            ) : (
              <MaterialIcons name={leftAction.iconAndroid} size={18} color="#fff" />
            )}
          </Pressable>
        </Animated.View>

        <Animated.View style={[styles.underlaySide, { backgroundColor: rightAction.backgroundColor, right: 0 }, rightActionStyle]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={rightAction.label}
            onPress={onPressRight}
            hitSlop={10}
            style={({ pressed }) => [styles.underlayBtn, pressed && { opacity: 0.9 }]}>
            {Platform.OS === 'ios' ? (
              <SymbolView name={rightAction.iconIOS as any} tintColor="#fff" style={{ width: 18, height: 18 }} />
            ) : (
              <MaterialIcons name={rightAction.iconAndroid} size={18} color="#fff" />
            )}
          </Pressable>
        </Animated.View>
      </Animated.View>

      <GestureDetector gesture={gesture}>
        <Animated.View style={rowStyle}>
          <Pressable
            onPress={() => {
              closeAnyOpen();
              onPressTask(task.id);
            }}
            style={({ pressed }) => [styles.rowPressable, pressed && { opacity: 0.92 }]}>
            <GlassSurface style={styles.row} glassEffectStyle="regular" tintColor={glassTint} fallbackBackgroundColor={glassFallback}>
              <View style={styles.emojiTile}>
                <Text style={styles.emojiText}>{task.emoji}</Text>
              </View>
              <View style={styles.textStack}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {task.title}
                </Text>
                {task.subtitle ? (
                  <Text style={styles.rowSubtitle} numberOfLines={1}>
                    {task.subtitle}
                  </Text>
                ) : null}
              </View>
            </GlassSurface>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
});

function formatCountLabel(count: number, singular: string, plural: string) {
  return count === 1 ? `${count} ${singular}` : `${count} ${plural}`;
}

export default function ArchiveScreen() {
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const isDark = theme === 'dark';
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  const hairline = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';

  const cardBg = isDark ? '#1C1C1E' : '#F2F2F7';
  const glassTint = withAlpha(Colors[theme].text, isDark ? 0.12 : 0.06);
  const glassFallback = withAlpha(cardBg, isDark ? 0.92 : 1);

  const { tasks, setTasks } = useTasksStore();

  const completed = React.useMemo(
    () => tasks.filter((t) => t.section === 'completed' && !t.deletedAt).sort((a, b) => b.dueAt - a.dueAt),
    [tasks]
  );

  const trashed = React.useMemo(
    () => tasks.filter((t) => !!t.deletedAt).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)),
    [tasks]
  );

  const [tab, setTab] = React.useState<TabId>(() => {
    if (completed.length > 0) return 'completed';
    if (trashed.length > 0) return 'trash';
    return 'completed';
  });

  const onPressTask = React.useCallback(
    (taskId: string) => {
      router.push(`/task/${taskId}`);
    },
    [router]
  );

  const openTaskIdRef = React.useRef<string | null>(null);
  const closersRef = React.useRef(new Map<string, () => void>());
  const beginSwipe = React.useCallback((taskId: string) => {
    const open = openTaskIdRef.current;
    if (open && open !== taskId) {
      const close = closersRef.current.get(open);
      close?.();
    }
    openTaskIdRef.current = taskId;
  }, []);

  const endSwipe = React.useCallback((taskId: string) => {
    if (openTaskIdRef.current === taskId) openTaskIdRef.current = null;
  }, []);

  const registerClose = React.useCallback((taskId: string, close: () => void) => {
    closersRef.current.set(taskId, close);
  }, []);

  const unregisterClose = React.useCallback((taskId: string) => {
    closersRef.current.delete(taskId);
    if (openTaskIdRef.current === taskId) openTaskIdRef.current = null;
  }, []);

  const closeAnyOpen = React.useCallback(() => {
    const open = openTaskIdRef.current;
    if (!open) return;
    const close = closersRef.current.get(open);
    close?.();
    openTaskIdRef.current = null;
  }, []);

  const moveCompletedBackToToday = React.useCallback(
    (taskId: string) => {
      setTasks((prev) => {
        const current = prev.find((t) => t.id === taskId);
        if (!current) return prev;

        const todayActive = prev
          .filter((t) => t.section === 'today' && !t.deletedAt)
          .sort((a, b) => a.orderRank - b.orderRank);
        const minRank = todayActive.length ? todayActive[0]!.orderRank : 1000;
        const nextRank = Math.max(0, minRank - 1000);

        return prev.map((t) => {
          if (t.id !== taskId) return t;
          return {
            ...t,
            section: 'today',
            dueAt: getDueAtForSection('today'),
            orderRank: nextRank,
          };
        });
      });
    },
    [setTasks]
  );

  const restoreFromTrash = React.useCallback(
    (taskId: string) => {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, deletedAt: undefined } : t)));
    },
    [setTasks]
  );

  const moveToTrash = React.useCallback(
    (taskId: string) => {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, deletedAt: Date.now() } : t)));
    },
    [setTasks]
  );

  const deleteForever = React.useCallback(
    (taskId: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    },
    [setTasks]
  );

  const data = tab === 'completed' ? completed : trashed;

  const title = tab === 'completed' ? 'Abgeschlossen' : 'Papierkorb';
  const subtitle =
    tab === 'completed'
      ? formatCountLabel(completed.length, 'Aufgabe', 'Aufgaben')
      : formatCountLabel(trashed.length, 'Aufgabe', 'Aufgaben');

  const headerEmoji = tab === 'completed' ? '✅' : '🧹';

  const listHeader = React.useMemo(() => {
    return (
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={[styles.headerEmojiTile, { borderColor: hairline }]}>
            <GlassSurface
              style={styles.headerEmojiTileInner}
              glassEffectStyle="regular"
              tintColor={glassTint}
              fallbackBackgroundColor={glassFallback}>
              <Text style={styles.headerEmojiText}>{headerEmoji}</Text>
            </GlassSurface>
          </View>

          <View style={styles.headerMeta}>
            <Text style={[styles.titleText, { color: Colors[theme].text }]}>{title}</Text>
            <Text style={[styles.subtitleText, { color: withAlpha(Colors[theme].text, 0.72) }]}>{subtitle}</Text>
          </View>
        </View>

        <GlassSurface
          tintColor={withAlpha(Colors[theme].background, isDark ? 0.14 : 0.22)}
          fallbackBackgroundColor={withAlpha(Colors[theme].background, isDark ? 0.86 : 0.92)}
          style={styles.segmentWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Abgeschlossen"
            onPress={() => {
              closeAnyOpen();
              setTab('completed');
            }}
            style={({ pressed }) => [styles.segment, tab === 'completed' && styles.segmentActive, pressed && { opacity: 0.9 }]}>
            <Text style={[styles.segmentText, tab === 'completed' && styles.segmentTextActive]}>
              {`Abgeschlossen (${completed.length})`}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Papierkorb"
            onPress={() => {
              closeAnyOpen();
              setTab('trash');
            }}
            style={({ pressed }) => [styles.segment, tab === 'trash' && styles.segmentActive, pressed && { opacity: 0.9 }]}>
            <Text style={[styles.segmentText, tab === 'trash' && styles.segmentTextActive]}>
              {`Papierkorb (${trashed.length})`}
            </Text>
          </Pressable>
        </GlassSurface>
      </View>
    );
  }, [
    closeAnyOpen,
    completed.length,
    glassFallback,
    glassTint,
    hairline,
    headerEmoji,
    isDark,
    styles,
    subtitle,
    tab,
    theme,
    title,
    trashed.length,
  ]);

  const renderRow = React.useCallback(
    ({ item }: { item: Task }) => {
      const leftAction: SwipeAction =
        tab === 'completed'
          ? {
              label: 'Rückgängig',
              iconAndroid: 'undo',
              iconIOS: 'arrow.uturn.left',
              backgroundColor: isDark ? '#30D158' : '#34C759',
              onTrigger: () => moveCompletedBackToToday(item.id),
              haptic: 'success',
            }
          : {
              label: 'Wiederherstellen',
              iconAndroid: 'restore',
              iconIOS: 'arrow.uturn.left',
              backgroundColor: isDark ? '#30D158' : '#34C759',
              onTrigger: () => restoreFromTrash(item.id),
              haptic: 'success',
            };

      const rightAction: SwipeAction =
        tab === 'completed'
          ? {
              label: 'Papierkorb',
              iconAndroid: 'delete',
              iconIOS: 'trash',
              backgroundColor: isDark ? '#FF453A' : '#FF3B30',
              onTrigger: () => moveToTrash(item.id),
              haptic: 'warning',
            }
          : {
              label: 'Löschen',
              iconAndroid: 'delete',
              iconIOS: 'trash',
              backgroundColor: isDark ? '#FF453A' : '#FF3B30',
              onTrigger: () => deleteForever(item.id),
              haptic: 'warning',
            };

      return (
        <SwipeTaskRow
          task={item}
          styles={styles}
          glassTint={glassTint}
          glassFallback={glassFallback}
          beginSwipe={beginSwipe}
          endSwipe={endSwipe}
          registerClose={registerClose}
          unregisterClose={unregisterClose}
          closeAnyOpen={closeAnyOpen}
          onPressTask={onPressTask}
          leftAction={leftAction}
          rightAction={rightAction}
        />
      );
    },
    [
      beginSwipe,
      closeAnyOpen,
      deleteForever,
      endSwipe,
      glassFallback,
      glassTint,
      isDark,
      moveCompletedBackToToday,
      moveToTrash,
      onPressTask,
      registerClose,
      restoreFromTrash,
      styles,
      tab,
      unregisterClose,
    ]
  );

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: '',
          headerTitle: '',
          headerTransparent: true,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: 'transparent' },
          headerBackButtonDisplayMode: 'minimal',
        } as any}
      />

      <FlatList
        data={data}
        keyExtractor={(t) => `${t.id}:${tab}`}
        renderItem={renderRow}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{tab === 'completed' ? 'Nichts abgeschlossen' : 'Papierkorb ist leer'}</Text>
            <Text style={styles.emptySubtitle}>
              {tab === 'completed'
                ? 'Erledigte Tasks erscheinen hier.'
                : 'Gelöschte Tasks erscheinen hier und können wiederhergestellt werden.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const createStyles = (theme: keyof typeof Colors) => {
  const isDark = theme === 'dark';
  const text = Colors[theme].text;
  const hairline = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';

  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: Colors[theme].background,
    },
    content: {
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 44,
    },

    header: {
      gap: 14,
      marginBottom: 14,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 14,
    },
    headerMeta: {
      flex: 1,
      gap: 6,
    },

    headerEmojiTile: {
      width: 64,
      height: 64,
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
    },
    headerEmojiTileInner: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerEmojiText: {
      fontSize: 30,
    },

    titleText: {
      fontSize: 30,
      fontWeight: '900',
      letterSpacing: -0.2,
    },
    subtitleText: {
      fontSize: 15,
      fontWeight: '600',
      lineHeight: 20,
    },

    segmentWrap: {
      flexDirection: 'row',
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hairline,
      overflow: 'hidden',
    },
    segment: {
      flex: 1,
      paddingVertical: 10,
      paddingHorizontal: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentActive: {
      backgroundColor: withAlpha(text, isDark ? 0.16 : 0.08),
    },
    segmentText: {
      fontSize: 12,
      fontWeight: '800',
      color: withAlpha(text, 0.7),
    },
    segmentTextActive: {
      color: text,
    },

    rowPressable: {
      borderRadius: 14,
    },

    rowWrap: {
      marginBottom: 12,
      position: 'relative',
    },
    underlay: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 14,
      overflow: 'hidden',
      flexDirection: 'row',
      alignItems: 'stretch',
      justifyContent: 'space-between',
    },
    underlaySide: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: SWIPE_STOP,
      alignItems: 'center',
      justifyContent: 'center',
    },
    underlayBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha('#000', isDark ? 0.18 : 0.12),
    },
    row: {
      minHeight: 56,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hairline,
    },
    emojiTile: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(text, isDark ? 0.08 : 0.06),
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
      fontWeight: '700',
      color: text,
    },
    rowSubtitle: {
      fontSize: 13,
      fontWeight: '600',
      color: withAlpha(text, 0.7),
    },

    empty: {
      paddingTop: 18,
      paddingHorizontal: 8,
      alignItems: 'center',
      gap: 6,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: text,
    },
    emptySubtitle: {
      fontSize: 13,
      fontWeight: '600',
      color: withAlpha(text, 0.65),
      textAlign: 'center',
    },
  });
};
