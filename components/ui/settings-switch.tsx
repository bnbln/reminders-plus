import React from "react";
import { Platform, Switch, type SwitchProps } from "react-native";

import { getAccentColorValue, useAppSettings } from "@/context/settings-store";

/**
 * The settings screens hardcode iOS system green (#34C759) for switch tracks,
 * which looks foreign on Android. Material 3 tints a checked switch with the
 * primary colour, so on Android the track follows the user's accent instead.
 *
 * iOS keeps the original green so the platform look is unchanged.
 */

const IOS_ON_TRACK = "#34C759";
const OFF_TRACK = "#7A7A7A";

export function SettingsSwitch(props: SwitchProps) {
  const { accentColor } = useAppSettings();
  const accent = getAccentColorValue(accentColor);
  const onTrack = Platform.OS === "android" ? accent : IOS_ON_TRACK;

  return (
    <Switch
      {...props}
      trackColor={{ false: OFF_TRACK, true: onTrack }}
      // M3 draws the checked thumb in onPrimary; iOS manages its own thumb.
      thumbColor={
        Platform.OS === "android"
          ? props.value
            ? "#FFFFFF"
            : undefined
          : undefined
      }
    />
  );
}
