import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { withAlpha } from "@/components/ui/glass-surface";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { ripple } from "@/components/ui/ripple";
import { Colors, contrastAlpha } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useThemedStyles } from "@/hooks/use-themed-styles";

/**
 * Shared building blocks for the settings screens: a grouped card with an
 * optional footnote, rows with a leading icon, and a value pill for every
 * row that opens a menu or expands a picker, so those all look the same.
 *
 * iOS draws the leading icon on a coloured tile like the system Settings app;
 * Android keeps the plain tinted icon Material 3 lists use.
 */

const ICON_TILE_SIZE = 30;
const ROW_PADDING_HORIZONTAL = 16;
const ICON_GAP = 14;
const SHOWS_ICON_TILE = Platform.OS === "ios";

export function useSettingsPalette() {
  const theme = useColorScheme() ?? "light";
  const isDark = theme === "dark";
  return useThemedStyles(
    () => ({
      theme,
      isDark,
      text: Colors[theme].text,
      muted: withAlpha(Colors[theme].text, contrastAlpha(isDark ? 0.62 : 0.58)),
      border: withAlpha(Colors[theme].text, contrastAlpha(isDark ? 0.12 : 0.09)),
      // The settings page itself is the plain system background, so cards sit
      // one step above it.
      card: isDark ? "#1C1C1E" : "#F2F2F7",
      pill: withAlpha(Colors[theme].text, contrastAlpha(isDark ? 0.12 : 0.06)),
      sectionTitle: withAlpha(Colors[theme].text, contrastAlpha(0.55)),
    }),
    [theme, isDark],
  );
}

export type SettingsPalette = ReturnType<typeof useSettingsPalette>;

export function SettingsSection({
  title,
  footer,
  children,
  style,
}: {
  title?: string;
  footer?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = useSettingsPalette();
  return (
    <View style={[styles.section, style]}>
      {title ? (
        <Text
          accessibilityRole="header"
          style={[styles.sectionTitle, { color: palette.sectionTitle }]}
        >
          {title}
        </Text>
      ) : null}
      <View
        style={[
          styles.sectionCard,
          { backgroundColor: palette.card, borderColor: palette.border },
        ]}
      >
        {children}
      </View>
      {footer ? (
        <Text style={[styles.sectionFooter, { color: palette.muted }]}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

/** Hairline between rows, inset to line up with the row labels. */
export function SettingsSeparator({ inset = true }: { inset?: boolean }) {
  const palette = useSettingsPalette();
  return (
    <View
      style={[
        styles.separator,
        {
          backgroundColor: palette.border,
          marginLeft: inset
            ? ROW_PADDING_HORIZONTAL + ICON_TILE_SIZE + ICON_GAP
            : ROW_PADDING_HORIZONTAL,
        },
      ]}
    />
  );
}

export function SettingsIcon({
  name,
  color,
}: {
  /** SF Symbol name; Android resolves it through `constants/sf-symbols`. */
  name: string;
  color: string;
}) {
  if (!SHOWS_ICON_TILE) {
    return (
      <View style={styles.iconPlain}>
        <IconSymbol name={name} size={24} color={color} />
      </View>
    );
  }
  return (
    <View style={[styles.iconTile, { backgroundColor: color }]}>
      <IconSymbol name={name} size={17} color="#FFFFFF" weight="semibold" />
    </View>
  );
}

export function SettingsRow({
  icon,
  iconColor,
  label,
  hint,
  trailing,
  onPress,
  disabled = false,
  accessibilityLabel,
  accessibilityState,
  children,
}: {
  icon?: string;
  iconColor?: string;
  label: string;
  hint?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityState?: { expanded?: boolean; selected?: boolean };
  /** Content shown under the label row, e.g. swatches or a segmented control. */
  children?: React.ReactNode;
}) {
  const palette = useSettingsPalette();
  const content = (
    <>
      <View style={styles.rowMain}>
        {icon ? (
          <SettingsIcon name={icon} color={iconColor ?? palette.muted} />
        ) : null}
        <View style={styles.rowLabelWrap}>
          <Text
            style={[
              styles.rowLabel,
              { color: disabled ? palette.muted : palette.text },
            ]}
          >
            {label}
          </Text>
          {hint ? (
            <Text style={[styles.rowHint, { color: palette.muted }]}>{hint}</Text>
          ) : null}
        </View>
        {trailing ? <View style={styles.rowTrailing}>{trailing}</View> : null}
      </View>
      {children ? (
        <View style={[styles.rowChildren, icon ? styles.rowChildrenIndented : null]}>
          {children}
        </View>
      ) : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.row}>{content}</View>;
  }

  return (
    <Pressable
      android_ripple={ripple()}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled, ...accessibilityState }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && Platform.OS === "ios"
          ? { backgroundColor: palette.pill }
          : null,
      ]}
    >
      {content}
    </Pressable>
  );
}

/**
 * The value of a row that opens a menu or expands a picker. App badge and
 * summary time both use it, so every expandable value reads the same.
 */
export function SettingsValuePill({
  value,
  active = false,
  activeColor,
}: {
  value: string;
  /** Highlights the pill while its picker is open. */
  active?: boolean;
  activeColor?: string;
}) {
  const palette = useSettingsPalette();
  const tint = active && activeColor ? activeColor : palette.text;
  return (
    <View
      style={[
        styles.valuePill,
        {
          backgroundColor:
            active && activeColor ? withAlpha(activeColor, 0.14) : palette.pill,
        },
      ]}
    >
      <Text numberOfLines={1} style={[styles.valuePillText, { color: tint }]}>
        {value}
      </Text>
      <MaterialIcons
        name="unfold-more"
        size={16}
        color={active && activeColor ? activeColor : palette.muted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
    paddingHorizontal: ROW_PADDING_HORIZONTAL,
  },
  sectionCard: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  sectionFooter: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: ROW_PADDING_HORIZONTAL,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  row: {
    minHeight: 58,
    justifyContent: "center",
    paddingHorizontal: ROW_PADDING_HORIZONTAL,
    paddingVertical: 13,
  },
  rowMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: ICON_GAP,
  },
  rowLabelWrap: {
    flex: 1,
    gap: 3,
  },
  rowLabel: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "500",
  },
  rowHint: {
    fontSize: 13,
    lineHeight: 17,
  },
  rowTrailing: {
    flexShrink: 0,
    maxWidth: "55%",
    alignItems: "flex-end",
  },
  rowChildren: {
    paddingTop: 14,
  },
  rowChildrenIndented: {
    paddingLeft: ICON_TILE_SIZE + ICON_GAP,
  },
  iconTile: {
    width: ICON_TILE_SIZE,
    height: ICON_TILE_SIZE,
    borderRadius: 8,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  iconPlain: {
    width: ICON_TILE_SIZE,
    height: ICON_TILE_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  valuePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 10,
    borderCurve: "continuous",
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 7,
  },
  valuePillText: {
    fontSize: 15,
    fontWeight: "500",
    flexShrink: 1,
  },
});
