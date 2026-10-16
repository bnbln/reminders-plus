import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  AccessibilityInfo,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { StreakFlame } from "@/components/streak-celebration/streak-flame";
import { GlassSurface, withAlpha } from "@/components/ui/glass-surface";
import { SFSymbol } from "@/components/ui/sfsymbol";
import { Colors, Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { t } from "@/i18n";
import {
  triggerImpactHaptic,
  triggerNotificationHaptic,
  triggerSelectionHaptic,
} from "@/utils/haptics";

export type StreakCelebrationDay = {
  key: string;
  label: string;
  done: boolean;
  isToday: boolean;
};

type StreakCelebrationOverlayProps = {
  streak: number;
  isRecord: boolean;
  week: StreakCelebrationDay[];
  reduceMotion: boolean;
  onClose: () => void;
};

// ---------------------------------------------------------------------------
// Choreography (ms from mount). The background stays still; all of the
// excitement lives in the flame: the back piece pops in with a half turn, the
// front piece drops onto it, a glint sweeps across — then the card and the
// button settle in underneath.
// ---------------------------------------------------------------------------
const T_OUTER = 180;
const T_INNER = 520;
const T_SWEEP = 760;
const T_CARD = 720;
const T_ROLL = 880;
const T_DOTS = 960;
const DOT_STAGGER = 55;
const T_BUTTON = T_DOTS + 7 * DOT_STAGGER + 120;

const MILESTONES = new Set([7, 14, 21, 30, 50, 75, 100, 150, 200, 250, 300, 365, 500, 730, 1000]);

export function isStreakMilestone(streak: number) {
  return MILESTONES.has(streak) || (streak > 1000 && streak % 100 === 0);
}

// Same streak orange the Streaks screen uses for its flame symbol.
const FIRE = "#F97316";
const HOT = "#3B82F6";

// Native tab bar geometry (iOS 26 floating bar), so the button sits exactly
// where the tab bar would be.
const BAR_HEIGHT = 56;
const BAR_SIDE_INSET = 20;

type RiseProps = {
  progress: SharedValue<number>;
  distance?: number;
  children: React.ReactNode;
  style?: object;
};

function Rise({ progress, distance = 20, children, style }: RiseProps) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value * 1.4),
    transform: [{ translateY: (1 - progress.value) * distance }],
  }));
  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

type DayDotProps = {
  day: StreakCelebrationDay;
  delay: number;
  reduceMotion: boolean;
  accent: string;
  labelColor: string;
  todayLabelColor: string;
  emptyColor: string;
};

function DayDot({
  day,
  delay,
  reduceMotion,
  accent,
  labelColor,
  todayLabelColor,
  emptyColor,
}: DayDotProps) {
  const lit = useSharedValue(reduceMotion || (day.done && !day.isToday) ? 1 : 0);
  const pop = useSharedValue(reduceMotion ? 1 : 0.6);

  React.useEffect(() => {
    if (reduceMotion) return;
    pop.value = withDelay(delay, withSpring(1, { damping: 12, stiffness: 300 }));
    if (!day.isToday) return;
    // Today's dot lights up last, with a small pop.
    lit.value = withDelay(delay + 140, withTiming(1, { duration: 160 }));
    pop.value = withDelay(
      delay + 140,
      withSequence(
        withTiming(1.5, { duration: 120, easing: Easing.out(Easing.quad) }),
        withSpring(1, { damping: 9, stiffness: 260 }),
      ),
    );
  }, [day.isToday, delay, lit, pop, reduceMotion]);

  const dotStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const fillStyle = useAnimatedStyle(() => ({ opacity: lit.value }));
  const showFill = day.done || day.isToday;

  return (
    <View style={styles.dayColumn}>
      <Animated.View style={[styles.dot, { backgroundColor: emptyColor }, dotStyle]}>
        {showFill ? (
          <Animated.View
            style={[StyleSheet.absoluteFill, { backgroundColor: accent }, fillStyle]}
          />
        ) : null}
      </Animated.View>
      <Text
        style={[styles.dayLabel, { color: day.isToday ? todayLabelColor : labelColor }]}
        numberOfLines={1}
      >
        {day.label}
      </Text>
    </View>
  );
}

function scheduleHaptics(reduceMotion: boolean) {
  if (reduceMotion) {
    return [setTimeout(() => triggerNotificationHaptic(), 200)];
  }
  const { Light, Medium, Heavy, Rigid, Soft } = Haptics.ImpactFeedbackStyle;
  const steps: [number, () => void][] = [
    // Back piece pops in and lands.
    [T_OUTER, () => triggerImpactHaptic(Medium)],
    [T_OUTER + 170, () => triggerImpactHaptic(Rigid)],
    // Front piece drops on top — the main hit.
    [T_INNER + 60, () => triggerImpactHaptic(Heavy)],
    [T_INNER + 130, () => triggerNotificationHaptic()],
    [T_ROLL + 120, () => triggerImpactHaptic(Light)],
  ];
  for (let i = 0; i < 7; i++) {
    steps.push([T_DOTS + i * DOT_STAGGER, () => triggerImpactHaptic(Soft)]);
  }
  steps.push([T_DOTS + 6 * DOT_STAGGER + 140, () => triggerImpactHaptic(Medium)]);
  steps.push([T_BUTTON, () => triggerSelectionHaptic()]);
  return steps.map(([at, run]) => setTimeout(run, at));
}

export function StreakCelebrationOverlay({
  streak,
  isRecord,
  week,
  reduceMotion,
  onClose,
}: StreakCelebrationOverlayProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const theme = useColorScheme() ?? "light";
  const isDark = theme === "dark";
  const milestone = isStreakMilestone(streak);
  const accent = milestone ? HOT : FIRE;

  const text = Colors[theme].text;
  const secondary = withAlpha(text, 0.6);
  const hairline = isDark ? "rgba(255,255,255,0.12)" : "rgba(17,24,28,0.1)";
  // Light veil only: the blurred app should read through as frosted glass.
  const scrim = isDark ? "rgba(21,23,24,0.22)" : "rgba(242,242,247,0.16)";
  const emptyDot = isDark ? "rgba(255,255,255,0.12)" : "rgba(17,24,28,0.08)";

  const buttonBottom = Math.max(insets.bottom - 8, 16);
  const cardBottom = buttonBottom + BAR_HEIGHT + 14;
  const flameH = Math.min(height * 0.36, 340, width * 0.95);

  const clock = useSharedValue(0);
  const reveal = useSharedValue(0);
  const outerIn = useSharedValue(reduceMotion ? 1 : 0);
  const innerIn = useSharedValue(reduceMotion ? 1 : 0);
  const spin = useSharedValue(reduceMotion ? 0 : 1);
  const idle = useSharedValue(0);
  const sweep = useSharedValue(0);
  const cardIn = useSharedValue(reduceMotion ? 1 : 0);
  const roll = useSharedValue(reduceMotion ? 1 : 0);
  const buttonIn = useSharedValue(reduceMotion ? 1 : 0);
  const [closing, setClosing] = React.useState(false);

  useFrameCallback((frame) => {
    clock.value = frame.timeSinceFirstFrame / 1000;
  });

  React.useEffect(() => {
    AccessibilityInfo.announceForAccessibility(
      t("streakCelebration.a11y", { count: streak }),
    );
    const timers = scheduleHaptics(reduceMotion);

    if (reduceMotion) {
      reveal.value = withTiming(1, { duration: 220 });
      return () => timers.forEach(clearTimeout);
    }

    reveal.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
    outerIn.value = withDelay(T_OUTER, withSpring(1, { damping: 9, stiffness: 170, mass: 0.8 }));
    spin.value = withDelay(T_OUTER, withSpring(0, { damping: 10, stiffness: 90 }));
    innerIn.value = withDelay(T_INNER, withSpring(1, { damping: 9, stiffness: 240, mass: 0.7 }));
    sweep.value = withDelay(
      T_SWEEP,
      withTiming(1, { duration: 950, easing: Easing.inOut(Easing.cubic) }),
    );
    idle.value = withDelay(T_SWEEP + 400, withTiming(1, { duration: 1200 }));
    cardIn.value = withDelay(T_CARD, withSpring(1, { damping: 18, stiffness: 160 }));
    roll.value = withDelay(T_ROLL, withSpring(1, { damping: 13, stiffness: 170 }));
    buttonIn.value = withDelay(T_BUTTON, withSpring(1, { damping: 18, stiffness: 170 }));
    return () => timers.forEach(clearTimeout);
    // Plays once per mount; the provider remounts us per celebration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = React.useCallback(() => {
    if (closing) return;
    setClosing(true);
    triggerSelectionHaptic();
    reveal.set(
      withTiming(0, { duration: 240 }, (finished) => {
        if (finished) runOnJS(onClose)();
      }),
    );
  }, [closing, onClose, reveal]);

  // Half-turn settle on entry, then a slow idle sway and float.
  const tilt = useDerivedValue(
    () => spin.value * 0.6 + idle.value * 0.12 * Math.sin(clock.value * 0.9),
  );
  const bob = useDerivedValue(() => idle.value * 4 * Math.sin(clock.value * 1.3));

  const backdropStyle = useAnimatedStyle(() => ({ opacity: reveal.value }));
  const fadeStyle = useAnimatedStyle(() => ({ opacity: reveal.value }));
  const oldNumberStyle = useAnimatedStyle(() => ({
    opacity: 1 - roll.value,
    transform: [{ translateY: -roll.value * 34 }],
  }));
  const newNumberStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, roll.value * 1.5),
    transform: [{ translateY: (1 - roll.value) * 34 }],
  }));

  const doneCount = week.filter((day) => day.done).length;
  // Both numbers are stacked absolutely, so the window needs an explicit width.
  const numberWidth = Math.max(String(streak).length, String(Math.max(0, streak - 1)).length) * 22 + 4;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={handleClose}
    >
      {/* A native modal is its own view hierarchy and needs its own gesture root. */}
      <GestureHandlerRootView style={styles.root} accessibilityViewIsModal>
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]} pointerEvents="none">
          <BlurView
            style={StyleSheet.absoluteFill}
            intensity={55}
            tint={isDark ? "systemUltraThinMaterialDark" : "systemUltraThinMaterialLight"}
          />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: scrim }]} />
        </Animated.View>

        <Animated.View
          style={[
            styles.stage,
            { top: insets.top, bottom: cardBottom },
            fadeStyle,
          ]}
          pointerEvents="box-none"
        >
          <StreakFlame
            height={flameH}
            backIn={outerIn}
            frontIn={innerIn}
            tilt={tilt}
            bob={bob}
            sweep={sweep}
            milestone={milestone}
            isDark={isDark}
            reduceMotion={reduceMotion}
          />
        </Animated.View>

        <Rise
          progress={cardIn}
          style={[styles.cardWrap, { bottom: cardBottom }]}
        >
          <GlassSurface
            style={[styles.card, { borderColor: hairline }]}
            glassEffectStyle="regular"
            fallbackBackgroundColor={isDark ? "#1C1C1E" : "#FFFFFF"}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.numberWindow, { width: numberWidth }]}>
                {!reduceMotion ? (
                  <Animated.Text style={[styles.number, { color: secondary }, oldNumberStyle]}>
                    {Math.max(0, streak - 1)}
                  </Animated.Text>
                ) : null}
                <Animated.Text style={[styles.number, { color: accent }, newNumberStyle]}>
                  {streak}
                </Animated.Text>
              </View>
              <Text style={[styles.streakLabel, { color: text }]} numberOfLines={1}>
                {t(streak === 1 ? "streaks.hero.one" : "streaks.hero.other")}
              </Text>
              <View style={styles.headerSpacer} />
              {isRecord && streak > 1 ? (
                <View style={styles.meta}>
                  <SFSymbol name="trophy.fill" size={13} color="#F59E0B" weight="semibold" />
                  <Text style={[styles.metaText, { color: secondary }]}>
                    {t("streakCelebration.record")}
                  </Text>
                </View>
              ) : (
                <Text style={[styles.metaText, { color: secondary }]}>{`${doneCount}/7`}</Text>
              )}
            </View>
            <View style={[styles.divider, { backgroundColor: hairline }]} />
            <View style={styles.weekRow}>
              {week.map((day, index) => (
                <DayDot
                  key={day.key}
                  day={day}
                  delay={T_DOTS + index * DOT_STAGGER}
                  reduceMotion={reduceMotion}
                  accent={accent}
                  labelColor={secondary}
                  todayLabelColor={text}
                  emptyColor={emptyDot}
                />
              ))}
            </View>
          </GlassSurface>
        </Rise>

        <Rise
          progress={buttonIn}
          distance={12}
          style={[styles.buttonWrap, { bottom: buttonBottom }]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("streakCelebration.continue")}
            onPress={handleClose}
            style={({ pressed }) => pressed && { transform: [{ scale: 0.98 }] }}
          >
            <GlassSurface
              style={[styles.button, { borderColor: hairline }]}
              glassEffectStyle="regular"
              fallbackBackgroundColor={isDark ? "#2C2C2E" : "#FFFFFF"}
              isInteractive
            >
              <Text style={[styles.buttonText, { color: text }]}>
                {t("streakCelebration.continue")}
              </Text>
            </GlassSurface>
          </Pressable>
        </Rise>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  stage: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  cardWrap: {
    position: "absolute",
    left: BAR_SIDE_INSET,
    right: BAR_SIDE_INSET,
    alignItems: "center",
  },
  card: {
    width: "100%",
    maxWidth: 480,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  numberWindow: {
    height: 40,
    overflow: "hidden",
  },
  number: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    fontFamily: Fonts?.rounded,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "900",
    letterSpacing: -0.6,
    fontVariant: ["tabular-nums"],
  },
  streakLabel: {
    fontSize: 17,
    fontWeight: "700",
    flexShrink: 1,
  },
  headerSpacer: {
    flex: 1,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metaText: {
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 14,
  },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  dayColumn: {
    flex: 1,
    alignItems: "center",
    gap: 7,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
  },
  dayLabel: {
    fontSize: 11,
    fontWeight: "700",
  },
  buttonWrap: {
    position: "absolute",
    left: BAR_SIDE_INSET,
    right: BAR_SIDE_INSET,
  },
  button: {
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
});
