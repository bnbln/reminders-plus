import { Appearance, useColorScheme as useRNColorScheme } from 'react-native';
import { resolveThemeFromAppearanceMode, useAppSettings } from '@/context/settings-store';

type ResolvedColorScheme = 'light' | 'dark';

function normalizeScheme(value: unknown): ResolvedColorScheme | null {
  return value === 'dark' || value === 'light' ? value : null;
}

export function useColorScheme(): ResolvedColorScheme {
  const { appearanceMode, hasHydrated } = useAppSettings();
  const hookScheme = normalizeScheme(useRNColorScheme());
  const appearanceScheme = normalizeScheme(Appearance.getColorScheme());
  const systemScheme = appearanceScheme ?? hookScheme ?? 'light';

  // Before settings hydrate we stay on the device scheme to avoid a light flash on cold start.
  if (!hasHydrated) return systemScheme;

  return resolveThemeFromAppearanceMode(appearanceMode, systemScheme);
}
