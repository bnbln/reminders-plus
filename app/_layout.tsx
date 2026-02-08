import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { I18nManager } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { HomeFiltersProvider } from '@/context/home-filters-store';
import { TaskCreateProvider } from '@/context/task-create-context';
import { TasksProvider } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { isRtlLocale, t } from '@/i18n';
import { initTaskNotifications } from '@/notifications/tasks-notifications';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  React.useEffect(() => {
    void initTaskNotifications();
  }, []);

  React.useEffect(() => {
    const shouldBeRtl = isRtlLocale();
    if (I18nManager.isRTL !== shouldBeRtl) {
      I18nManager.allowRTL(shouldBeRtl);
      I18nManager.forceRTL(shouldBeRtl);
      if (__DEV__) {
        console.info('RTL wurde aktualisiert. Bitte die App neu starten.');
      }
    }
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <TasksProvider>
        <TaskCreateProvider>
          <HomeFiltersProvider>
            <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
              <Stack>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen
                  name="task/create-modal"
                  options={{
                    // Zurück zum alten Styling: transparentes Overlay ohne Header
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
                    contentStyle: { backgroundColor: 'transparent' },
                  } as any}
                />
                <Stack.Screen
                  name="task/date-picker"
                  options={{
                    presentation: 'formSheet',
                    contentStyle: { backgroundColor: 'transparent' },
                  }}
                />
                <Stack.Screen
                  name="task/project-picker"
                  options={{
                    presentation: 'formSheet',
                    contentStyle: { backgroundColor: 'transparent' },
                  }}
                />
                <Stack.Screen
                  name="task/emoji-picker"
                  options={{
                    presentation: 'formSheet',
                    contentStyle: { backgroundColor: 'transparent' },
                  }}
                />
                <Stack.Screen name="task/[id]" options={{ title: t('common.task') }} />
                <Stack.Screen name="project/[id]" options={{ title: t('common.project') }} />
                <Stack.Screen
                  name="project/edit-modal"
                  options={{
                    presentation: 'formSheet',
                    contentStyle: { backgroundColor: 'transparent' },
                  }}
                />
                <Stack.Screen
                  name="modal"
                  options={{
                    presentation: 'formSheet',
                    contentStyle: { backgroundColor: 'transparent' },
                    title: t('modal.newTask')
                  }}
                />
              </Stack>
              <StatusBar style="auto" />
            </ThemeProvider>
          </HomeFiltersProvider>
        </TaskCreateProvider>
      </TasksProvider>
    </GestureHandlerRootView>
  );
}
