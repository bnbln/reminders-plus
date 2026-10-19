import { useRouter } from "expo-router";
import React from "react";

import { usePremium } from "@/context/premium-store";
import { t } from "@/i18n";
import {
  IS_ASSIST_SUPPORTED,
  IS_CLOUD_SYNC_SUPPORTED,
} from "@/utils/assist-availability";

export type ProfileMenuActionId =
  | "status"
  | "streaks"
  | "routines"
  | "assist"
  | "cloudSync"
  | "archive"
  | "settings";

export type ProfileMenuItem = {
  id: ProfileMenuActionId;
  title: string;
  /** SF Symbol name. */
  symbol: string;
  /** Icon tint in the header menu; null follows the text color. */
  color: string | null;
};

/**
 * One definition for the profile menu in the page header, the Duo bar and the
 * Mac sidebar. Each inner array is one menu section.
 */
export function getProfileMenuSections(): ProfileMenuItem[][] {
  const premium: ProfileMenuItem[] = [
    // Assist is Apple-only; see `IS_ASSIST_SUPPORTED`.
    ...(IS_ASSIST_SUPPORTED
      ? [{ id: "assist", title: t("screen.assist"), symbol: "message.badge.waveform.fill", color: "#0A84FF" } as const]
      : []),
    // Cloud Sync is CloudKit-only; see `IS_CLOUD_SYNC_SUPPORTED`.
    ...(IS_CLOUD_SYNC_SUPPORTED
      ? [{ id: "cloudSync", title: t("screen.cloudSync"), symbol: "icloud.fill", color: "#0A84FF" } as const]
      : []),
  ];
  return [
    [
      { id: "status", title: t("screen.status"), symbol: "arrow.up.right", color: "#22C55E" },
      { id: "streaks", title: t("home.quick.streaks"), symbol: "flame.fill", color: "#F97316" },
      { id: "routines", title: t("home.quick.routines"), symbol: "repeat", color: "#0A84FF" },
      { id: "archive", title: t("common.archive"), symbol: "archivebox.fill", color: "grey" },
    ],
    ...(premium.length > 0 ? [premium] : []),
    [{ id: "settings", title: t("screen.settings"), symbol: "gearshape", color: null }],
  ];
}

/** Opens a profile menu destination; Assist and Cloud Sync go to the paywall without Plus. */
export function useProfileMenuNavigate() {
  const router = useRouter();
  const { hasPremiumAccess, isReady } = usePremium();

  return React.useCallback(
    (id: string) => {
      switch (id as ProfileMenuActionId) {
        case "status":
          router.push("/status");
          break;
        case "streaks":
          router.push("/(tabs)/home/streaks");
          break;
        case "routines":
          router.push("/home/routines");
          break;
        case "archive":
          router.push("/home/archive");
          break;
        case "assist":
          if (!IS_ASSIST_SUPPORTED) return;
          router.push(
            !isReady || hasPremiumAccess
              ? "/assist"
              : { pathname: "/plus", params: { source: "assist" } },
          );
          break;
        case "cloudSync":
          if (!IS_CLOUD_SYNC_SUPPORTED) return;
          router.push(
            !isReady || hasPremiumAccess
              ? "/cloud-sync"
              : { pathname: "/plus", params: { source: "sync" } },
          );
          break;
        case "settings":
          router.push("/settings");
          break;
      }
    },
    [hasPremiumAccess, isReady, router],
  );
}
