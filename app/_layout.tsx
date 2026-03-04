import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Appearance, I18nManager, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { HomeFiltersProvider } from '@/context/home-filters-store';
import { TaskCreateProvider } from '@/context/task-create-context';
import { TasksProvider } from '@/context/tasks-store';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { isRtlLocale, t } from '@/i18n';
import { initTaskNotifications } from '@/notifications/tasks-notifications';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const resolvedColorScheme = colorScheme ?? Appearance.getColorScheme();
  const theme = resolvedColorScheme === 'dark' ? 'dark' : 'light';
  const themedContentStyle = React.useMemo(
    () => ({ backgroundColor: Colors[theme].background }),
    [theme]
  );
  const navigationTheme = React.useMemo(() => {
    const baseTheme = theme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        background: Colors[theme].background,
        card: Colors[theme].background,
      },
    };
  }, [theme]);
  const tabLikeHeaderOptions = React.useMemo(
    () => ({
      contentStyle: themedContentStyle,
      headerBackButtonDisplayMode: 'minimal' as const,
      headerLargeTitle: Platform.OS === 'ios',
      headerTransparent: Platform.OS === 'ios',
      headerShadowVisible: false,
      headerTintColor: Colors[theme].text,
      headerTitleAlign: 'left' as const,
      headerTitleStyle: { color: Colors[theme].text },
      headerLargeTitleStyle: { color: Colors[theme].text },
    }),
    [theme, themedContentStyle]
  );

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
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors[theme].background }}>
      <TasksProvider>
        <TaskCreateProvider>
          <HomeFiltersProvider>
            <ThemeProvider value={navigationTheme}>
              <Stack
                screenOptions={{
                  contentStyle: themedContentStyle,
                }}>
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
                    contentStyle: themedContentStyle,
                  } as any}
                />
                <Stack.Screen
                  name="task/date-picker"
                  options={{
                    presentation: 'formSheet',
                    contentStyle: themedContentStyle,
                  }}
                />
                <Stack.Screen
                  name="task/location-picker"
                  options={{
                    presentation: 'formSheet',
                    contentStyle: themedContentStyle,
                  }}
                />
                <Stack.Screen
                  name="task/project-picker"
                  options={{
                    presentation: 'formSheet',
                    contentStyle: themedContentStyle,
                  }}
                />
                <Stack.Screen
                  name="task/emoji-picker"
                  options={{
                    presentation: 'formSheet',
                    contentStyle: themedContentStyle,
                  }}
                />
                <Stack.Screen name="task/[id]" options={{ title: t('common.task') }} />
                <Stack.Screen name="project/[id]" options={{ title: t('common.project') }} />
                <Stack.Screen
                  name="project/create-modal"
                  options={{
                    presentation: 'transparentModal',
                    headerShown: false,
                    contentStyle: { backgroundColor: 'transparent' },
                    animation: 'fade',
                  }}
                />
                <Stack.Screen
                  name="project/edit-modal"
                  options={{
                    presentation: 'transparentModal',
                    headerShown: false,
                    contentStyle: { backgroundColor: 'transparent' },
                    animation: 'fade',
                  }}
                />
                <Stack.Screen
                  name="modal"
                  options={{
                    presentation: 'formSheet',
                    contentStyle: themedContentStyle,
                    title: t('modal.newTask')
                  }}
                />
                <Stack.Screen
                  name="profile"
                  options={{
                    ...tabLikeHeaderOptions,
                    title: 'Profil',
                  }}
                />
                <Stack.Screen
                  name="status"
                  options={{
                    ...tabLikeHeaderOptions,
                    title: 'Status',
                  }}
                />
                <Stack.Screen
                  name="settings"
                  options={{
                    ...tabLikeHeaderOptions,
                    title: 'Einstellungen',
                  }}
                />
                <Stack.Screen
                  name="assist"
                  options={{
                    ...tabLikeHeaderOptions,
                    title: 'Assist',
                    headerLargeTitle: false,
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
