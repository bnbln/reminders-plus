import React from "react";
import { NativeModules, Platform } from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";

import { requireOptionalNativeModule } from "expo-modules-core";
import { t } from "@/i18n";

export type TagId =
  | "overdue"
  | "datetime"
  | "location"
  | "project"
  | "routine"
  | "keywords";

export const TAG_ORDER: TagId[] = [
  "overdue",
  "datetime",
  "location",
  "project",
  "routine",
  "keywords",
];

export const TAG_DEFS: Record<TagId, { titleKey: string; iosSymbol: string }> = {
  overdue: { titleKey: "tags.overdue", iosSymbol: "exclamationmark.triangle.fill" },
  datetime: { titleKey: "tags.datetime", iosSymbol: "calendar.badge.clock" },
  location: { titleKey: "tags.location", iosSymbol: "location.fill" },
  project: { titleKey: "tags.project", iosSymbol: "folder.fill" },
  routine: { titleKey: "taskDetail.property.routine", iosSymbol: "repeat" },
  keywords: { titleKey: "tags.keywords", iosSymbol: "tag.fill" },
};

export function getTagTitle(tagId: TagId): string {
  return t(TAG_DEFS[tagId].titleKey);
}

const STORAGE_KEYS = {
  tags: "reminds.homeFilters.tags",
  tagIcons: "reminds.homeFilters.tagIcons",
  compactSubtasks: "reminds.homeFilters.compactSubtasks",
  completedTasks: "reminds.homeFilters.completedTasks",
} as const;

type KeyValueBackend = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

let backendPromise: Promise<KeyValueBackend> | null = null;

const resolveBackend = (): Promise<KeyValueBackend> => {
  if (backendPromise) return backendPromise;

  backendPromise = (async () => {
    if (Platform.OS === "web") {
      return {
        getItem: async (key) =>
          typeof localStorage === "undefined"
            ? null
            : localStorage.getItem(key),
        setItem: async (key, value) => {
          if (typeof localStorage !== "undefined")
            localStorage.setItem(key, value);
        },
        removeItem: async (key) => {
          if (typeof localStorage !== "undefined") localStorage.removeItem(key);
        },
      };
    }

    // Prefer AsyncStorage when linked (works in managed Expo, iOS/Android).
    if ((NativeModules as any)?.RNCAsyncStorage) {
      try {
        if (
          AsyncStorage?.getItem &&
          AsyncStorage?.setItem &&
          AsyncStorage?.removeItem
        ) {
          return {
            getItem: (key) => AsyncStorage.getItem(key),
            setItem: (key, value) => AsyncStorage.setItem(key, value),
            removeItem: (key) => AsyncStorage.removeItem(key),
          };
        }
      } catch {
        // ignore
      }
    }

    // Fallback: expo-file-system JSON store (works in many Expo Go versions).
    if (requireOptionalNativeModule("FileSystem")) {
      try {
        const FileSystemMod = await import("expo-file-system");
        const FileSystem: any =
          (FileSystemMod as any)?.default ?? FileSystemMod;

        if (
          FileSystem?.documentDirectory &&
          FileSystem?.readAsStringAsync &&
          FileSystem?.writeAsStringAsync &&
          FileSystem?.getInfoAsync
        ) {
          const fileUri = `${FileSystem.documentDirectory}reminds.homeFilters.json`;
          let cache: Record<string, string> | null = null;
          let writeChain: Promise<void> = Promise.resolve();

          const readAll = async (): Promise<Record<string, string>> => {
            if (cache) return cache;
            try {
              const info = await FileSystem.getInfoAsync(fileUri);
              if (!info.exists) {
                cache = {};
                return cache;
              }
              const raw = await FileSystem.readAsStringAsync(fileUri);
              const parsed = JSON.parse(raw);
              cache =
                parsed && typeof parsed === "object"
                  ? (parsed as Record<string, string>)
                  : {};
              return cache;
            } catch {
              cache = {};
              return cache;
            }
          };

          const commit = async (next: Record<string, string>) => {
            cache = next;
            const keys = Object.keys(next);
            if (keys.length === 0) {
              try {
                await FileSystem.deleteAsync(fileUri, { idempotent: true });
              } catch {
                // ignore
              }
              return;
            }
            try {
              await FileSystem.writeAsStringAsync(
                fileUri,
                JSON.stringify(next),
                {
                  encoding: FileSystem?.EncodingType?.UTF8,
                },
              );
            } catch {
              // ignore
            }
          };

          return {
            getItem: async (key) => {
              const all = await readAll();
              return Object.prototype.hasOwnProperty.call(all, key)
                ? all[key]
                : null;
            },
            setItem: async (key, value) => {
              writeChain = writeChain.then(async () => {
                const all = await readAll();
                await commit({ ...all, [key]: value });
              });
              await writeChain;
            },
            removeItem: async (key) => {
              writeChain = writeChain.then(async () => {
                const all = await readAll();
                const { [key]: _ignored, ...rest } = all;
                await commit(rest);
              });
              await writeChain;
            },
          };
        }
      } catch {
        // ignore
      }
    }

    // Last resort: keep settings in-memory (no persistence) to avoid crashing.
    const mem = new Map<string, string>();
    return {
      getItem: async (key) => (mem.has(key) ? (mem.get(key) as string) : null),
      setItem: async (key, value) => {
        mem.set(key, value);
      },
      removeItem: async (key) => {
        mem.delete(key);
      },
    };
  })();

  return backendPromise;
};

async function getStoredItem(key: string): Promise<string | null> {
  const backend = await resolveBackend();
  return backend.getItem(key);
}

async function setStoredItem(key: string, value: string): Promise<void> {
  const backend = await resolveBackend();
  await backend.setItem(key, value);
}

async function removeStoredItem(key: string): Promise<void> {
  const backend = await resolveBackend();
  await backend.removeItem(key);
}

type HomeFiltersContextValue = {
  enabledTags: Set<TagId>;
  setEnabledTags: React.Dispatch<React.SetStateAction<Set<TagId>>>;
  showTagIcons: boolean;
  setShowTagIcons: React.Dispatch<React.SetStateAction<boolean>>;
  showCompactSubtasks: boolean;
  setShowCompactSubtasks: React.Dispatch<React.SetStateAction<boolean>>;
  showCompletedTasks: boolean;
  setShowCompletedTasks: React.Dispatch<React.SetStateAction<boolean>>;
};

const HomeFiltersContext = React.createContext<HomeFiltersContextValue | null>(
  null,
);

export function HomeFiltersProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Default: all tags hidden, task-icons visible
  const [enabledTags, setEnabledTags] = React.useState<Set<TagId>>(
    () => new Set(),
  );
  const [showTagIcons, setShowTagIcons] = React.useState<boolean>(true);
  const [showCompactSubtasks, setShowCompactSubtasks] =
    React.useState<boolean>(false);
  const [showCompletedTasks, setShowCompletedTasks] =
    React.useState<boolean>(true);

  const hydratedRef = React.useRef(false);

  // Hydrate from persistent storage once.
  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const [
          storedTags,
          storedIcons,
          storedCompactSubtasks,
          storedCompletedTasks,
        ] =
          await Promise.all([
            getStoredItem(STORAGE_KEYS.tags),
            getStoredItem(STORAGE_KEYS.tagIcons),
            getStoredItem(STORAGE_KEYS.compactSubtasks),
            getStoredItem(STORAGE_KEYS.completedTasks),
          ]);

        if (cancelled) return;

        if (storedTags != null) {
          const nextEnabled = parseTagsParam(storedTags);
          setEnabledTags((prev) => {
            // Avoid replacing with an equal-but-different Set instance.
            if (
              prev.size === nextEnabled.size &&
              Array.from(prev).every((t) => nextEnabled.has(t))
            )
              return prev;
            return nextEnabled;
          });
        }

        if (storedIcons != null) {
          const nextIcons = parseTagIconsParam(storedIcons);
          setShowTagIcons((prev) => (prev === nextIcons ? prev : nextIcons));
        }

        if (storedCompactSubtasks != null) {
          const nextCompactSubtasks =
            parseCompactSubtasksParam(storedCompactSubtasks);
          setShowCompactSubtasks((prev) =>
            prev === nextCompactSubtasks ? prev : nextCompactSubtasks,
          );
        }

        if (storedCompletedTasks != null) {
          const nextCompletedTasks =
            parseShowCompletedTasksParam(storedCompletedTasks);
          setShowCompletedTasks((prev) =>
            prev === nextCompletedTasks ? prev : nextCompletedTasks,
          );
        }
      } finally {
        if (!cancelled) hydratedRef.current = true;
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist on change (after hydration).
  React.useEffect(() => {
    if (!hydratedRef.current) return;

    const run = async () => {
      const tagsParam = serializeTagsParam(enabledTags);
      if (tagsParam) await setStoredItem(STORAGE_KEYS.tags, tagsParam);
      else await removeStoredItem(STORAGE_KEYS.tags);

      await setStoredItem(STORAGE_KEYS.tagIcons, showTagIcons ? "1" : "0");
      await setStoredItem(
        STORAGE_KEYS.compactSubtasks,
        showCompactSubtasks ? "1" : "0",
      );
      await setStoredItem(
        STORAGE_KEYS.completedTasks,
        showCompletedTasks ? "1" : "0",
      );
    };

    void run();
  }, [enabledTags, showCompactSubtasks, showCompletedTasks, showTagIcons]);

  const value = React.useMemo(
    () => ({
      enabledTags,
      setEnabledTags,
      showTagIcons,
      setShowTagIcons,
      showCompactSubtasks,
      setShowCompactSubtasks,
      showCompletedTasks,
      setShowCompletedTasks,
    }),
    [enabledTags, showCompactSubtasks, showCompletedTasks, showTagIcons],
  );

  return (
    <HomeFiltersContext.Provider value={value}>
      {children}
    </HomeFiltersContext.Provider>
  );
}

export function useHomeFilters() {
  const ctx = React.useContext(HomeFiltersContext);
  if (!ctx)
    throw new Error("useHomeFilters must be used within HomeFiltersProvider");
  return ctx;
}

export function parseTagsParam(value: unknown): Set<TagId> {
  if (value === "all") return new Set(TAG_ORDER);
  if (value === "none") return new Set<TagId>();
  if (typeof value !== "string" || value.trim().length === 0)
    return new Set<TagId>();

  const parts = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const enabled = new Set<TagId>();
  for (const p of parts) {
    if (
      p === "overdue" ||
      p === "datetime" ||
      p === "location" ||
      p === "project" ||
      p === "routine" ||
      p === "keywords"
    )
      enabled.add(p);
  }
  return enabled;
}

export function serializeTagsParam(enabled: Set<TagId>): string | undefined {
  if (enabled.size === 0) return undefined;
  const allEnabled = TAG_ORDER.every((t) => enabled.has(t));
  if (allEnabled) return "all";
  return TAG_ORDER.filter((t) => enabled.has(t)).join(",");
}

export function parseTagIconsParam(value: unknown): boolean {
  if (value === "0") return false;
  if (value === "1") return true;
  return true;
}

export function parseCompactSubtasksParam(value: unknown): boolean {
  if (value === "0") return false;
  if (value === "1") return true;
  return false;
}

export function parseShowCompletedTasksParam(value: unknown): boolean {
  if (value === "0") return false;
  if (value === "1") return true;
  return true;
}
