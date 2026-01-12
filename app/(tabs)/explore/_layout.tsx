import { Stack } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function ExploreLayout() {
    const theme = useColorScheme() ?? 'light';

    return (
        <Stack
            screenOptions={{
                headerLargeTitle: Platform.OS === 'ios',
                headerShadowVisible: false,
                headerTintColor: Colors[theme].text,
                headerTitleStyle: { color: Colors[theme].text },
                headerLargeTitleStyle: { color: Colors[theme].text },
            }}>
            <Stack.Screen
                name="index"
                options={{
                    title: 'Projects',
                    headerBackButtonDisplayMode: 'minimal',
                }}
            />
        </Stack>
    );
}
