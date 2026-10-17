import { t } from '@/i18n';

export type FilterId =
  | 'all'
  | 'today'
  | 'upcoming'
  | 'completed'
  | 'withNotes'
  | 'withSubtasks';

type FilterDefinition = {
  id: FilterId;
  title: string;
  subtitle?: string;
  icon?: { ios?: string; android?: string };
};

// Titles are getters so they follow a language change instead of keeping the
// language that was active when this module was first imported.
const filter = (
  id: FilterId,
  titleKey: string,
  subtitleKey: string | null,
  icon: FilterDefinition['icon'],
): FilterDefinition => ({
  id,
  get title() {
    return t(titleKey);
  },
  get subtitle() {
    return subtitleKey ? t(subtitleKey) : undefined;
  },
  icon,
});

export const FILTERS: FilterDefinition[] = [
  filter('all', 'filters.all', null, { ios: 'tray.full', android: 'filter-list' }),
  filter('today', 'filters.today', 'filters.todayOnly', { ios: 'sun.max', android: 'wb-sunny' }),
  filter('upcoming', 'filters.upcoming', 'filters.upcomingOnly', { ios: 'calendar', android: 'event' }),
  filter('completed', 'filters.completed', 'filters.completedOnly', { ios: 'checkmark.circle', android: 'check-circle' }),
  filter('withNotes', 'filters.withNotes', 'filters.withNotesOnly', { ios: 'note.text', android: 'notes' }),
  filter('withSubtasks', 'filters.withSubtasks', 'filters.withSubtasksOnly', { ios: 'checkmark.square', android: 'check-box' }),
];

export function isFilterId(value: unknown): value is FilterId {
  return typeof value === 'string' && (FILTERS as { id: string }[]).some((f) => f.id === value);
}

export default function FiltersRoute() {
  return null;
}
