import NativeSegmentedControl from "@react-native-segmented-control/segmented-control";
import React from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  type StyleProp,
  Text,
  View,
  type ViewStyle,
} from "react-native";

import { withAlpha } from "@/components/ui/glass-surface";
import { Colors } from "@/constants/theme";
import { getAccentColorValue, useAppSettings } from "@/context/settings-store";
import { useColorScheme } from "@/hooks/use-color-scheme";

/**
 * `@react-native-segmented-control/segmented-control` is a UISegmentedControl
 * wrapper; on Android it falls back to a plain JS approximation of the iOS look.
 * This renders a Material 3 segmented button group there instead, and keeps the
 * real native control on iOS.
 *
 * The props mirror the upstream component (including the `nativeEvent`-shaped
 * change payload) so call sites work unchanged on both platforms.
 */

type SegmentedControlChangeEvent = {
  nativeEvent: { selectedSegmentIndex: number };
};

type SegmentedControlProps = {
  values: string[];
  selectedIndex: number;
  onChange: (event: SegmentedControlChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
};

export function SegmentedControl({
  values,
  selectedIndex,
  onChange,
  style,
}: SegmentedControlProps) {
  const colorScheme = useColorScheme();
  const theme = (colorScheme ?? "light") as keyof typeof Colors;
  const { accentColor } = useAppSettings();

  if (Platform.OS !== "android") {
    return (
      <NativeSegmentedControl
        values={values}
        selectedIndex={selectedIndex}
        onChange={onChange}
        style={style}
      />
    );
  }

  const accent = getAccentColorValue(accentColor);
  const onSurface = Colors[theme].text;
  const outline = withAlpha(onSurface, 0.24);
  const selectedContainer = withAlpha(accent, theme === "dark" ? 0.26 : 0.16);

  return (
    <View style={[styles.group, { borderColor: outline }, style]}>
      {values.map((value, index) => {
        const isSelected = index === selectedIndex;
        const isFirst = index === 0;
        const isLast = index === values.length - 1;

        return (
          <React.Fragment key={value}>
            {isFirst ? null : (
              <View style={[styles.divider, { backgroundColor: outline }]} />
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              onPress={() =>
                onChange({ nativeEvent: { selectedSegmentIndex: index } })
              }
              android_ripple={{ color: withAlpha(accent, 0.2) }}
              style={[
                styles.segment,
                isFirst && styles.segmentFirst,
                isLast && styles.segmentLast,
                isSelected && { backgroundColor: selectedContainer },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  { color: isSelected ? accent : withAlpha(onSurface, 0.78) },
                  isSelected && styles.labelSelected,
                ]}
              >
                {value}
              </Text>
            </Pressable>
          </React.Fragment>
        );
      })}
    </View>
  );
}

export default SegmentedControl;

const styles = StyleSheet.create({
  group: {
    flexDirection: "row",
    alignItems: "stretch",
    height: 40,
    borderWidth: 1,
    borderRadius: 20,
    overflow: "hidden",
  },
  segment: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  // Match the group's outer radius so the ripple stays inside the pill.
  segmentFirst: {
    borderTopLeftRadius: 19,
    borderBottomLeftRadius: 19,
  },
  segmentLast: {
    borderTopRightRadius: 19,
    borderBottomRightRadius: 19,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 0.1,
  },
  labelSelected: {
    fontWeight: "700",
  },
});
