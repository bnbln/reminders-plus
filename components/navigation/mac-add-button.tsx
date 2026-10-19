import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import React from "react";

import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { resolveCreateAction } from "@/components/ui/create-task-fab";
import { Colors } from "@/constants/theme";
import { useTaskCreateContext } from "@/context/task-create-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { IS_MAC } from "@/utils/mac";

/** The add action for the current page, as the iOS tab accessory and the Android FAB resolve it. */
export function useCreateActionHref() {
  const { mode, projectId, presetDateStart } = useTaskCreateContext();
  return React.useMemo(
    () => resolveCreateAction(mode, projectId, presetDateStart),
    [mode, presetDateStart, projectId],
  );
}

/**
 * The Mac has no tab bar accessory: the tabs are a sidebar there. The add
 * button sits in the page header instead, next to ⌘N in the menu bar.
 */
export function MacAddHeaderButton() {
  const router = useRouter();
  const theme = useColorScheme() ?? "light";
  const action = useCreateActionHref();

  if (!IS_MAC) return null;

  return (
    <HeaderIconButton
      accessibilityRole="button"
      accessibilityLabel={action.label}
      onPress={() => router.push(action.href as never)}
      size={36}
    >
      <SymbolView
        name="plus"
        tintColor={Colors[theme].text}
        style={{ width: 20, height: 20 }}
      />
    </HeaderIconButton>
  );
}
