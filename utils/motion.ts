import {
  Animated,
  LayoutAnimation,
  type LayoutAnimationConfig,
} from "react-native";

import { isReduceMotionActive } from "@/context/settings-store";

// React Native's `Animated` and `LayoutAnimation` ignore Reduce Motion (unlike
// Reanimated, which follows the global flag set in app/_layout.tsx). These
// drop-in wrappers jump straight to the end value instead, so completion
// callbacks, sequences and parallel groups behave as before, just without
// visible movement.

type TimingConfig = Animated.TimingAnimationConfig;
type SpringConfig = Animated.SpringAnimationConfig;

function instant(
  value: Animated.Value | Animated.ValueXY,
  config: TimingConfig | SpringConfig,
): Animated.CompositeAnimation {
  return Animated.timing(value, {
    toValue: config.toValue as TimingConfig["toValue"],
    duration: 0,
    delay: 0,
    useNativeDriver: config.useNativeDriver,
    isInteraction: config.isInteraction,
  });
}

export function motionTiming(
  value: Animated.Value | Animated.ValueXY,
  config: TimingConfig,
): Animated.CompositeAnimation {
  return isReduceMotionActive() ? instant(value, config) : Animated.timing(value, config);
}

export function motionSpring(
  value: Animated.Value | Animated.ValueXY,
  config: SpringConfig,
): Animated.CompositeAnimation {
  return isReduceMotionActive() ? instant(value, config) : Animated.spring(value, config);
}

// Lists with the drop layout handoff attach Reanimated layout transitions to
// their cells while a drag runs and shortly after the drop. React Native's
// LayoutAnimation must not run in the same commits: both rewrite Fabric's
// mount mutations, and the mix let a removed row be recycled while still
// mounted ("Attempt to recycle a mounted view"), which aborts the app.
const layoutAnimationHolds = new Map<object, number>();

/** Blocks LayoutAnimation for `owner` until `durationMs` from now. */
export function holdLayoutAnimations(owner: object, durationMs: number) {
  layoutAnimationHolds.set(owner, Date.now() + Math.max(0, durationMs));
}

export function releaseLayoutAnimations(owner: object) {
  layoutAnimationHolds.delete(owner);
}

export function areLayoutAnimationsHeld(now: number = Date.now()) {
  for (const [owner, until] of layoutAnimationHolds) {
    if (until > now) return true;
    layoutAnimationHolds.delete(owner);
  }
  return false;
}

export function configureLayoutAnimation(
  config: LayoutAnimationConfig,
  onAnimationDidEnd?: () => void,
) {
  if (isReduceMotionActive() || areLayoutAnimationsHeld()) {
    onAnimationDidEnd?.();
    return;
  }
  LayoutAnimation.configureNext(config, onAnimationDidEnd);
}
