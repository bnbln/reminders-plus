import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getAccentColorValue, useAppSettings } from "@/context/settings-store";
import {
  type TaskCreateMode,
  useTaskCreateContext,
} from "@/context/task-create-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { t } from "@/i18n";

/**
 * Android counterpart to the iOS `UITabAccessory` add button that lives in
 * `AppDelegate.swift`. iOS attaches a native accessory view to the tab bar; the
 * platform has no equivalent, so on Android the same action is surfaced as the
 * Material 3 extended FAB that sits above the navigation bar.
 *
 * Both platforms read the same context (`TaskCreateContext`) and resolve to the
 * same deep links, so the button behaves identically — only the presentation
 * differs.
 */

/** Material 3 navigation bar height. NativeTabs renders a standard M3 bar. */
const NAV_BAR_HEIGHT = 80;
const EDGE_MARGIN = 16;

type ResolvedAction = {
  label: string;
  href: string;
};

export function resolveCreateAction(
  mode: TaskCreateMode,
  projectId: string,
  presetDateStart: number,
): ResolvedAction {
  switch (mode) {
    case "today": {
      if (presetDateStart > 0) {
        return {
          label: t("home.addTask"),
          href: `/task/create-modal?preset=today&dateStart=${Math.trunc(presetDateStart)}`,
        };
      }
      return {
        label: t("home.addTask"),
        href: "/task/create-modal?preset=today",
      };
    }
    case "routine":
      return {
        label: t("home.addTask"),
        href: "/task/create-modal?preset=routine",
      };
    case "project":
      return {
        label: t("explore.newProject"),
        href: "/project/edit-modal",
      };
    case "inProject": {
      const trimmedProjectId = projectId.trim();
      if (!trimmedProjectId) {
        return { label: t("home.addTask"), href: "/task/create-modal" };
      }
      return {
        label: t("home.addTask"),
        href: `/task/create-modal?projectId=${encodeURIComponent(trimmedProjectId)}`,
      };
    }
    case "task":
    default:
      return { label: t("home.addTask"), href: "/task/create-modal" };
  }
}

export function CreateTaskFab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = colorScheme ?? "light";
  const { accentColor, hapticsEnabled } = useAppSettings();
  const { mode, projectId, presetDateStart } = useTaskCreateContext();
  const { fontScale } = useWindowDimensions();

  const [isPressed, setIsPressed] = React.useState(false);

  const action = React.useMemo(
    () => resolveCreateAction(mode, projectId, presetDateStart),
    [mode, presetDateStart, projectId],
  );

  const accent = getAccentColorValue(accentColor);
  // M3 puts on-color content on a filled container. Both accent families in this
  // app are saturated enough that white reads correctly in light and dark.
  const contentColor = "#FFFFFF";

  const handlePress = React.useCallback(() => {
    if (hapticsEnabled) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(action.href as never);
  }, [action.href, hapticsEnabled, router]);

  // Very large font scales turn the extended FAB into a full-width slab; fall
  // back to the icon-only FAB the way Material does.
  const isIconOnly = fontScale >= 1.6;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.container,
        { bottom: insets.bottom + NAV_BAR_HEIGHT + EDGE_MARGIN },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={action.label}
        onPress={handlePress}
        onPressIn={() => setIsPressed(true)}
        onPressOut={() => setIsPressed(false)}
        android_ripple={{ color: "rgba(255,255,255,0.24)", borderless: false }}
        style={[
          styles.fab,
          isIconOnly && styles.fabIconOnly,
          {
            backgroundColor: accent,
            // M3 elevation 3, plus a pressed state that mirrors the ripple.
            shadowColor: theme === "dark" ? "#000000" : "#000000",
            opacity: isPressed ? 0.92 : 1,
          },
        ]}
      >
        <MaterialIcons name="add" size={24} color={contentColor} />
        {isIconOnly ? null : (
          <Text numberOfLines={1} style={[styles.label, { color: contentColor }]}>
            {action.label}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    right: EDGE_MARGIN,
    // Never let the pill grow wide enough to span the screen.
    maxWidth: "80%",
  },
  fab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 56,
    paddingHorizontal: 20,
    borderRadius: 16,
    ...Platform.select({
      android: { elevation: 6 },
      default: {
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.22,
        shadowRadius: 6,
      },
    }),
  },
  fabIconOnly: {
    width: 56,
    paddingHorizontal: 0,
    justifyContent: "center",
    gap: 0,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
});
