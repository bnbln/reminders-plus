import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { HomeFiltersProvider } from '@/context/home-filters-store';
import { TasksProvider } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { initTaskNotifications } from '@/notifications/tasks-notifications';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  React.useEffect(() => {
    void initTaskNotifications();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <TasksProvider>
        <HomeFiltersProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="task/create-modal"
                options={{
                  presentation: 'transparentModal',
                  headerShown: false,
                  contentStyle: { backgroundColor: 'transparent' },
                  animation: 'fade',
                }}
              />
              <Stack.Screen
                name="task/routine-picker"
                options={{
                  presentation: 'formSheet',
                  sheetCornerRadius: 50,
                  contentStyle: { backgroundColor: 'transparent' },
                  headerShown: false,
                } as any}
              />
              <Stack.Screen name="task/[id]" options={{ title: 'Task' }} />
              <Stack.Screen name="project/[id]" options={{ title: 'Projekt' }} />
              <Stack.Screen name="project/edit-modal" options={{ presentation: 'modal', title: 'Projekt bearbeiten' }} />
              <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
            </Stack>
            <StatusBar style="auto" />
          </ThemeProvider>
        </HomeFiltersProvider>
      </TasksProvider>
    </GestureHandlerRootView>
  );
}
