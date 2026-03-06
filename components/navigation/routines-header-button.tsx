import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter, useSegments } from "expo-router";
import { SymbolView } from "expo-symbols";
import React from "react";
import { Platform } from "react-native";

import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { t } from "@/i18n";

export function RoutinesHeaderButton() {
  const router = useRouter();
  const segments = useSegments();
  const theme = useColorScheme() ?? "light";
  const color = Colors[theme].text;
  const [first, second, third] = segments;
  const isRoutinesRoute =
    (first === "(tabs)" && second === "routines") ||
    (first === "(tabs)" && second === "home" && third === "routines");

  const handlePress = React.useCallback(() => {
    if (isRoutinesRoute) return;
    router.navigate("/home/routines");
  }, [isRoutinesRoute, router]);

  return (
    <HeaderIconButton
      accessibilityRole="button"
      accessibilityLabel={t("home.quick.routines")}
      onPress={handlePress}
    >
      {Platform.OS === "ios" ? (
        <SymbolView
          name="repeat"
          tintColor={color}
          style={{ width: 24, height: 24 }}
        />
      ) : (
        <MaterialIcons name="repeat" size={22} color={color} />
      )}
    </HeaderIconButton>
  );
}
