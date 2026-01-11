import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { Platform, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { GlassSurface, withAlpha } from './glass-surface';

type Props = {
  onPress: () => void;
  style?: ViewStyle;
  accessibilityLabel?: string;
  placement?: 'accessory' | 'overlay';
  tabBarHeight?: number;
};

const DEFAULT_TAB_BAR_HEIGHT = {
  ios: 49,
  android: 56,
  default: 0,
} as const;

export function FloatingAddButton({
  onPress,
  style,
  accessibilityLabel,
  placement = 'accessory',
  tabBarHeight,
}: Props) {
  const theme = useColorScheme() ?? 'light';
  const insets = useSafeAreaInsets();

  const resolvedTabBarHeight =
    tabBarHeight ?? Platform.select({ ios: DEFAULT_TAB_BAR_HEIGHT.ios, android: DEFAULT_TAB_BAR_HEIGHT.android, default: 0 });
  const bottomOffset =
    placement === 'overlay'
      ? Math.max(0, insets.bottom - 8)
      : Math.max(0, insets.bottom + resolvedTabBarHeight + 12);

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
          // Accessory sits above the tab bar; overlay can overlap it.
          bottom: bottomOffset,
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
