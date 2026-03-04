import { Platform } from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Project, Task } from "@/context/tasks-store";
import { t } from "@/i18n";

const STORAGE_KEYS = {
  seeded: "reminds.tasks.onboardingSeeded.v1",
} as const;

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

export function createOnboardingSeedData(): {
  projects: Project[];
  tasks: Task[];
} {
  const now = Date.now();
  const todayDueAt = getTodayDueAt();

  const projects: Project[] = [
    { id: "p-work", name: t("seed.project.work"), color: "#0A84FF", icon: "briefcase.fill" },
    { id: "p-home", name: t("seed.project.home"), color: "#FF9500", icon: "house.fill" },
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
  ];

  return { projects, tasks };
}
