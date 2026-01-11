import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable } from 'react-native';

function AddOrConfirmButton() {
  const router = useRouter();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const text = typeof q === 'string' ? q.trim() : '';
  const canSubmit = text.length > 0;

  return (
    <Pressable
      onPress={() => {
        if (!canSubmit) return;
        router.setParams({ q: '' });
        router.navigate({ pathname: '/', params: { action: 'add', title: text } });
      }}
      disabled={!canSubmit}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={canSubmit ? 'Erinnerung hinzufuegen' : 'Text eingeben'}
      style={{ opacity: canSubmit ? 1 : 0.4 }}>
      <MaterialIcons name={canSubmit ? 'check' : 'add'} size={26} />
    </Pressable>
  );
}

export default function SearchLayout() {
  const router = useRouter();
  const searchBarRef = React.useRef<any>(null);

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Hinzufügen',
          headerSearchBarOptions: {
            placement: 'automatic',
            placeholder: 'Hinzufügen',
            autoFocus: true,
            ref: searchBarRef,
            onFocus: () => {
              // iOS 26 shows a cancel "X" button; we don't need it for add.
              searchBarRef.current?.toggleCancelButton?.(false);
            },
            onChangeText: (event: any) => {
              router.setParams({
                q: String(event?.nativeEvent?.text ?? ''),
              });
            },
          },
          headerRight: () => <AddOrConfirmButton />,
        }}
      />
    </Stack>
  );
}
