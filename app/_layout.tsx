import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "expo-router";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { I18nManager, Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";

import { VerticalBarSafeAreaProvider, verticalBarScreenLayout } from "@/components/navigation/vertical-bar-safe-area";
import {
  LaunchSplashOverlay,
  useSplashAccentPersistence,
} from "@/components/ui/launch-splash-overlay";
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
import { isRtlLocale, t } from "@/i18n";
import { initTaskNotifications } from "@/notifications/tasks-notifications";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { localeOverride } = useAppSettings();
  const theme = colorScheme ?? "light";
  const router = useRouter();
  const segments = useSegments();
  const searchBarRef = React.useRef<any>(null);
  useSplashAccentPersistence();
  const showSettingsAccentBackground =
    segments[0] === "settings" || segments[0] === "cloud-sync";
  const themedContentStyle = React.useMemo(
    () => ({ backgroundColor: Colors[theme].background }),
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
  }, [theme]);
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
    const shouldBeRtl = isRtlLocale();
    if (I18nManager.isRTL !== shouldBeRtl) {
      I18nManager.allowRTL(shouldBeRtl);
      I18nManager.forceRTL(shouldBeRtl);
      if (__DEV__) {
        console.info("RTL wurde aktualisiert. Bitte die App neu starten.");
      }
    }
  }, [localeOverride]);

  return (
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: Colors[theme].background }}
    >
      <PremiumProvider>
        <TasksProvider>
          <WidgetSync />
          <StreakCelebrationProvider>
          <TaskCreateProvider>
            <HomeFiltersProvider>
              <SnackbarProvider>
              <ThemeProvider value={navigationTheme}>
                <VerticalBarSafeAreaProvider>
                <View
                  style={{ flex: 1, backgroundColor: Colors[theme].background }}
                >
                  <StreakAccentBackground
                    isDark={theme === "dark"}
                    enabled={showSettingsAccentBackground}
                  />
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
                        contentStyle: themedContentStyle,
                      } as any
                    }
                  />
                  <Stack.Screen
                    name="task/date-picker"
                    options={{
                      presentation: "formSheet",
                      contentStyle: themedContentStyle,
                    }}
                  />
                  <Stack.Screen
                    name="task/location-picker"
                    options={{
                      presentation: "formSheet",
                      contentStyle: themedContentStyle,
                    }}
                  />
                  <Stack.Screen
                    name="task/project-picker"
                    options={{
                      presentation: "formSheet",
                      contentStyle: themedContentStyle,
                    }}
                  />
                  <Stack.Screen
                    name="task/emoji-picker"
                    options={{
                      presentation: "formSheet",
                      contentStyle: themedContentStyle,
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
                    name="modal"
                    options={{
                      presentation: "formSheet",
                      contentStyle: themedContentStyle,
                      title: t("modal.newTask"),
                    }}
                  />
                  <Stack.Screen
                    name="profile"
                    options={{
                      ...tabLikeHeaderOptions,
                      title: t("screen.profile"),
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
                        onChangeText: (event: any) => {
                          router.setParams({
                            q: String(event?.nativeEvent?.text ?? ""),
                          });
                        },
                      },
                    }}
                  />
                  </Stack>
                  <LaunchSplashOverlay />
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
