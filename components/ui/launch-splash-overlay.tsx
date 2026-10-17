import * as SplashScreen from "expo-splash-screen";
import React from "react";
import {
  Animated,
  Easing,
  Image,
  NativeModules,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
} from "react-native";

import { StreakAccentBackground } from "@/components/ui/streak-accent-background";
import { getAccentColorValue, useAppSettings } from "@/context/settings-store";
import { useColorScheme } from "@/hooks/use-color-scheme";

// The launch storyboard (ios/reminds/SplashScreen.storyboard) is a static
// asset, so it only holds the neutral screen background plus icon and title.
// While JS loads, AppDelegate adds the accent gradient to the splash view from
// the hex stored by useSplashAccentPersistence(). Once settings are hydrated,
// this overlay takes over with the identical layout and fades out onto the
// Home and Inbox screens, which draw the same gradient.

// Keep the native splash up until the stored accent color is known; otherwise
// the first frames render the default blue and cross-fade to the real color.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ duration: 220, fade: true });

const HYDRATION_TIMEOUT_MS = 1500;
const HOLD_DURATION_MS = 420;
const FADE_OUT_DURATION_MS = 320;

// Mirrors the storyboard constraints: icon 22% of the width (max 132pt),
// centred 55pt above the middle, title 18pt below the icon.
const ICON_WIDTH_RATIO = 0.22;
const ICON_MAX_SIZE = 132;
const ICON_CENTER_OFFSET_Y = -55;
const TITLE_SPACING = 18;

const ICON_LIGHT = require("@/assets/images/splash/icon-light.png");
const ICON_DARK = require("@/assets/images/splash/icon-dark.png");

const splashAccentBridge =
  Platform.OS === "ios" ? NativeModules.SplashAccentBridge : undefined;

/** Stores the resolved accent natively so the next launch's splash shows it. */
export function useSplashAccentPersistence() {
  const { accentColor, hasHydrated } = useAppSettings();

  React.useEffect(() => {
    if (!hasHydrated) return;
    splashAccentBridge?.setAccentColor?.(getAccentColorValue(accentColor));
  }, [accentColor, hasHydrated]);
}

export function LaunchSplashOverlay() {
  const { hasHydrated, reduceMotionEnabled } = useAppSettings();
  const theme = useColorScheme();
  const isDark = theme === "dark";
  const { width, height } = useWindowDimensions();
  const [opacity] = React.useState(() => new Animated.Value(1));
  const [isFinished, setIsFinished] = React.useState(false);
  const hasStartedRef = React.useRef(false);

  // Never leave the user stuck on the native splash if storage hangs.
  React.useEffect(() => {
    const timeout = setTimeout(() => {
      if (!hasStartedRef.current) {
        hasStartedRef.current = true;
        setIsFinished(true);
        void SplashScreen.hideAsync().catch(() => undefined);
      }
    }, HYDRATION_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, []);

  const handleLayout = React.useCallback(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    void SplashScreen.hideAsync().catch(() => undefined);

    if (reduceMotionEnabled) {
      setIsFinished(true);
      return;
    }

    Animated.timing(opacity, {
      toValue: 0,
      delay: HOLD_DURATION_MS,
      duration: FADE_OUT_DURATION_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => setIsFinished(true));
  }, [opacity, reduceMotionEnabled]);

  if (!hasHydrated || isFinished) {
    return null;
  }

  const iconSize = Math.min(width * ICON_WIDTH_RATIO, ICON_MAX_SIZE);
  const iconTop = height / 2 + ICON_CENTER_OFFSET_Y - iconSize / 2;

  return (
    <Animated.View
      style={[styles.container, { opacity }]}
      onLayout={handleLayout}
    >
      <StreakAccentBackground isDark={isDark} />
      <Image
        source={isDark ? ICON_DARK : ICON_LIGHT}
        style={[
          styles.icon,
          {
            top: iconTop,
            left: (width - iconSize) / 2,
            width: iconSize,
            height: iconSize,
          },
        ]}
        resizeMode="contain"
      />
      <Text
        style={[
          styles.title,
          {
            top: iconTop + iconSize + TITLE_SPACING,
            color: isDark ? "#EEEEEE" : "#1E1E1E",
          },
        ]}
      >
        Reminders+
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    elevation: 1000,
  },
  icon: {
    position: "absolute",
  },
  title: {
    position: "absolute",
    left: 24,
    right: 24,
    textAlign: "center",
    fontSize: 28,
    fontWeight: "600",
  },
});
