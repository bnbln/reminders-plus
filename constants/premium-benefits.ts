import { IS_ASSIST_SUPPORTED, IS_CLOUD_SYNC_SUPPORTED } from "@/utils/assist-availability";

export const PREMIUM_BENEFITS = [
  {
    id: "assist",
    icon: "auto-awesome",
    tint: "#34C759",
    titleKey: "plus.benefit.assist",
  },
  {
    id: "projects",
    icon: "folder-open",
    tint: "#3B82F6",
    titleKey: "plus.benefit.projects",
  },
  {
    id: "sync",
    icon: "cloud-done",
    tint: "#F59E0B",
    titleKey: "plus.benefit.sync",
  },
] as const;

export type PremiumBenefit = (typeof PREMIUM_BENEFITS)[number];

// Assist and Cloud Sync are Apple-only, so don't advertise them on platforms
// that cannot run them.
export const VISIBLE_PREMIUM_BENEFITS: readonly PremiumBenefit[] =
  PREMIUM_BENEFITS.filter((benefit) => {
    if (benefit.id === "assist") return IS_ASSIST_SUPPORTED;
    if (benefit.id === "sync") return IS_CLOUD_SYNC_SUPPORTED;
    return true;
  });
