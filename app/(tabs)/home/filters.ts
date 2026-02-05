import { t } from '@/i18n';

export type FilterId = 'all' | 'today' | 'upcoming' | 'completed' | 'withNotes';

export const FILTERS: {
  id: FilterId;
  title: string;
  subtitle?: string;
  icon?: { ios?: string; android?: string };
}[] = [
  { id: 'all', title: t('filters.all'), icon: { ios: 'tray.full', android: 'filter-list' } },
  { id: 'today', title: t('filters.today'), subtitle: t('filters.todayOnly'), icon: { ios: 'sun.max', android: 'wb-sunny' } },
  { id: 'upcoming', title: t('filters.upcoming'), subtitle: t('filters.upcomingOnly'), icon: { ios: 'calendar', android: 'event' } },
  { id: 'completed', title: t('filters.completed'), subtitle: t('filters.completedOnly'), icon: { ios: 'checkmark.circle', android: 'check-circle' } },
  { id: 'withNotes', title: t('filters.withNotes'), subtitle: t('filters.withNotesOnly'), icon: { ios: 'note.text', android: 'notes' } },
];

export function isFilterId(value: unknown): value is FilterId {
  return typeof value === 'string' && (FILTERS as { id: string }[]).some((f) => f.id === value);
}

export default function FiltersRoute() {
  return null;
}
