// Fallback for using Material Design icons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight } from 'expo-symbols';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

import { resolveMaterialIcon } from '@/constants/sf-symbols';

/**
 * An icon component that uses native SF Symbols on iOS, and Material Design icons on
 * Android and web. Names are SF Symbols; the Android mapping lives in
 * `constants/sf-symbols.ts`.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: string;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return (
    <MaterialIcons
      color={color}
      size={size}
      name={resolveMaterialIcon(name)}
      style={style}
    />
  );
}
