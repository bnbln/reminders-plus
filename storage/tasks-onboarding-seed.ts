import { Platform } from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Project, Task } from "@/context/tasks-store";

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
  const preferred = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    Math.min(23, Math.max(8, now.getHours() + 1)),
    0,
    0,
    0,
  );
  return preferred.getTime();
}

function getTomorrowDueAt() {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const tomorrow = new Date(startOfToday);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(11, 0, 0, 0);
  return tomorrow.getTime();
}

export function createOnboardingSeedData(): {
  projects: Project[];
  tasks: Task[];
} {
  const now = Date.now();

  const projects: Project[] = [
    { id: "p-work", name: "Work", color: "#0A84FF", icon: "briefcase.fill" },
    { id: "p-home", name: "Home", color: "#FF9500", icon: "house.fill" },
    {
      id: "p-selfcare",
      name: "Selfcare",
      color: "#34C759",
      icon: "heart.fill",
    },
  ];

  const tasks: Task[] = [
    {
      id: `t-seed-${now}-swipe-left`,
      title: "Nach links wischen",
      subtitle: "Zum Löschen der Aufgabe",
      emoji: "👈",
      projectId: "p-home",
      dueAt: getTodayDueAt(),
      dueHasTime: true,
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
      title: "Nach rechts wischen",
      subtitle: "Zum Erledigen der Aufgabe",
      emoji: "👉",
      projectId: "p-home",
      dueAt: getTodayDueAt(),
      dueHasTime: true,
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
      title: "Drag & Drop",
      subtitle: "Halte gedrückt und ziehe mich",
      emoji: "↕️",
      projectId: "p-work",
      dueAt: 0,
      dueHasTime: false,
      section: "upcoming",
      orderRank: 1000,
      location: undefined,
      notes: undefined,
      subtasks: undefined,
      completedAt: undefined,
      deletedAt: undefined,
    },
    {
      id: `t-seed-${now}-details`,
      title: "Tippe für Details",
      subtitle: "Öffnet die Detailansicht",
      emoji: "🔎",
      projectId: "p-selfcare",
      dueAt: getTomorrowDueAt(),
      dueHasTime: false,
      section: "upcoming",
      orderRank: 2000,
      location: undefined,
      notes: undefined,
      subtasks: undefined,
      completedAt: undefined,
      deletedAt: undefined,
    },
  ];

  return { projects, tasks };
}
