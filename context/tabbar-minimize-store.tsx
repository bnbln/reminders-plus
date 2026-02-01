import React from 'react';

export type TabBarMinimizeBehavior = 'automatic' | 'never' | 'onScrollDown' | 'onScrollUp';

type TabBarMinimizeState = {
  behavior: TabBarMinimizeBehavior;
  isMinimized: boolean;
};

type TabBarMinimizeApi = {
  behavior: TabBarMinimizeBehavior;
  isMinimized: boolean;

  reportScrollOffset: (offset: number) => void;
  expandForInteraction: (lockMs?: number) => void;
  resetTracking: (lockMs?: number) => void;
  setBehavior: (behavior: TabBarMinimizeBehavior) => void;
};

const DEFAULT_STATE: TabBarMinimizeState = {
  behavior: 'automatic',
  isMinimized: false,
};

const TabBarMinimizeContext = React.createContext<TabBarMinimizeApi | null>(null);

export function TabBarMinimizeProvider({
  children,
  behavior = 'automatic',
}: {
  children: React.ReactNode;
  behavior?: TabBarMinimizeBehavior;
}) {
  const [state, setState] = React.useState<TabBarMinimizeState>(() => ({
    ...DEFAULT_STATE,
    behavior,
  }));

  // Mutable state for high-frequency tracking avoids re-renders
  const lastOffsetRef = React.useRef<number | null>(null);
  const lockedUntilMsRef = React.useRef<number>(0);

  // Keep behavior in a ref so reportScrollOffset can access the latest without changing identity
  const behaviorRef = React.useRef(behavior);

  React.useEffect(() => {
    setState((prev) => ({ ...prev, behavior }));
    behaviorRef.current = behavior;
  }, [behavior]);

  const setBehavior = React.useCallback((nextBehavior: TabBarMinimizeBehavior) => {
    setState((prev) => ({ ...prev, behavior: nextBehavior }));
    behaviorRef.current = nextBehavior;
  }, []);

  const expandForInteraction = React.useCallback((lockMs: number = 250) => {
    const now = Date.now();
    lockedUntilMsRef.current = Math.max(lockedUntilMsRef.current, now + lockMs);
    setState((prev) => (prev.isMinimized ? { ...prev, isMinimized: false } : prev));
  }, []);

  const resetTracking = React.useCallback((lockMs: number = 250) => {
    const now = Date.now();
    lastOffsetRef.current = null;
    lockedUntilMsRef.current = Math.max(lockedUntilMsRef.current, now + lockMs);
    setState((prev) => (prev.isMinimized ? { ...prev, isMinimized: false } : prev));
  }, []);

  const reportScrollOffset = React.useCallback((offset: number) => {
    const now = Date.now();
    const prevOffset = lastOffsetRef.current;

    // First sample after reset: just sync baseline
    if (prevOffset === null) {
      lastOffsetRef.current = offset;
      setState((prev) => {
        // If we are starting at top, ensure expanded
        if (offset <= 0 && prev.isMinimized) {
          return { ...prev, isMinimized: false };
        }
        return prev;
      });
      return;
    }

    const dy = offset - prevOffset;
    lastOffsetRef.current = offset; // Always sync

    const EPS = 0.5;
    const MAX_REASONABLE_STEP = 80;

    // Determine target state based on refs and current calculated dy
    let shouldBeMinimized: boolean | null = null; // null means "no change"

    if (offset <= 0) {
      shouldBeMinimized = false;
    } else if (Math.abs(dy) > MAX_REASONABLE_STEP) {
      // Large jump: ignore for toggling, just baseline sync (state unchanged)
      shouldBeMinimized = null;
    } else if (Math.abs(dy) >= EPS) {
      const currentBehavior = behaviorRef.current;
      const behaviorResolved = currentBehavior === 'automatic' ? 'onScrollDown' : currentBehavior;

      if (behaviorResolved === 'onScrollDown') {
        if (dy > 0) shouldBeMinimized = true;
        if (dy < 0) shouldBeMinimized = false;

        // Interaction lock check
        if (now < lockedUntilMsRef.current && dy > 0) {
          shouldBeMinimized = false;
        }
      }

      if (behaviorResolved === 'onScrollUp') {
        if (dy < 0) shouldBeMinimized = true;
        if (dy > 0) shouldBeMinimized = false;

        if (now < lockedUntilMsRef.current && dy < 0) {
          shouldBeMinimized = false;
        }
      }

      if (behaviorResolved === 'never') {
        shouldBeMinimized = false;
      }
    }

    if (shouldBeMinimized !== null) {
      setState((prev) => {
        if (prev.isMinimized !== shouldBeMinimized) {
          return { ...prev, isMinimized: shouldBeMinimized };
        }
        return prev;
      });
    }
  }, []);

  const value = React.useMemo<TabBarMinimizeApi>(() => {
    return {
      behavior: state.behavior,
      isMinimized: state.isMinimized,
      reportScrollOffset,
      expandForInteraction,
      resetTracking,
      setBehavior,
    };
  }, [expandForInteraction, reportScrollOffset, resetTracking, setBehavior, state.behavior, state.isMinimized]);

  return <TabBarMinimizeContext.Provider value={value}>{children}</TabBarMinimizeContext.Provider>;
}

export function useTabBarMinimize() {
  const ctx = React.useContext(TabBarMinimizeContext);
  if (!ctx) throw new Error('useTabBarMinimize must be used within TabBarMinimizeProvider');
  return ctx;
}

