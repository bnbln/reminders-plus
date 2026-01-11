export type FilterId = 'all' | 'today' | 'upcoming' | 'completed' | 'withNotes';

export const FILTERS: {
  id: FilterId;
  title: string;
  subtitle?: string;
  icon?: { ios?: string; android?: string };
}[] = [
  { id: 'all', title: 'Alle', icon: { ios: 'tray.full', android: 'filter-list' } },
  { id: 'today', title: 'Today', subtitle: 'Nur Today', icon: { ios: 'sun.max', android: 'wb-sunny' } },
  { id: 'upcoming', title: 'Upcoming', subtitle: 'Nur Upcoming', icon: { ios: 'calendar', android: 'event' } },
  { id: 'completed', title: 'Completed', subtitle: 'Nur Completed', icon: { ios: 'checkmark.circle', android: 'check-circle' } },
  { id: 'withNotes', title: 'Mit Notiz', subtitle: 'Nur Tasks mit Subtitle', icon: { ios: 'note.text', android: 'notes' } },
];

export function isFilterId(value: unknown): value is FilterId {
  return typeof value === 'string' && (FILTERS as { id: string }[]).some((f) => f.id === value);
}
