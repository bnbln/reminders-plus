import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
  Stack,
  useSegments,
  type ErrorBoundaryProps,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import {
  DevSettings,
  I18nManager,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ReduceMotion, ReducedMotionConfig } from "react-native-reanimated";

import { MacIntegration } from "@/components/navigation/mac-integration";
import { VerticalBarSafeAreaProvider, verticalBarScreenLayout } from "@/components/navigation/vertical-bar-safe-area";
import { SearchBarDismissProvider } from "@/components/search/search-bar-dismiss";
import {
  useHideSplashWhenReady,
  useSplashAccentPersistence,
} from "@/components/ui/launch-splash";
import { StreakAccentBackground } from "@/components/ui/streak-accent-background";
import { WidgetSync } from "@/components/widgets/widget-sync";
import { Colors } from "@/constants/theme";
import { HomeFiltersProvider } from "@/context/home-filters-store";
import { PremiumProvider } from "@/context/premium-store";
import { useAppSettings } from "@/context/settings-store";
import { SnackbarProvider } from "@/context/snackbar-store";
import { StreakCelebrationProvider } from "@/context/streak-celebration-store";
import { TaskCreateProvider } from "@/context/task-create-context";
import { TasksProvider } from "@/context/tasks-store";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useSearchQueryParam } from "@/hooks/use-search-query-param";
import { isRtlLocale, t } from "@/i18n";
import { initTaskNotifications } from "@/notifications/tasks-notifications";

export const unstable_settings = {
  anchor: "(tabs)",
};

// Reads the route on its own so navigating does not re-render the whole root
// layout and its provider tree.
function SettingsAccentBackground({ isDark }: { isDark: boolean }) {
  const segments = useSegments();
  const enabled = segments[0] === "settings" || segments[0] === "cloud-sync";
  return <StreakAccentBackground isDark={isDark} enabled={enabled} />;
}

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const theme = useColorScheme() ?? "light";
  const textColor = Colors[theme].text;
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 32,
        gap: 12,
        backgroundColor: Colors[theme].background,
      }}
    >
      <Text
        accessibilityRole="header"
        style={{
          fontSize: 20,
          fontWeight: "600",
          textAlign: "center",
          color: textColor,
        }}
      >
        {t("errorBoundary.title")}
      </Text>
      <Text
        style={{
          fontSize: 15,
          lineHeight: 21,
          textAlign: "center",
          color: textColor,
          opacity: 0.7,
        }}
      >
        {t("errorBoundary.body")}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void retry();
        }}
        style={({ pressed }) => ({
          marginTop: 8,
          minHeight: 44,
          paddingHorizontal: 24,
          borderRadius: 22,
          justifyContent: "center",
          backgroundColor: textColor,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text
          style={{
            fontSize: 16,
            fontWeight: "600",
            color: Colors[theme].background,
          }}
        >
          {t("errorBoundary.retry")}
        </Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const {
    localeOverride,
    reduceMotionEnabled,
    highContrastEnabled,
    hasHydrated: hasSettingsHydrated,
  } = useAppSettings();
  const theme = colorScheme ?? "light";
  const onSearchTextChange = useSearchQueryParam();
  const searchBarRef = React.useRef<any>(null);
  useSplashAccentPersistence();
  useHideSplashWhenReady();
  const themedContentStyle = React.useMemo(
    () => ({ backgroundColor: Colors[theme].background }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Colors[theme] switches palette while Increase Contrast is on.
    [theme, highContrastEnabled],
  );
  // Task picker sheets paint the grouped sheet color themselves. On iOS a
  // formSheet's contentStyle background lands on the native Screen, which
  // shows wherever that content does not reach: beside it under the Duo
  // vertical bar and below its content. It has to match the sheet.
  const pickerSheetContentStyle = React.useMemo(
    () => ({ backgroundColor: theme === "dark" ? "#000000" : "#F2F2F7" }),
    [theme],
  );
  const navigationTheme = React.useMemo(() => {
    const baseTheme = theme === "dark" ? DarkTheme : DefaultTheme;
    return {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        background: Colors[theme].background,
        card: Colors[theme].background,
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Colors[theme] switches palette while Increase Contrast is on.
  }, [theme, highContrastEnabled]);
  const tabLikeHeaderOptions = React.useMemo(
    () => ({
      contentStyle: themedContentStyle,
      headerBackButtonDisplayMode: "minimal" as const,
      headerLargeTitle: Platform.OS === "ios",
      // Transparent so the page background runs behind the top app bar.
      headerTransparent: true,
      headerShadowVisible: false,
      headerTintColor: Colors[theme].text,
      headerTitleAlign: "left" as const,
      headerTitleStyle: { color: Colors[theme].text },
      headerLargeTitleStyle: { color: Colors[theme].text },
    }),
    [theme, themedContentStyle],
  );

  React.useEffect(() => {
    void initTaskNotifications();
  }, []);

  React.useEffect(() => {
    // Wait for the stored language; deciding on the default first would flip
    // the direction twice.
    if (!hasSettingsHydrated) return;
    const shouldBeRtl = isRtlLocale();
    if (I18nManager.isRTL !== shouldBeRtl) {
      I18nManager.allowRTL(shouldBeRtl);
      I18nManager.forceRTL(shouldBeRtl);
      // Layout direction is only read at startup. The in-app language switch
      // exists in development builds only, so reload there to apply it now. In
      // release the language follows the system, and iOS relaunches the app
      // when it changes.
      if (__DEV__) DevSettings.reload();
    }
  }, [hasSettingsHydrated, localeOverride]);

  return (
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: Colors[theme].background }}
    >
      {/* Drives Reanimated's global reduced-motion flag from the system
          setting as tracked live by the settings store; Reanimated's own
          reading is only taken at startup. */}
      <ReducedMotionConfig
        mode={reduceMotionEnabled ? ReduceMotion.Always : ReduceMotion.Never}
      />
      <PremiumProvider>
        <TasksProvider>
          <WidgetSync />
          <StreakCelebrationProvider>
          <TaskCreateProvider>
            <HomeFiltersProvider>
              <SnackbarProvider>
              <ThemeProvider value={navigationTheme}>
                <VerticalBarSafeAreaProvider>
                {/* Remount the screens when "Increase Contrast" flips. Colors
                    read inline during render (Colors[theme], contrastAlpha,
                    getAccentColorValue) are memoized by the React Compiler on
                    `theme` alone and would otherwise keep the old palette. */}
                <View
                  key={highContrastEnabled ? "high-contrast" : "default-contrast"}
                  style={{ flex: 1, backgroundColor: Colors[theme].background }}
                >
                  <SettingsAccentBackground isDark={theme === "dark"} />
                  <MacIntegration />
                  <SearchBarDismissProvider searchBarRef={searchBarRef}>
                  <Stack
                    screenLayout={verticalBarScreenLayout}
                    screenOptions={{
                      contentStyle: themedContentStyle,
                    }}
                  >
                  <Stack.Screen
                    name="(tabs)"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    name="task/create-modal"
                    options={{
                      // Zurück zum alten Styling: transparentes Overlay ohne Header
                      presentation: "transparentModal",
                      headerShown: false,
                      contentStyle: { backgroundColor: "transparent" },
                      animation: "fade",
                    }}
                  />
                  <Stack.Screen
                    name="task/routine-picker"
                    options={
                      {
                        presentation: "formSheet",
                        contentStyle: pickerSheetContentStyle,
                      } as any
                    }
                  />
                  <Stack.Screen
                    name="task/date-picker"
                    options={{
                      presentation: "formSheet",
                      contentStyle: pickerSheetContentStyle,
                    }}
                  />
                  <Stack.Screen
                    name="day-picker"
                    options={{
                      presentation: "formSheet",
                      sheetAllowedDetents: "fitToContents",
                      sheetGrabberVisible: true,
                      contentStyle: { backgroundColor: "transparent" },
                    }}
                  />
                  <Stack.Screen
                    name="task/location-picker"
                    options={{
                      presentation: "formSheet",
                      contentStyle: pickerSheetContentStyle,
                    }}
                  />
                  <Stack.Screen
                    name="task/project-picker"
                    options={{
                      presentation: "formSheet",
                      contentStyle: pickerSheetContentStyle,
                    }}
                  />
                  <Stack.Screen
                    name="task/emoji-picker"
                    options={{
                      presentation: "formSheet",
                      contentStyle: pickerSheetContentStyle,
                    }}
                  />
                  <Stack.Screen
                    name="task/[id]"
                    options={{ title: t("common.task") }}
                  />
                  <Stack.Screen
                    name="project/[id]"
                    options={{ title: t("common.project") }}
                  />
                  <Stack.Screen
                    name="project/create-modal"
                    options={{
                      presentation: "transparentModal",
                      headerShown: false,
                      contentStyle: { backgroundColor: "transparent" },
                      animation: "fade",
                    }}
                  />
                  <Stack.Screen
                    name="project/limit-modal"
                    options={{
                      presentation: "transparentModal",
                      headerShown: false,
                      contentStyle: { backgroundColor: "transparent" },
                      animation: "fade",
                    }}
                  />
                  <Stack.Screen
                    name="project/edit-modal"
                    options={{
                      presentation: "transparentModal",
                      headerShown: false,
                      contentStyle: { backgroundColor: "transparent" },
                      animation: "fade",
                    }}
                  />
                  <Stack.Screen
                    name="plus"
                    options={{
                      presentation: "modal",
                    }}
                  />
                  <Stack.Screen
                    name="status"
                    options={{
                      ...tabLikeHeaderOptions,
                      title: t("screen.status"),
                    }}
                  />
                  <Stack.Screen
                    name="settings"
                    options={{
                      ...tabLikeHeaderOptions,
                      contentStyle: { backgroundColor: "transparent" },
                      title: t("screen.settings"),
                    }}
                  />
                  <Stack.Screen
                    name="legal"
                    options={{
                      ...tabLikeHeaderOptions,
                      headerLargeTitle: false,
                      title: t("screen.legal"),
                    }}
                  />
                  <Stack.Screen
                    name="cloud-sync"
                    options={{
                      ...tabLikeHeaderOptions,
                      contentStyle: { backgroundColor: "transparent" },
                      title: t("screen.cloudSync"),
                    }}
                  />
                  <Stack.Screen
                    name="assist"
                    options={{
                      ...tabLikeHeaderOptions,
                      title: t("screen.assist"),
                      headerLargeTitle: false,
                    }}
                  />
                  <Stack.Screen
                    name="global-search"
                    options={{
                      ...tabLikeHeaderOptions,
                      title: t("tabs.search"),
                      headerLargeTitle: false,
                      headerSearchBarOptions: {
                        placement: "automatic",
                        placeholder: t("search.placeholder"),
                        cancelButtonText: t("taskDetail.alert.cancel"),
                        autoFocus: true,
                        ref: searchBarRef,
                        hideWhenScrolling: false,
                        onChangeText: onSearchTextChange,
                      },
                    }}
                  />
                  </Stack>
                  </SearchBarDismissProvider>
                </View>
                <StatusBar style={theme === "dark" ? "light" : "dark"} />
              </VerticalBarSafeAreaProvider>
              </ThemeProvider>
              </SnackbarProvider>
            </HomeFiltersProvider>
          </TaskCreateProvider>
          </StreakCelebrationProvider>
        </TasksProvider>
      </PremiumProvider>
    </GestureHandlerRootView>
  );
}
