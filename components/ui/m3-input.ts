import { Platform, type TextInputProps } from "react-native";

import { withAlpha } from "@/components/ui/glass-surface";
import {
  getAccentColorValue,
  getAppSettingsSnapshot,
} from "@/context/settings-store";

/**
 * Material 3 caret and selection colours for a bare `TextInput`.
 *
 * Android's default caret/handles are the platform green, which looks foreign in
 * an app with its own accent. Spread this onto any `TextInput` that isn't going
 * through `TextField`. Returns nothing on iOS, where the system tint is correct.
 *
 * Reads the settings snapshot rather than the hook so it can be spread inline
 * without adding a hook call to every call site; the value is resolved at render
 * time, so it follows the accent as soon as the component re-renders.
 */
export function m3InputProps(): Pick<
  TextInputProps,
  "cursorColor" | "selectionColor"
> {
  if (Platform.OS !== "android") return {};
  const accent = getAccentColorValue(getAppSettingsSnapshot().accentColor);
  return { cursorColor: accent, selectionColor: withAlpha(accent, 0.4) };
}
