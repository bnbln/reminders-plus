import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View, ViewStyle } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
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

type PillProps = {
  onPress: () => void;
  onLongPress?: () => void;
  label?: string;
  minimized?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
  tabBarHeight?: number;
};

export function FloatingAddPillButton({
  onPress,
  onLongPress,
  label = 'Task hinzufügen',
  minimized = false,
  style,
  accessibilityLabel,
  tabBarHeight,
}: PillProps) {
  const theme = useColorScheme() ?? 'light';
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

  const resolvedTabBarHeight =
    tabBarHeight ?? Platform.select({ ios: DEFAULT_TAB_BAR_HEIGHT.ios, android: DEFAULT_TAB_BAR_HEIGHT.android, default: 0 });

  // Base position: above the (non-minimized) tab bar.
  const bottomBase = Math.max(0, insets.bottom + resolvedTabBarHeight + 12);
  // Minimized target: dock near the home indicator / bottom, similar to Safari/Music.
  const minimizedTranslateY = resolvedTabBarHeight + 16;

  const progress = useSharedValue(minimized ? 1 : 0);
  React.useEffect(() => {
    progress.value = withSpring(minimized ? 1 : 0, {
      damping: 22,
      stiffness: 260,
      mass: 0.9,
    });
  }, [minimized, progress]);

  const expandedWidth = React.useMemo(() => {
    const target = Math.round(screenWidth * 0.86);
    return Math.max(260, Math.min(420, target));
  }, [screenWidth]);

  const minimizedWidth = React.useMemo(() => {
    const target = Math.round(screenWidth * 0.54);
    return Math.max(196, Math.min(300, target));
  }, [screenWidth]);

  const animStyle = useAnimatedStyle(() => {
    // When minimized, move the pill down (no scaling to avoid distortion).
    const translateY = interpolate(progress.value, [0, 1], [0, minimizedTranslateY]);
    return {
      transform: [{ translateY }],
    };
  }, [minimizedTranslateY]);

  const animWidthStyle = useAnimatedStyle(() => {
    const width = interpolate(progress.value, [0, 1], [expandedWidth, minimizedWidth]);
    return { width };
  }, [expandedWidth, minimizedWidth]);

  const animInnerPaddingStyle = useAnimatedStyle(() => {
    const paddingHorizontal = interpolate(progress.value, [0, 1], [16, 8]);
    return { paddingHorizontal };
  }, []);

  const animContentStyle = useAnimatedStyle(() => {
    const scale = interpolate(progress.value, [0, 1], [1, 0.92]);
    return { transform: [{ scale }] };
  }, []);

  const isDark = theme === 'dark';
  const blue = '#0A84FF';
  const onBlueText = isDark ? 'white' : 'black';

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        stylesPill.position,
        {
          bottom: bottomBase,
          left: 0,
          right: 0,
        },
        animStyle,
        style,
      ]}
    >
      <View style={stylesPill.center} pointerEvents="box-none">
        <Animated.View style={[animWidthStyle, style]}>
          <Pressable
            onPress={onPress}
            onLongPress={onLongPress}
            delayLongPress={350}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? label}
            style={({ pressed }) => [stylesPill.pressable, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }]}
          >
            <GlassSurface
              style={stylesPill.glass}
              glassEffectStyle="regular"
              tintColor={withAlpha(blue, isDark ? 0.34 : 0.22)}
              fallbackBackgroundColor={isDark ? withAlpha(blue, 0.94) : withAlpha(Colors.light.background, 0.96)}
              isInteractive
            >
              <Animated.View style={[stylesPill.inner, animInnerPaddingStyle, animContentStyle]}>
                <MaterialIcons name="add" size={20} color={onBlueText} />
                <Text style={[stylesPill.label, { color: onBlueText }]} numberOfLines={1}>
                  {label}
                </Text>
              </Animated.View>
            </GlassSurface>
          </Pressable>
        </Animated.View>
      </View>
    </Animated.View>
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

const stylesPill = StyleSheet.create({
  position: {
    position: 'absolute',
    zIndex: 120,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressable: {
    width: '100%',
  },
  glass: {
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
