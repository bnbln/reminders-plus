import { Stack } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';
import { t } from '@/i18n';

export default function RoutinesTabLayout() {
  return (
    <Stack
      screenOptions={{
        headerLargeTitle: Platform.OS === 'ios',
        headerShadowVisible: false,
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
