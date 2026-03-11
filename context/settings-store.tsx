import AsyncStorage from "@react-native-async-storage/async-storage";
import React from "react";
import { Appearance, Platform, type ColorSchemeName } from "react-native";

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
  appBadgeMode: AppBadgeMode;
  dailySummaryEnabled: boolean;
  dailySummaryMinutes: number;
  cloudSyncEnabled: boolean;
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
  appBadgeMode: DEFAULT_APP_BADGE_MODE,
  dailySummaryEnabled: false,
  dailySummaryMinutes: DEFAULT_DAILY_SUMMARY_MINUTES,
  cloudSyncEnabled: false,
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
  const appBadgeMode = (value as { appBadgeMode?: unknown }).appBadgeMode;
  const dailySummaryEnabled = (value as { dailySummaryEnabled?: unknown })
    .dailySummaryEnabled;
  const dailySummaryMinutes = (value as { dailySummaryMinutes?: unknown })
    .dailySummaryMinutes;
  const cloudSyncEnabled = (value as { cloudSyncEnabled?: unknown })
    .cloudSyncEnabled;
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
    snapshot.appBadgeMode !== next.appBadgeMode ||
    snapshot.dailySummaryEnabled !== next.dailySummaryEnabled ||
    snapshot.dailySummaryMinutes !== next.dailySummaryMinutes ||
    snapshot.cloudSyncEnabled !== next.cloudSyncEnabled ||
    !snapshot.hasHydrated;
  if (!hasChanged) return;

  localMutationRevision += 1;
  const previousAppearanceMode = snapshot.appearanceMode;
  snapshot = {
    ...snapshot,
    ...next,
    hasHydrated: true,
  };

  if (previousAppearanceMode !== next.appearanceMode) {
    applyAppearanceMode(next.appearanceMode);
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
    appBadgeMode: partial.appBadgeMode ?? snapshot.appBadgeMode,
    dailySummaryEnabled:
      partial.dailySummaryEnabled ?? snapshot.dailySummaryEnabled,
    dailySummaryMinutes:
      partial.dailySummaryMinutes !== undefined
        ? normalizeDailySummaryMinutes(partial.dailySummaryMinutes)
        : snapshot.dailySummaryMinutes,
    cloudSyncEnabled: partial.cloudSyncEnabled ?? snapshot.cloudSyncEnabled,
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

  return {
    ...state,
    setAppearanceMode,
    setAccentColor,
    setHapticsEnabled,
    setReduceMotionEnabled,
    setAppBadgeMode,
    setDailySummaryEnabled,
    setDailySummaryMinutes,
    setCloudSyncEnabled,
  };
}
