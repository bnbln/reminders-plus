import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import {
  TaskSwipeDraggableList,
  type TaskSwipeDraggableListHandle,
  type TaskSwipeDraggableListItem,
} from '@/components/tasks/task-swipe-draggable-list';
import { FloatingAddButton } from '@/components/ui/floating-add-button';
import { GlassSurface, withAlpha } from '@/components/ui/glass-surface';
import { Colors } from '@/constants/theme';
import { useHomeFilters } from '@/context/home-filters-store';
import { getDueAtForSection, SectionId, Task, useTasksStore } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useStreaks } from '@/hooks/use-streaks';
import { getIntlLocale, t } from '@/i18n';
import { isIOS26OrNewer } from '@/utils/ios-version';

// filter params are parsed locally in this file
const SECTION_ORDER: SectionId[] = ['today', 'upcoming', 'completed'];

const parseSectionsParam = (value: unknown): SectionId[] => {
  if (typeof value !== 'string' || value.trim().length === 0) return SECTION_ORDER;
  const parts = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const enabled = parts.filter((p): p is SectionId => p === 'today' || p === 'upcoming' || p === 'completed');
  return enabled.length ? Array.from(new Set(enabled)) : SECTION_ORDER;
};

const SECTION_TITLE_KEYS: Record<SectionId, string> = {
  today: 'common.today',
  upcoming: 'common.upcoming',
  completed: 'common.completed',
};

const getStartOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
};

const adjustDueAtOnSectionChange = (task: Task, nextSection: SectionId): Task => {
  // Only auto-adjust between Today <-> Upcoming as requested.
  if (
    (task.section === 'today' && nextSection === 'upcoming') ||
    (task.section === 'upcoming' && nextSection === 'today')
  ) {
    if (task.section === 'upcoming' && nextSection === 'today') {
      // When promoting to Today via drag, set due date to today's date without a time.
      return {
        ...task,
        section: 'today',
        dueAt: getStartOfToday(),
        dueHasTime: false,
      };
    }

    if (task.section === 'today' && nextSection === 'upcoming') {
      // When moving out of Today via drag, clear the due date.
      return {
        ...task,
        section: 'upcoming',
        dueAt: 0,
        dueHasTime: false,
      };
    }
  }

  return {
    ...task,
    section: nextSection,
  };
};

type ThemeName = keyof typeof Colors;

type QuickTile = {
  key: 'streaks' | 'inbox' | 'routines' | 'today';
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  onPress: () => void;
};

type QuickNavTheme = {
  tileTintColor: string;
  tileFallbackBg: string;
  iconColor: string;
  chevronColor: string;
};

function QuickNavGrid({
  tiles,
  styles,
  theme,
}: {
  tiles: QuickTile[];
  styles: ReturnType<typeof createStyles>;
  theme: QuickNavTheme;
}) {
  return (
    <View style={styles.quickGridWrap}>
      <View style={styles.quickGrid}>
        {tiles.map((tile) => (
          <Pressable
            key={tile.key}
            accessibilityRole="button"
            accessibilityLabel={`${tile.title}: ${tile.subtitle}`}
            onPress={tile.onPress}
            hitSlop={8}
            style={styles.quickTilePressable}
          >
            <GlassSurface
              style={styles.quickTile}
              glassEffectStyle="regular"
              tintColor={theme.tileTintColor}
              fallbackBackgroundColor={theme.tileFallbackBg}
              isInteractive
            >
              <View style={styles.quickTileInner}>
                <View style={styles.quickTileIconRow}>
                  <View style={styles.quickTileIconBadge}>
                    <MaterialIcons name={tile.icon} size={18} color={theme.iconColor} />
                  </View>
                  <MaterialIcons name="chevron-right" size={18} color={theme.chevronColor} />
                </View>

                <Text style={styles.quickTileTitle}>{tile.title}</Text>
                <Text style={styles.quickTileSubtitle} numberOfLines={1}>
                  {tile.subtitle}
                </Text>
              </View>
            </GlassSurface>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const isDark = theme === 'dark';
  const usesNativeTabAccessory = isIOS26OrNewer();
  const { height: windowHeight } = useWindowDimensions();
  const params = useLocalSearchParams<{ sections?: string; withNotes?: string }>();
  const enabledSections = React.useMemo(() => parseSectionsParam(params.sections), [params.sections]);
  const withNotesEnabled = params.withNotes === '1';

  const { enabledTags, showTagIcons } = useHomeFilters();

  const styles = React.useMemo(() => createStyles(theme, usesNativeTabAccessory), [theme, usesNativeTabAccessory]);

  const { tasks, setTasks, projects } = useTasksStore();
  const { currentStreak } = useStreaks();

  const projectsById = React.useMemo(() => new Map(projects.map((p) => [p.id, p] as const)), [projects]);

  const homeEnabledSections = React.useMemo(() => {
    // Home should never show completed; those live in Archive.
    const withoutCompleted = enabledSections.filter((s) => s !== 'completed');
    return (withoutCompleted.length ? withoutCompleted : ['today', 'upcoming']) as SectionId[];
  }, [enabledSections]);

  const [collapsedSections, setCollapsedSections] = React.useState<Record<'today' | 'upcoming', boolean>>({
    today: false,
    upcoming: false,
  });
  const listRef = React.useRef<TaskSwipeDraggableListHandle | null>(null);

  const closeAnyOpen = React.useCallback(() => {
    listRef.current?.closeAnyOpen();
  }, []);

  const onPressTask = React.useCallback(
    (taskId: string) => {
      router.push({ pathname: '/task/[id]', params: { id: taskId } });
    },
    [router]
  );

  const visibleTasks = React.useMemo(() => {
    const base = tasks.filter((t) => {
      if (t.deletedAt) return false;
      if (!homeEnabledSections.includes(t.section)) return false;

      // Upcoming should also show tasks without a due date.
      if (t.section === 'upcoming') return true;

      return typeof t.dueAt === 'number' && Number.isFinite(t.dueAt) && t.dueAt > 0;
    });
    if (!withNotesEnabled) return base;
    return base.filter((t) => !!t.subtitle);
  }, [homeEnabledSections, tasks, withNotesEnabled]);

  const visibleSections = React.useMemo(() => {
    return (SECTION_ORDER.filter((s) => homeEnabledSections.includes(s)) as SectionId[]);
  }, [homeEnabledSections]);

  const firstVisibleSection = visibleSections[0] ?? 'today';

  const inboxTasks = React.useMemo(() => {
    // Inbox = aktiv und ohne Datum.
    return tasks.filter((t) => !t.deletedAt && t.section !== 'completed' && (!Number.isFinite(t.dueAt) || t.dueAt <= 0));
  }, [tasks]);

  const todayLabel = React.useMemo(() => {
    const now = new Date();
    return new Intl.DateTimeFormat(getIntlLocale(), { weekday: 'short', day: '2-digit', month: 'short' }).format(now);
  }, []);

  const routineTasksCount = React.useMemo(() => {
    return tasks.filter((t) => !t.deletedAt && t.isRoutine && (!!t.routineType || !!t.routineInterval)).length;
  }, [tasks]);

  const quickTiles = React.useMemo<QuickTile[]>(() => {
    return [
      {
        key: 'streaks',
        title: t('home.quick.streaks'),
        subtitle: `${currentStreak} ${currentStreak === 1 ? t('home.quick.day') : t('home.quick.days')}`,
        icon: 'local-fire-department',
        onPress: () => router.push('/home/streaks'),
      },
      {
        key: 'inbox',
        title: t('common.inbox'),
        subtitle: t('home.quick.withoutDate', { count: inboxTasks.length }),
        icon: 'inbox',
        onPress: () => router.push('/home/inbox'),
      },
      {
        key: 'routines',
        title: t('home.quick.routines'),
        subtitle: t('home.quick.recurring', { count: routineTasksCount }),
        icon: 'loop',
        onPress: () => router.push('/home/routines'),
      },
      {
        key: 'today',
        title: t('common.today'),
        subtitle: todayLabel,
        icon: 'today',
        onPress: () => router.push('/home/today'),
      },
    ];
  }, [currentStreak, inboxTasks.length, routineTasksCount, router, todayLabel]);

  const quickNavTheme = React.useMemo<QuickNavTheme>(() => {
    const text = Colors[theme].text;
    return {
      tileTintColor: withAlpha(Colors[theme].background, isDark ? 0.18 : 0.28),
      tileFallbackBg: isDark ? '#1C1C1E' : '#F2F2F7',
      iconColor: withAlpha(text, 0.86),
      chevronColor: withAlpha(text, 0.45),
    };
  }, [isDark, theme]);

  const tasksBySection = React.useMemo(() => {
    const grouped: Record<SectionId, Task[]> = { today: [], upcoming: [], completed: [] };
    for (const task of visibleTasks) grouped[task.section].push(task);
    for (const sectionId of SECTION_ORDER) {
      grouped[sectionId] = [...grouped[sectionId]].sort((a, b) => a.orderRank - b.orderRank);
    }
    return grouped;
  }, [visibleTasks]);

  type ListItem =
    | { type: 'header'; key: string; sectionId: SectionId }
    | { type: 'task'; key: string; taskId: string };

  const listData = React.useMemo<ListItem[]>(() => {
    const data: ListItem[] = [];
    for (const sectionId of visibleSections) {
      if (sectionId !== firstVisibleSection) {
        data.push({ type: 'header', key: `h-${sectionId}`, sectionId });
      }

      const isCollapsed =
        sectionId === 'today' ? collapsedSections.today : sectionId === 'upcoming' ? collapsedSections.upcoming : false;
      if (isCollapsed) continue;

      for (const task of tasksBySection[sectionId]) {
        // Section-aware key prevents "pop back" on complete/undo by forcing a remount when section changes.
        data.push({ type: 'task', key: `${task.id}:${sectionId}`, taskId: task.id });
      }
    }
    return data;
  }, [collapsedSections.today, collapsedSections.upcoming, firstVisibleSection, tasksBySection, visibleSections]);

  const swipeListData = React.useMemo<TaskSwipeDraggableListItem[]>(() => {
    return listData.map((item) =>
      item.type === 'header'
        ? { kind: 'header', key: item.key, sectionId: item.sectionId }
        : { kind: 'task', key: item.key, taskId: item.taskId }
    );
  }, [listData]);

  const applyOrderFromListData = React.useCallback(
    (data: ListItem[]) => {
      if (visibleSections.length === 0) return;

      const bySection: Record<SectionId, string[]> = { today: [], upcoming: [], completed: [] };
      let currentSection: SectionId = firstVisibleSection;

      for (const item of data) {
        if (item.type === 'header') {
          currentSection = item.sectionId;
          continue;
        }
        bySection[currentSection].push(item.taskId);
      }

      setTasks((prev) => {
        const visibleIdSet = new Set(visibleTasks.map((t) => t.id));

        const nextById = new Map<string, Task>();
        for (const task of prev) nextById.set(task.id, task);

        for (const sectionId of SECTION_ORDER) {
          const reorderedVisibleIds = bySection[sectionId];
          const reorderedVisibleSet = new Set(reorderedVisibleIds);

          // Keep non-visible tasks in this section in their current order.
          const stableHidden = prev
            .filter((t) => t.section === sectionId && !visibleIdSet.has(t.id))
            .sort((a, b) => a.orderRank - b.orderRank)
            .map((t) => t.id);

          const finalOrder = [...reorderedVisibleIds, ...stableHidden];
          finalOrder.forEach((id, index) => {
            const existing = nextById.get(id);
            if (!existing) return;
            const moved = reorderedVisibleSet.has(id) ? adjustDueAtOnSectionChange(existing, sectionId) : existing;
            nextById.set(id, { ...moved, orderRank: (index + 1) * 1000 });
          });
        }

        return prev.map((t) => nextById.get(t.id) ?? t);
      });
    },
    [firstVisibleSection, setTasks, visibleSections, visibleTasks]
  );

  const applyOrderFromSwipeListData = React.useCallback(
    (data: TaskSwipeDraggableListItem[]) => {
      const mapped: ListItem[] = data.map((item) =>
        item.kind === 'header'
          ? { type: 'header', key: item.key, sectionId: item.sectionId as SectionId }
          : { type: 'task', key: item.key, taskId: item.taskId }
      );
      applyOrderFromListData(mapped);
    },
    [applyOrderFromListData]
  );

  const reseedSection = React.useCallback((items: Task[], sectionId: SectionId) => {
    const section = items
      .filter((t) => t.section === sectionId)
      .sort((a, b) => a.orderRank - b.orderRank)
      .map((t) => t.id);
    const byId = new Map(items.map((t) => [t.id, t] as const));
    section.forEach((id, index) => {
      const current = byId.get(id);
      if (!current) return;
      byId.set(id, { ...current, orderRank: (index + 1) * 1000 });
    });
    return items.map((t) => byId.get(t.id) ?? t);
  }, []);

  const toggleComplete = React.useCallback(
    (taskId: string) => {
      setTasks((prev) => {
        const task = prev.find((t) => t.id === taskId);
        if (!task) return prev;

        const fromSection = task.section;
        const toSection: SectionId = fromSection === 'completed' ? 'today' : 'completed';

        const now = Date.now();

        const next = prev.map((t): Task => {
          if (t.id !== taskId) return t;

          if (toSection === 'completed') {
            return {
              ...t,
              section: 'completed' as const,
              completedAt: now,
            };
          }

          const hasDueAt = typeof t.dueAt === 'number' && Number.isFinite(t.dueAt) && t.dueAt > 0;
          return {
            ...t,
            section: 'today' as const,
            completedAt: undefined,
            ...(hasDueAt
              ? {}
              : {
                dueAt: getDueAtForSection('today'),
                dueHasTime: true,
              }),
          };
        });

        // Put it at the top of the destination section for a native "just completed" feel.
        const moved = next.find((t) => t.id === taskId);
        if (!moved) return next;

        const other = next.filter((t) => t.id !== taskId);
        const dest = other
          .filter((t) => t.section === toSection)
          .sort((a, b) => a.orderRank - b.orderRank);
        const rest = other.filter((t) => t.section !== toSection);

        const withInserted = [
          ...rest,
          moved,
          ...dest,
        ];

        // Reseed only affected sections.
        const reseededFrom = reseedSection(withInserted, fromSection);
        const reseededBoth = reseedSection(reseededFrom, toSection);
        return reseededBoth;
      });
    },
    [reseedSection, setTasks]
  );

  const deleteTask = React.useCallback(
    (taskId: string) => {
      setTasks((prev) => {
        const task = prev.find((t) => t.id === taskId);
        if (!task) return prev;
        // Soft-delete: move to trash.
        return prev.map((t) => (t.id === taskId ? { ...t, deletedAt: Date.now() } : t));
      });
    },
    [setTasks]
  );

  const renderSectionHeaderRow = React.useCallback(
    (sectionId: string) => {
      const id = sectionId as SectionId;
      const isCollapsible = id === 'today' || id === 'upcoming';
      const isCollapsed = id === 'today' ? collapsedSections.today : collapsedSections.upcoming;

      const onToggle = () => {
        if (!isCollapsible) return;
        closeAnyOpen();
        setCollapsedSections((prev) => ({
          ...prev,
          [id]: !prev[id as 'today' | 'upcoming'],
        }));
      };

      return (
        <View style={styles.sectionHeader}>
          <View style={styles.sectionLine} />
          <Pressable
            accessibilityRole={isCollapsible ? 'button' : undefined}
            accessibilityLabel={isCollapsible ? t('home.filter.toggleSection', { section: t(SECTION_TITLE_KEYS[id]) }) : undefined}
            onPress={onToggle}
            hitSlop={10}
            style={styles.sectionHeaderButton}
          >
            {isCollapsible ? (
              <MaterialIcons
                name="chevron-right"
                size={16}
                color={withAlpha(Colors[theme].text, 0.55)}
                style={{ transform: [{ rotate: isCollapsed ? '0deg' : '90deg' }] }}
              />
            ) : null}
            <Text style={styles.sectionTitle}>{t(SECTION_TITLE_KEYS[id])}</Text>
          </Pressable>
          <View style={styles.sectionLine} />
        </View>
      );
    },
    [closeAnyOpen, collapsedSections.today, collapsedSections.upcoming, styles, theme]
  );

  const archivePill = React.useMemo(() => {
    const completedCount = tasks.filter((t) => t.section === 'completed' && !t.deletedAt).length;
    const trashedCount = tasks.filter((t) => !!t.deletedAt).length;
    const show = completedCount > 0 || trashedCount > 0;
    if (!show) return null;

    const label =
      completedCount > 0
        ? t('home.archivePill.completed', { count: completedCount })
        : trashedCount > 0
          ? t('home.archivePill.trash', { count: trashedCount })
          : t('home.archivePill.archive');

    const iconKind: 'completed' | 'trash' = completedCount > 0 ? 'completed' : 'trash';

    return (
      <View style={styles.archivePillFooter}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('home.openArchive')}
          onPress={() => router.push('/home/archive')}
          style={({ pressed }) => [pressed && { opacity: 0.92 }]}>
          <GlassSurface
            tintColor={withAlpha(Colors[theme].background, isDark ? 0.18 : 0.28)}
            fallbackBackgroundColor={withAlpha(Colors[theme].background, isDark ? 0.86 : 0.92)}
            style={styles.archivePill}>
            <MaterialIcons name={iconKind === 'completed' ? 'check-circle' : 'delete'} size={18} color={Colors[theme].text} />
            <Text style={styles.archivePillText}>{label}</Text>
          </GlassSurface>
        </Pressable>
      </View>
    );
  }, [isDark, router, styles, tasks, theme]);

  const listHeader = React.useMemo(() => {
    const sectionId = firstVisibleSection;
    const isCollapsible = sectionId === 'today' || sectionId === 'upcoming';
    const isCollapsed = sectionId === 'today' ? collapsedSections.today : collapsedSections.upcoming;

    const onToggle = () => {
      if (!isCollapsible) return;
      closeAnyOpen();
      setCollapsedSections((prev) => ({
        ...prev,
        [sectionId]: !prev[sectionId as 'today' | 'upcoming'],
      }));
    };

    return (
      <View>
        {sectionId === 'today' ? <QuickNavGrid tiles={quickTiles} styles={styles} theme={quickNavTheme} /> : null}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionLine} />
          <Pressable
            accessibilityRole={isCollapsible ? 'button' : undefined}
            accessibilityLabel={isCollapsible ? t('home.filter.toggleSection', { section: t(SECTION_TITLE_KEYS[sectionId]) }) : undefined}
            onPress={onToggle}
            hitSlop={10}
            style={styles.sectionHeaderButton}
          >
            {isCollapsible ? (
              <MaterialIcons
                name="chevron-right"
                size={16}
                color={withAlpha(Colors[theme].text, 0.55)}
                style={{ transform: [{ rotate: isCollapsed ? '0deg' : '90deg' }] }}
              />
            ) : null}
            <Text style={styles.sectionTitle}>{t(SECTION_TITLE_KEYS[sectionId])}</Text>
          </Pressable>
          <View style={styles.sectionLine} />
        </View>
      </View>
    );
  }, [closeAnyOpen, collapsedSections.today, collapsedSections.upcoming, firstVisibleSection, quickNavTheme, quickTiles, styles, theme]);

  return (
    <>
      <TaskSwipeDraggableList
        ref={listRef}
        theme={theme}
        tasks={visibleTasks}
        projectsById={projectsById}
        rowStyles={styles}
        enabledTags={enabledTags}
        showTaskIcons={showTagIcons}
        data={swipeListData}
        renderHeaderRow={renderSectionHeaderRow}
        header={listHeader}
        footer={archivePill}
        empty={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>{t('home.empty.noTasks')}</Text>
          </View>
        }
        contentContainerStyle={[styles.content, { minHeight: windowHeight + 220 }]}
        onPressTask={onPressTask}
        toggleComplete={toggleComplete}
        deleteTask={deleteTask}
        onReorderData={applyOrderFromSwipeListData}
      />

      {!usesNativeTabAccessory ? (
        <FloatingAddButton
          placement="overlay"
          accessibilityLabel={t('home.addTask')}
          onPress={() => {
            closeAnyOpen();
            router.push('/task/create-modal');
          }}
        />
      ) : null}
    </>
  );
}

const createStyles = (theme: ThemeName, usesNativeTabAccessory: boolean) => {
  const isDark = theme === 'dark';
  const text = Colors[theme].text;

  const hairline = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)';
  // Opaque row background so swipe actions don't "shine through" before reveal.
  const cardBg = isDark ? '#1C1C1E' : '#F2F2F7';
  const tagBg = withAlpha(text, isDark ? 0.10 : 0.08);
  const tagText = withAlpha(text, 0.78);
  const dangerBg = isDark ? 'rgba(255,69,58,0.18)' : 'rgba(255,59,48,0.14)';
  const dangerBorder = isDark ? 'rgba(255,69,58,0.32)' : 'rgba(255,59,48,0.26)';

  const quickTileSubtitle = withAlpha(text, 0.62);

  return StyleSheet.create({
    content: {
      paddingHorizontal: 16,
      paddingTop: 0,
      paddingBottom: usesNativeTabAccessory ? 108 : 168,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 8,
      marginBottom: 4,
    },
    sectionHeaderButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 6,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.9,
      textTransform: 'uppercase',
      color: text,
      opacity: 0.55,
    },
    sectionLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: hairline,
    },

    debugOverlay: {
      position: 'absolute',
      top: 10,
      left: 10,
      zIndex: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: withAlpha(isDark ? '#000' : '#fff', 0.72),
      borderWidth: 1,
      borderColor: withAlpha(text, 0.18),
    },
    debugText: {
      fontSize: 12,
      fontWeight: '700',
      color: text,
    },

    quickGridWrap: {
      marginTop: 8,
      marginBottom: 6,
    },
    quickGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    quickTilePressable: {
      width: '48.5%',
    },
    quickTile: {
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hairline,
      overflow: 'hidden',
      backgroundColor: cardBg,
    },
    quickTileInner: {
      paddingHorizontal: 12,
      paddingVertical: 12,
      gap: 6,
    },
    quickTileIconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    quickTileIconBadge: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(text, isDark ? 0.08 : 0.06),
    },
    quickTileTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: text,
      letterSpacing: 0.2,
    },
    quickTileSubtitle: {
      fontSize: 12,
      fontWeight: '700',
      color: quickTileSubtitle,
    },

    archivePillFooter: {
      paddingTop: 14,
      paddingBottom: 26,
      alignItems: 'center',
    },
    archivePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hairline,
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.32 : 0.16,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },
    archivePillText: {
      fontSize: 16,
      fontWeight: '700',
      color: text,
      opacity: 0.92,
    },
    row: {
      minHeight: 56,
      borderRadius: 12,
      backgroundColor: cardBg,
      justifyContent: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 4,
    },
    rowInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    emojiTile: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    emojiText: {
      fontSize: 18,
    },
    textStack: {
      flex: 1,
      gap: 4,
    },

    tagRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 2,
    },
    tagChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: '100%',
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hairline,
      backgroundColor: tagBg,
    },
    tagChipDanger: {
      backgroundColor: dangerBg,
      borderColor: dangerBorder,
    },
    tagIcon: {
      width: 12,
      height: 12,
      color: tagText,
    },
    tagChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: tagText,
      maxWidth: 220,
    },

    emptyState: {
      paddingTop: 16,
      paddingBottom: 12,
      alignItems: 'center',
    },
    emptyText: {
      fontSize: 13,
      fontWeight: '600',
      color: withAlpha(text, 0.55),
    },
    dragRow: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hairline,
      shadowColor: '#000',
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
    },
    rowTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: text,
    },
    rowSubtitle: {
      fontSize: 13,
      color: text,
      opacity: 0.7,
    },
    itemSpacer: {
      marginBottom: 12,
    },

    swipeClip: {
      borderRadius: 12,
      overflow: 'hidden',
    },

    underlay: {
      ...StyleSheet.absoluteFillObject,
    },
    actionSlot: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      justifyContent: 'center',
    },
    actionSlotLeft: {
      left: 0,
      alignItems: 'center',
    },
    actionSlotRight: {
      right: 0,
      alignItems: 'center',
    },
    actionSlotInner: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
};
