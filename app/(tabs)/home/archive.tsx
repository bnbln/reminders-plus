import { TaskWorkspace } from "@/components/tasks/task-workspace";
import { useOpenTask } from "@/context/task-workspace-context";
import {
  Host as ExpoSwiftUIHost,
  Picker as ExpoSwiftUIPicker,
  Text as ExpoSwiftUIText,
} from "@expo/ui/swift-ui";
import {
  pickerStyle as expoSwiftPickerStyleModifier,
  tag as expoSwiftTagModifier,
} from "@expo/ui/swift-ui/modifiers";
import { Stack, useRouter } from "expo-router";
import React from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { TaskSwipeDraggableList } from "@/components/tasks/task-swipe-draggable-list";
import { withAlpha } from "@/components/ui/glass-surface";
import { StreakAccentBackground } from "@/components/ui/streak-accent-background";
import { Colors, contrastAlpha } from "@/constants/theme";
import { useHomeFilters } from "@/context/home-filters-store";
import {
  getDueAtForSection,
  type Task,
  useTasksStore,
} from "@/context/tasks-store";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { t } from "@/i18n";
import { ripple } from '@/components/ui/ripple';
import {
  deriveActiveSectionFromDueAt,
  hasValidDueAt,
} from "@/utils/task-dates";
import { useThemedStyles } from "@/hooks/use-themed-styles";

type TabId = "completed" | "trash";

const ARCHIVE_TASK_ITEM_SPACING = 8;
const IOS_LIGHT_BASE_BACKGROUND = "#F2F2F7";
const IOS_LIGHT_ELEVATED_SURFACE = "#FFFFFF";
const HOME_TASK_ROW_SURFACE_LIGHT = IOS_LIGHT_ELEVATED_SURFACE;
const HOME_TASK_ROW_SURFACE_DARK = "rgba(35, 35, 35, 0.2)";

export default function ArchiveScreen() {
  return <TaskWorkspace showBack title={t("archive.title")}><ArchiveContent /></TaskWorkspace>;
}

function ArchiveContent() {
  const openTask = useOpenTask();
  const router = useRouter();
  const theme = useColorScheme() ?? "light";
  const isDark = theme === "dark";
  const styles = useThemedStyles(() => createStyles(theme), [theme]);
  const shouldUseNativeExpoSegmentedPicker = Platform.OS === "ios";

  const { enabledTags, showTagIcons, showProjectNames, showCompactSubtasks } =
    useHomeFilters();
  const { tasks, setTasks, projects } = useTasksStore();

  const projectsById = React.useMemo(
    () => new Map(projects.map((project) => [project.id, project] as const)),
    [projects],
  );

  const completed = React.useMemo(
    () =>
      tasks
        .filter((task) => task.section === "completed" && !task.deletedAt)
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)),
    [tasks],
  );

  const trashed = React.useMemo(
    () =>
      tasks
        .filter((task) => !!task.deletedAt && !task.isDraft)
        .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)),
    [tasks],
  );

  const [tab, setTab] = React.useState<TabId>(() => {
    if (completed.length > 0) return "completed";
    if (trashed.length > 0) return "trash";
    return "completed";
  });

  const listTasks = tab === "completed" ? completed : trashed;

  const onPressTask = React.useCallback(
    (taskId: string) => {
      openTask(taskId);
    },
    [openTask],
  );

  const moveCompletedBackToToday = React.useCallback(
    (taskId: string) => {
      setTasks((prev) => {
        const current = prev.find((task) => task.id === taskId);
        if (!current) return prev;

        const hasDueAt = hasValidDueAt(current.dueAt);
        const restoredSection = hasDueAt
          ? deriveActiveSectionFromDueAt(current.dueAt)
          : "today";

        const activeInSection = prev
          .filter(
            (task) =>
              task.section === restoredSection &&
              !task.deletedAt &&
              task.id !== taskId,
          )
          .sort((a, b) => a.orderRank - b.orderRank);
        const minRank = activeInSection.length
          ? activeInSection[0]!.orderRank
          : 1000;
        const nextRank = Math.max(0, minRank - 1000);

        return prev.map((task) => {
          if (task.id !== taskId) return task;
          return {
            ...task,
            section: restoredSection,
            completedAt: undefined,
            ...(hasDueAt
              ? {}
              : {
                  dueAt: getDueAtForSection("today"),
                  dueHasTime: true,
                }),
            orderRank: nextRank,
          };
        });
      });
    },
    [setTasks],
  );

  const restoreFromTrash = React.useCallback(
    (taskId: string) => {
      setTasks((prev) =>
        prev.map((task) =>
          task.id === taskId ? { ...task, deletedAt: undefined } : task,
        ),
      );
    },
    [setTasks],
  );

  const moveToTrash = React.useCallback(
    (taskId: string) => {
      setTasks((prev) =>
        prev.map((task) =>
          task.id === taskId ? { ...task, deletedAt: Date.now() } : task,
        ),
      );
    },
    [setTasks],
  );

  const deleteForever = React.useCallback(
    (taskId: string) => {
      // Removing a task from the trash cannot be undone, so ask first. If the
      // user cancels, the swiped row slides back because the task still exists.
      Alert.alert(
        t("archive.alert.deleteForeverTitle"),
        t("archive.alert.deleteForeverBody"),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("common.delete"),
            style: "destructive",
            onPress: () =>
              setTasks((prev) => prev.filter((task) => task.id !== taskId)),
          },
        ],
      );
    },
    [setTasks],
  );

  const enabledTagsSeed = React.useMemo(
    () => Array.from(enabledTags).sort().join(","),
    [enabledTags],
  );
  const rowLayoutSeed = React.useMemo(
    () =>
      `${enabledTagsSeed}|icons:${showTagIcons ? 1 : 0}|projects:${showProjectNames ? 1 : 0}|subtasks:${showCompactSubtasks ? 1 : 0}`,
    [enabledTagsSeed, showCompactSubtasks, showProjectNames, showTagIcons],
  );
  const keyForTask = React.useCallback(
    (task: Task) =>
      `task-${task.id}:${tab}:${rowLayoutSeed}:${task.subtitle?.length ?? 0}:${task.subtasks?.length ?? 0}:${task.notes?.length ?? 0}:${task.dueAt}:${task.dueHasTime ? 1 : 0}:${task.completedAt ?? 0}:${task.deletedAt ?? 0}:${task.color ?? ""}`,
    [rowLayoutSeed, tab],
  );

  const listHeader = React.useMemo(() => {
    if (shouldUseNativeExpoSegmentedPicker) {
      return (
        <View style={styles.header}>
          <ExpoSwiftUIHost matchContents style={styles.segmentSwiftHost}>
            <ExpoSwiftUIPicker<TabId>
              selection={tab}
              onSelectionChange={(nextValue) =>
                setTab(nextValue === "trash" ? "trash" : "completed")
              }
              modifiers={[expoSwiftPickerStyleModifier("segmented")]}
            >
              <ExpoSwiftUIText modifiers={[expoSwiftTagModifier("completed")]}>
                {t("archive.tab.completed")}
              </ExpoSwiftUIText>
              <ExpoSwiftUIText modifiers={[expoSwiftTagModifier("trash")]}>
                {t("archive.tab.trash")}
              </ExpoSwiftUIText>
            </ExpoSwiftUIPicker>
          </ExpoSwiftUIHost>
        </View>
      );
    }

    return (
      <View style={styles.header}>
        <View style={styles.segmentWrap}>
          <Pressable
            android_ripple={ripple()}
            accessibilityRole="button"
            accessibilityLabel={t("archive.tab.completed")}
            onPress={() => setTab("completed")}
            style={({ pressed }) => [
              styles.segment,
              tab === "completed" && styles.segmentActive,
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                tab === "completed" && styles.segmentTextActive,
              ]}
            >
              {t("archive.tab.completed")}
            </Text>
          </Pressable>
          <Pressable
            android_ripple={ripple()}
            accessibilityRole="button"
            accessibilityLabel={t("archive.tab.trash")}
            onPress={() => setTab("trash")}
            style={({ pressed }) => [
              styles.segment,
              tab === "trash" && styles.segmentActive,
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                tab === "trash" && styles.segmentTextActive,
              ]}
            >
              {t("archive.tab.trash")}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }, [shouldUseNativeExpoSegmentedPicker, styles, tab]);

  return (
    <View style={[styles.screen, { backgroundColor: "transparent" }]}>
      <StreakAccentBackground isDark={isDark} />
      <Stack.Screen
        options={
          {
            title: t("archive.title"),
            headerTitle: t("archive.title"),
            headerBackButtonDisplayMode: "minimal",
          } as any
        }
      />

      {/* Rows are keyed individually, so only a tab switch starts a fresh list. */}
      <ScrollView
        key={tab}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <TaskSwipeDraggableList
          renderMode="static"
          animateDataLayoutChanges={false}
          theme={theme}
          isDark={isDark}
          tasks={listTasks}
          keyForTask={keyForTask}
          projectsById={projectsById}
          rowStyles={styles}
          itemSpacing={ARCHIVE_TASK_ITEM_SPACING}
          containerStyle={{ backgroundColor: "transparent" }}
          header={listHeader}
          empty={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {tab === "completed"
                  ? t("archive.empty.completedTitle")
                  : t("archive.empty.trashTitle")}
              </Text>
              <Text style={styles.emptySubtitle}>
                {tab === "completed"
                  ? t("archive.empty.completedBody")
                  : t("archive.empty.trashBody")}
              </Text>
            </View>
          }
          enabledTags={enabledTags}
          showTaskIcons={showTagIcons}
          showProjectNames={showProjectNames}
          showCompactSubtasks={showCompactSubtasks}
          onPressTask={onPressTask}
          toggleComplete={
            tab === "trash" ? restoreFromTrash : moveCompletedBackToToday
          }
          deleteTask={tab === "trash" ? deleteForever : moveToTrash}
          sortByOrderRank={false}
        />
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: keyof typeof Colors) => {
  const isDark = theme === "dark";
  const useAppleLightPalette = !isDark && Platform.OS === "ios";
  const text = Colors[theme].text;
  const rowCardSurface = isDark
    ? HOME_TASK_ROW_SURFACE_DARK
    : HOME_TASK_ROW_SURFACE_LIGHT;
  const heroCardBorder = isDark
    ? "rgba(255,255,255,0.09)"
    : useAppleLightPalette
      ? "rgba(60,60,67,0.18)"
      : "rgba(17,24,28,0.09)";
  const rowMetaText = withAlpha(text, contrastAlpha(0.48));
  const dangerBg = isDark ? "rgba(255,69,58,0.18)" : "rgba(255,59,48,0.14)";
  const dangerBorder = isDark ? "rgba(255,69,58,0.32)" : "rgba(255,59,48,0.26)";

  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: "transparent",
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 56,
    },

    header: {
      marginBottom: 12,
    },
    segmentSwiftHost: {
      minHeight: 34,
      justifyContent: "center",
    },
    segmentWrap: {
      flexDirection: "row",
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
      overflow: "hidden",
    },
    segment: {
      flex: 1,
      paddingVertical: 9,
      paddingHorizontal: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    segmentActive: {
      backgroundColor: withAlpha(text, contrastAlpha(isDark ? 0.16 : 0.08)),
    },
    segmentText: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "700",
      color: withAlpha(text, contrastAlpha(0.7)),
    },
    segmentTextActive: {
      color: text,
    },

    itemSpacer: {
      marginBottom: 0,
      width: "100%",
      alignSelf: "stretch",
    },
    swipeClip: {
      borderRadius: 20,
      overflow: "hidden",
      backgroundColor: "transparent",
      marginHorizontal: 0,
      minHeight: 52,
      width: "100%",
      alignSelf: "stretch",
    },
    underlay: {
      ...StyleSheet.absoluteFill,
    },
    actionSlot: {
      position: "absolute",
      top: 0,
      bottom: 0,
      justifyContent: "center",
    },
    actionSlotLeft: {
      left: 0,
      alignItems: "center",
    },
    actionSlotRight: {
      right: 0,
      alignItems: "center",
    },
    actionSlotInner: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "stretch",
    },
    row: {
      minHeight: 52,
      width: "100%",
      borderRadius: 20,
      backgroundColor: rowCardSurface,
      justifyContent: "center",
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: heroCardBorder,
    },
    dragRow: {
      borderRadius: 20,
      backgroundColor: rowCardSurface,
      borderWidth: 0,
      opacity: 1,
      overflow: "visible",
      zIndex: 80,
      elevation: 28,
      shadowColor: "#000000",
      shadowOpacity: isDark ? 0.24 : 0.12,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
    },
    rowInner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },
    emojiTile: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      borderWidth: 0,
      marginTop: 0,
      backgroundColor: "transparent",
    },
    emojiText: {
      fontSize: 24,
    },
    textStack: {
      flex: 1,
      gap: 2,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    rowTitle: {
      flex: 1,
      fontSize: 16,
      lineHeight: 20,
      fontWeight: "700",
      color: text,
      letterSpacing: -0.2,
    },
    rowMeta: {
      fontSize: 10,
      lineHeight: 14,
      fontWeight: "600",
      color: rowMetaText,
      letterSpacing: 0.1,
    },
    rowSubtitle: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "500",
      color: withAlpha(text, contrastAlpha(0.32)),
    },
    tagRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 2,
    },
    tagChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      maxWidth: "100%",
      paddingVertical: 2,
      paddingHorizontal: 8,
      borderRadius: 999,
      borderWidth: 0,
      backgroundColor: isDark
        ? "rgba(255,255,255,0.12)"
        : useAppleLightPalette
          ? IOS_LIGHT_BASE_BACKGROUND
          : "rgba(255,255,255,0.85)",
    },
    tagChipDanger: {
      backgroundColor: dangerBg,
      borderColor: dangerBorder,
    },
    tagChipText: {
      fontSize: 10,
      lineHeight: 14,
      fontWeight: "700",
      letterSpacing: 0.2,
      textTransform: "uppercase",
      color: isDark ? withAlpha(text, contrastAlpha(0.7)) : withAlpha(text, contrastAlpha(0.5)),
      maxWidth: 220,
    },

    empty: {
      minHeight: 220,
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingHorizontal: 8,
    },
    emptyTitle: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: "700",
      color: text,
    },
    emptySubtitle: {
      fontSize: 14,
      lineHeight: 18,
      fontWeight: "600",
      color: withAlpha(text, contrastAlpha(0.65)),
      textAlign: "center",
    },
  });
};
