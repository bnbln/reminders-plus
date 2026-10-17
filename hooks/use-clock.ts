import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { getStartOfLocalDayMs } from "@/utils/task-dates";

const MINUTE_MS = 60_000;

const getStartOfToday = () => getStartOfLocalDayMs();

const getStartOfMinute = () => Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;

const getMsUntilNextLocalDay = () => {
  const next = new Date(getStartOfToday());
  next.setDate(next.getDate() + 1);
  return next.getTime() - Date.now();
};

// Re-reads `read` when the app returns to the foreground and whenever
// `msUntilNextChange` elapses. JS timers pause in the background, so the
// AppState listener covers resume on a later day.
function useTickingValue(read: () => number, msUntilNextChange: () => number) {
  const [value, setValue] = useState(read);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      const next = read();
      setValue((current) => (current === next ? current : next));
    };
    const schedule = () => {
      if (timer != null) clearTimeout(timer);
      // A small margin so the timer never fires just before the boundary.
      timer = setTimeout(
        () => {
          refresh();
          schedule();
        },
        Math.max(1000, msUntilNextChange() + 250),
      );
    };

    refresh();
    schedule();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      refresh();
      schedule();
    });

    return () => {
      subscription.remove();
      if (timer != null) clearTimeout(timer);
    };
  }, [read, msUntilNextChange]);

  return value;
}

/** Start of the current local day; updates at midnight and on resume. */
export function useStartOfToday() {
  return useTickingValue(getStartOfToday, getMsUntilNextLocalDay);
}

const getMsUntilNextMinute = () => MINUTE_MS - (Date.now() % MINUTE_MS);

/** `Date.now()` rounded down to the minute; updates every minute and on resume. */
export function useCurrentMinute() {
  return useTickingValue(getStartOfMinute, getMsUntilNextMinute);
}
