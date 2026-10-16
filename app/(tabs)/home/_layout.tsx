import {
  useVerticalBarActive,
  verticalBarTabScreenLayout,
} from "@/components/navigation/vertical-bar-safe-area";
import {
  useNativeFilterHeaderItems,
  useNativeProfileHeaderActionItems,
} from "@/components/navigation/native-header-action-items";
import { Stack } from "expo-router";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";

import { HeaderActions } from "@/components/navigation/header-actions";
import { HeaderTrailingActions } from "@/components/navigation/header-trailing-actions";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { t } from "@/i18n";

export default function HomeLayout() {
  const theme = useColorScheme() ?? "light";
  const hasVerticalBar = useVerticalBarActive();
  const nativeHomeFilterActions = useNativeFilterHeaderItems({
    showCompletedTasksToggle: true,
    showProjectTasksToggle: true,
    showRoutineTasksToggle: true,
  });
  const nativeFilterActions = useNativeFilterHeaderItems();
  const nativeProfileActions = useNativeProfileHeaderActionItems();
  const headerTitleAlign: "left" | "center" = "left";

  return (
    <Stack
      screenLayout={verticalBarTabScreenLayout}
      screenOptions={{
        headerLargeTitle: Platform.OS === "ios",
        headerShadowVisible: false,
        contentStyle: { backgroundColor: "transparent" },
        headerTintColor: Colors[theme].text,
        headerTitleAlign,
        headerTitleStyle: { color: Colors[theme].text },
        headerLargeTitleStyle: { color: Colors[theme].text },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: t("common.today"),
          // Let the page's gradient background run behind the header.
          headerTransparent: true,
          headerStyle: { backgroundColor: "transparent" },
          headerLeft: hasVerticalBar
            ? undefined
            : () => (
                <HeaderTrailingActions
                  theme={theme}
                  showCompletedTasksToggle={true}
                  showProjectTasksToggle={true}
                  showRoutineTasksToggle={true}
                />
              ),
          headerRight: () => <HeaderActions />,
          unstable_headerLeftItems: hasVerticalBar
            ? () => nativeHomeFilterActions
            : undefined,
          unstable_headerRightItems: hasVerticalBar
            ? () => nativeProfileActions
            : undefined,
        }}
      />
      <Stack.Screen
        name="archive"
        options={{
          title: t("archive.title"),
          headerTransparent: Platform.OS === "ios",
          headerRight: () => <HeaderActions />,
          unstable_headerRightItems: hasVerticalBar
            ? () => nativeProfileActions
            : undefined,
        }}
      />

      <Stack.Screen
        name="streaks"
        options={{
          title: t("home.quick.streaks"),
          headerLargeTitle: false,
          headerBackButtonDisplayMode: "minimal",
          headerTransparent: Platform.OS === "ios",
          headerRight: () => <HeaderActions />,
          unstable_headerRightItems: hasVerticalBar
            ? () => nativeProfileActions
            : undefined,
        }}
      />
      <Stack.Screen
        name="inbox"
        options={{
          title: t("common.inbox"),
          headerLargeTitle: false,
          headerBackButtonDisplayMode: "minimal",
          headerTransparent: Platform.OS === "ios",
          headerLeft: hasVerticalBar
            ? undefined
            : () => <HeaderTrailingActions theme={theme} />,
          headerRight: () => <HeaderActions />,
          unstable_headerLeftItems: hasVerticalBar
            ? () => nativeFilterActions
            : undefined,
          unstable_headerRightItems: hasVerticalBar
            ? () => nativeProfileActions
            : undefined,
        }}
      />
      <Stack.Screen
        name="routines"
        options={{
          title: t("home.quick.routines"),
          headerLargeTitle: false,
          headerBackButtonDisplayMode: "minimal",
          headerTransparent: Platform.OS === "ios",
          headerRight: () => (
            <View style={styles.headerRightRow}>
              <HeaderTrailingActions theme={theme} />
              <HeaderActions />
            </View>
          ),
          unstable_headerLeftItems: hasVerticalBar
            ? () => nativeFilterActions
            : undefined,
          unstable_headerRightItems: hasVerticalBar
            ? () => nativeProfileActions
            : undefined,
        }}
      />
      <Stack.Screen
        name="today"
        options={{
          title: t("common.today"),
          headerLargeTitle: false,
          headerBackButtonDisplayMode: "minimal",
          headerTransparent: Platform.OS === "ios",
          headerLeft: hasVerticalBar
            ? undefined
            : () => <HeaderTrailingActions theme={theme} />,
          headerRight: () => <HeaderActions />,
          unstable_headerLeftItems: hasVerticalBar
            ? () => nativeFilterActions
            : undefined,
          unstable_headerRightItems: hasVerticalBar
            ? () => nativeProfileActions
            : undefined,
        }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  headerRightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
