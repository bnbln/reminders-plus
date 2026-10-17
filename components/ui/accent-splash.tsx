import * as SplashScreen from "expo-splash-screen";
import React from "react";
import {
  Animated,
  Appearance,
  Image,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
} from "react-native";

import {
  getAccentColorValue,
  useAppSettings,
  type AccentColorId,
} from "@/context/settings-store";

// The native launch screen (ios/reminds/SplashScreen.storyboard) is static and
// cannot know the accent color, so it only shows the background and the title.
// This overlay starts as an exact copy of it, fades the icon and gradient in
// the user's accent color in, then fades out to the app.
const IS_ENABLED = Platform.OS === "ios";

if (IS_ENABLED) {
  void SplashScreen.preventAutoHideAsync().catch(() => undefined);
}

// Captured before the settings apply any appearance override, so it matches
// the scheme the native launch screen was rendered in.
const LAUNCH_SCHEME = Appearance.getColorScheme() === "dark" ? "dark" : "light";

const LIGHT_ICONS: Record<string, number> = {
  blue: require("@/assets/images/splash/icon-blue.png"),
  red: require("@/assets/images/splash/icon-red.png"),
  green: require("@/assets/images/splash/icon-green.png"),
  orange: require("@/assets/images/splash/icon-orange.png"),
  pink: require("@/assets/images/splash/icon-pink.png"),
  indigo: require("@/assets/images/splash/icon-indigo.png"),
};
// The dark icon has a white glyph for every accent, like the home screen icon.
const DARK_ICON = require("@/assets/images/splash/icon-dark.png");
const GRADIENT = require("@/assets/images/splash/gradient.png");

const NATIVE_COLORS = {
  light: { background: "#FFFFFF", text: "#1E1E1E" },
  dark: { background: "#000000", text: "#EEEEEE" },
} as const;

// Mirrors the storyboard constraints.
const ICON_WIDTH_RATIO = 0.22;
const ICON_MAX_WIDTH = 132;
const ICON_CENTER_OFFSET = -55;
const TITLE_GAP = 18;
const GRADIENT_OPACITY = 0.6;

const HYDRATION_TIMEOUT_MS = 1500;
const REVEAL_MS = 220;
const HOLD_MS = 350;
const EXIT_MS = 280;

function iconFor(accent: AccentColorId) {
  if (LAUNCH_SCHEME === "dark") return DARK_ICON;
  return LIGHT_ICONS[accent] ?? LIGHT_ICONS.blue;
}

export function AccentSplash() {
  const { accentColor, hasHydrated, reduceMotionEnabled } = useAppSettings();
  const { width, height } = useWindowDimensions();
  const [visible, setVisible] = React.useState(IS_ENABLED);
  const [timedOut, setTimedOut] = React.useState(false);
  const [laidOut, setLaidOut] = React.useState(false);
  const [reveal] = React.useState(() => new Animated.Value(0));
  const [exit] = React.useState(() => new Animated.Value(1));

  React.useEffect(() => {
    if (!IS_ENABLED) return;
    const timer = setTimeout(() => setTimedOut(true), HYDRATION_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  const ready = laidOut && (hasHydrated || timedOut);

  React.useEffect(() => {
    if (!IS_ENABLED || !ready) return;
    SplashScreen.hide();
    const animation = Animated.sequence([
      Animated.timing(reveal, {
        toValue: 1,
        duration: reduceMotionEnabled ? 0 : REVEAL_MS,
        useNativeDriver: true,
      }),
      Animated.delay(HOLD_MS),
      Animated.timing(exit, {
        toValue: 0,
        duration: EXIT_MS,
        useNativeDriver: true,
      }),
    ]);
    animation.start(() => setVisible(false));
    return () => animation.stop();
  }, [exit, ready, reduceMotionEnabled, reveal]);

  if (!visible) return null;

  const colors = NATIVE_COLORS[LAUNCH_SCHEME];
  const accent = getAccentColorValue(accentColor);
  const iconSize = Math.min(width * ICON_WIDTH_RATIO, ICON_MAX_WIDTH);
  const iconTop = height / 2 + ICON_CENTER_OFFSET - iconSize / 2;

  return (
    <Animated.View
      pointerEvents="none"
      onLayout={() => setLaidOut(true)}
      style={[
        StyleSheet.absoluteFill,
        styles.root,
        { backgroundColor: colors.background, opacity: exit },
      ]}
    >
      <Animated.Image
        source={GRADIENT}
        resizeMode="cover"
        style={[
          StyleSheet.absoluteFill,
          {
            width,
            height,
            tintColor: accent,
            opacity: Animated.multiply(reveal, GRADIENT_OPACITY),
          },
        ]}
      />
      <Animated.View
        style={[
          styles.icon,
          { top: iconTop, width: iconSize, height: iconSize, opacity: reveal },
        ]}
      >
        <Image source={iconFor(accentColor)} style={styles.iconImage} />
      </Animated.View>
      <Text
        style={[
          styles.title,
          { top: iconTop + iconSize + TITLE_GAP, color: colors.text },
        ]}
      >
        Reminders+
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    zIndex: 1000,
  },
  icon: {
    position: "absolute",
    alignSelf: "center",
  },
  iconImage: {
    width: "100%",
    height: "100%",
  },
  title: {
    position: "absolute",
    alignSelf: "center",
    fontSize: 28,
    fontWeight: "600",
  },
});
