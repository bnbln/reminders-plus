import { Stack } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';
import { isRtlLocale, t } from '@/i18n';

export default function RoutinesTabLayout() {
  const headerTextAlign = isRtlLocale() ? 'right' : 'left';

  return (
    <Stack
      screenOptions={{
        headerLargeTitle: Platform.OS === 'ios',
        headerShadowVisible: false,
        headerTitleAlign: headerTextAlign,
        headerTitleStyle: { textAlign: headerTextAlign },
        headerLargeTitleStyle: { textAlign: headerTextAlign },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: t('routinesTest.title'),
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
    </Stack>
  );
}
