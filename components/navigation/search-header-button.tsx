import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter, useSegments } from "expo-router";
import React from "react";
import { Platform } from "react-native";

import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { t } from "@/i18n";

export function SearchHeaderButton() {
  const router = useRouter();
  const segments = useSegments();
  const theme = useColorScheme() ?? "light";
  const color = Colors[theme].text;
  const [first, second] = segments;
  const isSearchRoute = first === "(tabs)" && second === "search";

  const handlePress = React.useCallback(() => {
    if (isSearchRoute) return;
    router.navigate("/search");
  }, [isSearchRoute, router]);

  // iOS surfaces search as its own native tab; Android has no tab-bar
  // affordance for it, so every top-level screen exposes it from the header.
  if (Platform.OS !== "android") return null;

  return (
    <HeaderIconButton
      accessibilityRole="button"
      accessibilityLabel={t("tabs.search")}
      onPress={handlePress}
    >
      <MaterialIcons name="search" size={24} color={color} />
    </HeaderIconButton>
  );
}
