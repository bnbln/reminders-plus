import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  Canvas,
  Fill,
  Group,
  LinearGradient,
  Points,
  Rect,
  Shader,
  Text as SkiaText,
  matchFont,
  vec,
  type SkFont,
} from "@shopify/react-native-skia";
import * as Haptics from "expo-haptics";
import { LinearGradient as ExpoLinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  AccessibilityInfo,
  Modal,
  Platform,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getBackdropEffect, getFlameEffect } from "@/components/streak-celebration/flame-shaders";
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
// Choreography (ms from mount). Modelled on Duolingo's streak-extended screen:
// cold grey flame + old count → anticipation tremble → ignition burst → count
// rolls over → supporting UI staggers up from below.
// ---------------------------------------------------------------------------
const T_ANTICIPATE = 320;
const T_IGNITE = 1000;
const T_ROLL = T_IGNITE + 140;
const T_LABEL = T_IGNITE + 520;
const T_WEEK = T_IGNITE + 700;
const DOT_STAGGER = 75;
const T_FOOTER_AFTER_WEEK = 7 * DOT_STAGGER + 260;

const MILESTONES = new Set([7, 14, 21, 30, 50, 75, 100, 150, 200, 250, 300, 365, 500, 730, 1000]);

export function isStreakMilestone(streak: number) {
  return MILESTONES.has(streak) || (streak > 1000 && streak % 100 === 0);
}

type Spark = { angle: number; speed: number };

function makeSparks(count: number, seed: number, speedMin: number, speedMax: number): Spark[] {
  // Deterministic pseudo-random so every celebration bursts the same way.
  const rand = (i: number, k: number) => {
    const x = Math.sin((i + 1) * 12.9898 + (seed + k) * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  return Array.from({ length: count }, (_, i) => ({
    angle: -Math.PI / 2 + (rand(i, 1) - 0.5) * Math.PI * 1.8,
    speed: speedMin + rand(i, 2) * (speedMax - speedMin),
  }));
}

const SPARKS_BIG = makeSparks(14, 3, 260, 620);
const SPARKS_MID = makeSparks(18, 11, 180, 520);
const SPARKS_FINE = makeSparks(16, 23, 320, 760);

function sparkPoints(
  sparks: Spark[],
  burst: number,
  cx: number,
  cy: number,
  gravity: number,
) {
  "worklet";
  const b = Math.max(burst, 0);
  const drag = 2.6;
  const k = (1 - Math.exp(-drag * b)) / drag;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < sparks.length; i++) {
    const s = sparks[i]!;
    out.push({
      x: cx + Math.cos(s.angle) * s.speed * k,
      y: cy + Math.sin(s.angle) * s.speed * k + 0.5 * gravity * b * b,
    });
  }
  return out;
}

function sparkFade(burst: number, life: number) {
  "worklet";
  if (burst < 0) return 0;
  const x = 1 - burst / life;
  return x <= 0 ? 0 : Math.pow(x, 1.3);
}

function useNumberFont(size: number): SkFont {
  return React.useMemo(
    () =>
      matchFont({
        fontFamily: Platform.select({
          ios: "Arial Rounded MT Bold",
          default: "sans-serif",
        }),
        fontSize: size,
        fontWeight: Platform.OS === "android" ? "900" : "bold",
      }),
    [size],
  );
}

type NumberFaceProps = {
  text: string;
  font: SkFont;
  cx: number;
  baseline: number;
  depth: number;
  cold: boolean;
};

/** A chunky, extruded, glossy numeral — the skeuomorphic "trophy" part. */
function NumberFace({ text, font, cx, baseline, depth, cold }: NumberFaceProps) {
  const bounds = font.measureText(text);
  const x = cx - (bounds.x + bounds.width / 2);
  const top = baseline + bounds.y;
  const bottom = baseline + bounds.y + bounds.height;
  const faceColors = cold
    ? ["#E4E1DE", "#B9B4B0", "#8F8A86"]
    : ["#FFF1A6", "#FFC132", "#FF7A00"];
  const sideNear = cold ? "#6E6964" : "#C2410C";
  const sideFar = cold ? "#46423F" : "#7C2106";
  const layers = Array.from({ length: depth }, (_, i) => depth - i);
  return (
    <Group>
      <SkiaText
        x={x}
        y={baseline + depth + 10}
        text={text}
        font={font}
        color="rgba(0,0,0,0.45)"
      />
      {layers.map((offset) => (
        <SkiaText
          key={offset}
          x={x}
          y={baseline + offset}
          text={text}
          font={font}
          color={offset > depth / 2 ? sideFar : sideNear}
        />
      ))}
      <SkiaText x={x} y={baseline} text={text} font={font}>
        <LinearGradient
          start={vec(0, top)}
          end={vec(0, bottom)}
          colors={faceColors}
          positions={[0, 0.45, 1]}
        />
      </SkiaText>
      <SkiaText
        x={x}
        y={baseline}
        text={text}
        font={font}
        style="stroke"
        strokeWidth={2}
        color={cold ? "rgba(255,255,255,0.35)" : "rgba(255,248,220,0.55)"}
      />
      <SkiaText x={x} y={baseline} text={text} font={font}>
        <LinearGradient
          start={vec(0, top)}
          end={vec(0, top + (bottom - top) * 0.55)}
          colors={["rgba(255,255,255,0.7)", "rgba(255,255,255,0)"]}
        />
      </SkiaText>
    </Group>
  );
}

type RiseProps = {
  progress: SharedValue<number>;
  distance?: number;
  children: React.ReactNode;
  style?: object;
};

function Rise({ progress, distance = 28, children, style }: RiseProps) {
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
};

function DayDot({ day, delay, reduceMotion }: DayDotProps) {
  const fill = useSharedValue(reduceMotion || (day.done && !day.isToday) ? 1 : 0);
  const pop = useSharedValue(reduceMotion ? 1 : 0.4);
  const flash = useSharedValue(0);

  React.useEffect(() => {
    if (reduceMotion) return;
    pop.value = withDelay(delay, withSpring(1, { damping: 9, stiffness: 260 }));
    if (!day.isToday) return;
    // Today's dot ignites a beat after the others have landed.
    fill.value = withDelay(delay + 220, withTiming(1, { duration: 260 }));
    flash.value = withDelay(
      delay + 220,
      withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 520 })),
    );
    pop.value = withDelay(
      delay + 220,
      withSequence(
        withTiming(1.45, { duration: 140, easing: Easing.out(Easing.quad) }),
        withSpring(1, { damping: 7, stiffness: 220 }),
      ),
    );
  }, [day.isToday, delay, fill, flash, pop, reduceMotion]);

  const circleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
  }));
  const fillStyle = useAnimatedStyle(() => ({ opacity: fill.value }));
  const flashStyle = useAnimatedStyle(() => ({
    opacity: flash.value,
    transform: [{ scale: 1 + flash.value * 0.9 }],
  }));

  const showFill = day.done || day.isToday;

  return (
    <View style={styles.dayColumn}>
      <Text
        style={[styles.dayLabel, day.isToday && styles.dayLabelToday]}
        numberOfLines={1}
      >
        {day.label}
      </Text>
      <View style={styles.dotWrap}>
        {day.isToday ? (
          <Animated.View pointerEvents="none" style={[styles.dotFlash, flashStyle]} />
        ) : null}
        <Animated.View style={[styles.dot, circleStyle]}>
          {showFill ? (
            <Animated.View style={[StyleSheet.absoluteFill, fillStyle]}>
              <ExpoLinearGradient
                colors={["#FFD05A", "#FF8A1F", "#E8440F"]}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={styles.dotFill}
              />
              <View style={styles.dotGloss} />
              <MaterialIcons name="check" size={20} color="#FFFFFF" style={styles.dotCheck} />
            </Animated.View>
          ) : null}
        </Animated.View>
      </View>
    </View>
  );
}

function scheduleHaptics(reduceMotion: boolean) {
  if (reduceMotion) {
    return [setTimeout(() => triggerNotificationHaptic(), 200)];
  }
  const { Light, Medium, Heavy, Rigid, Soft } = Haptics.ImpactFeedbackStyle;
  const steps: [number, () => void][] = [
    // Anticipation: ticks that accelerate into the ignition.
    [T_ANTICIPATE + 40, () => triggerImpactHaptic(Soft)],
    [T_ANTICIPATE + 260, () => triggerImpactHaptic(Light)],
    [T_ANTICIPATE + 430, () => triggerImpactHaptic(Light)],
    [T_ANTICIPATE + 550, () => triggerImpactHaptic(Medium)],
    [T_ANTICIPATE + 620, () => triggerImpactHaptic(Medium)],
    [T_ANTICIPATE + 660, () => triggerImpactHaptic(Rigid)],
    // Ignition: a heavy double-thump, then the success pattern.
    [T_IGNITE, () => triggerImpactHaptic(Heavy)],
    [T_IGNITE + 70, () => triggerImpactHaptic(Rigid)],
    [T_IGNITE + 150, () => triggerImpactHaptic(Heavy)],
    [T_ROLL + 180, () => triggerNotificationHaptic()],
    [T_LABEL, () => triggerImpactHaptic(Light)],
  ];
  for (let i = 0; i < 7; i++) {
    steps.push([T_WEEK + i * DOT_STAGGER, () => triggerImpactHaptic(Soft)]);
  }
  steps.push([T_WEEK + 6 * DOT_STAGGER + 220, () => triggerImpactHaptic(Heavy)]);
  steps.push([T_WEEK + T_FOOTER_AFTER_WEEK, () => triggerSelectionHaptic()]);
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
  const milestone = isStreakMilestone(streak);
  const flameEffect = getFlameEffect();
  const backdropEffect = getBackdropEffect();

  // Layout: the flame gets ~40% of the height, the count sits right under it.
  const flameH = Math.min(height * 0.4, 400);
  const flameW = Math.min(width, flameH * 0.82);
  const flameX = (width - flameW) / 2;
  const flameY = Math.max(insets.top, 12) + height * 0.02;
  const flameCenterY = flameY + flameH * 0.7;
  const digits = String(streak).length;
  const fontSize = Math.round(
    Math.min(flameH * 0.34, 128) * (digits <= 2 ? 1 : digits === 3 ? 0.85 : 0.7),
  );
  const depth = Math.max(5, Math.round(fontSize * 0.07));
  const numberBaseline = flameY + flameH * 0.9 + fontSize * 0.86;
  const rowHeight = fontSize * 1.25;
  const numberClipTop = numberBaseline - fontSize * 0.95;
  const numberFont = useNumberFont(fontSize);
  const contentTop = numberBaseline + depth + 16;

  const clock = useSharedValue(0);
  const reveal = useSharedValue(0);
  const ignite = useSharedValue(reduceMotion ? 1 : 0);
  const flameScale = useSharedValue(reduceMotion ? 1 : 0.35);
  const shake = useSharedValue(0);
  const igniteAt = useSharedValue(-1);
  const roll = useSharedValue(reduceMotion ? 1 : 0);
  const numberPop = useSharedValue(1);
  const labelIn = useSharedValue(reduceMotion ? 1 : 0);
  const weekIn = useSharedValue(reduceMotion ? 1 : 0);
  const footerIn = useSharedValue(reduceMotion ? 1 : 0);
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

    reveal.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) });
    // Fixed-duration steps so the pop lands exactly on T_IGNITE.
    flameScale.value = withSequence(
      withTiming(0.82, { duration: T_ANTICIPATE, easing: Easing.out(Easing.back(2)) }),
      // Squash down while it trembles — the wind-up before the pop.
      withTiming(0.72, { duration: T_IGNITE - T_ANTICIPATE, easing: Easing.in(Easing.quad) }),
      withTiming(1.28, { duration: 150, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 6, stiffness: 140, mass: 0.9 }),
    );
    shake.value = withDelay(
      T_ANTICIPATE,
      withSequence(
        withTiming(1, { duration: T_IGNITE - T_ANTICIPATE, easing: Easing.in(Easing.quad) }),
        withTiming(0, { duration: 60 }),
      ),
    );
    ignite.value = withDelay(T_IGNITE, withTiming(1, { duration: 320 }));
    const igniteTimer = setTimeout(() => {
      igniteAt.value = clock.value;
    }, T_IGNITE);
    roll.value = withDelay(T_ROLL, withSpring(1, { damping: 11, stiffness: 150 }));
    numberPop.value = withDelay(
      T_ROLL + 60,
      withSequence(
        withTiming(1.18, { duration: 160, easing: Easing.out(Easing.quad) }),
        withSpring(1, { damping: 7, stiffness: 170 }),
      ),
    );
    labelIn.value = withDelay(T_LABEL, withSpring(1, { damping: 14, stiffness: 150 }));
    weekIn.value = withDelay(T_WEEK, withSpring(1, { damping: 15, stiffness: 140 }));
    footerIn.value = withDelay(
      T_WEEK + T_FOOTER_AFTER_WEEK,
      withSpring(1, { damping: 15, stiffness: 140 }),
    );
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(igniteTimer);
    };
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

  const hot = milestone ? 1 : 0;
  const flameUniforms = useDerivedValue(() => ({
    uOrigin: [flameX, flameY],
    uSize: [flameW, flameH],
    uTime: reduceMotion ? 1.3 : clock.value,
    uIgnite: ignite.value,
    uScale: flameScale.value,
    uShake: shake.value,
    uHot: hot * ignite.value,
  }));
  const burst = useDerivedValue(() =>
    igniteAt.value < 0 ? -1 : clock.value - igniteAt.value,
  );
  const backdropUniforms = useDerivedValue(() => ({
    uSize: [width, height],
    uCenter: [width / 2, flameCenterY],
    uTime: reduceMotion ? 0 : clock.value,
    uIgnite: ignite.value,
    uBurst: burst.value,
    uHot: hot * ignite.value,
    uReveal: reveal.value,
  }));

  const cx = width / 2;
  const sparkCy = flameY + flameH * 0.66;
  const bigPoints = useDerivedValue(() => sparkPoints(SPARKS_BIG, burst.value, cx, sparkCy, 520));
  const midPoints = useDerivedValue(() => sparkPoints(SPARKS_MID, burst.value, cx, sparkCy, 420));
  const finePoints = useDerivedValue(() => sparkPoints(SPARKS_FINE, burst.value, cx, sparkCy, 300));
  const bigOpacity = useDerivedValue(() => sparkFade(burst.value, 1.1));
  const midOpacity = useDerivedValue(() => sparkFade(burst.value, 0.9));
  const fineOpacity = useDerivedValue(() => sparkFade(burst.value, 0.7));
  const bigWidth = useDerivedValue(() => 11 * (0.45 + 0.55 * sparkFade(burst.value, 1.1)));
  const midWidth = useDerivedValue(() => 7 * (0.5 + 0.5 * sparkFade(burst.value, 0.9)));

  const oldTransform = useDerivedValue(() => [{ translateY: -roll.value * rowHeight }]);
  // Start fully below the clip (extrusion + shadow included) so nothing peeks.
  const newTransform = useDerivedValue(() => [
    { translateY: (1 - roll.value) * (rowHeight + depth + 24) },
  ]);
  const popTransform = useDerivedValue(() => [{ scale: numberPop.value }]);
  const numberOpacity = useDerivedValue(() => reveal.value);

  const contentStyle = useAnimatedStyle(() => ({ opacity: reveal.value }));

  const previousStreak = Math.max(0, streak - 1);
  const subline = milestone
    ? t("streakCelebration.milestone", { count: streak })
    : streak <= 1
      ? t("streakCelebration.first")
      : t("streakCelebration.keepGoing");

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
      <View style={styles.root} accessibilityViewIsModal>
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
          {backdropEffect ? (
            <Fill>
              <Shader source={backdropEffect} uniforms={backdropUniforms} />
            </Fill>
          ) : (
            <Fill color="rgba(20,8,6,0.96)" opacity={numberOpacity} />
          )}
          {flameEffect ? (
            <Rect x={flameX} y={flameY} width={flameW} height={flameH} opacity={numberOpacity}>
              <Shader source={flameEffect} uniforms={flameUniforms} />
            </Rect>
          ) : null}
          <Group blendMode="plus">
            <Points
              points={bigPoints}
              mode="points"
              color="#FFD34D"
              strokeWidth={bigWidth}
              strokeCap="square"
              opacity={bigOpacity}
            />
            <Points
              points={midPoints}
              mode="points"
              color={milestone ? "#6FB6FF" : "#FF7A1F"}
              strokeWidth={midWidth}
              strokeCap="round"
              opacity={midOpacity}
            />
            <Points
              points={finePoints}
              mode="points"
              color="#FFF6D8"
              strokeWidth={3.5}
              strokeCap="round"
              opacity={fineOpacity}
            />
          </Group>
          <Group
            opacity={numberOpacity}
            clip={{ x: 0, y: numberClipTop, width, height: rowHeight + depth + 14 }}
          >
            {!reduceMotion ? (
              <Group transform={oldTransform}>
                <NumberFace
                  text={String(previousStreak)}
                  font={numberFont}
                  cx={cx}
                  baseline={numberBaseline}
                  depth={depth}
                  cold
                />
              </Group>
            ) : null}
            <Group transform={newTransform}>
              <Group transform={popTransform} origin={vec(cx, numberBaseline - fontSize * 0.35)}>
                <NumberFace
                  text={String(streak)}
                  font={numberFont}
                  cx={cx}
                  baseline={numberBaseline}
                  depth={depth}
                  cold={false}
                />
              </Group>
            </Group>
          </Group>
        </Canvas>

        <Animated.View
          style={[
            styles.content,
            { top: contentTop, paddingBottom: Math.max(insets.bottom, 16) + 8 },
            contentStyle,
          ]}
        >
          <Rise progress={labelIn} style={styles.labelBlock}>
            <Text style={styles.label}>
              {t(streak === 1 ? "streaks.hero.one" : "streaks.hero.other")}
            </Text>
            {isRecord && streak > 1 ? (
              <View style={styles.recordChip}>
                <MaterialIcons name="emoji-events" size={14} color="#FFD34D" />
                <Text style={styles.recordText}>{t("streakCelebration.record")}</Text>
              </View>
            ) : null}
          </Rise>

          <Rise progress={weekIn} distance={40} style={styles.weekCard}>
            <View style={styles.weekCardGloss} pointerEvents="none" />
            <View style={styles.weekRow}>
              {week.map((day, index) => (
                <DayDot
                  key={day.key}
                  day={day}
                  delay={T_WEEK + index * DOT_STAGGER}
                  reduceMotion={reduceMotion}
                />
              ))}
            </View>
          </Rise>

          <View style={styles.spacer} />

          <Rise progress={footerIn} distance={36} style={styles.footer}>
            <Text style={styles.subline}>{subline}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("streakCelebration.continue")}
              onPress={handleClose}
              style={styles.buttonHitArea}
            >
              {({ pressed }) => (
                <View style={[styles.buttonEdge, milestone && styles.buttonEdgeHot]}>
                  <ExpoLinearGradient
                    colors={milestone ? ["#6FB6FF", "#2F6BFF"] : ["#FFB23A", "#FF6A1A"]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={[styles.buttonFace, pressed && styles.buttonFacePressed]}
                  >
                    <View style={styles.buttonGloss} pointerEvents="none" />
                    <Text style={styles.buttonText}>{t("streakCelebration.continue")}</Text>
                  </ExpoLinearGradient>
                </View>
              )}
            </Pressable>
          </Rise>
        </Animated.View>
      </View>
    </Modal>
  );
}

const BUTTON_HEIGHT = 56;
const BUTTON_EDGE = 5;

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  labelBlock: {
    alignItems: "center",
    gap: 10,
  },
  label: {
    color: "#FFB547",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.3,
    textShadowColor: "rgba(255,110,20,0.55)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  recordChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,211,77,0.14)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,211,77,0.5)",
  },
  recordText: {
    color: "#FFD34D",
    fontSize: 13,
    fontWeight: "700",
  },
  weekCard: {
    marginTop: 22,
    alignSelf: "stretch",
    maxWidth: 420,
    width: "100%",
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  weekCardGloss: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: "45%",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  dayColumn: {
    flex: 1,
    alignItems: "center",
    gap: 8,
  },
  dayLabel: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontWeight: "700",
  },
  dayLabelToday: {
    color: "#FFB547",
  },
  dotWrap: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.14)",
    overflow: "hidden",
  },
  dotFill: {
    ...StyleSheet.absoluteFill,
  },
  dotGloss: {
    position: "absolute",
    left: 4,
    right: 4,
    top: 2,
    height: 11,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  dotCheck: {
    position: "absolute",
    left: 4.5,
    top: 4.5,
    textShadowColor: "rgba(120,30,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  dotFlash: {
    position: "absolute",
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,190,80,0.55)",
  },
  spacer: {
    flex: 1,
    minHeight: 12,
  },
  footer: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: 18,
  },
  subline: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 360,
  },
  buttonHitArea: {
    alignSelf: "stretch",
    maxWidth: 420,
    width: "100%",
    alignItems: "stretch",
  },
  buttonEdge: {
    height: BUTTON_HEIGHT + BUTTON_EDGE,
    borderRadius: 18,
    backgroundColor: "#B8390A",
  },
  buttonEdgeHot: {
    backgroundColor: "#1C3FB0",
  },
  buttonFace: {
    height: BUTTON_HEIGHT,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  buttonFacePressed: {
    transform: [{ translateY: BUTTON_EDGE - 1 }],
  },
  buttonGloss: {
    position: "absolute",
    left: 10,
    right: 10,
    top: 5,
    height: 14,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.4,
    textShadowColor: "rgba(120,30,0,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
});
