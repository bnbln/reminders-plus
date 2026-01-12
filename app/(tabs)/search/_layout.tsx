import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

export default function SearchLayout() {
  const router = useRouter();
  const searchBarRef = React.useRef<any>(null);
  const { q } = useLocalSearchParams<{ q?: string }>();

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Search',
          headerSearchBarOptions: {
            placement: 'automatic',
            placeholder: 'Tasks durchsuchen',
            autoFocus: true,
            ref: searchBarRef,
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
          headerRight: () => (
            <MaterialIcons
              name={typeof q === 'string' && q.trim().length > 0 ? 'close' : 'search'}
              size={22}
              style={{ opacity: typeof q === 'string' && q.trim().length > 0 ? 1 : 0.45 }}
              onPress={() => {
                if (typeof q === 'string' && q.trim().length > 0) router.setParams({ q: '' });
              }}
            />
          ),
        }}
      />
    </Stack>
  );
}
