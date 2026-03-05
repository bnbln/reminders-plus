import React from "react";
import { StyleSheet, View } from "react-native";

import { AssistHeaderButton } from "@/components/assist/assist-header-button";
import { FilterMenuButton } from "@/components/tasks/filter-menu-button";
import { Colors } from "@/constants/theme";

type HeaderTrailingActionsProps = {
  theme: keyof typeof Colors;
  hiddenTags?: React.ComponentProps<typeof FilterMenuButton>["hiddenTags"];
  showFilter?: boolean;
};

export function HeaderTrailingActions({
  theme,
  hiddenTags,
  showFilter = true,
}: HeaderTrailingActionsProps) {
  if (!showFilter) {
    return <AssistHeaderButton />;
  }

  return (
    <View style={styles.row}>
      <FilterMenuButton theme={theme} hiddenTags={hiddenTags} />
      <AssistHeaderButton />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 16,
    marginHorizontal: 3,
  },
});
