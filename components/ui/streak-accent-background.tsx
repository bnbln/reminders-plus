import { Asset } from "expo-asset";
import { Image } from "expo-image";
import React from "react";
import { Animated, Easing, StyleSheet, useWindowDimensions } from "react-native";

import {
  Colors,
  LIGHT_ACCENT_SCREEN_BACKGROUND,
} from "@/constants/theme";
import { type AccentColorId, useAppSettings } from "@/context/settings-store";

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
const MIN_CONTAINER_DIMENSION = 1;

type Size = { width: number; height: number };

let streakAccentBackgroundPreloadPromise: Promise<void> | null = null;

export function preloadStreakAccentBackgroundAssets(): Promise<void> {
  // Bind the memoised promise to a local so the return type stays `Promise<void>`;
  // TypeScript widens the module-level `let` back to `| null` after the branch.
  const pending =
    streakAccentBackgroundPreloadPromise ??
    (streakAccentBackgroundPreloadPromise = Asset.loadAsync(
      STREAK_BACKGROUND_MODULES,
    )
      .then(() => undefined)
      .catch(() => undefined));

  return pending;
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
    position: "absolute",
  },
  imageFill: {
    ...StyleSheet.absoluteFillObject,
  },
  imageLayer: {
    ...StyleSheet.absoluteFillObject,
  },
});

const toValidDimension = (value: number) =>
  Number.isFinite(value) && value > 0
    ? Math.max(MIN_CONTAINER_DIMENSION, Math.round(value))
    : MIN_CONTAINER_DIMENSION;

const resolveSourceSize = (source: number): Size | null => {
  try {
    const asset = Asset.fromModule(source);
    const sourceWidth = asset.width;
    const sourceHeight = asset.height;
    if (
      typeof sourceWidth !== "number" ||
      typeof sourceHeight !== "number" ||
      !Number.isFinite(sourceWidth) ||
      !Number.isFinite(sourceHeight) ||
      sourceWidth <= 0 ||
      sourceHeight <= 0
    ) {
      return null;
    }
    return {
      width: sourceWidth,
      height: sourceHeight,
    };
  } catch {
    return null;
  }
};

const resolveBottomCoverFrame = (
  source: number,
  containerSize: Size,
): { width: number; height: number; left: number; top: number } | null => {
  const sourceSize = resolveSourceSize(source);
  if (!sourceSize) return null;

  const scale = Math.max(
    containerSize.width / sourceSize.width,
    containerSize.height / sourceSize.height,
  );
  if (!Number.isFinite(scale) || scale <= 0) return null;

  const width = sourceSize.width * scale;
  const height = sourceSize.height * scale;
  return {
    width,
    height,
    left: (containerSize.width - width) / 2,
    top: containerSize.height - height,
  };
};

function StreakAccentBackgroundComponent({
  isDark,
  enabled = true,
}: StreakAccentBackgroundProps) {
  const { width, height } = useWindowDimensions();
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
  const imageSource = React.useMemo(
    () =>
      STREAK_BACKGROUND_SOURCES[accentColor] ?? STREAK_BACKGROUND_SOURCES.blue,
    [accentColor],
  );
  const [displaySource, setDisplaySource] = React.useState(imageSource);
  const [previousSource, setPreviousSource] = React.useState<number | null>(
    null,
  );
  const [layerSize, setLayerSize] = React.useState<Size>(() => ({
    width: toValidDimension(width),
    height: toValidDimension(height),
  }));
  const sourceFade = React.useRef(new Animated.Value(1)).current;
  const previousSourceOpacity = React.useMemo(
    () =>
      sourceFade.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0],
      }),
    [sourceFade],
  );
  const layerSizeKey = React.useMemo(
    () => `${Math.round(layerSize.width)}x${Math.round(layerSize.height)}`,
    [layerSize.height, layerSize.width],
  );
  const displaySourceFrame = React.useMemo(
    () => resolveBottomCoverFrame(displaySource, layerSize),
    [displaySource, layerSize],
  );
  const previousSourceFrame = React.useMemo(
    () =>
      previousSource != null
        ? resolveBottomCoverFrame(previousSource, layerSize)
        : null,
    [layerSize, previousSource],
  );

  const handleLayerLayout = React.useCallback(
    (event: {
      nativeEvent: { layout: { width: number; height: number } };
    }) => {
      const nextWidth = toValidDimension(event.nativeEvent.layout.width);
      const nextHeight = toValidDimension(event.nativeEvent.layout.height);
      setLayerSize((current) =>
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight },
      );
    },
    [],
  );

  React.useEffect(() => {
    void preloadStreakAccentBackgroundAssets();
  }, []);

  React.useEffect(() => {
    const nextWidth = toValidDimension(width);
    const nextHeight = toValidDimension(height);
    setLayerSize((current) =>
      current.width === nextWidth && current.height === nextHeight
        ? current
        : { width: nextWidth, height: nextHeight },
    );
  }, [height, width]);

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
        onLayout={handleLayerLayout}
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
              key={`streak-bg-prev-${previousSource}-${layerSizeKey}`}
              source={previousSource}
              style={[styles.image, previousSourceFrame ?? styles.imageFill]}
              contentFit={previousSourceFrame ? "fill" : "cover"}
              contentPosition={previousSourceFrame ? undefined : "bottom center"}
              transition={0}
              recyclingKey={`streak-bg-prev-${layerSizeKey}`}
              cachePolicy="memory-disk"
            />
          </Animated.View>
        ) : null}
        <Animated.View
          pointerEvents="none"
          style={[styles.imageLayer, { opacity: sourceFade }]}
        >
          <Image
            key={`streak-bg-current-${displaySource}-${layerSizeKey}`}
            source={displaySource}
            style={[styles.image, displaySourceFrame ?? styles.imageFill]}
            contentFit={displaySourceFrame ? "fill" : "cover"}
            contentPosition={displaySourceFrame ? undefined : "bottom center"}
            transition={0}
            recyclingKey={`streak-bg-current-${layerSizeKey}`}
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
