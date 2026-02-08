import { Appearance, useColorScheme as useRNColorScheme } from 'react-native';

type ResolvedColorScheme = 'light' | 'dark';

export function useColorScheme(): ResolvedColorScheme {
  const colorScheme = useRNColorScheme();
  if (colorScheme === 'light' || colorScheme === 'dark') {
    return colorScheme;
  }

  const appearanceScheme = Appearance.getColorScheme();
  if (appearanceScheme === 'light' || appearanceScheme === 'dark') {
    return appearanceScheme;
  }

  return 'light';
}
