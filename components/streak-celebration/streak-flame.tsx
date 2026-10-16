import {
  Blur,
  Canvas,
  ColorMatrix,
  Group,
  Image,
  LinearGradient,
  Oval,
  Rect,
  useImage,
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

import { triggerImpactHaptic } from "@/utils/haptics";

// Pre-lit layers rendered by scripts/render-streak-flame.js.
const BACK = require("@/assets/images/streak-flame/flame-back.png");
const FRONT = require("@/assets/images/streak-flame/flame-front.png");
const SHADE = require("@/assets/images/streak-flame/flame-shade.png");

/** Width / height of the rendered layers. */
export const STREAK_FLAME_ASPECT = 304 / 404;

// Luminance-preserving hue rotation (milestones turn the clay blue).
function hueRotation(degrees: number) {
  const a = (degrees * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const lr = 0.213;
  const lg = 0.715;
  const lb = 0.072;
  return [
    lr + c * (1 - lr) - s * lr,
    lg - c * lg - s * lg,
    lb - c * lb + s * (1 - lb),
    0,
    0,
    lr - c * lr + s * 0.143,
    lg + c * (1 - lg) + s * 0.14,
    lb - c * lb - s * 0.283,
    0,
    0,
    lr - c * lr - s * (1 - lr),
    lg - c * lg + s * lg,
    lb + c * (1 - lb) + s * lb,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
  ];
}
const MILESTONE_HUE = hueRotation(192);

// iOS-style rubber band: follows the finger 1:1 at first, then resists more
// the further it is pulled, approaching (but never reaching) `limit`.
function rubberBand(offset: number, limit: number) {
  "worklet";
  const sign = offset < 0 ? -1 : 1;
  const x = Math.abs(offset);
  return sign * limit * (1 - 1 / ((x * 0.55) / limit + 1));
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
  /** Height of the flame itself; the canvas adds room for overshoot + shadow. */
  height: number;
  /** 0 → 1 spring (may overshoot): the orange back piece pops in. */
  backIn: SharedValue<number>;
  /** 0 → 1 spring: the yellow front piece drops onto the back piece. */
  frontIn: SharedValue<number>;
  /** Turn in radians (entry spin + idle sway). */
  tilt: SharedValue<number>;
  /** Idle float offset in points. */
  bob: SharedValue<number>;
  /** Glint position, 0 (before the flame) → 1 (past it). */
  sweep: SharedValue<number>;
  milestone: boolean;
  isDark: boolean;
  /** Keeps tap/drag feedback but drops the wobble. */
  reduceMotion?: boolean;
};

/**
 * The streak flame: two matte clay slabs (pre-rendered with real lighting)
 * animated as separate layers so the front piece can land on the back one and
 * the whole object can turn in perspective.
 *
 * It is also a toy: tapping flares it up (a quick stretch that springs back
 * with a wobble, the front piece pulsing a beat later), and dragging bends it
 * like a flame in the wind — anchored at its base, rubber-banded, snapping back
 * elastically on release.
 */
export function StreakFlame({
  height,
  backIn,
  frontIn,
  tilt,
  bob,
  sweep,
  milestone,
  isDark,
  reduceMotion = false,
}: StreakFlameProps) {
  const back = useImage(BACK);
  const front = useImage(FRONT);
  const shade = useImage(SHADE);

  const fw = height * STREAK_FLAME_ASPECT;
  const fh = height;
  const cw = fw * 1.36;
  const ch = fh * 1.24;
  const x = (cw - fw) / 2;
  const y = fh * 0.1;
  const pivot = vec(x + fw / 2, y + fh * 0.62);
  const frontPivot = vec(x + fw * 0.45, y + fh * 0.72);
  const base = vec(x + fw / 2, y + fh * 0.97);

  // --- Interaction ------------------------------------------------------
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const flare = useSharedValue(0);
  const frontKick = useSharedValue(0);
  const tapGlint = useSharedValue(1);

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
      frontKick.value = withDelay(
        60,
        withSequence(
          withTiming(1, { duration: 110, easing: Easing.out(Easing.quad) }),
          withSpring(0, reduceMotion ? wobble : { damping: 6, stiffness: 210 }),
        ),
      );
      tapGlint.value = 0;
      tapGlint.value = withTiming(1, {
        duration: 520,
        easing: Easing.out(Easing.cubic),
      });
      runOnJS(flareHaptics)();
    },
  });

  const gesture = useCompetingGestures(pan, tap);

  // Bend anchored at the base: lean towards the drag (skew), stretch when
  // pulled up / squash when pushed down, and flare tall and narrow on tap.
  const bendTransform = useDerivedValue(() => {
    const stretch =
      Math.max(-0.22, Math.min(0.3, -dragY.value / fh)) + flare.value * 0.13;
    return [
      { translateX: dragX.value * 0.3 },
      { translateY: Math.max(dragY.value, 0) * 0.15 },
      { skewX: reduceMotion ? 0 : -(dragX.value / fw) * 1.4 },
      { scaleY: 1 + stretch },
      { scaleX: 1 - stretch * 0.45 },
    ];
  });

  const objectTransform = useDerivedValue(() => [
    { translateY: bob.value },
    { perspective: 700 },
    { rotateY: tilt.value + (reduceMotion ? 0 : (dragX.value / fw) * 0.7) },
    { scale: Math.max(backIn.value, 0.001) },
  ]);
  const frontTransform = useDerivedValue(() => {
    const p = Math.min(frontIn.value, 1);
    return [
      // Parallax: the front slab sits nearer the camera than the back one.
      { translateX: tilt.value * fw * 0.06 + dragX.value * 0.12 },
      { translateY: -(1 - p) * fh * 0.22 - frontKick.value * fh * 0.025 },
      { scale: Math.max(frontIn.value, 0.001) * (1 + frontKick.value * 0.09) },
    ];
  });
  const frontOpacity = useDerivedValue(() => Math.min(1, frontIn.value * 4));
  const shadeOpacity = useDerivedValue(
    () => 0.45 * Math.min(1, Math.max(frontIn.value, 0)),
  );
  const groundTransform = useDerivedValue(() => [
    { translateX: dragX.value * 0.3 },
    {
      scaleX:
        Math.max(backIn.value, 0.001) *
        (1 - bob.value * 0.01) *
        (1 + Math.max(dragY.value, 0) / fh),
    },
  ]);
  const groundOpacity = useDerivedValue(
    () => (isDark ? 0.5 : 0.22) * Math.min(1, Math.max(backIn.value, 0)),
  );

  // The entry glint, or a quicker one replayed on every tap.
  const glintPos = useDerivedValue(() =>
    sweep.value < 1 ? sweep.value : tapGlint.value,
  );
  const glintStart = useDerivedValue(() =>
    vec(x - fw * 0.9 + glintPos.value * fw * 2.2, y),
  );
  const glintEnd = useDerivedValue(() =>
    vec(x - fw * 0.9 + glintPos.value * fw * 2.2 + fw * 0.55, y + fh * 0.45),
  );
  const glint = (
    <Rect x={x} y={y} width={fw} height={fh} blendMode="srcATop">
      <LinearGradient
        start={glintStart}
        end={glintEnd}
        colors={[
          "rgba(255,255,255,0)",
          "rgba(255,248,235,0.38)",
          "rgba(255,255,255,0)",
        ]}
      />
    </Rect>
  );

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={{ width: cw, height: ch }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Canvas style={{ width: cw, height: ch }}>
          <Group
            transform={groundTransform}
            origin={vec(cw / 2, y + fh * 0.985)}
          >
            <Oval
              x={cw / 2 - fw * 0.36}
              y={y + fh * 0.955}
              width={fw * 0.72}
              height={fh * 0.06}
              color="black"
              opacity={groundOpacity}
            >
              <Blur blur={fh * 0.025} />
            </Oval>
          </Group>
          <Group transform={objectTransform} origin={pivot}>
            <Group transform={bendTransform} origin={base}>
              {milestone ? <ColorMatrix matrix={MILESTONE_HUE} /> : null}
              {/* Back piece + the shadow the front piece casts onto it, clipped to it. */}
              <Group layer>
                {back ? (
                  <Image image={back} x={x} y={y} width={fw} height={fh} />
                ) : null}
                {shade ? (
                  <Group transform={frontTransform} origin={frontPivot}>
                    <Image
                      image={shade}
                      x={x}
                      y={y}
                      width={fw}
                      height={fh}
                      blendMode="srcATop"
                      opacity={shadeOpacity}
                    />
                  </Group>
                ) : null}
                {glint}
              </Group>
              <Group
                transform={frontTransform}
                origin={frontPivot}
                opacity={frontOpacity}
              >
                <Group layer>
                  {front ? (
                    <Image image={front} x={x} y={y} width={fw} height={fh} />
                  ) : null}
                  {glint}
                </Group>
              </Group>
            </Group>
          </Group>
        </Canvas>
      </View>
    </GestureDetector>
  );
}
