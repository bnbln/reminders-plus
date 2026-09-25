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
import { Platform } from "react-native";

import { HeaderActions } from "@/components/navigation/header-actions";
import { HeaderTrailingActions } from "@/components/navigation/header-trailing-actions";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { t } from "@/i18n";

export default function InboxLayout() {
  const theme = useColorScheme() ?? "light";
  const hasVerticalBar = useVerticalBarActive();
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
          title: t("common.inbox"),
          headerTransparent: true,
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
