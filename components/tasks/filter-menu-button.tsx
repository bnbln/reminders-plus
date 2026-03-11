import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  MenuView,
  type MenuAction,
  type MenuComponentRef,
} from "@react-native-menu/menu";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import React from "react";
import { Platform, Pressable } from "react-native";

import { Colors } from "@/constants/theme";
import {
  getTagTitle,
  parseCompactSubtasksParam,
  parseShowCompletedTasksParam,
  parseShowProjectTasksParam,
  parseShowRoutineTasksParam,
  parseTagIconsParam,
  parseTagsParam,
  serializeTagsParam,
  TAG_DEFS,
  TAG_ORDER,
  useHomeFilters,
  type TagId,
} from "@/context/home-filters-store";
import { t } from "@/i18n";

function setsEqual<T>(a: Set<T>, b: Set<T>) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

const EMPTY_TAGS: readonly TagId[] = [];

const buildScopedTagSet = (source: Set<TagId>, allowed: Set<TagId>) => {
  const scoped = new Set<TagId>();
  for (const tag of source) {
    if (allowed.has(tag)) scoped.add(tag);
  }
  return scoped;
};

const mergeScopedTags = (
  previous: Set<TagId>,
  nextScoped: Set<TagId>,
  allowed: Set<TagId>,
) => {
  const next = new Set(previous);
  for (const tag of allowed) next.delete(tag);
  for (const tag of nextScoped) next.add(tag);
  return next;
};

function FilterIcon({ theme }: { theme: keyof typeof Colors }) {
  const color = Colors[theme].text;
  if (Platform.OS === "ios") {
    return (
      <SymbolView
        name="line.3.horizontal.decrease"
        tintColor={color}
        style={{ width: 24, height: 24 }}
      />
    );
  }
  return <MaterialIcons name="filter-list" size={22} color={color} />;
}

type FilterMenuButtonProps = {
  theme: keyof typeof Colors;
  hiddenTags?: readonly TagId[];
  showCompletedTasksToggle?: boolean;
  showProjectTasksToggle?: boolean;
  showRoutineTasksToggle?: boolean;
};

export function FilterMenuButton({
  theme,
  hiddenTags = EMPTY_TAGS,
  showCompletedTasksToggle = false,
  showProjectTasksToggle = false,
  showRoutineTasksToggle = false,
}: FilterMenuButtonProps) {
  const router = useRouter();
  const menuRef = React.useRef<MenuComponentRef>(null);

  const params = useLocalSearchParams<{
    tags?: string;
    tagIcons?: string;
    withSubtasks?: string;
    completed?: string;
    projects?: string;
    routines?: string;
  }>();
  const {
    enabledTags,
    setEnabledTags,
    showTagIcons,
    setShowTagIcons,
    showCompactSubtasks,
    setShowCompactSubtasks,
    setShowProjectNames,
    showCompletedTasks,
    setShowCompletedTasks,
    showProjectTasks,
    setShowProjectTasks,
    showRoutineTasks,
    setShowRoutineTasks,
  } = useHomeFilters();

  const hiddenTagSet = React.useMemo(() => new Set(hiddenTags), [hiddenTags]);
  const availableTags = React.useMemo(
    () => TAG_ORDER.filter((tag) => !hiddenTagSet.has(tag)),
    [hiddenTagSet],
  );
  const availableTagSet = React.useMemo(
    () => new Set<TagId>(availableTags),
    [availableTags],
  );
  const scopedEnabledTags = React.useMemo(
    () => buildScopedTagSet(enabledTags, availableTagSet),
    [availableTagSet, enabledTags],
  );

  // One-way sync from URL params -> store (deep links / restore).
  React.useEffect(() => {
    // Important: if the param is absent, do NOT override persisted/app state.
    if (params.tags !== undefined) {
      const parsedEnabled = parseTagsParam(params.tags);
      const nextScoped = buildScopedTagSet(parsedEnabled, availableTagSet);
      setEnabledTags((prev) => {
        const next = mergeScopedTags(prev, nextScoped, availableTagSet);
        return setsEqual(prev, next) ? prev : next;
      });
    }

    if (params.tagIcons !== undefined) {
      const nextIcons = parseTagIconsParam(params.tagIcons);
      setShowTagIcons((prev) => (prev === nextIcons ? prev : nextIcons));
    }

    if (params.withSubtasks !== undefined) {
      const nextSubtasks = parseCompactSubtasksParam(params.withSubtasks);
      setShowCompactSubtasks((prev) =>
        prev === nextSubtasks ? prev : nextSubtasks,
      );
    }

    if (showCompletedTasksToggle && params.completed !== undefined) {
      const nextCompleted = parseShowCompletedTasksParam(params.completed);
      setShowCompletedTasks((prev) =>
        prev === nextCompleted ? prev : nextCompleted,
      );
    }

    if (showProjectTasksToggle && params.projects !== undefined) {
      const nextProjects = parseShowProjectTasksParam(params.projects);
      setShowProjectTasks((prev) => (prev === nextProjects ? prev : nextProjects));
    }

    if (showRoutineTasksToggle && params.routines !== undefined) {
      const nextRoutines = parseShowRoutineTasksParam(params.routines);
      setShowRoutineTasks((prev) => (prev === nextRoutines ? prev : nextRoutines));
    }
  }, [
    availableTagSet,
    params.completed,
    params.projects,
    params.routines,
    params.tagIcons,
    params.tags,
    params.withSubtasks,
    setShowCompletedTasks,
    setEnabledTags,
    setShowProjectTasks,
    setShowRoutineTasks,
    setShowCompactSubtasks,
    setShowTagIcons,
    showCompletedTasksToggle,
    showProjectTasksToggle,
    showRoutineTasksToggle,
  ]);

  const pendingReopenRef = React.useRef(false);
  const scheduleReopen = React.useCallback(() => {
    if (Platform.OS !== "ios") return;
    pendingReopenRef.current = true;
    setTimeout(() => {
      if (!pendingReopenRef.current) return;
      pendingReopenRef.current = false;
      menuRef.current?.show?.();
    }, 0);
  }, []);

  const actions = React.useMemo<MenuAction[]>(() => {
    const iconColor = Colors[theme].text;

    const showAll: MenuAction = {
      id: "showAllTags",
      title: t("home.filter.showAllTags"),
      image: Platform.OS === "ios" ? "eye" : undefined,
      imageColor: Platform.OS === "ios" ? iconColor : undefined,
    };

    const hideAll: MenuAction = {
      id: "hideAllTags",
      title: t("home.filter.hideAllTags"),
      image: Platform.OS === "ios" ? "eye.slash" : undefined,
      imageColor: Platform.OS === "ios" ? iconColor : undefined,
    };

    const visibilityToggles: MenuAction[] = [
      ...(showProjectTasksToggle
        ? [
            {
              id: "toggleProjectTasks",
              title: t("tags.project"),
              image: Platform.OS === "ios" ? "folder.fill" : undefined,
              imageColor: Platform.OS === "ios" ? iconColor : undefined,
              state:
                Platform.OS === "ios"
                  ? showProjectTasks
                    ? "on"
                    : "off"
                  : undefined,
            } satisfies MenuAction,
          ]
        : []),
      ...(showRoutineTasksToggle
        ? [
            {
              id: "toggleRoutineTasks",
              title: t("taskDetail.property.routine"),
              image: Platform.OS === "ios" ? "repeat" : undefined,
              imageColor: Platform.OS === "ios" ? iconColor : undefined,
              state:
                Platform.OS === "ios"
                  ? showRoutineTasks
                    ? "on"
                    : "off"
                  : undefined,
            } satisfies MenuAction,
          ]
        : []),
      ...(showCompletedTasksToggle
        ? [
            {
              id: "toggleCompletedTasks",
              title: t("home.filter.completedTasks"),
              image: Platform.OS === "ios" ? "checkmark.circle" : undefined,
              imageColor: Platform.OS === "ios" ? iconColor : undefined,
              state:
                Platform.OS === "ios"
                  ? showCompletedTasks
                    ? "on"
                    : "off"
                  : undefined,
            } satisfies MenuAction,
          ]
        : []),
    ];
    const tagToggles: MenuAction[] = [
      {
        id: "toggleTagIcons",
        title: t("home.filter.icons"),
        image: Platform.OS === "ios" ? "app.dashed" : undefined,
        imageColor: Platform.OS === "ios" ? iconColor : undefined,
        state:
          Platform.OS === "ios" ? (showTagIcons ? "on" : "off") : undefined,
      },
      {
        id: "toggleCompactSubtasks",
        title: t("home.filter.subtasks"),
        image: Platform.OS === "ios" ? "checkmark.square" : undefined,
        imageColor: Platform.OS === "ios" ? iconColor : undefined,
        state:
          Platform.OS === "ios"
            ? showCompactSubtasks
              ? "on"
              : "off"
            : undefined,
      },
      ...availableTags.map((tag) => {
        const on = scopedEnabledTags.has(tag);
        return {
          id: tag,
          title: getTagTitle(tag),
          image: Platform.OS === "ios" ? TAG_DEFS[tag].iosSymbol : undefined,
          imageColor: Platform.OS === "ios" ? iconColor : undefined,
          state: Platform.OS === "ios" ? (on ? "on" : "off") : undefined,
        } satisfies MenuAction;
      }),
    ];

    if (Platform.OS !== "ios") {
      return [
        ...visibilityToggles,
        ...tagToggles,
        showAll,
        hideAll,
      ];
    }

    const grouped: MenuAction[] = [];
    if (visibilityToggles.length > 0) {
      grouped.push({
        title: "",
        displayInline: true,
        subactions: visibilityToggles,
      });
    }
    grouped.push({
      title: "",
      displayInline: true,
      subactions: tagToggles,
    });
    grouped.push({
      title: "",
      displayInline: true,
      subactions: [showAll, hideAll],
    });
    return grouped;
  }, [
    availableTags,
    scopedEnabledTags,
    showCompactSubtasks,
    showCompletedTasks,
    showCompletedTasksToggle,
    showProjectTasks,
    showProjectTasksToggle,
    showRoutineTasks,
    showRoutineTasksToggle,
    showTagIcons,
    theme,
  ]);

  const onPressAction = React.useCallback(
    ({ nativeEvent: { event } }: any) => {
      const id = event as string;

      if (id === "showAllTags") {
        const nextScoped = new Set<TagId>(availableTags);
        setEnabledTags((prev) => {
          const next = mergeScopedTags(prev, nextScoped, availableTagSet);
          return setsEqual(prev, next) ? prev : next;
        });
        setShowCompactSubtasks(true);
        setShowProjectNames(true);
        router.setParams({
          tags: serializeTagsParam(nextScoped),
          withSubtasks: "1",
        });
        scheduleReopen();
        return;
      }

      if (id === "hideAllTags") {
        const nextScoped = new Set<TagId>();
        setEnabledTags((prev) => {
          const next = mergeScopedTags(prev, nextScoped, availableTagSet);
          return setsEqual(prev, next) ? prev : next;
        });
        setShowCompactSubtasks(false);
        setShowProjectNames(false);
        router.setParams({ tags: undefined, withSubtasks: "0" });
        scheduleReopen();
        return;
      }

      if (id === "toggleTagIcons") {
        const next = !showTagIcons;
        setShowTagIcons(next);
        router.setParams({ tagIcons: next ? "1" : "0" });
        scheduleReopen();
        return;
      }

      if (id === "toggleCompactSubtasks") {
        const next = !showCompactSubtasks;
        setShowCompactSubtasks(next);
        router.setParams({ withSubtasks: next ? "1" : "0" });
        scheduleReopen();
        return;
      }

      if (showCompletedTasksToggle && id === "toggleCompletedTasks") {
        const next = !showCompletedTasks;
        setShowCompletedTasks(next);
        router.setParams({ completed: next ? "1" : "0" });
        scheduleReopen();
        return;
      }

      if (showProjectTasksToggle && id === "toggleProjectTasks") {
        const next = !showProjectTasks;
        setShowProjectTasks(next);
        router.setParams({ projects: next ? "1" : "0" });
        scheduleReopen();
        return;
      }

      if (showRoutineTasksToggle && id === "toggleRoutineTasks") {
        const next = !showRoutineTasks;
        setShowRoutineTasks(next);
        router.setParams({ routines: next ? "1" : "0" });
        scheduleReopen();
        return;
      }

      if (availableTagSet.has(id as TagId)) {
        const tag = id as TagId;
        setEnabledTags((prev) => {
          const next = new Set(prev);
          if (next.has(tag)) next.delete(tag);
          else next.add(tag);
          const nextScoped = buildScopedTagSet(next, availableTagSet);
          router.setParams({ tags: serializeTagsParam(nextScoped) });
          return next;
        });
        scheduleReopen();
      }
    },
    [
      availableTagSet,
      availableTags,
      router,
      scheduleReopen,
      setEnabledTags,
      setShowCompactSubtasks,
      setShowCompletedTasks,
      setShowProjectNames,
      setShowProjectTasks,
      setShowRoutineTasks,
      setShowTagIcons,
      showCompactSubtasks,
      showCompletedTasks,
      showCompletedTasksToggle,
      showProjectTasks,
      showProjectTasksToggle,
      showRoutineTasks,
      showRoutineTasksToggle,
      showTagIcons,
    ],
  );

  return (
    <MenuView
      ref={menuRef}
      themeVariant={Platform.OS === "ios" ? theme : undefined}
      isAnchoredToRight={Platform.OS === "android" ? true : undefined}
      actions={actions}
      onPressAction={onPressAction}
      shouldOpenOnLongPress={false}
      style={{
        width: 36,
        height: 36,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "transparent",
      }}
    >
      {Platform.OS === "android" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.filter")}
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          onPress={() => menuRef.current?.show?.()}
        >
          <FilterIcon theme={theme} />
        </Pressable>
      ) : (
        <FilterIcon theme={theme} />
      )}
    </MenuView>
  );
}
