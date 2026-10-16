import React from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";

import { withAlpha } from "@/components/ui/glass-surface";
import { m3Surface } from "@/constants/material";
import { Colors } from "@/constants/theme";
import { getAccentColorValue, useAppSettings } from "@/context/settings-store";
import { useColorScheme } from "@/hooks/use-color-scheme";

/**
 * Material 3 text field for Android.
 *
 * The app's inputs are bare `TextInput`s — no container, no label, no focus
 * indicator — which is fine inside iOS's grouped cards but reads as an unstyled
 * form on Android. This renders the M3 *filled* variant: a tonal container with
 * a bottom indicator that thickens and takes the accent colour on focus, and a
 * label that shrinks above the text once there is content.
 *
 * On iOS it renders a plain `TextInput` with the caller's own styling, so the
 * existing look is untouched.
 */

export type TextFieldProps = TextInputProps & {
  /** Floating label. Falls back to `placeholder` when omitted. */
  label?: string;
  containerStyle?: StyleProp<ViewStyle>;
  /** Renders the error state: error-coloured indicator and label. */
  hasError?: boolean;
};

export function TextField({
  label,
  containerStyle,
  hasError = false,
  style,
  onFocus,
  onBlur,
  value,
  placeholder,
  multiline,
  ...rest
}: TextFieldProps) {
  const colorScheme = useColorScheme();
  const theme = (colorScheme ?? "light") as keyof typeof Colors;
  const { accentColor } = useAppSettings();
  const [isFocused, setIsFocused] = React.useState(false);

  const handleFocus: TextInputProps["onFocus"] = (event) => {
    setIsFocused(true);
    onFocus?.(event);
  };
  const handleBlur: TextInputProps["onBlur"] = (event) => {
    setIsFocused(false);
    onBlur?.(event);
  };

  if (Platform.OS !== "android") {
    return (
      <TextInput
        {...rest}
        value={value}
        placeholder={placeholder}
        multiline={multiline}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={style}
      />
    );
  }

  const accent = getAccentColorValue(accentColor);
  const onSurface = Colors[theme].text;
  const error = theme === "dark" ? "#F2B8B5" : "#B3261E";
  const indicator = hasError ? error : isFocused ? accent : withAlpha(onSurface, 0.38);
  const resolvedLabel = label ?? placeholder;
  // M3 floats the label once the field has content or focus.
  const isLabelFloating = isFocused || (value?.length ?? 0) > 0;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: m3Surface(Colors[theme].background, accent, 2),
          borderBottomColor: indicator,
          borderBottomWidth: isFocused || hasError ? 2 : 1,
        },
        containerStyle,
      ]}
    >
      {resolvedLabel ? (
        <Text
          numberOfLines={1}
          style={[
            styles.label,
            {
              color: hasError
                ? error
                : isFocused
                  ? accent
                  : withAlpha(onSurface, 0.6),
              fontSize: isLabelFloating ? 12 : 15,
            },
          ]}
        >
          {resolvedLabel}
        </Text>
      ) : null}

      <TextInput
        {...rest}
        value={value}
        multiline={multiline}
        onFocus={handleFocus}
        onBlur={handleBlur}
        // The floating label replaces the placeholder in the M3 filled variant.
        placeholder={isLabelFloating ? placeholder : undefined}
        placeholderTextColor={withAlpha(onSurface, 0.38)}
        cursorColor={accent}
        selectionColor={withAlpha(accent, 0.4)}
        style={[styles.input, { color: onSurface }, style]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // M3 filled fields are square at the bottom so the indicator reads as a line.
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    justifyContent: "center",
    minHeight: 56,
  },
  label: {
    letterSpacing: 0.4,
  },
  input: {
    fontSize: 16,
    paddingVertical: 4,
    paddingHorizontal: 0,
    textAlignVertical: "top",
  },
});
