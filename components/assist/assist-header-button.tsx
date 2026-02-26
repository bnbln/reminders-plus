import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Platform } from 'react-native';

import { HeaderIconButton } from '@/components/ui/header-icon-button';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function AssistHeaderButton() {
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const color = Colors[theme].text;

  return (
    <HeaderIconButton
      accessibilityRole="button"
      accessibilityLabel="Assist"
      onPress={() => router.push('/assist')}
    >
      {Platform.OS === 'ios' ? (
        <SymbolView
          name="sparkles"
          tintColor={color}
          style={{ width: 20, height: 20 }}
        />
      ) : (
        <MaterialIcons name="auto-awesome" size={20} color={color} />
      )}
    </HeaderIconButton>
  );
}
