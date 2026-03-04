import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AssistHeaderButton } from '@/components/assist/assist-header-button';
import { FilterMenuButton } from '@/components/tasks/filter-menu-button';
import { Colors } from '@/constants/theme';

type HeaderTrailingActionsProps = {
  theme: keyof typeof Colors;
  hiddenTags?: React.ComponentProps<typeof FilterMenuButton>['hiddenTags'];
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
      <AssistHeaderButton />
      <View
        style={[
          styles.divider,
          {
            backgroundColor:
              theme === 'dark' ? 'rgba(255,255,255,0.26)' : 'rgba(17,24,28,0.18)',
          },
        ]}
      />
      <FilterMenuButton theme={theme} hiddenTags={hiddenTags} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 16,
    marginHorizontal: 3,
  },
});
