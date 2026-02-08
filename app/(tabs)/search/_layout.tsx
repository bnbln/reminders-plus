import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';
import { isRtlLocale, t } from '@/i18n';

export default function SearchLayout() {
  const router = useRouter();
  const searchBarRef = React.useRef<any>(null);
  const headerTextAlign = isRtlLocale() ? 'right' : 'left';

  return (
    <Stack
      screenOptions={{
        headerLargeTitle: Platform.OS === 'ios',
        headerShadowVisible: false,
        headerShown: true,
        headerTitleAlign: headerTextAlign,
        headerTitleStyle: { textAlign: headerTextAlign },
        headerLargeTitleStyle: { textAlign: headerTextAlign },
        // headerTintColor: Colors[theme].text,
        // headerTitleStyle: { color: Colors[theme].text },
        // headerLargeTitleStyle: { color: Colors[theme].text },
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
