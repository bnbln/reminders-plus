import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';
import { resolveThemeFromAppearanceMode, useAppSettings } from '@/context/settings-store';

type ResolvedColorScheme = 'light' | 'dark';

function normalizeScheme(value: unknown): ResolvedColorScheme | null {
  return value === 'dark' || value === 'light' ? value : null;
}

function getWebSystemScheme(): ResolvedColorScheme | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  const { appearanceMode, hasHydrated: hasSettingsHydrated } = useAppSettings();
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const hookScheme = normalizeScheme(useRNColorScheme());
  const webSystemScheme = normalizeScheme(getWebSystemScheme());
  const systemScheme = webSystemScheme ?? hookScheme ?? 'light';

  // Match browser scheme until both app settings and client render have hydrated.
  if (!hasHydrated || !hasSettingsHydrated) {
    return systemScheme;
  }

  return resolveThemeFromAppearanceMode(appearanceMode, systemScheme);
}
