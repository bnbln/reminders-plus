import { useRouter } from "expo-router";
import React from "react";
import {
  Animated,
  type GestureResponderEvent,
  LayoutAnimation,
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
import { StreakAccentBackground } from "@/components/ui/streak-accent-background";
import { Colors } from "@/constants/theme";
import { usePremium } from "@/context/premium-store";
import { Project, useTasksStore } from "@/context/tasks-store";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { t } from "@/i18n";
import {
  triggerImpactHaptic,
  triggerSelectionHaptic,
} from "@/utils/haptics";
import { isIOS26OrNewer } from "@/utils/ios-version";
import { shouldRouteToProjectLimitGate } from "@/utils/project-creation-gate";

type ThemeName = keyof typeof Colors;
const GRID_HORIZONTAL_PADDING = 16;
const GRID_GAP = 16;
const GRID_COLUMNS = 2;
const PROJECT_TILE_HEIGHT = 124;
const DRAG_SCALE_ACTIVE = 1.03;
const IOS_LIGHT_ELEVATED_SURFACE = "#FFFFFF";
const IOS_LIGHT_SEPARATOR = "rgba(60, 60, 67, 0.22)";

type ExploreTheme = {
  screenBackground: string;
  cardBackgroundColor: string;
  cardBorderColor: string;
  primaryText: string;
  mutedText: string;
};

type ProjectTilePosition = {
  x: Animated.Value;
  y: Animated.Value;
};

type ProjectTileLayout = {
  x: number;
  y: number;
};

const createExploreTheme = (theme: ThemeName): ExploreTheme => {
  const isDark = theme === "dark";
  const useAppleLightPalette = !isDark && Platform.OS === "ios";

  return {
    screenBackground: useAppleLightPalette
      ? "#F2F2F7"
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
      backgroundColor: "transparent",
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: GRID_HORIZONTAL_PADDING,
      paddingTop: 8,
      paddingBottom: 184,
    },
    grid: {
      position: "relative",
      width: tileWidth * GRID_COLUMNS + GRID_GAP,
      alignSelf: "center",
    },
    tileShell: {
      position: "absolute",
      left: 0,
      top: 0,
      width: tileWidth,
      height: PROJECT_TILE_HEIGHT,
    },
    tilePressable: {
      width: "100%",
      height: "100%",
    },
    tile: {
      flex: 1,
      borderRadius: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.cardBorderColor,
      overflow: "hidden",
    },
    tileDragging: {
      shadowColor: "#000000",
      shadowOpacity: 0.18,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 12 },
      elevation: 24,
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

function moveItem<T>(items: T[], from: number, to: number) {
  if (from === to) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item === undefined) return items;
  next.splice(to, 0, item);
  return next;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function ProjectTileCard({
  project,
  taskCount,
  styles,
  palette,
  isDragging,
}: {
  project: Project;
  taskCount: number;
  styles: ReturnType<typeof createStyles>;
  palette: ExploreTheme;
  isDragging: boolean;
}) {
  const iconColor = project.color;
  const tasksLabel = t(
    taskCount === 1 ? "explore.taskCount.one" : "explore.taskCount.other",
    { count: taskCount },
  );

  return (
    <GlassSurface
      style={[styles.tile, isDragging ? styles.tileDragging : null]}
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
  );
}

type ProjectTileProps = {
  project: Project;
  taskCount: number;
  onPress: () => void;
  onLongPress: (event: GestureResponderEvent) => void;
  styles: ReturnType<typeof createStyles>;
  palette: ExploreTheme;
  isDragging: boolean;
};

function ProjectTile({
  project,
  taskCount,
  onPress,
  onLongPress,
  styles,
  palette,
  isDragging,
}: ProjectTileProps) {
  const longPressTriggeredRef = React.useRef(false);

  const handleLongPress = React.useCallback(
    (event: GestureResponderEvent) => {
      longPressTriggeredRef.current = true;
      onLongPress(event);
    },
    [onLongPress],
  );

  const handlePress = React.useCallback(() => {
    if (longPressTriggeredRef.current || isDragging) {
      longPressTriggeredRef.current = false;
      return;
    }
    onPress();
  }, [isDragging, onPress]);

  React.useEffect(() => {
    if (!isDragging) {
      longPressTriggeredRef.current = false;
    }
  }, [isDragging]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("explore.tileAccessibility", {
        project: project.name,
        count: taskCount,
      })}
      delayLongPress={220}
      onLongPress={handleLongPress}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.tilePressable,
        pressed && !isDragging ? { opacity: 0.94 } : null,
      ]}
    >
      <ProjectTileCard
        project={project}
        taskCount={taskCount}
        styles={styles}
        palette={palette}
        isDragging={isDragging}
      />
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
      Math.max(
        0,
        (viewportWidth - GRID_HORIZONTAL_PADDING * 2 - GRID_GAP) / GRID_COLUMNS,
      ),
    [viewportWidth],
  );
  const tileStrideX = tileWidth + GRID_GAP;
  const tileStrideY = PROJECT_TILE_HEIGHT + GRID_GAP;
  const styles = React.useMemo(
    () => createStyles(palette, tileWidth),
    [palette, tileWidth],
  );

  const { projects, setProjects, tasks } = useTasksStore();
  const { hasPremiumAccess, isReady } = usePremium();
  const activeProjectCount = React.useMemo(
    () => projects.filter((project) => !project.deletedAt).length,
    [projects],
  );

  const taskCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      if (!task.deletedAt && task.section !== "completed") {
        counts.set(task.projectId, (counts.get(task.projectId) || 0) + 1);
      }
    }
    return counts;
  }, [tasks]);

  const visibleProjects = React.useMemo(
    () => projects.filter((project) => !project.deletedAt),
    [projects],
  );
  const visibleProjectsById = React.useMemo(
    () => new Map(visibleProjects.map((project) => [project.id, project] as const)),
    [visibleProjects],
  );
  const visibleProjectIdsKey = React.useMemo(
    () => visibleProjects.map((project) => project.id).join("|"),
    [visibleProjects],
  );

  const [orderedProjectIds, setOrderedProjectIds] = React.useState<string[]>(() =>
    visibleProjects.map((project) => project.id),
  );
  const orderedProjectIdsRef = React.useRef(orderedProjectIds);
  const [draggingProjectId, setDraggingProjectId] = React.useState<string | null>(
    null,
  );
  const draggingProjectIdRef = React.useRef<string | null>(null);
  const dragTargetIndexRef = React.useRef(-1);
  const dragTouchOffsetRef = React.useRef({ x: 0, y: 0 });
  const gridOriginRef = React.useRef({ x: 0, y: 0 });
  const gridRef = React.useRef<View | null>(null);
  const tilePositionRef = React.useRef(new Map<string, ProjectTilePosition>());

  const getLayoutForIndex = React.useCallback(
    (index: number): ProjectTileLayout => ({
      x: (index % GRID_COLUMNS) * tileStrideX,
      y: Math.floor(index / GRID_COLUMNS) * tileStrideY,
    }),
    [tileStrideX, tileStrideY],
  );

  const ensureTilePosition = React.useCallback(
    (projectId: string, initial: ProjectTileLayout): ProjectTilePosition => {
      const existing = tilePositionRef.current.get(projectId);
      if (existing) return existing;

      const next = {
        x: new Animated.Value(initial.x),
        y: new Animated.Value(initial.y),
      };
      tilePositionRef.current.set(projectId, next);
      return next;
    },
    [],
  );

  const animateProjectSlots = React.useCallback(
    (projectIds: string[], draggingId: string | null) => {
      for (const [index, projectId] of projectIds.entries()) {
        if (projectId === draggingId) continue;
        const layout = getLayoutForIndex(index);
        const position = ensureTilePosition(projectId, layout);
        Animated.parallel([
          Animated.spring(position.x, {
            toValue: layout.x,
            useNativeDriver: true,
            damping: 26,
            stiffness: 280,
            mass: 0.25,
          }),
          Animated.spring(position.y, {
            toValue: layout.y,
            useNativeDriver: true,
            damping: 26,
            stiffness: 280,
            mass: 0.25,
          }),
        ]).start();
      }
    },
    [ensureTilePosition, getLayoutForIndex],
  );

  React.useEffect(() => {
    orderedProjectIdsRef.current = orderedProjectIds;
    draggingProjectIdRef.current = draggingProjectId;
  }, [draggingProjectId, orderedProjectIds]);

  React.useEffect(() => {
    setOrderedProjectIds((current) => {
      const visibleIds = visibleProjects.map((project) => project.id);
      const visibleIdSet = new Set(visibleIds);
      const kept = current.filter((projectId) => visibleIdSet.has(projectId));
      const next = [...kept];

      for (const projectId of visibleIds) {
        if (!next.includes(projectId)) {
          next.push(projectId);
        }
      }

      return next.length === current.length &&
        next.every((projectId, index) => projectId === current[index])
        ? current
        : next;
    });
  }, [visibleProjectIdsKey, visibleProjects]);

  React.useEffect(() => {
    const visibleIdSet = new Set(visibleProjects.map((project) => project.id));
    for (const [projectId] of tilePositionRef.current) {
      if (!visibleIdSet.has(projectId)) {
        tilePositionRef.current.delete(projectId);
      }
    }
  }, [visibleProjectIdsKey, visibleProjects]);

  React.useEffect(() => {
    animateProjectSlots(orderedProjectIds, draggingProjectId);
  }, [animateProjectSlots, draggingProjectId, orderedProjectIds, tileWidth]);

  const orderedProjects = React.useMemo(
    () =>
      orderedProjectIds
        .map((projectId) => visibleProjectsById.get(projectId))
        .filter((project): project is Project => Boolean(project)),
    [orderedProjectIds, visibleProjectsById],
  );

  const gridHeight = React.useMemo(() => {
    const rowCount = Math.ceil(orderedProjects.length / GRID_COLUMNS);
    if (rowCount === 0) return 0;
    return rowCount * PROJECT_TILE_HEIGHT + (rowCount - 1) * GRID_GAP;
  }, [orderedProjects.length]);

  const measureGridOrigin = React.useCallback(() => {
    gridRef.current?.measureInWindow((x, y) => {
      gridOriginRef.current = { x, y };
    });
  }, []);

  const getTargetIndexFromPoint = React.useCallback(
    (left: number, top: number, itemCount: number) => {
      if (itemCount <= 1) return 0;

      const centerX = left + tileWidth / 2;
      const centerY = top + PROJECT_TILE_HEIGHT / 2;
      const column = clamp(
        Math.floor((centerX + tileStrideX / 2) / tileStrideX),
        0,
        GRID_COLUMNS - 1,
      );
      const row = Math.max(
        0,
        Math.floor((centerY + tileStrideY / 2) / tileStrideY),
      );
      return clamp(row * GRID_COLUMNS + column, 0, itemCount - 1);
    },
    [tileStrideX, tileStrideY, tileWidth],
  );

  const commitProjectOrder = React.useCallback(
    (orderedIds: string[]) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setProjects((prev) => {
        const nextVisibleProjects = orderedIds
          .map((projectId) => visibleProjectsById.get(projectId))
          .filter((project): project is Project => Boolean(project));

        let visibleIndex = 0;
        return prev.map((project) => {
          if (project.deletedAt) return project;
          const nextProject = nextVisibleProjects[visibleIndex];
          visibleIndex += 1;
          return nextProject ?? project;
        });
      });
    },
    [setProjects, visibleProjectsById],
  );

  const finishDrag = React.useCallback(() => {
    const projectId = draggingProjectIdRef.current;
    if (!projectId) return;

    const finalOrder = orderedProjectIdsRef.current;
    const finalIndex = finalOrder.indexOf(projectId);
    const finalLayout = getLayoutForIndex(Math.max(0, finalIndex));
    const position = ensureTilePosition(projectId, finalLayout);

    triggerImpactHaptic();
    commitProjectOrder(finalOrder);

    Animated.parallel([
      Animated.spring(position.x, {
        toValue: finalLayout.x,
        useNativeDriver: true,
        damping: 28,
        stiffness: 320,
        mass: 0.24,
      }),
      Animated.spring(position.y, {
        toValue: finalLayout.y,
        useNativeDriver: true,
        damping: 28,
        stiffness: 320,
        mass: 0.24,
      }),
    ]).start(() => {
      setDraggingProjectId(null);
      draggingProjectIdRef.current = null;
      dragTargetIndexRef.current = -1;
    });
  }, [commitProjectOrder, ensureTilePosition, getLayoutForIndex]);

  const updateDragPosition = React.useCallback(
    (pageX: number, pageY: number) => {
      const projectId = draggingProjectIdRef.current;
      if (!projectId) return;

      const maxX = Math.max(0, tileStrideX * (GRID_COLUMNS - 1));
      const maxY = Math.max(0, gridHeight - PROJECT_TILE_HEIGHT);
      const left = clamp(
        pageX - gridOriginRef.current.x - dragTouchOffsetRef.current.x,
        0,
        maxX,
      );
      const top = clamp(
        pageY - gridOriginRef.current.y - dragTouchOffsetRef.current.y,
        0,
        maxY,
      );
      const position = ensureTilePosition(projectId, { x: left, y: top });
      position.x.setValue(left);
      position.y.setValue(top);

      const nextIndex = getTargetIndexFromPoint(
        left,
        top,
        orderedProjectIdsRef.current.length,
      );
      if (nextIndex === dragTargetIndexRef.current) return;
      const currentOrder = orderedProjectIdsRef.current;
      const fromIndex = currentOrder.indexOf(projectId);
      if (fromIndex < 0 || fromIndex === nextIndex) return;

      dragTargetIndexRef.current = nextIndex;
      triggerSelectionHaptic();
      setOrderedProjectIds(moveItem(currentOrder, fromIndex, nextIndex));
    },
    [
      ensureTilePosition,
      getTargetIndexFromPoint,
      gridHeight,
      tileStrideX,
    ],
  );

  const handleGridTouchMove = React.useCallback(
    (event: GestureResponderEvent) => {
      if (!draggingProjectIdRef.current) return;
      updateDragPosition(event.nativeEvent.pageX, event.nativeEvent.pageY);
    },
    [updateDragPosition],
  );

  const handleGridTouchEnd = React.useCallback(() => {
    finishDrag();
  }, [finishDrag]);

  const handleDragStart = React.useCallback(
    (projectId: string, event: GestureResponderEvent) => {
      measureGridOrigin();
      const index = orderedProjectIdsRef.current.indexOf(projectId);
      if (index < 0) return;

      const layout = getLayoutForIndex(index);
      const position = ensureTilePosition(projectId, layout);
      position.x.setValue(layout.x);
      position.y.setValue(layout.y);
      dragTouchOffsetRef.current = {
        x: event.nativeEvent.locationX,
        y: event.nativeEvent.locationY,
      };
      dragTargetIndexRef.current = index;
      setDraggingProjectId(projectId);
      draggingProjectIdRef.current = projectId;
      triggerImpactHaptic();
    },
    [ensureTilePosition, getLayoutForIndex, measureGridOrigin],
  );

  const onCreateProject = React.useCallback(() => {
    router.push(
      shouldRouteToProjectLimitGate({
        activeProjectCount,
        hasPremiumAccess,
        isReady,
      })
        ? "/project/limit-modal"
        : "/project/create-modal",
    );
  }, [activeProjectCount, hasPremiumAccess, isReady, router]);

  const onPressProject = React.useCallback(
    (id: string) => {
      router.push({ pathname: "/explore/[id]", params: { id } });
    },
    [router],
  );

  return (
    <View
      style={[styles.container, { backgroundColor: "transparent" }]}
      onTouchMove={handleGridTouchMove}
      onTouchEnd={handleGridTouchEnd}
      onTouchCancel={handleGridTouchEnd}
    >
      <StreakAccentBackground isDark={theme === "dark"} />
      <ScrollView
        style={styles.scroll}
        scrollEnabled={!draggingProjectId}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        alwaysBounceVertical
        showsVerticalScrollIndicator={false}
        onLayout={measureGridOrigin}
        onScrollBeginDrag={measureGridOrigin}
      >
        <View
          ref={gridRef}
          style={[styles.grid, { height: gridHeight }]}
          onLayout={measureGridOrigin}
        >
          {orderedProjects.map((project) => {
            const position = ensureTilePosition(
              project.id,
              getLayoutForIndex(orderedProjectIds.indexOf(project.id)),
            );
            const isDragging = draggingProjectId === project.id;

            return (
              <Animated.View
                key={project.id}
                style={[
                  styles.tileShell,
                  {
                    zIndex: isDragging ? 100 : 1,
                    transform: [
                      { translateX: position.x },
                      { translateY: position.y },
                      { scale: isDragging ? DRAG_SCALE_ACTIVE : 1 },
                    ],
                  },
                ]}
              >
                <ProjectTile
                  project={project}
                  taskCount={taskCounts.get(project.id) || 0}
                  onPress={() => onPressProject(project.id)}
                  onLongPress={(event) => handleDragStart(project.id, event)}
                  styles={styles}
                  palette={palette}
                  isDragging={isDragging}
                />
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>

      {showFloatingAddButton ? (
        <FloatingAddButton onPress={onCreateProject} />
      ) : null}
    </View>
  );
}
