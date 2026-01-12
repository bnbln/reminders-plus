import React from 'react';

export type TabBarMinimizeBehavior = 'automatic' | 'never' | 'onScrollDown' | 'onScrollUp';

type TabBarMinimizeState = {
  behavior: TabBarMinimizeBehavior;
  isMinimized: boolean;
  lastOffset: number | null;
  lastDy: number;
  lockedUntilMs: number;
};

type TabBarMinimizeApi = {
  behavior: TabBarMinimizeBehavior;
  isMinimized: boolean;
  lastOffset: number;
  lastDy: number;

  reportScrollOffset: (offset: number) => void;
  expandForInteraction: (lockMs?: number) => void;
  resetTracking: (lockMs?: number) => void;
  setBehavior: (behavior: TabBarMinimizeBehavior) => void;
};

const DEFAULT_STATE: TabBarMinimizeState = {
  behavior: 'automatic',
  isMinimized: false,
  lastOffset: null,
  lastDy: 0,
  lockedUntilMs: 0,
};

const TabBarMinimizeContext = React.createContext<TabBarMinimizeApi | null>(null);

export function TabBarMinimizeProvider({
  children,
  behavior,
}: {
  children: React.ReactNode;
  behavior?: TabBarMinimizeBehavior;
}) {
  const [state, setState] = React.useState<TabBarMinimizeState>(() => ({
    ...DEFAULT_STATE,
    behavior: behavior ?? DEFAULT_STATE.behavior,
  }));

  React.useEffect(() => {
    if (!behavior) return;
    setState((prev) => ({ ...prev, behavior }));
  }, [behavior]);

  const setBehavior = React.useCallback((nextBehavior: TabBarMinimizeBehavior) => {
    setState((prev) => ({ ...prev, behavior: nextBehavior }));
  }, []);

  const expandForInteraction = React.useCallback((lockMs: number = 250) => {
    const now = Date.now();
    setState((prev) => ({
      ...prev,
      isMinimized: false,
      lockedUntilMs: Math.max(prev.lockedUntilMs, now + lockMs),
    }));
  }, []);

  const resetTracking = React.useCallback((lockMs: number = 250) => {
    const now = Date.now();
    setState((prev) => ({
      ...prev,
      isMinimized: false,
      lastOffset: null,
      lastDy: 0,
      lockedUntilMs: Math.max(prev.lockedUntilMs, now + lockMs),
    }));
  }, []);

  const reportScrollOffset = React.useCallback((offset: number) => {
    const now = Date.now();

    setState((prev) => {
      // First sample after reset/tab switch: sync baseline, don't toggle.
      if (prev.lastOffset === null) {
        return {
          ...prev,
          lastOffset: offset,
          lastDy: 0,
          isMinimized: offset <= 0 ? false : prev.isMinimized,
        };
      }

      const dy = offset - prev.lastOffset;

      // Always keep lastOffset in sync, even for tiny changes.
      // Epsilon avoids flip-flopping from floating jitter.
      const EPS = 0.5;
      // Large jumps happen on tab switches / programmatic scroll / content changes.
      // Treat them as a baseline sync (avoid incorrect flips).
      const MAX_REASONABLE_STEP = 80;

      let nextMinimized = prev.isMinimized;

      // Always expand at/above the top.
      if (offset <= 0) {
        nextMinimized = false;
      } else if (Math.abs(dy) > MAX_REASONABLE_STEP) {
        // Baseline sync only.
        nextMinimized = prev.isMinimized;
      } else if (Math.abs(dy) >= EPS) {
        const behaviorResolved = prev.behavior === 'automatic' ? 'onScrollDown' : prev.behavior;

        if (behaviorResolved === 'onScrollDown') {
          if (dy > 0) nextMinimized = true;
          if (dy < 0) nextMinimized = false;

          // If we just expanded due to interaction (tab press/focus), don't immediately re-minimize
          // while momentum scroll is still running.
          if (now < prev.lockedUntilMs && dy > 0) nextMinimized = false;
        }

        if (behaviorResolved === 'onScrollUp') {
          if (dy < 0) nextMinimized = true;
          if (dy > 0) nextMinimized = false;

          if (now < prev.lockedUntilMs && dy < 0) nextMinimized = false;
        }

        if (behaviorResolved === 'never') {
          nextMinimized = false;
        }
      }

      return {
        ...prev,
        lastOffset: offset,
        lastDy: dy,
        isMinimized: nextMinimized,
      };
    });
  }, []);

  const value = React.useMemo<TabBarMinimizeApi>(() => {
    return {
      behavior: state.behavior,
      isMinimized: state.isMinimized,
      lastOffset: state.lastOffset ?? 0,
      lastDy: state.lastDy,
      reportScrollOffset,
      expandForInteraction,
      resetTracking,
      setBehavior,
    };
  }, [expandForInteraction, reportScrollOffset, resetTracking, setBehavior, state.behavior, state.isMinimized, state.lastDy, state.lastOffset]);

  return <TabBarMinimizeContext.Provider value={value}>{children}</TabBarMinimizeContext.Provider>;
}

export function useTabBarMinimize() {
  const ctx = React.useContext(TabBarMinimizeContext);
  if (!ctx) throw new Error('useTabBarMinimize must be used within TabBarMinimizeProvider');
  return ctx;
}
