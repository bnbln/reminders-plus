import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { Platform, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { t } from '@/i18n';
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

  const primaryBlue = '#0070E1';

  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? t('home.addTask')}
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
        tintColor={withAlpha(primaryBlue, theme === 'dark' ? 0.44 : 0.32)}
        fallbackBackgroundColor={primaryBlue}
      >
        <MaterialIcons name="add" size={28} color="white" />
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
