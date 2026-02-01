import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

export default function SearchLayout() {
  const router = useRouter();
  const searchBarRef = React.useRef<any>(null);
  const { q } = useLocalSearchParams<{ q?: string }>();

  return (
    <Stack
      screenOptions={{
        headerLargeTitle: Platform.OS === 'ios',
        headerShadowVisible: false,
        headerShown: true,
        // headerTintColor: Colors[theme].text,
        // headerTitleStyle: { color: Colors[theme].text },
        // headerLargeTitleStyle: { color: Colors[theme].text },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Search',
          headerSearchBarOptions: {
            placement: 'automatic',
            placeholder: 'Tasks durchsuchen',
            autoFocus: true,
            ref: searchBarRef,
            //hideWhenScrolling: false,
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
