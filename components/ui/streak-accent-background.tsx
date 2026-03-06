import { Asset } from "expo-asset";
import { Image } from "expo-image";
import React from "react";
import { Animated, Easing, StyleSheet } from "react-native";

import {
  Colors,
  LIGHT_ACCENT_SCREEN_BACKGROUND,
} from "@/constants/theme";
import { type AccentColorId, useAppSettings } from "@/context/settings-store";
import { useStreaks } from "@/hooks/use-streaks";

type StreakAccentBackgroundProps = {
  isDark: boolean;
  enabled?: boolean;
};

const STREAK_BACKGROUND_SOURCES: Record<AccentColorId, number> = {
  blue: require("../../assets/images/streak-backgrounds/blue.png"),
  red: require("../../assets/images/streak-backgrounds/red.png"),
  green: require("../../assets/images/streak-backgrounds/green.png"),
  orange: require("../../assets/images/streak-backgrounds/orange.png"),
  pink: require("../../assets/images/streak-backgrounds/pink.png"),
  indigo: require("../../assets/images/streak-backgrounds/indigo.png"),
};
const STREAK_BACKGROUND_MODULES = Object.values(STREAK_BACKGROUND_SOURCES);
const HIDDEN_TRANSLATE_Y = 240;
const VISIBLE_LAYER_OPACITY = 0.4;
const SOURCE_TRANSITION_DURATION_MS = 260;

let streakAccentBackgroundPreloadPromise: Promise<void> | null = null;

export function preloadStreakAccentBackgroundAssets(): Promise<void> {
  if (!streakAccentBackgroundPreloadPromise) {
    streakAccentBackgroundPreloadPromise = Asset.loadAsync(
      STREAK_BACKGROUND_MODULES,
    )
      .then(() => undefined)
      .catch(() => undefined);
  }

  return streakAccentBackgroundPreloadPromise;
}

const styles = StyleSheet.create({
  base: {
    ...StyleSheet.absoluteFillObject,
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  image: {
    ...StyleSheet.absoluteFillObject,
  },
  imageLayer: {
    ...StyleSheet.absoluteFillObject,
  },
});

function StreakAccentBackgroundComponent({
  isDark,
  enabled = true,
}: StreakAccentBackgroundProps) {
  const { accentColor, reduceMotionEnabled } = useAppSettings();
  const { todayCompletedCount } = useStreaks();
  const isVisible = enabled && todayCompletedCount > 0;
  const baseBackgroundColor = isDark
    ? Colors.dark.background
    : LIGHT_ACCENT_SCREEN_BACKGROUND;
  const translateY = React.useRef(
    new Animated.Value(isVisible ? 0 : HIDDEN_TRANSLATE_Y),
  ).current;
  const opacity = React.useRef(
    new Animated.Value(isVisible ? VISIBLE_LAYER_OPACITY : 0),
  ).current;
  const imageSource = React.useMemo(
    () =>
      STREAK_BACKGROUND_SOURCES[accentColor] ?? STREAK_BACKGROUND_SOURCES.blue,
    [accentColor],
  );
  const [displaySource, setDisplaySource] = React.useState(imageSource);
  const [previousSource, setPreviousSource] = React.useState<number | null>(
    null,
  );
  const sourceFade = React.useRef(new Animated.Value(1)).current;
  const previousSourceOpacity = React.useMemo(
    () =>
      sourceFade.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0],
      }),
    [sourceFade],
  );

  React.useEffect(() => {
    void preloadStreakAccentBackgroundAssets();
  }, []);

  React.useEffect(() => {
    if (imageSource === displaySource) {
      return;
    }

    sourceFade.stopAnimation();

    if (reduceMotionEnabled || !isVisible) {
      setDisplaySource(imageSource);
      setPreviousSource(null);
      sourceFade.setValue(1);
      return;
    }

    setPreviousSource(displaySource);
    setDisplaySource(imageSource);
    sourceFade.setValue(0);

    Animated.timing(sourceFade, {
      toValue: 1,
      duration: SOURCE_TRANSITION_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setPreviousSource(null);
      }
    });
  }, [displaySource, imageSource, isVisible, reduceMotionEnabled, sourceFade]);

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
      Animated.spring(translateY, {
        toValue: targetTranslateY,
        stiffness: isVisible ? 72 : 90,
        damping: isVisible ? 21 : 28,
        mass: 1.08,
        overshootClamping: true,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
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
        {previousSource ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.imageLayer, { opacity: previousSourceOpacity }]}
          >
            <Image
              source={previousSource}
              style={styles.image}
              contentFit="cover"
              contentPosition="bottom center"
              transition={0}
              cachePolicy="memory-disk"
            />
          </Animated.View>
        ) : null}
        <Animated.View
          pointerEvents="none"
          style={[styles.imageLayer, { opacity: sourceFade }]}
        >
          <Image
            source={displaySource}
            style={styles.image}
            contentFit="cover"
            contentPosition="bottom center"
            transition={0}
            cachePolicy="memory-disk"
          />
        </Animated.View>
      </Animated.View>
    </>
  );
}

export const StreakAccentBackground = React.memo(
  StreakAccentBackgroundComponent,
);
