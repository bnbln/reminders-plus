import React from "react";
import { StyleSheet, View } from "react-native";

import { MacAddHeaderButton } from "@/components/navigation/mac-add-button";
import { ProfileHeaderMenuButton } from "@/components/navigation/profile-header-menu-button";
import { SearchHeaderButton } from "@/components/navigation/search-header-button";

export function HeaderActions() {
  return (
    <View style={styles.row}>
      <SearchHeaderButton />
      <ProfileHeaderMenuButton />
      <MacAddHeaderButton />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
