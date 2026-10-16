import AsyncStorage from "@react-native-async-storage/async-storage";
import React from "react";
import { AppState, Platform } from "react-native";

import {
  StreakCelebrationOverlay,
  type StreakCelebrationDay,
} from "@/components/streak-celebration/streak-celebration-overlay";
import { useAppSettings } from "@/context/settings-store";
import { useTasksStore } from "@/context/tasks-store";
import { useStreaks } from "@/hooks/use-streaks";

const LAST_CELEBRATED_KEY = "reminds.streakCelebration.lastDay.v1";
// Lets the row's own completion animation finish before the stage takes over.
const SHOW_DELAY_MS = 650;

type Celebration = {
  id: number;
  streak: number;
  isRecord: boolean;
  week: StreakCelebrationDay[];
};

type StreakCelebrationContextValue = {
  /** Plays the celebration for the current streak without recording it. */
  playPreview: () => void;
};

const StreakCelebrationContext =
  React.createContext<StreakCelebrationContextValue | null>(null);

function toLocalISODate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function readLastCelebratedDay(): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      return typeof localStorage === "undefined"
        ? null
        : localStorage.getItem(LAST_CELEBRATED_KEY);
    }
    return await AsyncStorage.getItem(LAST_CELEBRATED_KEY);
  } catch {
    return null;
  }
}

async function writeLastCelebratedDay(day: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(LAST_CELEBRATED_KEY, day);
      }
      return;
    }
    await AsyncStorage.setItem(LAST_CELEBRATED_KEY, day);
  } catch {
    // best-effort; worst case the celebration plays once more today
  }
}

/**
 * Watches today's completion count and, when it goes from 0 to ≥1 (the first
 * finished task of the day extends the streak), plays the full-screen flame
 * celebration once per day. Disabled unless the user opts in via settings.
 *
 * Completions made outside the app (widget, notification action) surface when
 * the tasks store reloads on foreground, so they celebrate on the next open.
 */
export function StreakCelebrationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { completionHistory, hasHydrated } = useTasksStore();
  const { streakCelebrationEnabled, reduceMotionEnabled } = useAppSettings();
  const { currentStreak, longestStreak, todayCompletedCount, getChartData } =
    useStreaks();
  const [celebration, setCelebration] = React.useState<Celebration | null>(null);
  const lastSeenRef = React.useRef<{ day: string; count: number } | null>(null);
  const nextIdRef = React.useRef(1);

  const buildCelebration = React.useCallback(
    (assumeTodayDone: boolean): Celebration => {
      const extendsToday = assumeTodayDone && todayCompletedCount === 0;
      const streak = Math.max(1, currentStreak + (extendsToday ? 1 : 0));
      const week = getChartData("7d").map((point) => ({
        key: point.dateStr,
        label: point.label,
        done: point.count > 0 || (point.isToday === true && assumeTodayDone),
        isToday: point.isToday === true,
      }));
      return {
        id: nextIdRef.current++,
        streak,
        isRecord: streak >= longestStreak,
        week,
      };
    },
    [currentStreak, getChartData, longestStreak, todayCompletedCount],
  );

  const pendingRef = React.useRef<{
    timer?: ReturnType<typeof setTimeout>;
    sub?: { remove: () => void };
  }>({});

  const clearPending = React.useCallback(() => {
    const pending = pendingRef.current;
    if (pending.timer) clearTimeout(pending.timer);
    pending.sub?.remove();
    pendingRef.current = {};
  }, []);

  const buildRef = React.useRef(buildCelebration);
  React.useEffect(() => {
    buildRef.current = buildCelebration;
  }, [buildCelebration]);

  const schedule = React.useCallback(() => {
    clearPending();
    const show = () => {
      pendingRef.current = {};
      setCelebration(buildRef.current(true));
    };
    if (AppState.currentState === "active") {
      pendingRef.current.timer = setTimeout(show, SHOW_DELAY_MS);
      return;
    }
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      sub.remove();
      pendingRef.current = { timer: setTimeout(show, SHOW_DELAY_MS) };
    });
    pendingRef.current.sub = sub;
  }, [clearPending]);

  React.useEffect(() => clearPending, [clearPending]);

  React.useEffect(() => {
    if (!hasHydrated) return;
    const day = toLocalISODate(Date.now());
    const count = completionHistory[day] ?? 0;
    const previous = lastSeenRef.current;
    lastSeenRef.current = { day, count };
    // The first hydrated value is only a baseline — loading today's history
    // on launch is not a new completion.
    if (!previous) return;
    const previousCount = previous.day === day ? previous.count : 0;
    if (previousCount > 0 || count <= 0) return;
    if (!streakCelebrationEnabled) return;

    // Not tied to this effect's cleanup: another completion within the delay
    // must not cancel a celebration that was already recorded for today.
    void (async () => {
      if ((await readLastCelebratedDay()) === day) return;
      await writeLastCelebratedDay(day);
      schedule();
    })();
  }, [completionHistory, hasHydrated, schedule, streakCelebrationEnabled]);

  const playPreview = React.useCallback(() => {
    clearPending();
    setCelebration(buildRef.current(true));
  }, [clearPending]);

  const handleClose = React.useCallback(() => setCelebration(null), []);

  const value = React.useMemo(() => ({ playPreview }), [playPreview]);

  return (
    <StreakCelebrationContext.Provider value={value}>
      {children}
      {celebration ? (
        <StreakCelebrationOverlay
          key={celebration.id}
          streak={celebration.streak}
          isRecord={celebration.isRecord}
          week={celebration.week}
          reduceMotion={reduceMotionEnabled}
          onClose={handleClose}
        />
      ) : null}
    </StreakCelebrationContext.Provider>
  );
}

export function useStreakCelebration() {
  const ctx = React.useContext(StreakCelebrationContext);
  if (!ctx) {
    throw new Error(
      "useStreakCelebration must be used within StreakCelebrationProvider",
    );
  }
  return ctx;
}
