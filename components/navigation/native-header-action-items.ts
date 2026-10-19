import type {
  NativeStackHeaderItem,
  NativeStackHeaderItemMenu,
  NativeStackHeaderItemMenuAction,
  NativeStackHeaderItemMenuSubmenu,
} from "expo-router";
import { useRouter, useLocalSearchParams } from "expo-router";
import React from "react";

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
import { useColorScheme } from "@/hooks/use-color-scheme";
import { t } from "@/i18n";
import {
  getProfileMenuSections,
  useProfileMenuNavigate,
} from "@/components/navigation/profile-menu";

type FilterMenuOptions = {
  showFilter?: boolean;
  hiddenTags?: readonly TagId[];
  showCompletedTasksToggle?: boolean;
  showProjectTasksToggle?: boolean;
  showRoutineTasksToggle?: boolean;
};

const sfSymbol = (name: string) =>
  ({ type: "sfSymbol", name }) as NonNullable<NativeStackHeaderItemMenuAction["icon"]>;
const EMPTY_TAGS: readonly TagId[] = [];

function setsEqual<T>(a: Set<T>, b: Set<T>) {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

function buildScopedTagSet(source: Set<TagId>, allowed: Set<TagId>) {
  const scoped = new Set<TagId>();
  for (const tag of source) if (allowed.has(tag)) scoped.add(tag);
  return scoped;
}

function mergeScopedTags(
  previous: Set<TagId>,
  nextScoped: Set<TagId>,
  allowed: Set<TagId>,
) {
  const next = new Set(previous);
  for (const tag of allowed) next.delete(tag);
  for (const tag of nextScoped) next.add(tag);
  return next;
}

function useNativeFilterHeaderItem({
  hiddenTags = EMPTY_TAGS,
  showCompletedTasksToggle = false,
  showProjectTasksToggle = false,
  showRoutineTasksToggle = false,
}: FilterMenuOptions): NativeStackHeaderItemMenu {
  const router = useRouter();
  const theme = useColorScheme() ?? "light";
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

  React.useEffect(() => {
    if (params.tags !== undefined) {
      const parsed = buildScopedTagSet(parseTagsParam(params.tags), availableTagSet);
      setEnabledTags((previous) => {
        const next = mergeScopedTags(previous, parsed, availableTagSet);
        return setsEqual(previous, next) ? previous : next;
      });
    }
    if (params.tagIcons !== undefined) {
      const next = parseTagIconsParam(params.tagIcons);
      setShowTagIcons((previous) => previous === next ? previous : next);
    }
    if (params.withSubtasks !== undefined) {
      const next = parseCompactSubtasksParam(params.withSubtasks);
      setShowCompactSubtasks((previous) => previous === next ? previous : next);
    }
    if (showCompletedTasksToggle && params.completed !== undefined) {
      const next = parseShowCompletedTasksParam(params.completed);
      setShowCompletedTasks((previous) => previous === next ? previous : next);
    }
    if (showProjectTasksToggle && params.projects !== undefined) {
      const next = parseShowProjectTasksParam(params.projects);
      setShowProjectTasks((previous) => previous === next ? previous : next);
    }
    if (showRoutineTasksToggle && params.routines !== undefined) {
      const next = parseShowRoutineTasksParam(params.routines);
      setShowRoutineTasks((previous) => previous === next ? previous : next);
    }
  }, [
    availableTagSet,
    params.completed,
    params.projects,
    params.routines,
    params.tagIcons,
    params.tags,
    params.withSubtasks,
    setEnabledTags,
    setShowCompactSubtasks,
    setShowCompletedTasks,
    setShowProjectTasks,
    setShowProjectNames,
    setShowRoutineTasks,
    setShowTagIcons,
    showCompletedTasksToggle,
    showProjectTasksToggle,
    showRoutineTasksToggle,
  ]);

  const handleAction = React.useCallback((id: string) => {
    if (id === "showAllTags") {
      const nextScoped = new Set<TagId>(availableTags);
      setEnabledTags((previous) => {
        const next = mergeScopedTags(previous, nextScoped, availableTagSet);
        return setsEqual(previous, next) ? previous : next;
      });
      setShowCompactSubtasks(true);
      setShowProjectNames(true);
      router.setParams({ tags: serializeTagsParam(nextScoped), withSubtasks: "1" });
      return;
    }
    if (id === "hideAllTags") {
      const nextScoped = new Set<TagId>();
      setEnabledTags((previous) => {
        const next = mergeScopedTags(previous, nextScoped, availableTagSet);
        return setsEqual(previous, next) ? previous : next;
      });
      setShowCompactSubtasks(false);
      setShowProjectNames(false);
      router.setParams({ tags: undefined, withSubtasks: "0" });
      return;
    }
    if (id === "toggleTagIcons") {
      const next = !showTagIcons;
      setShowTagIcons(next);
      router.setParams({ tagIcons: next ? "1" : "0" });
      return;
    }
    if (id === "toggleCompactSubtasks") {
      const next = !showCompactSubtasks;
      setShowCompactSubtasks(next);
      router.setParams({ withSubtasks: next ? "1" : "0" });
      return;
    }
    if (showCompletedTasksToggle && id === "toggleCompletedTasks") {
      const next = !showCompletedTasks;
      setShowCompletedTasks(next);
      router.setParams({ completed: next ? "1" : "0" });
      return;
    }
    if (showProjectTasksToggle && id === "toggleProjectTasks") {
      const next = !showProjectTasks;
      setShowProjectTasks(next);
      router.setParams({ projects: next ? "1" : "0" });
      return;
    }
    if (showRoutineTasksToggle && id === "toggleRoutineTasks") {
      const next = !showRoutineTasks;
      setShowRoutineTasks(next);
      router.setParams({ routines: next ? "1" : "0" });
      return;
    }
    if (availableTagSet.has(id as TagId)) {
      const tag = id as TagId;
      setEnabledTags((previous) => {
        const next = new Set(previous);
        if (next.has(tag)) next.delete(tag);
        else next.add(tag);
        router.setParams({
          tags: serializeTagsParam(buildScopedTagSet(next, availableTagSet)),
        });
        return next;
      });
    }
  }, [
    availableTagSet,
    availableTags,
    router,
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
  ]);

  const action = React.useCallback(
    (id: string, label: string, icon?: string, state?: "on" | "off") => ({
      type: "action" as const,
      label,
      ...(icon ? { icon: sfSymbol(icon) } : {}),
      ...(state ? { state } : {}),
      keepsMenuPresented: true,
      onPress: () => handleAction(id),
    }),
    [handleAction],
  );

  const menuItems = React.useMemo(() => {
    const visibility: NativeStackHeaderItemMenuAction[] = [
      ...(showProjectTasksToggle
        ? [action("toggleProjectTasks", t("tags.project"), "folder.fill", showProjectTasks ? "on" : "off")]
        : []),
      ...(showRoutineTasksToggle
        ? [action("toggleRoutineTasks", t("taskDetail.property.routine"), "repeat", showRoutineTasks ? "on" : "off")]
        : []),
      ...(showCompletedTasksToggle
        ? [action("toggleCompletedTasks", t("home.filter.completedTasks"), "checkmark.circle", showCompletedTasks ? "on" : "off")]
        : []),
    ];
    const tagToggles: NativeStackHeaderItemMenuAction[] = [
      action("toggleTagIcons", t("home.filter.icons"), "app.dashed", showTagIcons ? "on" : "off"),
      action("toggleCompactSubtasks", t("home.filter.subtasks"), "checkmark.square", showCompactSubtasks ? "on" : "off"),
      ...availableTags.map((tag) =>
        action(tag, getTagTitle(tag), TAG_DEFS[tag].iosSymbol, scopedEnabledTags.has(tag) ? "on" : "off"),
      ),
    ];
    const bulkActions = [
      action("showAllTags", t("home.filter.showAllTags"), "eye"),
      action("hideAllTags", t("home.filter.hideAllTags"), "eye.slash"),
    ];
    return [...visibility, ...tagToggles, ...bulkActions];
  }, [
    action,
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
  ]);

  return React.useMemo(() => ({
    type: "menu",
    label: t("common.filter"),
    icon: sfSymbol("line.3.horizontal.decrease"),
    tintColor: Colors[theme].text,
    menu: { multiselectable: true, items: menuItems },
  }), [menuItems, theme]);
}

function useNativeProfileHeaderItem(): NativeStackHeaderItemMenu {
  const theme = useColorScheme() ?? "light";
  const navigate = useProfileMenuNavigate();

  return React.useMemo(() => {
    const items: NativeStackHeaderItemMenu["menu"]["items"] = getProfileMenuSections().map(
      (section): NativeStackHeaderItemMenuSubmenu => ({
        type: "submenu",
        label: "",
        inline: true,
        items: section.map((item): NativeStackHeaderItemMenuAction => ({
          type: "action",
          label: item.title,
          icon: sfSymbol(item.symbol),
          onPress: () => navigate(item.id),
        })),
      }),
    );
    return {
      type: "menu",
      label: t("screen.profile"),
      icon: sfSymbol("person.fill"),
      tintColor: Colors[theme].text,
      menu: { items },
    };
  }, [navigate, theme]);
}

export function useNativeFilterHeaderItems(options: FilterMenuOptions = {}): NativeStackHeaderItem[] {
  const filterItem = useNativeFilterHeaderItem(options);
  return React.useMemo(() => [filterItem], [filterItem]);
}

export function useNativeProfileHeaderActionItems(): NativeStackHeaderItem[] {
  const profileItem = useNativeProfileHeaderItem();
  return React.useMemo(() => [profileItem], [profileItem]);
}
