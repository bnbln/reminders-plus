import { Stack } from "expo-router";
import React from "react";
import { Platform } from "react-native";

import { HeaderTrailingActions } from "@/components/navigation/header-trailing-actions";
import { ProfileHeaderMenuButton } from "@/components/navigation/profile-header-menu-button";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { t } from "@/i18n";

const INBOX_HIDDEN_FILTER_TAGS = ["overdue", "datetime"] as const;
const HOME_LIGHT_BACKGROUND = "#F2F2F7";

export default function InboxLayout() {
  const theme = useColorScheme() ?? "light";
  const headerTitleAlign: "left" | "center" = "left";

  return (
    <Stack
      screenOptions={{
        headerLargeTitle: Platform.OS === "ios",
        headerShadowVisible: false,
        contentStyle: {
          backgroundColor:
            theme === "dark" ? Colors[theme].background : HOME_LIGHT_BACKGROUND,
        },
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
          headerTransparent: Platform.OS === "ios",
          headerLeft: () => <ProfileHeaderMenuButton />,
          headerRight: () => (
            <HeaderTrailingActions
              theme={theme}
              hiddenTags={INBOX_HIDDEN_FILTER_TAGS}
            />
          ),
        }}
      />
    </Stack>
  );
}
