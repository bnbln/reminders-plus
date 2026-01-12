
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolView, SymbolViewProps } from 'expo-symbols';
import { StyleProp, ViewStyle } from 'react-native';

export function SFSymbol({
    name,
    size = 24,
    color,
    style,
    weight = 'regular',
}: {
    name: string;
    size?: number;
    color: string;
    style?: StyleProp<ViewStyle>;
    weight?: SymbolViewProps['weight'];
}) {
    // Cast style to any as simple workaround for library type mismatch on style props
    return (
        <SymbolView
            name={name as any}
            size={size}
            tintColor={color}
            style={style as any}
            weight={weight}
        />
    );
    // Fallback for Android/Web (using MaterialIcons or generic)
    // For now, mapping a few or showing a generic icon
    return <MaterialIcons name="folder" size={size} color={color} style={style} />;
}
