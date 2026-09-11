import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  type MenuAction,
  type MenuComponentRef,
} from "@react-native-menu/menu";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import React from "react";
import { Platform } from "react-native";

import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { Colors } from "@/constants/theme";
import { usePremium } from "@/context/premium-store";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { t } from "@/i18n";
import {
  IS_ASSIST_SUPPORTED,
  IS_CLOUD_SYNC_SUPPORTED,
} from "@/utils/assist-availability";

type ProfileMenuActionId =
  | "profile"
  | "status"
  | "streaks"
  | "routines"
  | "assist"
  | "cloudSync"
  | "archive"
  | "settings";

function ProfileMenuIcon({ theme }: { theme: keyof typeof Colors }) {
  const color = Colors[theme].text;

  if (Platform.OS === "ios") {
    return (
      <SymbolView
        name="person.fill"
        tintColor={color}
        style={{ width: 24, height: 24 }}
      />
    );
  }

  return <MaterialIcons name="person-outline" size={20} color={color} />;
}

export function ProfileHeaderMenuButton() {
  const router = useRouter();
  const theme = useColorScheme() ?? "light";
  const menuRef = React.useRef<MenuComponentRef>(null);
  const { hasPremiumAccess, isReady } = usePremium();

  const actions = React.useMemo<MenuAction[]>(() => {
    const imageColor = Colors[theme].text;

    const mainGroup: MenuAction = {
      title: "",
      displayInline: true,
      subactions: [
        {
          id: "status",
          title: t("screen.status"),
          image: Platform.OS === "ios" ? "arrow.up.right" : undefined,
          imageColor: Platform.OS === "ios" ? "#22C55E" : undefined,
        },
        {
          id: "streaks",
          title: t("home.quick.streaks"),
          image: Platform.OS === "ios" ? "flame.fill" : undefined,
          imageColor: Platform.OS === "ios" ? "#F97316" : undefined,
        },
        {
          id: "routines",
          title: t("home.quick.routines"),
          image: Platform.OS === "ios" ? "repeat" : undefined,
          imageColor: Platform.OS === "ios" ? "#0A84FF" : undefined,
        },
        {
          id: "archive",
          title: t("common.archive"),
          image: Platform.OS === "ios" ? "archivebox.fill" : undefined,
          imageColor: Platform.OS === "ios" ? "grey" : undefined,
        },
      ],
    };

    const premiumGroup: MenuAction = {
      title: "",
      displayInline: true,
      subactions: [
        // Assist is Apple-only; see `IS_ASSIST_SUPPORTED`.
        ...(IS_ASSIST_SUPPORTED
          ? [
              {
                id: "assist",
                title: t("screen.assist"),
                image:
                  Platform.OS === "ios"
                    ? "message.badge.waveform.fill"
                    : undefined,
                imageColor: Platform.OS === "ios" ? "#0A84FF" : undefined,
              } satisfies MenuAction,
            ]
          : []),
        // Cloud Sync is CloudKit-only; see `IS_CLOUD_SYNC_SUPPORTED`.
        ...(IS_CLOUD_SYNC_SUPPORTED
          ? [
              {
                id: "cloudSync",
                title: t("screen.cloudSync"),
                image: Platform.OS === "ios" ? "icloud.fill" : undefined,
                imageColor: Platform.OS === "ios" ? "#0A84FF" : undefined,
              } satisfies MenuAction,
            ]
          : []),
      ],
    };

    const settingsGroup: MenuAction = {
      title: "",
      displayInline: true,
      subactions: [
        {
          id: "settings",
          title: t("screen.settings"),
          image: Platform.OS === "ios" ? "gearshape" : undefined,
          imageColor: Platform.OS === "ios" ? imageColor : undefined,
        },
      ],
    };

    const groups = [mainGroup, premiumGroup, settingsGroup];

    // `displayInline` maps to a UIMenu inline section on iOS. Android's PopupMenu
    // has no such concept, so each group renders as a *submenu* row labelled with
    // its (deliberately empty) title — an unreadable menu of blank arrows. Flatten
    // to a single level there; the grouping is purely visual anyway.
    if (Platform.OS === "android") {
      return groups.flatMap((group) => group.subactions ?? []);
    }

    return groups;
  }, [theme]);

  const onPressAction = React.useCallback(
    ({ nativeEvent: { event } }: any) => {
      const actionId = event as ProfileMenuActionId;

      if (actionId === "profile") {
        router.push("/profile");
        return;
      }

      if (actionId === "status") {
        router.push("/status");
        return;
      }

      if (actionId === "streaks") {
        router.push("/(tabs)/home/streaks");
        return;
      }

      if (actionId === "routines") {
        router.push("/home/routines");
        return;
      }

      if (actionId === "assist") {
        if (!IS_ASSIST_SUPPORTED) return;
        if (!isReady || hasPremiumAccess) {
          router.push("/assist");
          return;
        }

        router.push({ pathname: "/plus", params: { source: "assist" } });
        return;
      }

      if (actionId === "cloudSync") {
        if (!IS_CLOUD_SYNC_SUPPORTED) return;
        if (!isReady || hasPremiumAccess) {
          router.push("/cloud-sync");
          return;
        }

        router.push({ pathname: "/plus", params: { source: "sync" } });
        return;
      }

      if (actionId === "archive") {
        router.push("/home/archive");
        return;
      }

      if (actionId === "settings") {
        router.push("/settings");
      }
    },
    [hasPremiumAccess, isReady, router],
  );

  return (
    <DropdownMenu
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
      <ProfileMenuIcon theme={theme} />
    </DropdownMenu>
  );
}
