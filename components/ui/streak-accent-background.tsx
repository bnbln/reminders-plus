import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Animated, Easing, StyleSheet } from "react-native";

import { withAlpha } from "@/components/ui/glass-surface";
import {
  Colors,
  LIGHT_ACCENT_SCREEN_BACKGROUND,
} from "@/constants/theme";
import { useHighContrast } from "@/context/high-contrast-store";
import { getAccentColorValue, useAppSettings } from "@/context/settings-store";
import { motionSpring, motionTiming } from "@/utils/motion";

type StreakAccentBackgroundProps = {
  isDark: boolean;
  enabled?: boolean;
};

const HIDDEN_TRANSLATE_Y = 240;
const VISIBLE_LAYER_OPACITY = 0.4;
const COLOR_TRANSITION_DURATION_MS = 260;

// Alpha ramp sampled from the artwork this component used to render as a
// baked PNG: transparent through the top half of the screen, then rising to
// fully opaque at the very bottom edge.
const GRADIENT_LOCATIONS: [number, number, ...number[]] = [0, 0.5, 0.75, 0.9, 1];
const GRADIENT_ALPHAS: [number, number, ...number[]] = [0, 0.06, 0.62, 0.96, 1];

const styles = StyleSheet.create({
  base: {
    ...StyleSheet.absoluteFill,
  },
  layer: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
  },
  fill: {
    ...StyleSheet.absoluteFill,
  },
});

function gradientColorsFor(color: string): [string, string, ...string[]] {
  return GRADIENT_ALPHAS.map((alpha) => withAlpha(color, alpha)) as [
    string,
    string,
    ...string[],
  ];
}

function StreakAccentBackgroundComponent({
  isDark,
  enabled = true,
}: StreakAccentBackgroundProps) {
  const { accentColor, reduceMotionEnabled } = useAppSettings();
  // Temporarily keep the accent background always visible when mounted.
  const isVisible = enabled;
  const baseBackgroundColor = isDark
    ? Colors.dark.background
    : LIGHT_ACCENT_SCREEN_BACKGROUND;
  const translateY = React.useRef(
    new Animated.Value(isVisible ? 0 : HIDDEN_TRANSLATE_Y),
  ).current;
  const opacity = React.useRef(
    new Animated.Value(isVisible ? VISIBLE_LAYER_OPACITY : 0),
  ).current;

  // `getAccentColorValue` resolves the Material You pseudo-accent by reading
  // the *currently active* Appearance scheme, so it needs to be re-evaluated
  // whenever the caller's resolved theme (`isDark`) flips, not just when the
  // user picks a different accent swatch.
  const highContrast = useHighContrast();
  const accentHex = React.useMemo(
    () => getAccentColorValue(accentColor),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isDark isn't read directly, but forces a recompute when the Material You branch's Appearance-derived scheme flips.
    [accentColor, isDark, highContrast],
  );
  const [displayColor, setDisplayColor] = React.useState(accentHex);
  const [previousColor, setPreviousColor] = React.useState<string | null>(
    null,
  );
  const colorFade = React.useRef(new Animated.Value(1)).current;
  const previousColorOpacity = React.useMemo(
    () =>
      colorFade.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0],
      }),
    [colorFade],
  );

  React.useEffect(() => {
    if (accentHex === displayColor) {
      return;
    }

    colorFade.stopAnimation();

    if (reduceMotionEnabled || !isVisible) {
      setDisplayColor(accentHex);
      setPreviousColor(null);
      colorFade.setValue(1);
      return;
    }

    setPreviousColor(displayColor);
    setDisplayColor(accentHex);
    colorFade.setValue(0);

    motionTiming(colorFade, {
      toValue: 1,
      duration: COLOR_TRANSITION_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setPreviousColor(null);
      }
    });
  }, [accentHex, colorFade, displayColor, isVisible, reduceMotionEnabled]);

  React.useEffect(() => {
    translateY.stopAnimation();
    opacity.stopAnimation();

    const targetTranslateY = isVisible ? 0 : HIDDEN_TRANSLATE_Y;
    const targetOpacity = isVisible ? VISIBLE_LAYER_OPACITY : 0;

    if (reduceMotionEnabled) {
      translateY.setValue(targetTranslateY);
      opacity.setValue(targetOpacity);
      return;
    }

    Animated.parallel([
      motionSpring(translateY, {
        toValue: targetTranslateY,
        stiffness: isVisible ? 72 : 90,
        damping: isVisible ? 21 : 28,
        mass: 1.08,
        overshootClamping: true,
        useNativeDriver: true,
      }),
      motionTiming(opacity, {
        toValue: targetOpacity,
        duration: isVisible ? 680 : 260,
        easing: isVisible
          ? Easing.bezier(0.22, 1, 0.36, 1)
          : Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [isVisible, opacity, reduceMotionEnabled, translateY]);

  return (
    <>
      {enabled ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.base, { backgroundColor: baseBackgroundColor }]}
        />
      ) : null}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.layer,
          {
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        {previousColor ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.fill, { opacity: previousColorOpacity }]}
          >
            <LinearGradient
              colors={gradientColorsFor(previousColor)}
              locations={GRADIENT_LOCATIONS}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.fill}
            />
          </Animated.View>
        ) : null}
        <LinearGradient
          colors={gradientColorsFor(displayColor)}
          locations={GRADIENT_LOCATIONS}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.fill}
        />
      </Animated.View>
    </>
  );
}

export const StreakAccentBackground = React.memo(
  StreakAccentBackgroundComponent,
);
