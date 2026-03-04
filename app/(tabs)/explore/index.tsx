import { useRouter } from "expo-router";
import React from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { FloatingAddButton } from "@/components/ui/floating-add-button";
import { GlassSurface } from "@/components/ui/glass-surface";
import { SFSymbol } from "@/components/ui/sfsymbol";
import { Colors } from "@/constants/theme";
import { Project, useTasksStore } from "@/context/tasks-store";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { isIOS26OrNewer } from "@/utils/ios-version";

type ThemeName = keyof typeof Colors;
const GRID_HORIZONTAL_PADDING = 16;
const GRID_GAP = 16;
const IOS_LIGHT_BASE_BACKGROUND = "#F2F2F7";
const IOS_LIGHT_ELEVATED_SURFACE = "#FFFFFF";
const IOS_LIGHT_SEPARATOR = "rgba(60, 60, 67, 0.22)";

type ExploreTheme = {
  screenBackground: string;
  cardBackgroundColor: string;
  cardBorderColor: string;
  primaryText: string;
  mutedText: string;
};

const createExploreTheme = (theme: ThemeName): ExploreTheme => {
  const isDark = theme === "dark";
  const useAppleLightPalette = !isDark && Platform.OS === "ios";

  return {
    screenBackground: useAppleLightPalette
      ? IOS_LIGHT_BASE_BACKGROUND
      : Colors[theme].background,
    cardBackgroundColor: isDark ? "#1C1C1E" : IOS_LIGHT_ELEVATED_SURFACE,
    cardBorderColor: isDark
      ? "rgba(255,255,255,0.14)"
      : useAppleLightPalette
        ? IOS_LIGHT_SEPARATOR
        : "rgba(0,0,0,0.12)",
    primaryText: isDark ? "#FFFFFF" : "#000000",
    mutedText: isDark
      ? "#94A3B8"
      : useAppleLightPalette
        ? "#8E8E93"
        : "#94A3B8",
  };
};

const createStyles = (palette: ExploreTheme, tileWidth: number) => {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: palette.screenBackground,
    },
    content: {
      paddingHorizontal: GRID_HORIZONTAL_PADDING,
      paddingTop: 8,
      paddingBottom: 184,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: GRID_GAP,
    },
    tilePressable: {
      width: tileWidth,
      flexGrow: 0,
    },
    tile: {
      borderRadius: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.cardBorderColor,
      overflow: "hidden",
      minHeight: 110,
    },
    tileInner: {
      paddingHorizontal: 20,
      paddingVertical: 20,
      gap: 8,
      flex: 1,
      justifyContent: "space-between",
    },
    tileTopRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minHeight: 24,
    },
    tileHeaderLabel: {
      fontSize: 13,
      fontWeight: "700",
      letterSpacing: 0.5,
      color: palette.mutedText,
      flexShrink: 1,
    },
    tileMain: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minHeight: 50,
    },
    tileEmoji: {
      fontSize: 16,
      lineHeight: 20,
    },
    tileIconFallback: {
      width: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    tileTitle: {
      fontSize: 28,
      lineHeight: 30,
      fontWeight: "700",
      color: palette.primaryText,
      letterSpacing: -0.4,
      flex: 1,
    },
  });
};

function ProjectTile({
  project,
  taskCount,
  onPress,
  styles,
  palette,
}: {
  project: Project;
  taskCount: number;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  palette: ExploreTheme;
}) {
  const iconColor = project.color;
  const tasksLabel = `${taskCount} ${taskCount === 1 ? "AUFGABE" : "AUFGABEN"}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${project.name}: ${taskCount} tasks`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tilePressable,
        pressed && { opacity: 0.9 },
        { transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}
    >
      <GlassSurface
        style={styles.tile}
        glassEffectStyle="regular"
        tintColor={palette.cardBackgroundColor}
        fallbackBackgroundColor={palette.cardBackgroundColor}
        isInteractive
      >
        <View style={styles.tileInner}>
          <View style={styles.tileTopRow}>
            {project.emoji ? (
              <Text style={styles.tileEmoji}>{project.emoji}</Text>
            ) : (
              <View style={styles.tileIconFallback}>
                <SFSymbol name={project.icon} size={16} color={iconColor} />
              </View>
            )}
            <Text numberOfLines={1} style={styles.tileHeaderLabel}>
              {tasksLabel}
            </Text>
          </View>

          <View style={styles.tileMain}>
            <Text numberOfLines={1} style={styles.tileTitle}>
              {project.name}
            </Text>
          </View>
        </View>
      </GlassSurface>
    </Pressable>
  );
}

export default function ExploreScreen() {
  const router = useRouter();
  const theme = useColorScheme() ?? "light";
  const { width: viewportWidth } = useWindowDimensions();
  const showFloatingAddButton = Platform.OS === "ios" && !isIOS26OrNewer();
  const palette = React.useMemo(() => createExploreTheme(theme), [theme]);
  const tileWidth = React.useMemo(
    () =>
      Math.max(0, (viewportWidth - GRID_HORIZONTAL_PADDING * 2 - GRID_GAP) / 2),
    [viewportWidth],
  );
  const styles = React.useMemo(
    () => createStyles(palette, tileWidth),
    [palette, tileWidth],
  );

  const { projects, tasks } = useTasksStore();

  const taskCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      if (!task.deletedAt && task.section !== "completed") {
        counts.set(task.projectId, (counts.get(task.projectId) || 0) + 1);
      }
    }
    return counts;
  }, [tasks]);

  const visibleProjects = React.useMemo(() => {
    return projects.filter((p) => !p.deletedAt);
  }, [projects]);

  const onCreateProject = React.useCallback(() => {
    router.push("/project/create-modal");
  }, [router]);

  const onPressProject = React.useCallback(
    (id: string) => {
      router.push({ pathname: "/explore/[id]", params: { id } });
    },
    [router],
  );

  return (
    <View style={styles.container}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        alwaysBounceVertical
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {visibleProjects.map((project) => (
            <ProjectTile
              key={project.id}
              project={project}
              taskCount={taskCounts.get(project.id) || 0}
              onPress={() => onPressProject(project.id)}
              styles={styles}
              palette={palette}
            />
          ))}
        </View>
      </ScrollView>
      {showFloatingAddButton ? (
        <FloatingAddButton onPress={onCreateProject} />
      ) : null}
    </View>
  );
}
