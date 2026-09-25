import {
  useVerticalBarActive,
  verticalBarTabScreenLayout,
} from "@/components/navigation/vertical-bar-safe-area";
import { useNativeProfileHeaderActionItems } from "@/components/navigation/native-header-action-items";
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

import { ProfileHeaderMenuButton } from '@/components/navigation/profile-header-menu-button';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { t } from '@/i18n';

export default function SearchLayout() {
  const router = useRouter();
  const searchBarRef = React.useRef<any>(null);
  const theme = useColorScheme() ?? 'light';
  const hasVerticalBar = useVerticalBarActive();
  const nativeHeaderActions = useNativeProfileHeaderActionItems();
  const headerTitleAlign: 'left' | 'center' = 'left';

  return (
    <Stack
      screenLayout={verticalBarTabScreenLayout}
      screenOptions={{
        headerLargeTitle: Platform.OS === 'ios',
        headerShadowVisible: false,
        // Let the page background run behind the top app bar.
        headerTransparent: true,
        headerStyle: { backgroundColor: 'transparent' },
        headerShown: true,
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
          title: t('tabs.search'),
          headerRight: () => <ProfileHeaderMenuButton />,
          unstable_headerRightItems: hasVerticalBar
            ? () => nativeHeaderActions
            : undefined,
          headerSearchBarOptions: {
            placement: 'automatic',
            placeholder: t('search.placeholder'),
            cancelButtonText: t('taskDetail.alert.cancel'),
            // Android expands the search bar into the header row on focus, which
            // squeezes `headerRight` off the leading edge. Let the user open it.
            autoFocus: Platform.OS === 'ios',
            ref: searchBarRef,
            hideWhenScrolling: false,
            onFocus: () => {
              // iOS 26 shows a cancel "X" button; keep it minimal.
              if (Platform.OS === 'ios') searchBarRef.current?.toggleCancelButton?.(false);
            },
            onChangeText: (event: any) => {
              router.setParams({
                q: String(event?.nativeEvent?.text ?? ''),
              });
            },
          },

        }}
      />
    </Stack>
  );
}
