import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { GlassSurface, withAlpha } from './glass-surface';

type Props = {
  onPress: () => void;
  style?: ViewStyle;
  accessibilityLabel?: string;
};

export function FloatingAddButton({ onPress, style, accessibilityLabel }: Props) {
  const theme = useColorScheme() ?? 'light';
  const insets = useSafeAreaInsets();

  // iOS system blue-ish tint for the glass.
  const blue = '#0A84FF';

  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? 'Hinzufügen'}
      style={[
        styles.position,
        {
          // Sit close to the native tab bar (slightly overlapping is OK).
          bottom: Math.max(0, insets.bottom - 8),
        },
        style,
      ]}
    >
      <GlassSurface
        style={styles.glass}
        glassEffectStyle="regular"
        tintColor={withAlpha(blue, theme === 'dark' ? 0.28 : 0.22)}
        fallbackBackgroundColor={withAlpha(Colors[theme].background, theme === 'dark' ? 0.72 : 0.9)}
      >
        <MaterialIcons name="add" size={28} color={theme === 'dark' ? 'white' : 'black'} />
      </GlassSurface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  position: {
    position: 'absolute',
    right: 18,
    zIndex: 100,
  },
  glass: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
});
