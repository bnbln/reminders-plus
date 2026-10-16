import React from 'react';
import { Platform, Pressable, StyleSheet, View, type Insets, type PressableProps } from 'react-native';

import { rippleBorderless } from '@/components/ui/ripple';

type HeaderIconButtonProps = Omit<PressableProps, 'style'> & {
  children: React.ReactNode;
  hitSlop?: Insets | number;
  size?: number;
};

export function HeaderIconButton({
  children,
  hitSlop = 10,
  size = 32,
  ...pressableProps
}: HeaderIconButtonProps) {
  const shapeStyle = {
    width: size,
    height: size,
    minWidth: size,
    maxWidth: size,
    minHeight: size,
    maxHeight: size,
    borderRadius: size / 2,
  } as const;

  return (
    <View style={[styles.container, shapeStyle]}>
      <Pressable
        {...pressableProps}
        hitSlop={hitSlop}
        android_ripple={rippleBorderless(size / 2)}
        style={({ pressed }) => [
          styles.pressable,
          shapeStyle,
          // Android shows the ripple instead; dimming on top of it reads muddy.
          { opacity: pressed && Platform.OS !== 'android' ? 0.6 : 1 },
        ]}
      >
        {children}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    flexGrow: 0,
    flexShrink: 0,
    overflow: 'hidden',
  },
  pressable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
