import { Stack } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

import { HeaderTrailingActions } from '@/components/navigation/header-trailing-actions';
import { ProfileHeaderMenuButton } from '@/components/navigation/profile-header-menu-button';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { t } from '@/i18n';

export default function ExploreLayout() {
  const theme = useColorScheme() ?? 'light';
  const headerTitleAlign: 'left' | 'center' = 'left';

  return (
    <Stack
      screenOptions={{
        headerLargeTitle: Platform.OS === 'ios',
        headerShadowVisible: false,
        contentStyle: { backgroundColor: Colors[theme].background },
        headerTintColor: Colors[theme].text,
        headerTitleAlign,
        headerTitleStyle: { color: Colors[theme].text },
        headerLargeTitleStyle: { color: Colors[theme].text },
      }}>
      <Stack.Screen
        name="index"
        options={{
          title: t('tabs.projects'),
          headerBackButtonDisplayMode: 'minimal',
          headerBackVisible: false,
          headerLeft: () => <ProfileHeaderMenuButton />,
          headerRight: () => <HeaderTrailingActions theme={theme} showFilter={false} />,
        }}
      />
    </Stack>
  );
}
