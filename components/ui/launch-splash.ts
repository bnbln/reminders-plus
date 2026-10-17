import * as SplashScreen from "expo-splash-screen";
import React from "react";
import { NativeModules, Platform } from "react-native";

import { getAccentColorValue, useAppSettings } from "@/context/settings-store";

// The launch storyboard (ios/reminds/SplashScreen.storyboard) is static, so it
// only holds the neutral screen background plus icon and title. While JS
// loads, AppDelegate adds the accent gradient to the splash view from the hex
// stored by useSplashAccentPersistence(), matching the gradient the Home and
// Inbox screens draw. The native splash is the only splash: it stays up until
// settings are hydrated and then fades straight onto the app.

// Keep the native splash up until the stored accent color is known; otherwise
// the first frames render the default blue and cross-fade to the real color.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ duration: 300, fade: true });

const HYDRATION_TIMEOUT_MS = 1500;

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

/** Hides the native splash once settings are hydrated and the app has painted. */
export function useHideSplashWhenReady() {
  const { hasHydrated } = useAppSettings();

  // Never leave the user stuck on the native splash if storage hangs.
  React.useEffect(() => {
    const timeout = setTimeout(() => {
      void SplashScreen.hideAsync().catch(() => undefined);
    }, HYDRATION_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, []);

  React.useEffect(() => {
    if (!hasHydrated) return;
    // Wait one frame so the hydrated accent is on screen under the splash.
    const frame = requestAnimationFrame(() => {
      void SplashScreen.hideAsync().catch(() => undefined);
    });
    return () => cancelAnimationFrame(frame);
  }, [hasHydrated]);
}
