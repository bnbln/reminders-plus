import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolView, SymbolViewProps } from 'expo-symbols';
import { Platform, StyleProp } from 'react-native';

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
    style?: StyleProp<any>;
    weight?: SymbolViewProps['weight'];
}) {
    if (Platform.OS === 'ios') {
        return (
            <SymbolView
                name={name as any}
                size={size}
                tintColor={color}
                style={style as any}
                weight={weight}
            />
        );
    }

    return <MaterialIcons name="folder" size={size} color={color} style={style as any} />;
}
