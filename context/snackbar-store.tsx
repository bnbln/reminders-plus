import React from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getAccentColorValue, useAppSettings } from "@/context/settings-store";
import { useColorScheme } from "@/hooks/use-color-scheme";

/**
 * Material 3 snackbar.
 *
 * Android's convention for a destructive action is to perform it immediately and
 * offer Undo, rather than blocking on a confirmation dialog the way iOS does.
 * Transient errors and validation messages also belong here instead of in an
 * `Alert`, which on Android is a modal dialog that demands dismissal.
 *
 * Dialogs are still right for anything that genuinely needs a decision (a
 * permission explanation with a "Settings" action, a premium upsell).
 */

const DEFAULT_DURATION_MS = 4000;
/**
 * M3 stacks the snackbar *above* the FAB rather than over it, so this clears the
 * navigation bar, the FAB's own margin, and the FAB itself.
 */
const BOTTOM_GAP = 16;
const NAV_BAR_HEIGHT = 80;
const FAB_HEIGHT = 56;

export type SnackbarOptions = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Milliseconds; defaults to 4s (M3 "long" duration). */
  duration?: number;
};

type SnackbarContextValue = {
  showSnackbar: (options: SnackbarOptions) => void;
  dismissSnackbar: () => void;
};

const SnackbarContext = React.createContext<SnackbarContextValue | null>(null);

export function SnackbarProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = React.useState<SnackbarOptions | null>(null);
  const [opacity] = React.useState(() => new Animated.Value(0));
  const [translateY] = React.useState(() => new Animated.Value(24));
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const { accentColor } = useAppSettings();

  const clearTimer = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hide = React.useCallback(() => {
    clearTimer();
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 24,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setCurrent(null);
    });
  }, [clearTimer, opacity, translateY]);

  const showSnackbar = React.useCallback(
    (options: SnackbarOptions) => {
      clearTimer();
      setCurrent(options);
      opacity.setValue(0);
      translateY.setValue(24);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();

      timerRef.current = setTimeout(
        hide,
        options.duration ?? DEFAULT_DURATION_MS,
      );
    },
    [clearTimer, hide, opacity, translateY],
  );

  React.useEffect(() => clearTimer, [clearTimer]);

  const value = React.useMemo(
    () => ({ showSnackbar, dismissSnackbar: hide }),
    [hide, showSnackbar],
  );

  // M3 inverse surface: dark container on a light theme and vice versa.
  const container = isDark ? "#E3E3E6" : "#2F3033";
  const label = isDark ? "#1A1C1E" : "#F1F0F4";
  const accent = getAccentColorValue(accentColor);

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      {current ? (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.host,
            {
              bottom:
                insets.bottom +
                NAV_BAR_HEIGHT +
                BOTTOM_GAP +
                FAB_HEIGHT +
                8,
              opacity,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={[styles.snackbar, { backgroundColor: container }]}>
            <Text numberOfLines={2} style={[styles.message, { color: label }]}>
              {current.message}
            </Text>
            {current.actionLabel ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const action = current.onAction;
                  hide();
                  action?.();
                }}
                android_ripple={{ color: `${accent}33` }}
                style={styles.action}
              >
                <Text style={[styles.actionLabel, { color: accent }]}>
                  {current.actionLabel}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </SnackbarContext.Provider>
  );
}

export function useSnackbar() {
  const ctx = React.useContext(SnackbarContext);
  if (!ctx) {
    throw new Error("useSnackbar must be used within SnackbarProvider");
  }
  return ctx;
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 16,
  },
  snackbar: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 8,
    // M3 corner on Android; iOS uses its rounder card corner.
    borderRadius: Platform.OS === "ios" ? 16 : 4,
    ...Platform.select({
      android: { elevation: 6 },
      default: {
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
    }),
  },
  message: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  action: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Platform.OS === "ios" ? 10 : 4,
    overflow: "hidden",
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
});
