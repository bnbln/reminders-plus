import { Stack } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { isRtlLocale, t } from '@/i18n';

export default function ExploreLayout() {
    const theme = useColorScheme() ?? 'light';
    const headerTextAlign = isRtlLocale() ? 'right' : 'left';

    return (
        <Stack
            screenOptions={{
                headerLargeTitle: Platform.OS === 'ios',
                headerShadowVisible: false,
                contentStyle: { backgroundColor: Colors[theme].background },
                headerTintColor: Colors[theme].text,
                headerTitleAlign: headerTextAlign,
                headerTitleStyle: { color: Colors[theme].text, textAlign: headerTextAlign },
                headerLargeTitleStyle: { color: Colors[theme].text, textAlign: headerTextAlign },
            }}>
            <Stack.Screen
                name="index"
                options={{
                    title: t('tabs.projects'),
                    headerBackButtonDisplayMode: 'minimal',
                    headerBackVisible: false,
                    headerLeft: () => null,
                }}
            />
        </Stack>
    );
}
