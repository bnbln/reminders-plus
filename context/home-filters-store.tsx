import React from 'react';

export type TagId = 'overdue' | 'datetime' | 'location' | 'project' | 'keywords';

export const TAG_ORDER: TagId[] = ['overdue', 'datetime', 'location', 'project', 'keywords'];

export const TAG_DEFS: Record<TagId, { title: string; iosSymbol: string }> = {
  overdue: { title: 'Overdue', iosSymbol: 'exclamationmark.triangle.fill' },
  datetime: { title: 'Date & Time', iosSymbol: 'calendar.badge.clock' },
  location: { title: 'Location', iosSymbol: 'location.fill' },
  project: { title: 'Project', iosSymbol: 'folder.fill' },
  keywords: { title: 'Keywords', iosSymbol: 'tag.fill' },
};

type HomeFiltersContextValue = {
  enabledTags: Set<TagId>;
  setEnabledTags: React.Dispatch<React.SetStateAction<Set<TagId>>>;
  showTagIcons: boolean;
  setShowTagIcons: React.Dispatch<React.SetStateAction<boolean>>;
};

const HomeFiltersContext = React.createContext<HomeFiltersContextValue | null>(null);

export function HomeFiltersProvider({ children }: { children: React.ReactNode }) {
  // Default: all tags hidden, task-icons visible
  const [enabledTags, setEnabledTags] = React.useState<Set<TagId>>(() => new Set());
  const [showTagIcons, setShowTagIcons] = React.useState<boolean>(true);

  const value = React.useMemo(
    () => ({ enabledTags, setEnabledTags, showTagIcons, setShowTagIcons }),
    [enabledTags, showTagIcons]
  );

  return <HomeFiltersContext.Provider value={value}>{children}</HomeFiltersContext.Provider>;
}

export function useHomeFilters() {
  const ctx = React.useContext(HomeFiltersContext);
  if (!ctx) throw new Error('useHomeFilters must be used within HomeFiltersProvider');
  return ctx;
}

export function parseTagsParam(value: unknown): Set<TagId> {
  if (value === 'all') return new Set(TAG_ORDER);
  if (value === 'none') return new Set<TagId>();
  if (typeof value !== 'string' || value.trim().length === 0) return new Set<TagId>();

  const parts = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const enabled = new Set<TagId>();
  for (const p of parts) {
    if (p === 'overdue' || p === 'datetime' || p === 'location' || p === 'project' || p === 'keywords') enabled.add(p);
  }
  return enabled;
}

export function serializeTagsParam(enabled: Set<TagId>): string | undefined {
  if (enabled.size === 0) return undefined;
  const allEnabled = TAG_ORDER.every((t) => enabled.has(t));
  if (allEnabled) return 'all';
  return TAG_ORDER.filter((t) => enabled.has(t)).join(',');
}

export function parseTagIconsParam(value: unknown): boolean {
  if (value === '0') return false;
  if (value === '1') return true;
  return true;
}
