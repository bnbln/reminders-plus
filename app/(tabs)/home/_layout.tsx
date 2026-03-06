import { Stack } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { HeaderTrailingActions } from '@/components/navigation/header-trailing-actions';
import { ProfileHeaderMenuButton } from '@/components/navigation/profile-header-menu-button';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { t } from '@/i18n';

const INBOX_HIDDEN_FILTER_TAGS = ['overdue', 'datetime'] as const;

export default function HomeLayout() {
  const theme = useColorScheme() ?? 'light';
  const headerTitleAlign: 'left' | 'center' = 'left';

  return (
    <Stack
      screenOptions={{
        headerLargeTitle: Platform.OS === 'ios',
        headerShadowVisible: false,
        contentStyle: { backgroundColor: 'transparent' },
        headerTintColor: Colors[theme].text,
        headerTitleAlign,
        headerTitleStyle: { color: Colors[theme].text },
        headerLargeTitleStyle: { color: Colors[theme].text },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: t('common.today'),
          headerLeft: () => (
            <HeaderTrailingActions
              theme={theme}
              showCompletedTasksToggle={true}
            />
          ),
          headerRight: () => <ProfileHeaderMenuButton />,
        }}
      />
      <Stack.Screen
        name="archive"
        options={{
          title: t('archive.title'),
          headerTransparent: Platform.OS === 'ios',
          headerRight: () => <ProfileHeaderMenuButton />,
        }}
      />

      <Stack.Screen
        name="streaks"
        options={{
          title: t('home.quick.streaks'),
          headerLargeTitle: false,
          headerBackButtonDisplayMode: 'minimal',
          headerTransparent: Platform.OS === 'ios',
          headerRight: () => <ProfileHeaderMenuButton />,
        }}
      />
      <Stack.Screen
        name="inbox"
        options={{
          title: t('common.inbox'),
          headerLargeTitle: false,
          headerBackButtonDisplayMode: 'minimal',
          headerTransparent: Platform.OS === 'ios',
          headerLeft: () => (
            <HeaderTrailingActions
              theme={theme}
              hiddenTags={INBOX_HIDDEN_FILTER_TAGS}
            />
          ),
          headerRight: () => <ProfileHeaderMenuButton />,
        }}
      />
      <Stack.Screen
        name="routines"
        options={{
          title: t('home.quick.routines'),
          headerLargeTitle: false,
          headerBackButtonDisplayMode: 'minimal',
          headerTransparent: Platform.OS === 'ios',
          headerRight: () => (
            <View style={styles.headerRightRow}>
              <HeaderTrailingActions theme={theme} />
              <ProfileHeaderMenuButton />
            </View>
          ),
        }}
      />
      <Stack.Screen
        name="today"
        options={{
          title: t('common.today'),
          headerLargeTitle: false,
          headerBackButtonDisplayMode: 'minimal',
          headerTransparent: Platform.OS === 'ios',
          headerLeft: () => <HeaderTrailingActions theme={theme} />,
          headerRight: () => <ProfileHeaderMenuButton />,
        }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  headerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
