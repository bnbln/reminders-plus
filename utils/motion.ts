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

export function configureLayoutAnimation(
  config: LayoutAnimationConfig,
  onAnimationDidEnd?: () => void,
) {
  if (isReduceMotionActive()) {
    onAnimationDidEnd?.();
    return;
  }
  LayoutAnimation.configureNext(config, onAnimationDidEnd);
}
