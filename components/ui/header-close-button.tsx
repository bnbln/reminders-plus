import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { HeaderIconButton } from '@/components/ui/header-icon-button';

type HeaderCloseButtonProps = Omit<React.ComponentProps<typeof HeaderIconButton>, 'children'> & {
  color: string;
};

export function HeaderCloseButton({ color, ...buttonProps }: HeaderCloseButtonProps) {
  return (
    <HeaderIconButton {...buttonProps}>
      {Platform.OS === 'ios' ? (
        <View style={styles.iconSlot}>
          <SymbolView
            name="xmark"
            size={16}
            weight="semibold"
            tintColor={color}
            style={styles.iosIcon}
          />
        </View>
      ) : (
        <MaterialIcons name="close" size={22} color={color} />
      )}
    </HeaderIconButton>
  );
}

const styles = StyleSheet.create({
  iconSlot: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iosIcon: {
    transform: [{ translateX: 0.75 }, { translateY: 1 }],
  },
});
