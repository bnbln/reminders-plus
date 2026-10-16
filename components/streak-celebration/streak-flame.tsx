import {
  Blur,
  Canvas,
  Group,
  Oval,
  Path,
  vec,
} from "@shopify/react-native-skia";
import * as Haptics from "expo-haptics";
import React from "react";
import { View } from "react-native";
import {
  GestureDetector,
  useCompetingGestures,
  usePanGesture,
  useTapGesture,
} from "react-native-gesture-handler";
import {
  Easing,
  runOnJS,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import {
  STREAK_FLAME_FRAME,
  STREAK_FLAME_INNER,
  STREAK_FLAME_OUTER,
} from "@/components/streak-celebration/streak-flame-paths";
import { triggerImpactHaptic } from "@/utils/haptics";

/** Width / height of the flame. */
export const STREAK_FLAME_ASPECT =
  STREAK_FLAME_FRAME.width / STREAK_FLAME_FRAME.height;

// Flat fills: an orange flame with a yellow core; milestones burn blue.
const COLORS = {
  fire: { outer: "#F97316", inner: "#FCC934" },
  milestone: { outer: "#3B82F6", inner: "#9CCBFF" },
};

// Anchor points in the path frame (fractions of width / height): both shapes
// grow from and bend around their own base.
const OUTER_BASE = { x: 0.5, y: 0.96 };
const INNER_BASE = { x: 0.42, y: 0.93 };

// iOS-style rubber band: follows the finger 1:1 at first, then resists more
// the further it is pulled, approaching (but never reaching) `limit`.
function rubberBand(offset: number, limit: number) {
  "worklet";
  const sign = offset < 0 ? -1 : 1;
  const x = Math.abs(offset);
  return sign * limit * (1 - 1 / ((x * 0.55) / limit + 1));
}

// How a flame grows from 0 → 1 (the value may overshoot): it shoots up as a
// narrow tongue first and only then fills out to its full width.
function growTransform(grow: number) {
  "worklet";
  const g = Math.max(grow, 0);
  const width = Math.min(1, g) ** 0.7;
  return {
    scaleY: Math.max(g, 0.001),
    scaleX: Math.max(0.001, 0.35 * Math.min(1, g * 3) + 0.65 * width),
  };
}

// A flare-up feels like a flicker: a strong hit followed by two fading ones.
function flareHaptics() {
  const { Heavy, Medium, Light } = Haptics.ImpactFeedbackStyle;
  triggerImpactHaptic(Heavy);
  setTimeout(() => triggerImpactHaptic(Medium), 70);
  setTimeout(() => triggerImpactHaptic(Light), 150);
}

function grabHaptic() {
  triggerImpactHaptic(Haptics.ImpactFeedbackStyle.Light);
}

function releaseHaptic() {
  triggerImpactHaptic(Haptics.ImpactFeedbackStyle.Medium);
}

type StreakFlameProps = {
  /** Height of the flame itself; the canvas adds room for stretch + drag. */
  height: number;
  /** 0 → 1 spring (may overshoot): the orange flame grows from its base. */
  outerIn: SharedValue<number>;
  /** 0 → 1 spring (may overshoot): the yellow core grows up inside it. */
  innerIn: SharedValue<number>;
  /** Seconds since mount; drives the flicker and the idle burn. */
  time: SharedValue<number>;
  /** 1 → 0 while the flame catches: a fast, fading flicker. */
  flicker: SharedValue<number>;
  /** 0 → 1 once settled: a slow, calm burn. */
  idle: SharedValue<number>;
  milestone: boolean;
  isDark: boolean;
  /** Keeps tap/drag feedback but drops the wobble. */
  reduceMotion?: boolean;
};

/**
 * The streak flame: two flat shapes (an orange flame and its yellow core),
 * drawn as vectors and animated separately so they flicker against each other
 * like a real flame.
 *
 * It is also a toy: tapping flares it up (a quick stretch that springs back
 * with a wobble, the core pulsing a beat later), and dragging bends it like a
 * flame in the wind — anchored at its base, rubber-banded, snapping back
 * elastically on release.
 */
export function StreakFlame({
  height,
  outerIn,
  innerIn,
  time,
  flicker,
  idle,
  milestone,
  isDark,
  reduceMotion = false,
}: StreakFlameProps) {
  const colors = milestone ? COLORS.milestone : COLORS.fire;

  const fw = height * STREAK_FLAME_ASPECT;
  const fh = height;
  const cw = fw * 1.5;
  const ch = fh * 1.36;
  const x = (cw - fw) / 2;
  const y = fh * 0.27;
  const scale = fw / STREAK_FLAME_FRAME.width;
  const base = vec(x + fw * OUTER_BASE.x, y + fh * OUTER_BASE.y);
  const innerBase = vec(x + fw * INNER_BASE.x, y + fh * INNER_BASE.y);

  // --- Interaction ------------------------------------------------------
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const flare = useSharedValue(0);
  const coreKick = useSharedValue(0);

  const wobble = reduceMotion
    ? { damping: 30, stiffness: 260 }
    : { damping: 6, stiffness: 170, mass: 0.9 };

  const pan = usePanGesture({
    minDistance: 4,
    onActivate: () => {
      "worklet";
      runOnJS(grabHaptic)();
    },
    onUpdate: (event) => {
      "worklet";
      dragX.value = rubberBand(event.translationX, fw * 0.32);
      dragY.value = rubberBand(event.translationY, fh * 0.2);
    },
    onDeactivate: (event) => {
      "worklet";
      dragX.value = withSpring(0, {
        ...wobble,
        velocity: event.velocityX * 0.25,
      });
      dragY.value = withSpring(0, {
        ...wobble,
        velocity: event.velocityY * 0.25,
      });
      runOnJS(releaseHaptic)();
    },
  });

  const tap = useTapGesture({
    // A tap activates once it is recognised (finger up within limits).
    onActivate: () => {
      "worklet";
      flare.value = withSequence(
        withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) }),
        withSpring(
          0,
          reduceMotion ? wobble : { damping: 5, stiffness: 190, mass: 0.8 },
        ),
      );
      coreKick.value = withDelay(
        60,
        withSequence(
          withTiming(1, { duration: 110, easing: Easing.out(Easing.quad) }),
          withSpring(0, reduceMotion ? wobble : { damping: 6, stiffness: 210 }),
        ),
      );
      runOnJS(flareHaptics)();
    },
  });

  const gesture = useCompetingGestures(pan, tap);

  // Whole flame: bend towards the drag (skew), stretch when pulled up /
  // squash when pushed down, flare tall and narrow on tap, and sway and
  // flicker on its own. Everything is anchored at the base.
  const outerTransform = useDerivedValue(() => {
    const t = time.value;
    const grow = growTransform(outerIn.value);
    const stretch =
      Math.max(-0.22, Math.min(0.3, -dragY.value / fh)) + flare.value * 0.13;
    const burn =
      idle.value * 0.018 * Math.sin(t * 2.3) +
      flicker.value * 0.06 * Math.sin(t * 17);
    const lean =
      idle.value * 0.05 * Math.sin(t * 1.1) +
      flicker.value * 0.09 * Math.sin(t * 11 + 0.6);
    return [
      { translateX: dragX.value * 0.3 },
      { translateY: Math.max(dragY.value, 0) * 0.15 },
      { skewX: lean + (reduceMotion ? 0 : -(dragX.value / fw) * 1.4) },
      { scaleY: grow.scaleY * (1 + stretch + burn) },
      { scaleX: grow.scaleX * (1 - (stretch + burn) * 0.45) },
    ];
  });

  // The core flickers on its own rhythm, so the two shapes play against
  // each other instead of moving as one block.
  const innerTransform = useDerivedValue(() => {
    const t = time.value;
    const grow = growTransform(innerIn.value);
    const burn =
      idle.value * 0.035 * Math.sin(t * 3.1 + 1.2) +
      flicker.value * 0.1 * Math.sin(t * 21 + 2) +
      coreKick.value * 0.1;
    const lean =
      idle.value * 0.06 * Math.sin(t * 1.7 + 2.1) +
      flicker.value * 0.12 * Math.sin(t * 14 + 1.4);
    return [
      { translateX: dragX.value * 0.05 },
      { skewX: lean },
      { scaleY: grow.scaleY * (1 + burn) },
      { scaleX: grow.scaleX * (1 - burn * 0.35) },
    ];
  });

  const outerOpacity = useDerivedValue(() =>
    Math.min(1, Math.max(outerIn.value, 0) * 5),
  );
  const innerOpacity = useDerivedValue(() =>
    Math.min(1, Math.max(innerIn.value, 0) * 5),
  );

  // Only a faint contact shadow on the ground, no shading on the flame.
  const groundTransform = useDerivedValue(() => [
    { translateX: dragX.value * 0.3 },
    {
      scaleX:
        Math.max(Math.min(outerIn.value, 1), 0.001) *
        (1 + Math.max(dragY.value, 0) / fh),
    },
  ]);
  const groundOpacity = useDerivedValue(
    () => (isDark ? 0.2 : 0.07) * Math.min(1, Math.max(outerIn.value, 0)),
  );

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={{ width: cw, height: ch }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Canvas style={{ width: cw, height: ch }}>
          <Group transform={groundTransform} origin={vec(cw / 2, base.y)}>
            <Oval
              x={cw / 2 - fw * 0.32}
              y={base.y - fh * 0.012}
              width={fw * 0.64}
              height={fh * 0.04}
              color="black"
              opacity={groundOpacity}
            >
              <Blur blur={fh * 0.018} />
            </Oval>
          </Group>
          <Group transform={outerTransform} origin={base}>
            <Group opacity={outerOpacity}>
              <Group transform={[{ translateX: x }, { translateY: y }, { scale }]}>
                <Path path={STREAK_FLAME_OUTER} color={colors.outer} />
              </Group>
            </Group>
            <Group transform={innerTransform} origin={innerBase}>
              <Group opacity={innerOpacity}>
                <Group
                  transform={[{ translateX: x }, { translateY: y }, { scale }]}
                >
                  <Path path={STREAK_FLAME_INNER} color={colors.inner} />
                </Group>
              </Group>
            </Group>
          </Group>
        </Canvas>
      </View>
    </GestureDetector>
  );
}
