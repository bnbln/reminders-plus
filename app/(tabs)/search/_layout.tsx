import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { isRtlLocale, t } from '@/i18n';

export default function SearchLayout() {
  const router = useRouter();
  const searchBarRef = React.useRef<any>(null);
  const theme = useColorScheme() ?? 'light';
  const headerTextAlign = isRtlLocale() ? 'right' : 'left';

  return (
    <Stack
      screenOptions={{
        headerLargeTitle: Platform.OS === 'ios',
        headerShadowVisible: false,
        headerShown: true,
        contentStyle: { backgroundColor: Colors[theme].background },
        headerTintColor: Colors[theme].text,
        headerTitleAlign: headerTextAlign,
        headerTitleStyle: { color: Colors[theme].text, textAlign: headerTextAlign },
        headerLargeTitleStyle: { color: Colors[theme].text, textAlign: headerTextAlign },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: t('tabs.search'),
          headerSearchBarOptions: {
            placement: 'automatic',
            placeholder: t('search.placeholder'),
            cancelButtonText: t('taskDetail.alert.cancel'),
            autoFocus: true,
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
