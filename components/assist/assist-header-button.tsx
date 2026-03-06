import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import React from "react";
import { Platform } from "react-native";

import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { Colors } from "@/constants/theme";
import { usePremium } from "@/context/premium-store";
import { useColorScheme } from "@/hooks/use-color-scheme";

export function AssistHeaderButton() {
  const router = useRouter();
  const theme = useColorScheme() ?? "light";
  const color = Colors[theme].text;
  const { hasPremiumAccess, isReady } = usePremium();

  const handlePress = React.useCallback(() => {
    if (!isReady || hasPremiumAccess) {
      router.push("/assist");
      return;
    }

    router.push({ pathname: "/plus", params: { source: "assist" } });
  }, [hasPremiumAccess, isReady, router]);

  return (
    <HeaderIconButton
      accessibilityRole="button"
      accessibilityLabel="Assistant"
      onPress={handlePress}
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
