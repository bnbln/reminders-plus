import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import Constants from "expo-constants";
import { Tabs, useGlobalSearchParams, useSegments } from "expo-router";
import {
  Icon,
  Label,
  NativeTabs,
  VectorIcon,
} from "expo-router/unstable-native-tabs";
import React from "react";
import { DynamicColorIOS, NativeModules, Platform, StyleSheet, View } from "react-native";

import { GlassSurface, withAlpha } from "@/components/ui/glass-surface";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { useTaskCreateContext } from "@/context/task-create-context";
import { TabBarMinimizeProvider } from "@/context/tabbar-minimize-store";
import { useTasksStore } from "@/context/tasks-store";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { t } from "@/i18n";
import { isIOS26OrNewer } from "@/utils/ios-version";

type TaskAccessoryContextBridge = {
  setContext?: (
    mode: "task" | "project" | "inProject",
    projectId?: string | null,
    projectLabel?: string | null,
  ) => void;
};

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme ?? "light";
  const isIOS26Plus = isIOS26OrNewer();
  const showRoutinesTab = false;
  const segments = useSegments();
  const { id: routeIdParam } = useGlobalSearchParams<{ id?: string | string[] }>();
  const { setProjectId, clearProjectId } = useTaskCreateContext();
  const { projects } = useTasksStore();
  const accessoryBridge = NativeModules
    .TaskAccessoryContextBridge as TaskAccessoryContextBridge | undefined;

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

    // Keep project context only for the in-tab project detail route.
    if (
      first === "(tabs)" &&
      second === "explore" &&
      third === "[id]" &&
      routeProjectId.length > 0 &&
      routeProjectExists
    ) {
      setProjectId(routeProjectId);
      return;
    }

    // When we are in tabs but not in a project detail, clear context.
    // If a root modal is on top (e.g. create modal), segments won't start with "(tabs)",
    // so we intentionally keep the last focused project context for that flow.
    if (first === "(tabs)") {
      clearProjectId();
    }
  }, [clearProjectId, routeProjectExists, routeProjectId, segments, setProjectId]);

  React.useEffect(() => {
    if (Platform.OS !== "ios" || !isIOS26Plus) return;

    const [first, second, third] = segments;
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
      <View style={{ flex: 1, backgroundColor: Colors[theme].background }}>
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
                  Colors[theme].background,
                  theme === "dark" ? 0.22 : 0.35,
                )}
                fallbackBackgroundColor={Colors[theme].background}
              />
            ),
          }}
        >
          <Tabs.Screen
            name="home"
            options={{
              title: t("tabs.tasks"),
              tabBarIcon: ({ color }) => (
                <IconSymbol
                  size={28}
                  name="checkmark.circle.fill"
                  color={color}
                />
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
    <View style={{ flex: 1, backgroundColor: Colors[theme].background }}>
      <TabBarMinimizeProvider behavior="onScrollDown">
        <NativeTabs
          minimizeBehavior="onScrollDown"
          // Keep scroll-edge behavior native on iOS 26+ so tab minimization can react to content scrolling.
          disableTransparentOnScrollEdge={!isIOS26Plus}
          backgroundColor={Colors[theme].background}
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
          <NativeTabs.Trigger name="home">
            <Label>{t("tabs.tasks")}</Label>
            {Platform.select({
              ios: (
                <Icon
                  sf={{
                    default: "checkmark.circle",
                    selected: "checkmark.circle.fill",
                  }}
                />
              ),
              android: (
                <Icon
                  src={
                    <VectorIcon family={MaterialIcons} name="check-circle" />
                  }
                />
              ),
            })}
          </NativeTabs.Trigger>

          {isIOS26Plus ? (
            <NativeTabs.Trigger name="search" role="search">
              <Label>{t("tabs.search")}</Label>
              {Platform.select({
                ios: (
                  <Icon
                    sf={{
                      default: "magnifyingglass",
                      selected: "magnifyingglass",
                    }}
                  />
                ),
                android: (
                  <Icon
                    src={<VectorIcon family={MaterialIcons} name="search" />}
                  />
                ),
              })}
            </NativeTabs.Trigger>
          ) : (
            <NativeTabs.Trigger name="search">
              <Label>{t("tabs.search")}</Label>
              {Platform.select({
                ios: (
                  <Icon
                    sf={{
                      default: "magnifyingglass",
                      selected: "magnifyingglass",
                    }}
                  />
                ),
                android: (
                  <Icon
                    src={<VectorIcon family={MaterialIcons} name="search" />}
                  />
                ),
              })}
            </NativeTabs.Trigger>
          )}

          <NativeTabs.Trigger name="explore">
            <Label>{t("tabs.projects")}</Label>
            {Platform.select({
              ios: <Icon sf={{ default: "folder", selected: "folder.fill" }} />,
              android: (
                <Icon
                  src={<VectorIcon family={MaterialIcons} name="folder" />}
                />
              ),
            })}
          </NativeTabs.Trigger>

          {showRoutinesTab && (
            <NativeTabs.Trigger name="routines">
              <Label>{t("home.quick.routines")}</Label>
              {Platform.select({
                ios: <Icon sf={{ default: "repeat", selected: "repeat" }} />,
                android: (
                  <Icon
                    src={<VectorIcon family={MaterialIcons} name="repeat" />}
                  />
                ),
              })}
            </NativeTabs.Trigger>
          )}
        </NativeTabs>
      </TabBarMinimizeProvider>
    </View>
  );
}
