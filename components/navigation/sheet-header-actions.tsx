import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type {
  NativeStackHeaderItemButton,
  NativeStackNavigationOptions,
} from "expo-router";
import React from "react";
import { Platform, type ColorValue } from "react-native";

import { useVerticalBarActive } from "@/components/navigation/vertical-bar-safe-area";
import { HeaderCloseButton } from "@/components/ui/header-close-button";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { t } from "@/i18n";

type SheetHeaderActionsOptions = {
  onClose: () => void;
  onDone?: () => void;
  doneDisabled?: boolean;
  /** Use native header items on iOS in every layout, not only in the vertical bar. */
  native?: boolean;
  /** Tint for the native Done item. */
  doneTintColor?: ColorValue;
};

type SheetHeaderOptions = Pick<
  NativeStackNavigationOptions,
  | "headerLeft"
  | "headerRight"
  | "unstable_headerLeftItems"
  | "unstable_headerRightItems"
>;

const sfSymbol = (name: string) =>
  ({ type: "sfSymbol", name }) as NonNullable<NativeStackHeaderItemButton["icon"]>;

/**
 * Close and Done for sheets. Custom header views never move into the vertical
 * bar (iPhone Duo), so that layout gets native items with title and symbol:
 * Close on top, Done right after it. Every key is always set, because
 * screen options merge and a stale item would otherwise survive a pose change.
 */
export function useSheetHeaderActions({
  onClose,
  onDone,
  doneDisabled = false,
  native = false,
  doneTintColor,
}: SheetHeaderActionsOptions): SheetHeaderOptions {
  const theme = useColorScheme() ?? "light";
  const hasVerticalBar = useVerticalBarActive();
  const useNativeItems = hasVerticalBar || (native && Platform.OS === "ios");

  return React.useMemo(() => {
    if (useNativeItems) {
      const close: NativeStackHeaderItemButton = {
        type: "button",
        label: t("common.close"),
        icon: sfSymbol("xmark"),
        onPress: onClose,
      };
      const done: NativeStackHeaderItemButton | undefined = onDone
        ? {
            type: "button",
            label: t("common.done"),
            icon: sfSymbol("checkmark"),
            variant: "prominent",
            tintColor: doneTintColor,
            disabled: doneDisabled,
            onPress: onDone,
          }
        : undefined;
      return {
        headerLeft: undefined,
        headerRight: undefined,
        unstable_headerLeftItems: () => [close],
        unstable_headerRightItems: done ? () => [done] : undefined,
      };
    }

    const color = Colors[theme].text;
    return {
      headerLeft: () => (
        <HeaderCloseButton
          onPress={onClose}
          color={color}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        />
      ),
      headerRight: onDone
        ? () => (
            <HeaderIconButton
              onPress={onDone}
              disabled={doneDisabled}
              accessibilityRole="button"
              accessibilityLabel={t("common.done")}
            >
              <MaterialIcons
                name="check"
                size={24}
                color={doneDisabled ? Colors[theme].icon : color}
              />
            </HeaderIconButton>
          )
        : undefined,
      unstable_headerLeftItems: undefined,
      unstable_headerRightItems: undefined,
    };
  }, [doneDisabled, doneTintColor, onClose, onDone, theme, useNativeItems]);
}
