import React from "react";
import { AccessibilityInfo, AppState, Platform } from "react-native";

// Mirrors the OS "Increase Contrast" setting (iOS: Darker System Colors,
// Android: High Contrast Text). React Native has no change event for either,
// so the value is read once at startup and again whenever the app returns to
// the foreground, which is where users change it (Settings app, Control
// Center). The value lives at module level so non-hook helpers such as
// `getAccentColorValue` and `contrastAlpha` can read it synchronously.

let highContrastEnabled = false;
const listeners = new Set<() => void>();

function setHighContrastEnabled(next: boolean) {
  if (next === highContrastEnabled) return;
  highContrastEnabled = next;
  listeners.forEach((listener) => listener());
}

function queryHighContrast(): Promise<boolean> {
  if (Platform.OS === "ios") return AccessibilityInfo.isDarkerSystemColorsEnabled();
  if (Platform.OS === "android") return AccessibilityInfo.isHighTextContrastEnabled();
  return Promise.resolve(false);
}

export function refreshHighContrast() {
  queryHighContrast()
    .then(setHighContrastEnabled)
    .catch(() => undefined);
}

if (Platform.OS === "ios" || Platform.OS === "android") {
  refreshHighContrast();
  AppState.addEventListener("change", (state) => {
    if (state === "active") refreshHighContrast();
  });
}

export function isHighContrastEnabled() {
  return highContrastEnabled;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useHighContrast() {
  return React.useSyncExternalStore(subscribe, isHighContrastEnabled, isHighContrastEnabled);
}
