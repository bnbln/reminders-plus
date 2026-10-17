import React from "react";

import { useHighContrast } from "@/context/high-contrast-store";

/**
 * `useMemo` for style factories that read `Colors[theme]`, `contrastAlpha` or
 * `getAccentColorValue`. Those switch values while the OS "Increase Contrast"
 * setting is on without any argument changing, so the memo also recomputes
 * when that setting flips.
 */
export function useThemedStyles<T>(factory: () => T, deps: React.DependencyList): T {
  const highContrast = useHighContrast();
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo -- deps are the caller's, plus the contrast flag the factory reads indirectly.
  return React.useMemo(factory, [...deps, highContrast]);
}
