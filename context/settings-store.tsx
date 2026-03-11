import AsyncStorage from "@react-native-async-storage/async-storage";
import React from "react";
import { Appearance, Platform, type ColorSchemeName } from "react-native";

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

export type AccentColorId = (typeof ACCENT_COLORS)[number]["id"];

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
  localeOverride: null,
  appBadgeMode: DEFAULT_APP_BADGE_MODE,
  dailySummaryEnabled: false,
  dailySummaryMinutes: DEFAULT_DAILY_SUMMARY_MINUTES,
  cloudSyncEnabled: false,
  fakeStatsEnabled: false,
};

const ACCENT_COLOR_VALUE_BY_ID = ACCENT_COLORS.reduce(
  (acc, color) => ({ ...acc, [color.id]: color.value }),
  {} as Record<AccentColorId, string>,
);

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
  return ACCENT_COLORS.some((color) => color.id === value);
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
  return (
    ACCENT_COLOR_VALUE_BY_ID[accentColorId] ??
    ACCENT_COLOR_VALUE_BY_ID[DEFAULT_SETTINGS.accentColor]
  );
}

export function getAppSettingsSnapshot() {
  return snapshot;
}

export function useAppSettings() {
  const state = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  React.useEffect(() => {
    void hydrateSettings();
  }, []);

  const setAppearanceMode = React.useCallback((appearanceMode: AppearanceMode) => {
    patchSettings({ appearanceMode });
  }, []);

  const setAccentColor = React.useCallback((accentColor: AccentColorId) => {
    patchSettings({ accentColor });
  }, []);

  const setHapticsEnabled = React.useCallback((hapticsEnabled: boolean) => {
    patchSettings({ hapticsEnabled });
  }, []);

  const setReduceMotionEnabled = React.useCallback(
    (reduceMotionEnabled: boolean) => {
      patchSettings({ reduceMotionEnabled });
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
    setAppearanceMode,
    setAccentColor,
    setHapticsEnabled,
    setReduceMotionEnabled,
    setLocaleOverride,
    setAppBadgeMode,
    setDailySummaryEnabled,
    setDailySummaryMinutes,
    setCloudSyncEnabled,
    setFakeStatsEnabled,
  };
}
