import { Platform } from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Project, Task } from "@/context/tasks-store";
import { t } from "@/i18n";

const STORAGE_KEYS = {
  seeded: "reminds.tasks.onboardingSeeded.v2",
} as const;

const ONBOARDING_PROJECT_TRANSLATION_KEYS = {
  "p-work": "seed.project.work",
  "p-home": "seed.project.home",
  "p-selfcare": "seed.project.selfcare",
} as const;

const ONBOARDING_TASK_TRANSLATIONS = [
  {
    suffix: "-swipe-left",
    titleKey: "seed.task.swipeLeft.title",
    subtitleKey: "seed.task.swipeLeft.subtitle",
  },
  {
    suffix: "-swipe-right",
    titleKey: "seed.task.swipeRight.title",
    subtitleKey: "seed.task.swipeRight.subtitle",
  },
  {
    suffix: "-dragdrop",
    titleKey: "seed.task.drag.title",
    subtitleKey: "seed.task.drag.subtitle",
  },
  {
    suffix: "-details",
    titleKey: "seed.task.details.title",
    subtitleKey: "seed.task.details.subtitle",
  },
  {
    suffix: "-inbox-overdue",
    titleKey: "seed.task.inboxOverdue.title",
    subtitleKey: "seed.task.inboxOverdue.subtitle",
  },
  {
    suffix: "-inbox-without-date",
    titleKey: "seed.task.inboxWithoutDate.title",
    subtitleKey: "seed.task.inboxWithoutDate.subtitle",
  },
  {
    suffix: "-favorite-color",
    titleKey: "seed.task.favoriteColor.title",
    subtitleKey: "seed.task.favoriteColor.subtitle",
  },
  {
    suffix: "-more-features",
    titleKey: "seed.task.moreFeatures.title",
    subtitleKey: "seed.task.moreFeatures.subtitle",
  },
] as const;

function getOnboardingTaskTranslation(taskId: string) {
  if (!taskId.startsWith("t-seed-")) return null;
  return (
    ONBOARDING_TASK_TRANSLATIONS.find((entry) => taskId.endsWith(entry.suffix)) ??
    null
  );
}

export async function hasCompletedOnboardingSeed(): Promise<boolean> {
  try {
    if (Platform.OS === "web") return true;
    const v = await AsyncStorage.getItem(STORAGE_KEYS.seeded);
    return v === "1";
  } catch {
    return true;
  }
}

export async function markCompletedOnboardingSeed(): Promise<void> {
  try {
    if (Platform.OS === "web") return;
    await AsyncStorage.setItem(STORAGE_KEYS.seeded, "1");
  } catch {
    // ignore
  }
}

function getTodayDueAt() {
  const now = new Date();
  const dueAt = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    12,
    0,
    0,
    0,
  );
  return dueAt.getTime();
}

function getOneMonthAgoDueAt() {
  const now = new Date();
  const targetMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const targetYear =
    now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const maxDayOfTargetMonth = new Date(
    targetYear,
    targetMonth + 1,
    0,
  ).getDate();
  const targetDay = Math.min(now.getDate(), maxDayOfTargetMonth);
  const dueAt = new Date(targetYear, targetMonth, targetDay, 12, 0, 0, 0);
  return dueAt.getTime();
}

export function createOnboardingSeedData(): {
  projects: Project[];
  tasks: Task[];
} {
  const now = Date.now();
  const todayDueAt = getTodayDueAt();
  const oneMonthAgoDueAt = getOneMonthAgoDueAt();

  const projects: Project[] = [
    {
      id: "p-work",
      name: t("seed.project.work"),
      color: "#0A84FF",
      icon: "briefcase.fill",
    },
    {
      id: "p-home",
      name: t("seed.project.home"),
      color: "#FF9500",
      icon: "house.fill",
    },
    {
      id: "p-selfcare",
      name: t("seed.project.selfcare"),
      color: "#34C759",
      icon: "heart.fill",
    },
  ];

  const tasks: Task[] = [
    {
      id: `t-seed-${now}-swipe-left`,
      title: t("seed.task.swipeLeft.title"),
      subtitle: t("seed.task.swipeLeft.subtitle"),
      emoji: "👈",
      projectId: "p-home",
      dueAt: todayDueAt,
      dueHasTime: false,
      section: "today",
      orderRank: 1000,
      location: undefined,
      notes: undefined,
      subtasks: undefined,
      completedAt: undefined,
      deletedAt: undefined,
    },
    {
      id: `t-seed-${now}-swipe-right`,
      title: t("seed.task.swipeRight.title"),
      subtitle: t("seed.task.swipeRight.subtitle"),
      emoji: "👉",
      projectId: "p-home",
      dueAt: todayDueAt,
      dueHasTime: false,
      section: "today",
      orderRank: 2000,
      location: undefined,
      notes: undefined,
      subtasks: undefined,
      completedAt: undefined,
      deletedAt: undefined,
    },
    {
      id: `t-seed-${now}-dragdrop`,
      title: t("seed.task.drag.title"),
      subtitle: t("seed.task.drag.subtitle"),
      emoji: "↕️",
      projectId: "p-work",
      dueAt: todayDueAt,
      dueHasTime: false,
      section: "today",
      orderRank: 3000,
      location: undefined,
      notes: undefined,
      subtasks: undefined,
      completedAt: undefined,
      deletedAt: undefined,
    },
    {
      id: `t-seed-${now}-details`,
      title: t("seed.task.details.title"),
      subtitle: t("seed.task.details.subtitle"),
      emoji: "🔎",
      projectId: "p-selfcare",
      dueAt: todayDueAt,
      dueHasTime: false,
      section: "today",
      orderRank: 4000,
      location: undefined,
      notes: undefined,
      subtasks: undefined,
      completedAt: undefined,
      deletedAt: undefined,
    },
    {
      id: `t-seed-${now}-inbox-overdue`,
      title: t("seed.task.inboxOverdue.title"),
      subtitle: t("seed.task.inboxOverdue.subtitle"),
      emoji: "⚠️",
      projectId: "p-work",
      dueAt: oneMonthAgoDueAt,
      dueHasTime: false,
      section: "upcoming",
      orderRank: 5000,
      location: undefined,
      notes: undefined,
      subtasks: undefined,
      completedAt: undefined,
      deletedAt: undefined,
    },
    {
      id: `t-seed-${now}-inbox-without-date`,
      title: t("seed.task.inboxWithoutDate.title"),
      subtitle: t("seed.task.inboxWithoutDate.subtitle"),
      emoji: "💼",
      projectId: "p-work",
      dueAt: 0,
      dueHasTime: false,
      section: "upcoming",
      orderRank: 6000,
      location: undefined,
      notes: undefined,
      subtasks: undefined,
      completedAt: undefined,
      deletedAt: undefined,
    },
    {
      id: `t-seed-${now}-favorite-color`,
      title: t("seed.task.favoriteColor.title"),
      subtitle: t("seed.task.favoriteColor.subtitle"),
      emoji: "🎨",
      projectId: "p-home",
      dueAt: 0,
      dueHasTime: false,
      section: "upcoming",
      orderRank: 7000,
      location: undefined,
      notes: undefined,
      subtasks: undefined,
      completedAt: undefined,
      deletedAt: undefined,
    },
    {
      id: `t-seed-${now}-more-features`,
      title: t("seed.task.moreFeatures.title"),
      subtitle: t("seed.task.moreFeatures.subtitle"),
      emoji: "🖤",
      projectId: "p-selfcare",
      dueAt: 0,
      dueHasTime: false,
      section: "upcoming",
      orderRank: 8000,
      location: undefined,
      notes: undefined,
      subtasks: undefined,
      completedAt: undefined,
      deletedAt: undefined,
    },
  ];

  return { projects, tasks };
}

export function localizeExistingOnboardingSeedData(
  tasks: Task[],
  projects: Project[],
): {
  tasks: Task[];
  projects: Project[];
  changed: boolean;
} {
  let projectsChanged = false;
  const localizedProjects = projects.map((project) => {
    const translationKey =
      ONBOARDING_PROJECT_TRANSLATION_KEYS[
        project.id as keyof typeof ONBOARDING_PROJECT_TRANSLATION_KEYS
      ];
    if (!translationKey) return project;

    const nextName = t(translationKey);
    if (project.name === nextName) return project;

    projectsChanged = true;
    return {
      ...project,
      name: nextName,
    };
  });

  let tasksChanged = false;
  const localizedTasks = tasks.map((task) => {
    const translation = getOnboardingTaskTranslation(task.id);
    if (!translation) return task;

    const nextTitle = t(translation.titleKey);
    const nextSubtitle = t(translation.subtitleKey);
    if (task.title === nextTitle && task.subtitle === nextSubtitle) {
      return task;
    }

    tasksChanged = true;
    return {
      ...task,
      title: nextTitle,
      subtitle: nextSubtitle,
    };
  });

  return {
    tasks: tasksChanged ? localizedTasks : tasks,
    projects: projectsChanged ? localizedProjects : projects,
    changed: tasksChanged || projectsChanged,
  };
}
