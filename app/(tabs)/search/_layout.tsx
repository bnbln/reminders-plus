import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { Pressable } from 'react-native';

export default function SearchLayout() {
  const router = useRouter();

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Hinzufügen',
          headerSearchBarOptions: {
            placement: 'automatic',
            placeholder: 'Hinzufügen',
            autoFocus: true
          },
          headerRight: () => (
            <Pressable
              onPress={() => router.navigate({ pathname: '/', params: { action: 'add' } })}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Neue Erinnerung">
              <MaterialIcons name="add" size={26} />
            </Pressable>
          ),
        }}
      />
    </Stack>
  );
}
