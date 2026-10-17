import AsyncStorage from "@react-native-async-storage/async-storage";
import { getMaterial3Theme, type Material3Theme } from "@pchmn/expo-material3-theme";
import React from "react";
import { AccessibilityInfo, Appearance, Platform, type ColorSchemeName } from "react-native";

import { isHighContrastEnabled, useHighContrast } from "@/context/high-contrast-store";

import { type AppLocale, setLocale } from "@/i18n";

export type AppearanceMode = "adaptive" | "alwaysLight" | "alwaysDark";

export const APPEARANCE_MODES: readonly AppearanceMode[] = [
  "adaptive",
  "alwaysLight",
  "alwaysDark",
] as const;

export const ACCENT_COLORS = [
  { id: "blue", value: "#007AFF", label: "Blau" },
  { id: "red", value: "#F4512C", label: "Rot" },
  { id: "green", value: "#34C759", label: "Grün" },
  { id: "orange", value: "#FF9500", label: "Orange" },
  { id: "pink", value: "#FF2D55", label: "Pink" },
  { id: "indigo", value: "#5856D6", label: "Indigo" },
] as const;

// Apple's accessible system color variants, used while "Increase Contrast" is on.
const HIGH_CONTRAST_ACCENT_VALUES: Record<
  (typeof ACCENT_COLORS)[number]["id"],
  { light: string; dark: string }
> = {
  blue: { light: "#0040DD", dark: "#409CFF" },
  red: { light: "#D70015", dark: "#FF6961" },
  green: { light: "#248A3D", dark: "#30DB5B" },
  orange: { light: "#C93400", dark: "#FFB340" },
  pink: { light: "#D30F45", dark: "#FF6482" },
  indigo: { light: "#3634A3", dark: "#7D7AFF" },
};

// Android-only: derives the accent (and, via `getMaterial3Scheme`, the rest
// of the M3 surface palette) from the system's Material You wallpaper theme
// instead of a fixed swatch. `@pchmn/expo-material3-theme` has no iOS native
// module (see its expo-module.config.json), so this id is meaningless there.
export const MATERIAL_YOU_ACCENT_ID = "material" as const;
export const IS_MATERIAL_YOU_SUPPORTED = Platform.OS === "android";

export type AccentColorId =
  | (typeof ACCENT_COLORS)[number]["id"]
  | typeof MATERIAL_YOU_ACCENT_ID;

export type AppBadgeMode =
  | "dueToday"
  | "overdueOnly"
  | "allOpenTasks"
  | "completedToday"
  | "hidden";

export const APP_BADGE_MODES: readonly AppBadgeMode[] = [
  "dueToday",
  "overdueOnly",
  "allOpenTasks",
  "completedToday",
  "hidden",
] as const;

export const DEFAULT_APP_BADGE_MODE: AppBadgeMode = "dueToday";
export const DEFAULT_DAILY_SUMMARY_MINUTES = 20 * 60;

type PersistedSettings = {
  appearanceMode: AppearanceMode;
  accentColor: AccentColorId;
  hapticsEnabled: boolean;
  reduceMotionEnabled: boolean;
  streakCelebrationEnabled: boolean;
  localeOverride: AppLocale | null;
  appBadgeMode: AppBadgeMode;
  dailySummaryEnabled: boolean;
  dailySummaryMinutes: number;
  cloudSyncEnabled: boolean;
  fakeStatsEnabled: boolean;
};

type SettingsSnapshot = PersistedSettings & {
  hasHydrated: boolean;
};

const STORAGE_KEY = "reminds.settings.v1";

const DEFAULT_SETTINGS: PersistedSettings = {
  appearanceMode: "adaptive",
  accentColor: "blue",
  hapticsEnabled: true,
  reduceMotionEnabled: false,
  streakCelebrationEnabled: false,
  localeOverride: null,
  appBadgeMode: DEFAULT_APP_BADGE_MODE,
  dailySummaryEnabled: false,
  dailySummaryMinutes: DEFAULT_DAILY_SUMMARY_MINUTES,
  cloudSyncEnabled: false,
  fakeStatsEnabled: false,
};

const ACCENT_COLOR_VALUE_BY_ID = ACCENT_COLORS.reduce(
  (acc, color) => ({ ...acc, [color.id]: color.value }),
  {} as Partial<Record<AccentColorId, string>>,
);

// `@material/material-color-utilities`'s own default M3 seed (deep purple);
// used only as the very first paint before the native call below resolves,
// and as the non-Android/error fallback.
const MATERIAL_YOU_FALLBACK_SEED = "#6750A4";

let cachedMaterialTheme: Material3Theme | null | undefined;

function getMaterialYouTheme(): Material3Theme | null {
  if (cachedMaterialTheme !== undefined) return cachedMaterialTheme;
  if (!IS_MATERIAL_YOU_SUPPORTED) {
    cachedMaterialTheme = null;
    return cachedMaterialTheme;
  }
  try {
    cachedMaterialTheme = getMaterial3Theme(MATERIAL_YOU_FALLBACK_SEED);
  } catch {
    cachedMaterialTheme = null;
  }
  return cachedMaterialTheme;
}

/** The current Material You scheme's full M3 palette (light or dark), or null off-Android. */
export function getMaterialYouScheme(scheme: "light" | "dark" = "light") {
  return getMaterialYouTheme()?.[scheme] ?? null;
}

let snapshot: SettingsSnapshot = {
  ...DEFAULT_SETTINGS,
  hasHydrated: false,
};

const listeners = new Set<() => void>();
let hydrationPromise: Promise<void> | null = null;
let localMutationRevision = 0;
let writeChain: Promise<void> = Promise.resolve();
let appliedInterfaceOverride: "light" | "dark" | null = null;

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function isAppearanceMode(value: unknown): value is AppearanceMode {
  return (
    value === "adaptive" || value === "alwaysLight" || value === "alwaysDark"
  );
}

function isAccentColorId(value: unknown): value is AccentColorId {
  return (
    ACCENT_COLORS.some((color) => color.id === value) ||
    value === MATERIAL_YOU_ACCENT_ID
  );
}

function isAppBadgeMode(value: unknown): value is AppBadgeMode {
  return APP_BADGE_MODES.some((mode) => mode === value);
}

const APP_LOCALES: readonly AppLocale[] = [
  "de",
  "en",
  "es",
  "fr",
  "pt",
  "hi",
  "zh",
  "ja",
  "it",
  "sv",
  "da",
  "fi",
  "pl",
  "nl",
  "tr",
  "cs",
  "hu",
  "ro",
  "el",
  "id",
  "vi",
  "ko",
  "uk",
  "ru",
  "ar",
] as const;

function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && APP_LOCALES.includes(value as AppLocale);
}

function normalizeDailySummaryMinutes(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_DAILY_SUMMARY_MINUTES;
  }
  const rounded = Math.round(value);
  const normalized = ((rounded % 1440) + 1440) % 1440;
  return normalized;
}

function sanitizeStoredSettings(value: unknown): PersistedSettings | null {
  if (!value || typeof value !== "object") return null;
  const appearanceMode = (value as { appearanceMode?: unknown }).appearanceMode;
  const accentColor = (value as { accentColor?: unknown }).accentColor;
  const hapticsEnabled = (value as { hapticsEnabled?: unknown }).hapticsEnabled;
  const reduceMotionEnabled = (value as { reduceMotionEnabled?: unknown })
    .reduceMotionEnabled;
  const streakCelebrationEnabled = (value as {
    streakCelebrationEnabled?: unknown;
  }).streakCelebrationEnabled;
  const localeOverride = (value as { localeOverride?: unknown }).localeOverride;
  const appBadgeMode = (value as { appBadgeMode?: unknown }).appBadgeMode;
  const dailySummaryEnabled = (value as { dailySummaryEnabled?: unknown })
    .dailySummaryEnabled;
  const dailySummaryMinutes = (value as { dailySummaryMinutes?: unknown })
    .dailySummaryMinutes;
  const cloudSyncEnabled = (value as { cloudSyncEnabled?: unknown })
    .cloudSyncEnabled;
  const fakeStatsEnabled = (value as { fakeStatsEnabled?: unknown })
    .fakeStatsEnabled;
  return {
    appearanceMode: isAppearanceMode(appearanceMode)
      ? appearanceMode
      : DEFAULT_SETTINGS.appearanceMode,
    accentColor: isAccentColorId(accentColor)
      ? accentColor
      : DEFAULT_SETTINGS.accentColor,
    hapticsEnabled:
      typeof hapticsEnabled === "boolean"
        ? hapticsEnabled
        : DEFAULT_SETTINGS.hapticsEnabled,
    reduceMotionEnabled:
      typeof reduceMotionEnabled === "boolean"
        ? reduceMotionEnabled
        : DEFAULT_SETTINGS.reduceMotionEnabled,
    streakCelebrationEnabled:
      typeof streakCelebrationEnabled === "boolean"
        ? streakCelebrationEnabled
        : DEFAULT_SETTINGS.streakCelebrationEnabled,
    localeOverride:
      localeOverride === null
        ? null
        : isAppLocale(localeOverride)
          ? localeOverride
          : DEFAULT_SETTINGS.localeOverride,
    appBadgeMode: isAppBadgeMode(appBadgeMode)
      ? appBadgeMode
      : DEFAULT_SETTINGS.appBadgeMode,
    dailySummaryEnabled:
      typeof dailySummaryEnabled === "boolean"
        ? dailySummaryEnabled
        : DEFAULT_SETTINGS.dailySummaryEnabled,
    dailySummaryMinutes: normalizeDailySummaryMinutes(dailySummaryMinutes),
    cloudSyncEnabled:
      typeof cloudSyncEnabled === "boolean"
        ? cloudSyncEnabled
        : DEFAULT_SETTINGS.cloudSyncEnabled,
    fakeStatsEnabled:
      __DEV__ && typeof fakeStatsEnabled === "boolean"
        ? fakeStatsEnabled
        : false,
  };
}

async function readStoredSettings(): Promise<PersistedSettings | null> {
  try {
    if (Platform.OS === "web") {
      if (typeof localStorage === "undefined") return null;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return sanitizeStoredSettings(JSON.parse(raw));
    }

    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return sanitizeStoredSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function persistSettings(next: PersistedSettings): Promise<void> {
  try {
    const payload = JSON.stringify(next);
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEY, payload);
      }
      return;
    }
    await AsyncStorage.setItem(STORAGE_KEY, payload);
  } catch {
    // ignore persistence failures to keep UI responsive
  }
}

function applyAppearanceMode(mode: AppearanceMode) {
  try {
    if (mode === "alwaysDark") {
      Appearance.setColorScheme("dark");
      appliedInterfaceOverride = "dark";
      return;
    }

    if (mode === "alwaysLight") {
      Appearance.setColorScheme("light");
      appliedInterfaceOverride = "light";
      return;
    }

    // In adaptive mode we normally keep the native automatic behavior untouched.
    // We only reset explicitly when this runtime had previously applied a forced override.
    if (appliedInterfaceOverride !== null) {
      Appearance.setColorScheme("unspecified");
      appliedInterfaceOverride = null;
    }
  } catch {
    // ignore on unsupported platforms
  }
}

function applyLocaleOverride(localeOverride: AppLocale | null) {
  setLocale(localeOverride);
}

async function hydrateSettings() {
  if (snapshot.hasHydrated) return;
  if (!hydrationPromise) {
    const revisionAtHydrationStart = localMutationRevision;
    hydrationPromise = (async () => {
      const stored = await readStoredSettings();
      const noLocalUpdateDuringHydration =
        localMutationRevision === revisionAtHydrationStart;

      if (stored && noLocalUpdateDuringHydration) {
        snapshot = {
          ...snapshot,
          ...stored,
          hasHydrated: true,
        };
      } else {
        snapshot = {
          ...snapshot,
          hasHydrated: true,
        };
      }

      if (snapshot.appearanceMode !== "adaptive") {
        applyAppearanceMode(snapshot.appearanceMode);
      }
      applyLocaleOverride(snapshot.localeOverride);
      notifyListeners();
    })();
  }

  await hydrationPromise;
}

function updateSettings(next: PersistedSettings) {
  const hasChanged =
    snapshot.appearanceMode !== next.appearanceMode ||
    snapshot.accentColor !== next.accentColor ||
    snapshot.hapticsEnabled !== next.hapticsEnabled ||
    snapshot.reduceMotionEnabled !== next.reduceMotionEnabled ||
    snapshot.streakCelebrationEnabled !== next.streakCelebrationEnabled ||
    snapshot.localeOverride !== next.localeOverride ||
    snapshot.appBadgeMode !== next.appBadgeMode ||
    snapshot.dailySummaryEnabled !== next.dailySummaryEnabled ||
    snapshot.dailySummaryMinutes !== next.dailySummaryMinutes ||
    snapshot.cloudSyncEnabled !== next.cloudSyncEnabled ||
    snapshot.fakeStatsEnabled !== next.fakeStatsEnabled ||
    !snapshot.hasHydrated;
  if (!hasChanged) return;

  localMutationRevision += 1;
  const previousAppearanceMode = snapshot.appearanceMode;
  const previousLocaleOverride = snapshot.localeOverride;
  snapshot = {
    ...snapshot,
    ...next,
    hasHydrated: true,
  };

  if (previousAppearanceMode !== next.appearanceMode) {
    applyAppearanceMode(next.appearanceMode);
  }
  if (previousLocaleOverride !== next.localeOverride) {
    applyLocaleOverride(next.localeOverride);
  }

  notifyListeners();
  writeChain = writeChain
    .then(() => persistSettings(next))
    .catch(() => undefined);
}

function patchSettings(partial: Partial<PersistedSettings>) {
  updateSettings({
    appearanceMode: partial.appearanceMode ?? snapshot.appearanceMode,
    accentColor: partial.accentColor ?? snapshot.accentColor,
    hapticsEnabled: partial.hapticsEnabled ?? snapshot.hapticsEnabled,
    reduceMotionEnabled:
      partial.reduceMotionEnabled ?? snapshot.reduceMotionEnabled,
    streakCelebrationEnabled:
      partial.streakCelebrationEnabled ?? snapshot.streakCelebrationEnabled,
    localeOverride:
      partial.localeOverride !== undefined
        ? partial.localeOverride
        : snapshot.localeOverride,
    appBadgeMode: partial.appBadgeMode ?? snapshot.appBadgeMode,
    dailySummaryEnabled:
      partial.dailySummaryEnabled ?? snapshot.dailySummaryEnabled,
    dailySummaryMinutes:
      partial.dailySummaryMinutes !== undefined
        ? normalizeDailySummaryMinutes(partial.dailySummaryMinutes)
        : snapshot.dailySummaryMinutes,
    cloudSyncEnabled: partial.cloudSyncEnabled ?? snapshot.cloudSyncEnabled,
    fakeStatsEnabled: __DEV__
      ? partial.fakeStatsEnabled ?? snapshot.fakeStatsEnabled
      : false,
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  void hydrateSettings();
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return snapshot;
}

export function resolveThemeFromAppearanceMode(
  appearanceMode: AppearanceMode,
  systemScheme: ColorSchemeName | null | undefined,
): "light" | "dark" {
  if (appearanceMode === "alwaysDark") return "dark";
  if (appearanceMode === "alwaysLight") return "light";
  return systemScheme === "dark" ? "dark" : "light";
}

export function getAccentColorValue(accentColorId: AccentColorId): string {
  if (accentColorId === MATERIAL_YOU_ACCENT_ID) {
    // No theme is threaded through this call site by design (see the many
    // callers below) — read the scheme Appearance is *currently* resolved
    // to. applyAppearanceMode() forces this via Appearance.setColorScheme()
    // for alwaysLight/alwaysDark, so this already matches what `useColorScheme()`
    // returns elsewhere in the same render pass.
    const scheme = Appearance.getColorScheme() === "dark" ? "dark" : "light";
    return (
      getMaterialYouScheme(scheme)?.primary ?? MATERIAL_YOU_FALLBACK_SEED
    );
  }
  if (isHighContrastEnabled()) {
    const variants =
      HIGH_CONTRAST_ACCENT_VALUES[
        accentColorId in HIGH_CONTRAST_ACCENT_VALUES
          ? (accentColorId as keyof typeof HIGH_CONTRAST_ACCENT_VALUES)
          : (DEFAULT_SETTINGS.accentColor as keyof typeof HIGH_CONTRAST_ACCENT_VALUES)
      ];
    // Same scheme source as the Material You branch above.
    return Appearance.getColorScheme() === "dark" ? variants.dark : variants.light;
  }
  return (
    ACCENT_COLOR_VALUE_BY_ID[accentColorId] ??
    (ACCENT_COLOR_VALUE_BY_ID[DEFAULT_SETTINGS.accentColor] as string)
  );
}

// System Reduce Motion, held once at module level: queried at import time and
// kept current through the change event, so every hook instance reads the
// same value and components mounting after startup see it on first render.
let systemReduceMotion = false;
const systemReduceMotionListeners = new Set<() => void>();

function setSystemReduceMotion(next: boolean) {
  if (next === systemReduceMotion) return;
  systemReduceMotion = next;
  systemReduceMotionListeners.forEach((listener) => listener());
}

AccessibilityInfo.isReduceMotionEnabled()
  .then(setSystemReduceMotion)
  .catch(() => undefined);
AccessibilityInfo.addEventListener("reduceMotionChanged", setSystemReduceMotion);

function getSystemReduceMotion() {
  return systemReduceMotion;
}

function subscribeSystemReduceMotion(listener: () => void) {
  systemReduceMotionListeners.add(listener);
  return () => {
    systemReduceMotionListeners.delete(listener);
  };
}

/**
 * System Reduce Motion value for code that runs outside render, such as
 * animation helpers and event callbacks.
 */
export function isReduceMotionActive() {
  return systemReduceMotion;
}

export function getAppSettingsSnapshot() {
  return snapshot;
}

export function useAppSettings() {
  const state = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  React.useEffect(() => {
    void hydrateSettings();
  }, []);

  const highContrastEnabled = useHighContrast();
  const systemReduceMotion = React.useSyncExternalStore(
    subscribeSystemReduceMotion,
    getSystemReduceMotion,
    getSystemReduceMotion,
  );

  const setAppearanceMode = React.useCallback((appearanceMode: AppearanceMode) => {
    patchSettings({ appearanceMode });
  }, []);

  const setAccentColor = React.useCallback((accentColor: AccentColorId) => {
    patchSettings({ accentColor });
  }, []);

  const setHapticsEnabled = React.useCallback((hapticsEnabled: boolean) => {
    patchSettings({ hapticsEnabled });
  }, []);


  const setStreakCelebrationEnabled = React.useCallback(
    (streakCelebrationEnabled: boolean) => {
      patchSettings({ streakCelebrationEnabled });
    },
    [],
  );

  const setLocaleOverride = React.useCallback(
    (localeOverride: AppLocale | null) => {
      patchSettings({ localeOverride });
    },
    [],
  );

  const setAppBadgeMode = React.useCallback((appBadgeMode: AppBadgeMode) => {
    patchSettings({ appBadgeMode });
  }, []);

  const setDailySummaryEnabled = React.useCallback(
    (dailySummaryEnabled: boolean) => {
      patchSettings({ dailySummaryEnabled });
    },
    [],
  );

  const setDailySummaryMinutes = React.useCallback(
    (dailySummaryMinutes: number) => {
      patchSettings({ dailySummaryMinutes });
    },
    [],
  );

  const setCloudSyncEnabled = React.useCallback((cloudSyncEnabled: boolean) => {
    patchSettings({ cloudSyncEnabled });
  }, []);

  const setFakeStatsEnabled = React.useCallback(
    (fakeStatsEnabled: boolean) => {
      if (!__DEV__) {
        patchSettings({ fakeStatsEnabled: false });
        return;
      }
      patchSettings({ fakeStatsEnabled });
    },
    [],
  );

  return {
    ...state,
    // Reduce Motion follows the OS setting only. The former in-app switch was
    // removed (2026-10-17): native transitions, sheets and system controls
    // cannot follow an app-only flag. The persisted `reduceMotionEnabled`
    // field stays for backup compatibility but is ignored.
    reduceMotionEnabled: systemReduceMotion,
    // OS "Increase Contrast". Subscribing here re-renders every settings
    // consumer (and `useColorScheme()`) when it changes, so `Colors[theme]`,
    // `getAccentColorValue` and `contrastAlpha` are read fresh.
    highContrastEnabled,
    setAppearanceMode,
    setAccentColor,
    setHapticsEnabled,
    setStreakCelebrationEnabled,
    setLocaleOverride,
    setAppBadgeMode,
    setDailySummaryEnabled,
    setDailySummaryMinutes,
    setCloudSyncEnabled,
    setFakeStatsEnabled,
  };
}
