import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolView, SymbolViewProps } from 'expo-symbols';
import { Platform, StyleProp } from 'react-native';

import { resolveMaterialIcon } from '@/constants/sf-symbols';

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
    const resolvedName =
        typeof name === 'string' && name.trim().length > 0 ? name.trim() : 'folder.fill';

    if (Platform.OS === 'ios') {
        return (
            <SymbolView
                name={resolvedName as any}
                size={size}
                tintColor={color}
                style={style as any}
                weight={weight}
            />
        );
    }

    return (
        <MaterialIcons
            name={resolveMaterialIcon(resolvedName)}
            size={size}
            color={color}
            style={style as any}
        />
    );
}
