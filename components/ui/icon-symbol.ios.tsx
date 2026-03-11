import { SymbolView, SymbolViewProps, SymbolWeight } from 'expo-symbols';
import { StyleProp, ViewStyle } from 'react-native';

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
  weight = 'regular',
}: {
  name: SymbolViewProps['name'];
  size?: number;
  color: string;
  style?: StyleProp<ViewStyle>;
  weight?: SymbolWeight;
}) {
  const resolvedName =
    typeof name === 'string' && name.trim().length > 0
      ? name
      : ('questionmark.circle' as SymbolViewProps['name']);

  return (
    <SymbolView
      weight={weight}
      tintColor={color}
      resizeMode="scaleAspectFit"
      name={resolvedName}
      style={[
        {
          width: size,
          height: size,
        },
        style,
      ]}
    />
  );
}
