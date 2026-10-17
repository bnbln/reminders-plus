import { useRouter } from "expo-router";
import React from "react";

const SEARCH_PARAM_DELAY_MS = 150;

/**
 * Header search bar handler that writes the `q` route param once typing pauses
 * instead of on every keystroke. `router.setParams` re-renders the route and
 * re-runs the search each time. Clearing the field applies at once.
 */
export function useSearchQueryParam() {
  const router = useRouter();
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timerRef.current != null) clearTimeout(timerRef.current);
    },
    [],
  );

  return React.useCallback(
    (event: any) => {
      const q = String(event?.nativeEvent?.text ?? "");
      if (timerRef.current != null) clearTimeout(timerRef.current);
      timerRef.current = null;
      if (q.length === 0) {
        router.setParams({ q });
        return;
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        router.setParams({ q });
      }, SEARCH_PARAM_DELAY_MS);
    },
    [router],
  );
}
