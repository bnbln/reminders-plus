import { verticalBarScreenLayout } from "@/components/navigation/vertical-bar-safe-area";
import { Stack } from "expo-router";
import React from "react";
import { Platform } from "react-native";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function AssistantLayout() {
  const theme = useColorScheme() ?? "light";

  return (
    <Stack
      screenLayout={verticalBarScreenLayout}
      screenOptions={{
        headerLargeTitle: Platform.OS === "ios",
        headerShadowVisible: false,
        contentStyle: { backgroundColor: Colors[theme].background },
        headerTintColor: Colors[theme].text,
        headerTitleAlign: "left",
        headerTitleStyle: { color: Colors[theme].text },
        headerLargeTitleStyle: { color: Colors[theme].text },
      }}
    />
  );
}
