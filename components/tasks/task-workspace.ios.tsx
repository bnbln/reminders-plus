import { Stack } from "expo-router";
import React from "react";

import { PagePane, useVerticalBarActive } from "@/components/navigation/vertical-bar-safe-area";
import { useNativeFilterHeaderItems } from "@/components/navigation/native-header-action-items";
import type { TaskWorkspaceProps } from "./task-workspace";

/**
 * Task lists open details as full-screen pages on every iOS device. The split
 * detail column is parked on `park/task-split-view` until it can use a native
 * container that knows the Duo fold.
 */
export function TaskWorkspace({ children, homeFilters, projectId, showBack }: TaskWorkspaceProps) {
  const verticalBar = useVerticalBarActive();
  const filters = useNativeFilterHeaderItems({
    showCompletedTasksToggle: homeFilters, showProjectTasksToggle: homeFilters,
    showRoutineTasksToggle: homeFilters,
  });
  return <>
    {/* UIKit bar items in the existing Duo rail, not an extra toolbar. */}
    <Stack.Screen options={{ headerShown: true,
      unstable_headerLeftItems: verticalBar && !projectId && !showBack ? () => filters : undefined,
    }} />
    <PagePane>{children}</PagePane>
  </>;
}
