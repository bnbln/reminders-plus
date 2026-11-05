import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  type MenuAction,
  type MenuComponentRef,
} from "@react-native-menu/menu";
import { SymbolView } from "expo-symbols";
import React from "react";
import { Platform } from "react-native";

import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  getProfileMenuSections,
  useProfileMenuNavigate,
} from "@/components/navigation/profile-menu";
import { IS_MAC } from "@/utils/mac";

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

  // This trigger doesn't open a profile/account screen — it's the same
  // Status/Streaks/Routines/Archive/Settings menu as iOS's person icon, just
  // rendered as a Material dropdown (see DropdownMenu). Material's own
  // convention for a content-only overflow menu like this is the kebab, not
  // an avatar — an avatar in Android apps (Gmail, Drive, Photos) implies an
  // actual account switcher, which this isn't. Match the search icon's
  // weight (size 24) so the header reads as one consistent icon set.
  return <MaterialIcons name="more-vert" size={24} color={color} />;
}

export function ProfileHeaderMenuButton() {
  const theme = useColorScheme() ?? "light";
  const menuRef = React.useRef<MenuComponentRef>(null);
  const navigate = useProfileMenuNavigate();

  const actions = React.useMemo<MenuAction[]>(() => {
    const isIOS = Platform.OS === "ios";
    const imageColor = Colors[theme].text;
    const groups: MenuAction[] = getProfileMenuSections().map((section) => ({
      title: "",
      displayInline: true,
      subactions: section.map((item) => ({
        id: item.id,
        title: item.title,
        image: isIOS ? item.symbol : undefined,
        imageColor: isIOS ? (item.color ?? imageColor) : undefined,
      })),
    }));

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
    ({ nativeEvent: { event } }: any) => navigate(event),
    [navigate],
  );

  // On the Mac the profile menu lives at the bottom of the sidebar.
  if (IS_MAC) return null;

  return (
    <DropdownMenu
      ref={menuRef}
      themeVariant={Platform.OS === "ios" ? theme : undefined}
      isAnchoredToRight={Platform.OS === "android" ? true : undefined}
      actions={actions}
      onPressAction={onPressAction}
      shouldOpenOnLongPress={false}
      style={{
        // 32 matches SearchHeaderButton's HeaderIconButton box so the two
        // header icons read as the same size on Android.
        width: Platform.OS === "android" ? 32 : 36,
        height: Platform.OS === "android" ? 32 : 36,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "transparent",
      }}
    >
      <ProfileMenuIcon theme={theme} />
    </DropdownMenu>
  );
}
