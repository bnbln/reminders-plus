import { Stack, useLocalSearchParams, useRouter, type NativeStackHeaderItem } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import React from "react";
import { Keyboard, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PagePane, useIsRegularWidth, usePageDimensions, useVerticalBarActive } from "@/components/navigation/vertical-bar-safe-area";
import { useNativeFilterHeaderItems } from "@/components/navigation/native-header-action-items";
import { TaskDetailContent } from "@/components/tasks/task-detail-content";
import { Colors } from "@/constants/theme";
import { TaskWorkspaceContext } from "@/context/task-workspace-context";
import { useTasksStore } from "@/context/tasks-store";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { t } from "@/i18n";
import type { TaskWorkspaceProps } from "./task-workspace";

/** Keep navigation, Duo controls and UITabAccessory in the existing UIKit shell. */
export function TaskWorkspace({ children, homeFilters, projectId, showBack }: TaskWorkspaceProps) {
  const theme = useColorScheme() ?? "light";
  const router = useRouter();
  const regular = useIsRegularWidth();
  const verticalBar = useVerticalBarActive();
  const { width } = usePageDimensions();
  const safe = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { selectedTaskId: selectedParam } = useLocalSearchParams<{ selectedTaskId?: string }>();
  const { tasks, hasHydrated } = useTasksStore();
  const task = tasks.find(item => item.id === selectedParam && !item.deletedAt);
  const selectedTaskId = hasHydrated && !task ? undefined : selectedParam;
  const filters = useNativeFilterHeaderItems({
    showCompletedTasksToggle: homeFilters, showProjectTasksToggle: homeFilters,
    showRoutineTasksToggle: homeFilters,
  });
  const split = regular && width >= 680;
  const openTask = React.useCallback((id: string) => {
    Keyboard.dismiss();
    if (split) router.setParams({ selectedTaskId: id });
    else router.push({ pathname: "/task/[id]", params: { id } });
  }, [router, split]);
  const closeDetail = React.useCallback(() => {
    Keyboard.dismiss();
    router.setParams({ selectedTaskId: undefined });
  }, [router]);
  React.useEffect(() => {
    if (hasHydrated && selectedParam && !selectedTaskId) closeDetail();
  }, [hasHydrated, selectedParam, selectedTaskId, closeDetail]);
  const state = React.useMemo(() => ({ selectedTaskId, openTask }), [selectedTaskId, openTask]);
  const back: NativeStackHeaderItem = {
    type: "button", label: t("taskDetail.back"),
    icon: { type: "sfSymbol", name: "chevron.backward" }, onPress: closeDetail,
  };
  return <TaskWorkspaceContext.Provider value={state}>
    {/* These are UIKit bar items in the existing Duo rail, not an extra toolbar. */}
    <Stack.Screen options={{ headerShown: true,
      unstable_headerLeftItems: selectedTaskId
        ? () => verticalBar ? [back, ...(projectId ? [] : filters)] : [back]
        : verticalBar && !projectId && !showBack ? () => filters : undefined,
    }} />
    <View style={{ flex: 1, flexDirection: "row" }}>
      <View style={{ flex: 1, ...(selectedTaskId && split ? { flex: undefined, width: Math.max(300, Math.min(420, width * 0.4)) } : {}),
        ...(selectedTaskId && !split ? { display: "none" } : {}) }}>
        <PagePane>{children}</PagePane>
      </View>
      {selectedTaskId ? <View style={{ flex: 1,
        paddingTop: split ? headerHeight + 12 : headerHeight,
        paddingBottom: split ? safe.bottom + 12 : 0,
        paddingLeft: split ? 12 : 0, paddingRight: split ? 12 : 0 }}>
        <View testID="task-detail-pane" style={{ flex: 1, backgroundColor: Colors[theme].background,
          borderRadius: split ? 32 : 0, borderCurve: "continuous", overflow: "hidden" }}>
          <PagePane><TaskDetailContent key={selectedTaskId} taskId={selectedTaskId}
            embedded onClose={closeDetail} /></PagePane>
        </View>
      </View> : null}
    </View>
  </TaskWorkspaceContext.Provider>;
}
