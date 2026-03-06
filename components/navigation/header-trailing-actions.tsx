import React from "react";

import { FilterMenuButton } from "@/components/tasks/filter-menu-button";
import { Colors } from "@/constants/theme";

type HeaderTrailingActionsProps = {
  theme: keyof typeof Colors;
  hiddenTags?: React.ComponentProps<typeof FilterMenuButton>["hiddenTags"];
  showFilter?: boolean;
  showCompletedTasksToggle?: boolean;
};

export function HeaderTrailingActions({
  theme,
  hiddenTags,
  showFilter = true,
  showCompletedTasksToggle = false,
}: HeaderTrailingActionsProps) {
  if (!showFilter) {
    return null;
  }

  return (
    <FilterMenuButton
      theme={theme}
      hiddenTags={hiddenTags}
      showCompletedTasksToggle={showCompletedTasksToggle}
    />
  );
}
