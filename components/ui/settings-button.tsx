import React from "react";
import { Button, Platform, Pressable, StyleSheet, Text } from "react-native";

import { withAlpha } from "@/components/ui/glass-surface";
import { Colors } from "@/constants/theme";
import { getAccentColorValue, useAppSettings } from "@/context/settings-store";
import { useColorScheme } from "@/hooks/use-color-scheme";

/**
 * React Native's `Button` renders a bare `<TouchableNativeFeedback>` on Android
 * with UPPERCASED text and no container — nothing like a Material 3 button. iOS
 * gets a text button that already matches the platform, so only Android is
 * restyled here and the iOS rendering is left exactly as it was.
 *
 * Colours follow the M3 spec: filled buttons use the accent as the container,
 * tonal buttons a low-opacity accent wash, and disabled state is onSurface at
 * 12% container / 38% label.
 */

export type SettingsButtonVariant = "filled" | "tonal";

type SettingsButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: SettingsButtonVariant;
};

export function SettingsButton({
  title,
  onPress,
  disabled = false,
  variant = "tonal",
}: SettingsButtonProps) {
  const colorScheme = useColorScheme();
  const theme = (colorScheme ?? "light") as keyof typeof Colors;
  const { accentColor } = useAppSettings();

  if (Platform.OS !== "android") {
    return <Button title={title} onPress={onPress} disabled={disabled} />;
  }

  const accent = getAccentColorValue(accentColor);
  const onSurface = Colors[theme].text;

  const containerColor = disabled
    ? withAlpha(onSurface, 0.12)
    : variant === "filled"
      ? accent
      : withAlpha(accent, theme === "dark" ? 0.22 : 0.14);

  const labelColor = disabled
    ? withAlpha(onSurface, 0.38)
    : variant === "filled"
      ? "#FFFFFF"
      : accent;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={
        disabled
          ? undefined
          : {
              color: withAlpha(
                variant === "filled" ? "#FFFFFF" : accent,
                0.24,
              ),
            }
      }
      style={[styles.button, { backgroundColor: containerColor }]}
    >
      <Text numberOfLines={1} style={[styles.label, { color: labelColor }]}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 40,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    // M3 full-radius button.
    borderRadius: 20,
    overflow: "hidden",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
});
