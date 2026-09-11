import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import Constants from "expo-constants";
import { Tabs, useGlobalSearchParams, useSegments } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import React from "react";
import { DynamicColorIOS, NativeModules, Platform, StyleSheet, View } from "react-native";

import { CreateTaskFab } from "@/components/ui/create-task-fab";
import { GlassSurface, withAlpha } from "@/components/ui/glass-surface";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { preloadStreakAccentBackgroundAssets } from "@/components/ui/streak-accent-background";
import { Colors, LIGHT_ACCENT_SCREEN_BACKGROUND } from "@/constants/theme";
import { useTaskCreateContext } from "@/context/task-create-context";
import { TabBarMinimizeProvider } from "@/context/tabbar-minimize-store";
import { useTasksStore } from "@/context/tasks-store";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { t } from "@/i18n";
import { isIOS26OrNewer } from "@/utils/ios-version";

type TaskAccessoryContextBridge = {
  setContext?: (
    mode: "task" | "today" | "routine" | "project" | "inProject",
    projectId?: string | null,
    projectLabel?: string | null,
    selectedDateStart?: number | null,
  ) => void;
};
const HOME_LIGHT_BACKGROUND = LIGHT_ACCENT_SCREEN_BACKGROUND;

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme ?? "light";
  const tabSceneBackground =
    theme === "dark" ? Colors[theme].background : HOME_LIGHT_BACKGROUND;
  const isIOS26Plus = isIOS26OrNewer();
  const segments = useSegments();
  const { id: routeIdParam } = useGlobalSearchParams<{ id?: string | string[] }>();
  const { setProjectId, clearProjectId, setMode, clearPresetDateStart } = useTaskCreateContext();
  const { projects } = useTasksStore();
  const accessoryBridge = NativeModules
    .TaskAccessoryContextBridge as TaskAccessoryContextBridge | undefined;

  React.useEffect(() => {
    void preloadStreakAccentBackgroundAssets();
  }, []);

  const routeProjectId = React.useMemo(() => {
    const rawRouteId = Array.isArray(routeIdParam) ? routeIdParam[0] : routeIdParam;
    return typeof rawRouteId === "string" ? rawRouteId.trim() : "";
  }, [routeIdParam]);

  const routeProjectName = React.useMemo(() => {
    if (!routeProjectId) return "";
    const project = projects.find(
      (candidate) => candidate.id === routeProjectId && !candidate.deletedAt,
    );
    return project?.name?.trim() ?? "";
  }, [projects, routeProjectId]);
  const routeProjectExists = routeProjectName.length > 0;

  React.useEffect(() => {
    const [first, second, third] = segments;
    const segmentList = segments as string[];
    const isHomeStackRoute =
      first === "(tabs)" && (second === undefined || second === "home");
    const isTodayRoute =
      isHomeStackRoute &&
      (third === undefined ||
        third === "today" ||
        third === "archive" ||
        third === "streaks");

    // Keep project context only for the in-tab project detail route.
    if (
      first === "(tabs)" &&
      second === "explore" &&
      third === "[id]" &&
      routeProjectId.length > 0 &&
      routeProjectExists
    ) {
      setProjectId(routeProjectId);
      setMode("inProject");
      clearPresetDateStart();
      return;
    }

    const isRoutinesRoute =
      (first === "(tabs)" && second === "routines") ||
      (first === "(tabs)" &&
        second === "home" &&
        (third === "routines" || segmentList.includes("routines")));
    if (isRoutinesRoute) {
      clearProjectId();
      setMode("routine");
      clearPresetDateStart();
      return;
    }

    if (isTodayRoute) {
      clearProjectId();
      setMode("today");
      return;
    }

    if (first === "(tabs)" && second === "explore") {
      clearProjectId();
      setMode("project");
      clearPresetDateStart();
      return;
    }

    // When we are in tabs but not in a project detail, clear context.
    // If a root modal is on top (e.g. create modal), segments won't start with "(tabs)",
    // so we intentionally keep the last focused project context for that flow.
    if (first === "(tabs)") {
      clearProjectId();
      setMode("task");
      clearPresetDateStart();
    }
  }, [clearPresetDateStart, clearProjectId, routeProjectExists, routeProjectId, segments, setMode, setProjectId]);

  React.useEffect(() => {
    if (Platform.OS !== "ios" || !isIOS26Plus) return;

    const [first, second, third] = segments;
    const segmentList = segments as string[];
    const isHomeStackRoute =
      first === "(tabs)" && (second === undefined || second === "home");
    const isTodayRoute =
      isHomeStackRoute &&
      (third === undefined ||
        third === "today" ||
        third === "archive" ||
        third === "streaks");
    if (first === "(tabs)" && second === "explore" && third === undefined) {
      accessoryBridge?.setContext?.("project", null, null);
      return;
    }

    if (
      first === "(tabs)" &&
      second === "explore" &&
      third === "[id]" &&
      routeProjectId.length > 0 &&
      routeProjectExists
    ) {
      accessoryBridge?.setContext?.(
        "inProject",
        routeProjectId,
        routeProjectName || routeProjectId,
      );
      return;
    }

    if (first === "(tabs)" && second === "explore") {
      accessoryBridge?.setContext?.("project", null, null);
      return;
    }

    const isRoutinesRoute =
      (first === "(tabs)" && second === "routines") ||
      (first === "(tabs)" &&
        second === "home" &&
        (third === "routines" || segmentList.includes("routines")));
    if (isRoutinesRoute) {
      accessoryBridge?.setContext?.("routine", null, null);
      return;
    }

    if (isTodayRoute) {
      accessoryBridge?.setContext?.("today", null, null);
      return;
    }

    accessoryBridge?.setContext?.("task", null, null);
  }, [accessoryBridge, isIOS26Plus, routeProjectExists, routeProjectId, routeProjectName, segments]);

  if (__DEV__ && isIOS26Plus) {
    if (Constants.appOwnership === "expo") {
      console.warn(
        "[NativeTabs] Running in Expo Go. Some iOS 26 behaviors may not match docs unless using a custom native build compiled with Xcode 26+.",
      );
    }
  }

  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return (
      <View style={{ flex: 1, backgroundColor: tabSceneBackground }}>
        <Tabs
          screenOptions={{
            tabBarActiveTintColor: Colors[theme].tint,
            headerShown: false,
            tabBarStyle: {
              backgroundColor: "transparent",
              borderTopWidth: 0,
            },
            tabBarBackground: () => (
              <GlassSurface
                style={StyleSheet.absoluteFill}
                glassEffectStyle="regular"
                tintColor={withAlpha(
                  tabSceneBackground,
                  theme === "dark" ? 0.22 : 0.35,
                )}
                fallbackBackgroundColor={tabSceneBackground}
              />
            ),
          }}
        >
          <Tabs.Screen
            name="home"
            options={{
              title: t("common.today"),
              tabBarIcon: ({ color }) => (
                <MaterialIcons name="calendar-today" size={24} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="inbox"
            options={{
              title: t("common.inbox"),
              tabBarIcon: ({ color }) => (
                <MaterialIcons name="inbox" size={24} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="search"
            options={{
              title: t("tabs.search"),
              tabBarIcon: ({ color }) => (
                <MaterialIcons name="search" size={26} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="explore"
            options={{
              title: t("tabs.projects"),
              tabBarIcon: ({ color }) => (
                <IconSymbol size={28} name="folder.fill" color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="routines"
            options={{
              href: null,
            }}
          />
        </Tabs>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: tabSceneBackground }}>
      <TabBarMinimizeProvider behavior="onScrollDown">
        <NativeTabs
          minimizeBehavior="onScrollDown"
          // Keep scroll-edge behavior native on iOS 26+ so tab minimization can react to content scrolling.
          disableTransparentOnScrollEdge={!isIOS26Plus}
          backgroundColor={tabSceneBackground}
          labelStyle={
            Platform.OS === "ios"
              ? {
                  color: DynamicColorIOS({
                    dark: "white",
                    light: "black",
                  }),
                }
              : undefined
          }
          tintColor={
            Platform.OS === "ios"
              ? DynamicColorIOS({
                  dark: "white",
                  light: "black",
                })
              : Colors[theme].tint
          }
        >
          <NativeTabs.Trigger
            name="home"
            contentStyle={{ backgroundColor: "transparent" }}
          >
            <NativeTabs.Trigger.Label>{t("common.today")}</NativeTabs.Trigger.Label>
            {Platform.select({
              ios: (
                <NativeTabs.Trigger.Icon
                  sf={{
                    default: "calendar",
                    selected: "calendar",
                  }}
                />
              ),
              android: (
                <NativeTabs.Trigger.Icon
                  src={
                    <NativeTabs.Trigger.VectorIcon family={MaterialIcons} name="calendar-today" />
                  }
                />
              ),
            })}
          </NativeTabs.Trigger>

          <NativeTabs.Trigger
            name="inbox"
            contentStyle={{ backgroundColor: "transparent" }}
          >
            <NativeTabs.Trigger.Label>{t("common.inbox")}</NativeTabs.Trigger.Label>
            {Platform.select({
              ios: <NativeTabs.Trigger.Icon sf={{ default: "tray", selected: "tray.fill" }} />,
              android: (
                <NativeTabs.Trigger.Icon
                  src={<NativeTabs.Trigger.VectorIcon family={MaterialIcons} name="inbox" />}
                />
              ),
            })}
          </NativeTabs.Trigger>

          {isIOS26Plus ? (
            <NativeTabs.Trigger
              name="search"
              role="search"
              contentStyle={{ backgroundColor: "transparent" }}
            >
              <NativeTabs.Trigger.Label>{t("tabs.search")}</NativeTabs.Trigger.Label>
              {Platform.select({
                ios: (
                  <NativeTabs.Trigger.Icon
                    sf={{
                      default: "magnifyingglass",
                      selected: "magnifyingglass",
                    }}
                  />
                ),
                android: (
                  <NativeTabs.Trigger.Icon
                    src={<NativeTabs.Trigger.VectorIcon family={MaterialIcons} name="search" />}
                  />
                ),
              })}
            </NativeTabs.Trigger>
          ) : (
            // Android has no native tab-bar search affordance, so search is
            // reached from a header button on every top-level screen instead
            // (see SearchHeaderButton). Keep the route registered but hidden
            // from the tab bar, same as "routines" below.
            <NativeTabs.Trigger
              name="search"
              hidden={Platform.OS === "android"}
              contentStyle={{ backgroundColor: "transparent" }}
            >
              <NativeTabs.Trigger.Label>{t("tabs.search")}</NativeTabs.Trigger.Label>
              {Platform.select({
                ios: (
                  <NativeTabs.Trigger.Icon
                    sf={{
                      default: "magnifyingglass",
                      selected: "magnifyingglass",
                    }}
                  />
                ),
                android: (
                  <NativeTabs.Trigger.Icon
                    src={<NativeTabs.Trigger.VectorIcon family={MaterialIcons} name="search" />}
                  />
                ),
              })}
            </NativeTabs.Trigger>
          )}

          <NativeTabs.Trigger
            name="explore"
            contentStyle={{ backgroundColor: "transparent" }}
          >
            <NativeTabs.Trigger.Label>{t("tabs.projects")}</NativeTabs.Trigger.Label>
            {Platform.select({
              ios: <NativeTabs.Trigger.Icon sf={{ default: "folder", selected: "folder.fill" }} />,
              android: (
                <NativeTabs.Trigger.Icon
                  src={<NativeTabs.Trigger.VectorIcon family={MaterialIcons} name="folder" />}
                />
              ),
            })}
          </NativeTabs.Trigger>

          <NativeTabs.Trigger
            name="routines"
            hidden
            contentStyle={{ backgroundColor: "transparent" }}
          >
            <NativeTabs.Trigger.Label>{t("home.quick.routines")}</NativeTabs.Trigger.Label>
            {Platform.select({
              ios: <NativeTabs.Trigger.Icon sf={{ default: "repeat", selected: "repeat" }} />,
              android: (
                <NativeTabs.Trigger.Icon
                  src={<NativeTabs.Trigger.VectorIcon family={MaterialIcons} name="repeat" />}
                />
              ),
            })}
          </NativeTabs.Trigger>
        </NativeTabs>
      </TabBarMinimizeProvider>
      {/*
        iOS gets this button as a native UITabAccessory attached to the tab bar
        (see AppDelegate.swift). Android has no such affordance, so the same
        action is surfaced as the Material 3 primary action button.
      */}
      {Platform.OS === "android" ? <CreateTaskFab /> : null}
    </View>
  );
}
