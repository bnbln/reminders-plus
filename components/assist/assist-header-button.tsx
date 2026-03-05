import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import React from "react";
import { Platform } from "react-native";

import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export function AssistHeaderButton() {
  const router = useRouter();
  const theme = useColorScheme() ?? "light";
  const color = Colors[theme].text;

  return (
    <HeaderIconButton
      accessibilityRole="button"
      accessibilityLabel="Assistant"
      onPress={() => router.push("/assist")}
    >
      {Platform.OS === "ios" ? (
        <SymbolView
          name="message.badge.waveform.fill"
          tintColor={color}
          style={{ width: 24, height: 24 }}
        />
      ) : (
        <MaterialIcons name="auto-awesome" size={20} color={color} />
      )}
    </HeaderIconButton>
  );
}
