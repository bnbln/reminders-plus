import { useRouter, useSegments } from "expo-router";
import React from "react";
import { Linking } from "react-native";

import { useCreateActionHref } from "@/components/navigation/mac-add-button";
import {
  getProfileMenuSections,
  useProfileMenuNavigate,
} from "@/components/navigation/profile-menu";
import { LEGAL_ACCESSIBILITY_FEEDBACK_EMAIL } from "@/constants/legal";
import {
  getTagTitle,
  TAG_ORDER,
  useHomeFilters,
  type TagId,
} from "@/context/home-filters-store";
import { useAppSettings } from "@/context/settings-store";
import { useTasksStore } from "@/context/tasks-store";
import { t } from "@/i18n";
import {
  IS_ASSIST_SUPPORTED,
  IS_CLOUD_SYNC_SUPPORTED,
} from "@/utils/assist-availability";
import {
  HAS_MAC_MENU_BRIDGE,
  IS_MAC,
  setMacMenuContent,
  setMacSidebarContent,
  subscribeMacCommands,
  type MacCommandEvent,
} from "@/utils/mac";

// Routes Esc may close: the overlays and sheets the add flows open.
const CLOSABLE_ROUTES = new Set([
  "task/create-modal",
  "task/date-picker",
  "task/emoji-picker",
  "task/location-picker",
  "task/project-picker",
  "task/routine-picker",
  "project/create-modal",
  "project/edit-modal",
  "project/limit-modal",
  "day-picker",
  "plus",
]);

type FilterToggleId =
  | "toggleProjectTasks"
  | "toggleRoutineTasks"
  | "toggleCompletedTasks"
  | "toggleTagIcons"
  | "toggleCompactSubtasks";

/**
 * Feeds the menu bar (Mac and iPad) and the Mac sidebar with localized titles,
 * projects and the profile menu, and runs their commands through the router.
 * Commands that act on an open task are taken by that screen first, see
 * `registerMacCommandHandler`.
 */
export function MacIntegration() {
  if (!HAS_MAC_MENU_BRIDGE) return null;
  return <MacIntegrationBridge />;
}

function MacIntegrationBridge() {
  const router = useRouter();
  const segments = useSegments();
  const { projects } = useTasksStore();
  const { localeOverride } = useAppSettings();
  const navigateProfile = useProfileMenuNavigate();
  const createAction = useCreateActionHref();
  const {
    enabledTags,
    setEnabledTags,
    showTagIcons,
    setShowTagIcons,
    showCompactSubtasks,
    setShowCompactSubtasks,
    showCompletedTasks,
    setShowCompletedTasks,
    showProjectTasks,
    setShowProjectTasks,
    showRoutineTasks,
    setShowRoutineTasks,
  } = useHomeFilters();

  React.useEffect(() => {
    const titles: Record<string, string> = {
      settings: t("mac.menu.settings"),
      newTask: t("mac.menu.newTask"),
      newProject: t("explore.newProject"),
      exportBackup: t("mac.menu.exportBackup"),
      search: t("common.search"),
      toggleComplete: t("mac.menu.toggleComplete"),
      deleteTask: t("mac.menu.deleteTask"),
      closeOverlay: t("taskDetail.alert.cancel"),
      goToday: t("common.today"),
      goInbox: t("common.inbox"),
      goProjects: t("tabs.projects"),
      goRoutines: t("home.quick.routines"),
      toggleSidebar: t("mac.menu.toggleSidebar"),
      filter: t("common.filter"),
      go: t("mac.menu.go"),
      status: t("screen.status"),
      streaks: t("home.quick.streaks"),
      archive: t("common.archive"),
      ...(IS_ASSIST_SUPPORTED ? { assist: t("screen.assist") } : {}),
      ...(IS_CLOUD_SYNC_SUPPORTED ? { cloudSync: t("screen.cloudSync") } : {}),
      legal: t("screen.legal"),
      support: t("mac.menu.support"),
    };
    const filters = [
      { id: "toggleProjectTasks", title: t("tags.project"), checked: showProjectTasks },
      { id: "toggleRoutineTasks", title: t("taskDetail.property.routine"), checked: showRoutineTasks },
      { id: "toggleCompletedTasks", title: t("home.filter.completedTasks"), checked: showCompletedTasks },
      { id: "toggleTagIcons", title: t("home.filter.icons"), checked: showTagIcons },
      { id: "toggleCompactSubtasks", title: t("home.filter.subtasks"), checked: showCompactSubtasks },
      ...TAG_ORDER.map((tag) => ({ id: tag, title: getTagTitle(tag), checked: enabledTags.has(tag) })),
    ];
    setMacMenuContent({ titles, filters });
  }, [
    enabledTags,
    localeOverride,
    showCompactSubtasks,
    showCompletedTasks,
    showProjectTasks,
    showRoutineTasks,
    showTagIcons,
  ]);

  React.useEffect(() => {
    if (!IS_MAC) return;
    setMacSidebarContent({
      projectsGroupTitle: t("mac.sidebar.projects"),
      newProjectTitle: t("explore.newProject"),
      profileTitle: t("screen.profile"),
      projects: projects
        .filter((project) => !project.deletedAt)
        .map((project) => ({
          id: project.id,
          title: project.name,
          symbol: project.icon || "folder",
          color: project.color,
        })),
      profileSections: getProfileMenuSections().map((section) =>
        section.map((item) => ({
          id: item.id,
          title: item.title,
          symbol: item.symbol,
          color: item.color?.startsWith("#") ? item.color : undefined,
        })),
      ),
    });
  }, [localeOverride, projects]);

  const toggleFilter = React.useCallback(
    (id: string) => {
      switch (id as FilterToggleId) {
        case "toggleProjectTasks":
          setShowProjectTasks((previous) => !previous);
          return;
        case "toggleRoutineTasks":
          setShowRoutineTasks((previous) => !previous);
          return;
        case "toggleCompletedTasks":
          setShowCompletedTasks((previous) => !previous);
          return;
        case "toggleTagIcons":
          setShowTagIcons((previous) => !previous);
          return;
        case "toggleCompactSubtasks":
          setShowCompactSubtasks((previous) => !previous);
          return;
      }
      if (!TAG_ORDER.includes(id as TagId)) return;
      setEnabledTags((previous) => {
        const next = new Set(previous);
        if (next.has(id as TagId)) next.delete(id as TagId);
        else next.add(id as TagId);
        return next;
      });
    },
    [
      setEnabledTags,
      setShowCompactSubtasks,
      setShowCompletedTasks,
      setShowProjectTasks,
      setShowRoutineTasks,
      setShowTagIcons,
    ],
  );

  // The subscription stays put; the latest handler is read from a ref.
  const handleCommand = React.useCallback(
    ({ command, value }: MacCommandEvent) => {
      const route = (segments as string[]).join("/");
      switch (command) {
        case "newTask":
          // On the project overview the page action is "New project"; ⌘N still adds a task.
          router.push(
            (createAction.href.startsWith("/project/") ? "/task/create-modal" : createAction.href) as never,
          );
          return;
        case "newProject":
          router.push("/project/edit-modal");
          return;
        case "openProject":
          if (value) router.navigate({ pathname: "/explore/[id]", params: { id: value } });
          return;
        case "profile":
          navigateProfile(value);
          return;
        case "status":
        case "streaks":
        case "archive":
        case "assist":
        case "cloudSync":
        case "settings":
          navigateProfile(command);
          return;
        case "exportBackup":
          // Export lives in Settings next to restore, Cloud Sync and the Plus gate.
          navigateProfile("settings");
          return;
        case "search":
          router.navigate("/(tabs)/search" as never);
          return;
        case "goToday":
          router.navigate("/(tabs)/home" as never);
          return;
        case "goInbox":
          router.navigate("/(tabs)/inbox" as never);
          return;
        case "goProjects":
          router.navigate("/(tabs)/explore" as never);
          return;
        case "goRoutines":
          router.navigate("/(tabs)/routines" as never);
          return;
        case "toggleFilter":
          toggleFilter(value);
          return;
        case "closeOverlay":
          if (CLOSABLE_ROUTES.has(route) && router.canGoBack()) router.back();
          return;
        case "legal":
          router.push("/legal");
          return;
        case "support":
          void Linking.openURL(`mailto:${LEGAL_ACCESSIBILITY_FEEDBACK_EMAIL}`).catch(() => undefined);
          return;
      }
    },
    [createAction.href, navigateProfile, router, segments, toggleFilter],
  );
  const handleCommandRef = React.useRef(handleCommand);
  React.useEffect(() => {
    handleCommandRef.current = handleCommand;
  }, [handleCommand]);

  React.useEffect(
    () => subscribeMacCommands((event) => handleCommandRef.current(event)),
    [],
  );

  return null;
}
