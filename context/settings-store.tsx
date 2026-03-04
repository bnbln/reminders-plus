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

type PersistedSettings = {
  appearanceMode: AppearanceMode;
  accentColor: AccentColorId;
};

type SettingsSnapshot = PersistedSettings & {
  hasHydrated: boolean;
};

const STORAGE_KEY = "reminds.settings.v1";

const DEFAULT_SETTINGS: PersistedSettings = {
  appearanceMode: "adaptive",
  accentColor: "blue",
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

function sanitizeStoredSettings(value: unknown): PersistedSettings | null {
  if (!value || typeof value !== "object") return null;
  const appearanceMode = (value as { appearanceMode?: unknown }).appearanceMode;
  const accentColor = (value as { accentColor?: unknown }).accentColor;
  return {
    appearanceMode: isAppearanceMode(appearanceMode)
      ? appearanceMode
      : DEFAULT_SETTINGS.appearanceMode,
    accentColor: isAccentColorId(accentColor)
      ? accentColor
      : DEFAULT_SETTINGS.accentColor,
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

  return {
    ...state,
    setAppearanceMode,
    setAccentColor,
  };
}
