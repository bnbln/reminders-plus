import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { HomeFiltersProvider } from '@/context/home-filters-store';
import { TasksProvider } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <TasksProvider>
        <HomeFiltersProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
