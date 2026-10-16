import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  MenuView,
  type MenuAction,
  type MenuComponentRef,
} from "@react-native-menu/menu";
import React from "react";
import {
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
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
 * `@react-native-menu/menu` is unusable on Android under the New Architecture:
 * its `codegenConfig.componentProvider` registers a component for iOS only, so
 * props reach `MenuViewManager` through reflection ("Could not find generated
 * setter for class com.reactnativemenu.MenuViewManager"). The popup renders, but
 * pressing an item throws `UnexpectedNativeTypeException: expected Array, got a
 * null` on the native queue and `onPressAction` never reaches JS — every menu in
 * the app was dead on Android.
 *
 * iOS keeps the real `UIMenu`; Android gets a Material 3 dropdown with the same
 * props, so call sites are unchanged.
 */

type PressEvent = { nativeEvent: { event: string } };

type DropdownMenuProps = {
  actions: MenuAction[];
  onPressAction: (event: PressEvent) => void;
  children: React.ReactNode;
  themeVariant?: "light" | "dark";
  isAnchoredToRight?: boolean;
  shouldOpenOnLongPress?: boolean;
  style?: StyleProp<ViewStyle>;
  onOpenMenu?: () => void;
  onCloseMenu?: () => void;
};

type AnchorRect = { x: number; y: number; width: number; height: number };

const MENU_MIN_WIDTH = 200;
const MENU_MAX_WIDTH = 320;
const SCREEN_MARGIN = 8;

/** One level of `subactions` is flattened; a non-empty group title becomes a header. */
type FlatRow =
  | { kind: "header"; key: string; title: string }
  | { kind: "item"; key: string; action: MenuAction };

function flatten(actions: MenuAction[]): FlatRow[] {
  const rows: FlatRow[] = [];

  actions.forEach((action, index) => {
    const subactions = action.subactions;
    if (subactions && subactions.length > 0) {
      const title = (action.title ?? "").trim();
      if (title) {
        rows.push({ kind: "header", key: `h-${index}-${title}`, title });
      }
      subactions.forEach((sub, subIndex) => {
        rows.push({
          kind: "item",
          key: `${index}-${subIndex}-${sub.id ?? sub.title ?? ""}`,
          action: sub,
        });
      });
      return;
    }

    rows.push({
      kind: "item",
      key: `${index}-${action.id ?? action.title ?? ""}`,
      action,
    });
  });

  return rows;
}

export const DropdownMenu = React.forwardRef<
  MenuComponentRef,
  DropdownMenuProps
>(function DropdownMenu(
  {
    actions,
    onPressAction,
    children,
    themeVariant,
    isAnchoredToRight,
    shouldOpenOnLongPress,
    style,
    onOpenMenu,
    onCloseMenu,
  },
  ref,
) {
  const colorScheme = useColorScheme();
  const theme = (colorScheme ?? "light") as keyof typeof Colors;
  const { accentColor } = useAppSettings();

  const anchorRef = React.useRef<View>(null);
  const [anchor, setAnchor] = React.useState<AnchorRect | null>(null);

  const open = React.useCallback(() => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      onOpenMenu?.();
    });
  }, [onOpenMenu]);

  const close = React.useCallback(() => {
    setAnchor(null);
    onCloseMenu?.();
  }, [onCloseMenu]);

  React.useImperativeHandle(
    ref,
    () => ({ show: open, hide: close }) as unknown as MenuComponentRef,
    [close, open],
  );

  const rows = React.useMemo(() => flatten(actions), [actions]);

  if (Platform.OS !== "android") {
    return (
      <MenuView
        ref={ref}
        actions={actions}
        onPressAction={onPressAction}
        themeVariant={themeVariant}
        isAnchoredToRight={isAnchoredToRight}
        shouldOpenOnLongPress={shouldOpenOnLongPress}
        style={style}
        onOpenMenu={onOpenMenu}
        onCloseMenu={onCloseMenu}
      >
        {children}
      </MenuView>
    );
  }

  const accent = getAccentColorValue(accentColor);
  const onSurface = Colors[theme].text;
  const surface = theme === "dark" ? "#26282B" : "#FFFFFF";
  const window = Dimensions.get("window");

  // Position from the left in both cases and clamp to the viewport: anchoring a
  // narrow trigger near the screen edge by its `right` pushes the card off-screen
  // (the settings pickers sit ~30dp from the left, well inside one menu width).
  let menuStyle: ViewStyle = {};
  if (anchor) {
    const estimatedWidth = MENU_MIN_WIDTH;
    const desiredLeft = isAnchoredToRight
      ? anchor.x + anchor.width - estimatedWidth
      : anchor.x;
    const maxLeft = Math.max(
      SCREEN_MARGIN,
      window.width - estimatedWidth - SCREEN_MARGIN,
    );
    const left = Math.min(Math.max(SCREEN_MARGIN, desiredLeft), maxLeft);

    // Drop down by default; flip above the trigger when the space below is too
    // tight and there is more room overhead.
    const spaceBelow = window.height - (anchor.y + anchor.height);
    const flipUp = spaceBelow < 240 && anchor.y > spaceBelow;

    menuStyle = flipUp
      ? { left, bottom: window.height - anchor.y + 4 }
      : { left, top: anchor.y + anchor.height + 4 };
  }

  return (
    <View ref={anchorRef} collapsable={false} style={style}>
      {children}
      {/*
        The press target overlays the trigger instead of wrapping it, so the
        anchor lays out exactly as it did under `MenuView` — wrapping it in a
        flex Pressable stretched auto-sized anchors like the settings pickers.
      */}
      <Pressable
        accessibilityRole="button"
        onPress={shouldOpenOnLongPress ? undefined : open}
        onLongPress={shouldOpenOnLongPress ? open : undefined}
        style={StyleSheet.absoluteFill}
      />

      <Modal
        visible={anchor !== null}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <Pressable style={styles.backdrop} onPress={close}>
          <View
            style={[styles.menu, { backgroundColor: surface }, menuStyle]}
            // Swallow taps on the card so they don't dismiss via the backdrop.
            onStartShouldSetResponder={() => true}
          >
            <ScrollView bounces={false} style={styles.menuScroll}>
              {rows.map((row) => {
                if (row.kind === "header") {
                  return (
                    <Text
                      key={row.key}
                      style={[
                        styles.sectionHeader,
                        { color: withAlpha(onSurface, 0.6) },
                      ]}
                    >
                      {row.title}
                    </Text>
                  );
                }

                const action = row.action;
                const disabled = action.attributes?.disabled === true;
                const checkable =
                  action.state === "on" || action.state === "off";

                return (
                  <Pressable
                    key={row.key}
                    accessibilityRole="menuitem"
                    accessibilityState={{
                      disabled,
                      checked: checkable ? action.state === "on" : undefined,
                    }}
                    disabled={disabled}
                    android_ripple={
                      disabled ? undefined : { color: withAlpha(accent, 0.18) }
                    }
                    onPress={() => {
                      close();
                      onPressAction({
                        nativeEvent: { event: String(action.id ?? "") },
                      });
                    }}
                    style={styles.row}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.rowLabel,
                        {
                          color: disabled
                            ? withAlpha(onSurface, 0.38)
                            : onSurface,
                        },
                      ]}
                    >
                      {action.title}
                    </Text>
                    {checkable ? (
                      <MaterialIcons
                        name={
                          action.state === "on"
                            ? "check-box"
                            : "check-box-outline-blank"
                        }
                        size={20}
                        color={
                          action.state === "on"
                            ? accent
                            : withAlpha(onSurface, 0.5)
                        }
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  menu: {
    position: "absolute",
    minWidth: MENU_MIN_WIDTH,
    maxWidth: MENU_MAX_WIDTH,
    borderRadius: 12,
    paddingVertical: 8,
    elevation: 8,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    overflow: "hidden",
  },
  menuScroll: {
    maxHeight: 420,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  row: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    paddingHorizontal: 16,
  },
  rowLabel: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "500",
  },
});
