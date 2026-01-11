import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';

import { GlassSurface, withAlpha } from '@/components/ui/glass-surface';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

// filter params are parsed locally in this file

type SectionId = 'today' | 'upcoming' | 'completed';

type Task = {
  id: string;
  title: string;
  subtitle?: string;
  dueAt: number;
  section: SectionId;
  orderRank: number;
};

const BASE_TASKS = [
  { title: 'Design sync', subtitle: 'Gradient, motion, microcopy prüfen' },
  { title: 'Kunden-Call', subtitle: 'Scope für Q2 finalisieren' },
  { title: 'Moodboard export', subtitle: 'Konzeptvarianten markieren' },
  { title: 'Spaziergang', subtitle: 'Headspace für neue Idee' },
  { title: 'Briefing sortiert', subtitle: 'Stakeholder-Feedback eingearbeitet' },
] as const;

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

const SECTION_TITLES: Record<SectionId, string> = {
  today: 'Today',
  upcoming: 'Upcoming',
  completed: 'Completed',
};

const getDueAtForSection = (section: SectionId) => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (section === 'today') {
    const preferred = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      Math.min(23, Math.max(8, now.getHours() + 1)),
      0
    );
    return preferred.getTime();
  }
  if (section === 'upcoming') {
    const tomorrow = new Date(startOfToday);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(11, 0, 0, 0);
    return tomorrow.getTime();
  }
  // completed
  const completedAt = new Date(now);
  completedAt.setMinutes(completedAt.getMinutes() - 5);
  return completedAt.getTime();
};

const adjustDueAtOnSectionChange = (task: Task, nextSection: SectionId): Task => {
  // Only auto-adjust between Today <-> Upcoming as requested.
  if (
    (task.section === 'today' && nextSection === 'upcoming') ||
    (task.section === 'upcoming' && nextSection === 'today')
  ) {
    return {
      ...task,
      section: nextSection,
      dueAt: getDueAtForSection(nextSection),
    };
  }

  return {
    ...task,
    section: nextSection,
  };
};

const createSeedTasks = (): Task[] => {
  return Array.from({ length: 80 }).map((_, index) => {
    const template = BASE_TASKS[index % BASE_TASKS.length];
    const section: SectionId = index < 28 ? 'today' : index < 56 ? 'upcoming' : 'completed';
    const sectionIndex = section === 'today' ? index : section === 'upcoming' ? index - 28 : index - 56;
    return {
      id: `t-${index + 1}`,
      title: `${template.title} #${index + 1}`,
      subtitle: template.subtitle,
      section,
      dueAt: getDueAtForSection(section),
      orderRank: (sectionIndex + 1) * 1000,
    };
  });
};

type ThemeName = keyof typeof Colors;

export default function HomeScreen() {
  const theme = useColorScheme() ?? 'light';
  const isDark = theme === 'dark';
  const params = useLocalSearchParams<{ sections?: string; withNotes?: string }>();
  const enabledSections = React.useMemo(() => parseSectionsParam(params.sections), [params.sections]);
  const withNotesEnabled = params.withNotes === '1';

  const styles = React.useMemo(() => createStyles(theme), [theme]);

  const [tasks, setTasks] = React.useState<Task[]>(() => createSeedTasks());
  const isDraggingRef = React.useRef(false);
  const placeholderIndexRef = React.useRef<number>(-1);

  const visibleTasks = React.useMemo(() => {
    const base = tasks.filter((t) => enabledSections.includes(t.section));
    if (!withNotesEnabled) return base;
    return base.filter((t) => !!t.subtitle);
  }, [enabledSections, tasks, withNotesEnabled]);

  const visibleSections = React.useMemo(() => {
    return SECTION_ORDER.filter((s) => enabledSections.includes(s));
  }, [enabledSections]);

  const firstVisibleSection = visibleSections[0] ?? 'today';

  const tasksById = React.useMemo(() => new Map(visibleTasks.map((task) => [task.id, task])), [visibleTasks]);

  const tasksBySection = React.useMemo(() => {
    const grouped: Record<SectionId, Task[]> = { today: [], upcoming: [], completed: [] };
    for (const task of visibleTasks) grouped[task.section].push(task);
    for (const sectionId of SECTION_ORDER) {
      grouped[sectionId] = [...grouped[sectionId]].sort((a, b) => a.orderRank - b.orderRank);
    }
    return grouped;
  }, [visibleTasks]);

  const glassDragTint = React.useMemo(() => withAlpha(Colors[theme].background, isDark ? 0.18 : 0.28), [isDark, theme]);
  const glassDragFallback = React.useMemo(
    () => withAlpha(Colors[theme].background, isDark ? 0.86 : 0.92),
    [isDark, theme]
  );

  type ListItem =
    | { type: 'header'; key: string; sectionId: SectionId }
    | { type: 'task'; key: string; taskId: string };

  const listData = React.useMemo<ListItem[]>(() => {
    const data: ListItem[] = [];
    for (const sectionId of visibleSections) {
      if (sectionId !== firstVisibleSection) {
        data.push({ type: 'header', key: `h-${sectionId}`, sectionId });
      }
      for (const task of tasksBySection[sectionId]) {
        data.push({ type: 'task', key: task.id, taskId: task.id });
      }
    }
    return data;
  }, [firstVisibleSection, tasksBySection, visibleSections]);

  const [flatListData, setFlatListData] = React.useState<ListItem[]>(() => listData);

  React.useEffect(() => {
    if (!isDraggingRef.current) {
      setFlatListData(listData);
    }
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

  const renderListItem = React.useCallback(
    ({ item, drag, isActive }: RenderItemParams<ListItem>) => {
      if (item.type === 'header') {
        return (
          <View style={styles.sectionHeader}>
            <View style={styles.sectionLine} />
            <Text style={styles.sectionTitle}>{SECTION_TITLES[item.sectionId]}</Text>
            <View style={styles.sectionLine} />
          </View>
        );
      }

      const task = tasksById.get(item.taskId);
      if (!task) return null;

      return (
        <View style={styles.itemSpacer}>
          <Pressable onLongPress={drag} delayLongPress={220}>
            {isActive ? (
              <GlassSurface
                style={[styles.row, styles.dragRow]}
                glassEffectStyle="regular"
                tintColor={glassDragTint}
                fallbackBackgroundColor={glassDragFallback}
              >
                <Text style={styles.rowTitle}>{task.title}</Text>
                {task.subtitle ? <Text style={styles.rowSubtitle}>{task.subtitle}</Text> : null}
              </GlassSurface>
            ) : (
              <View style={styles.row}>
                <Text style={styles.rowTitle}>{task.title}</Text>
                {task.subtitle ? <Text style={styles.rowSubtitle}>{task.subtitle}</Text> : null}
              </View>
            )}
          </Pressable>
        </View>
      );
    },
    [glassDragFallback, glassDragTint, styles.dragRow, styles.itemSpacer, styles.row, styles.rowSubtitle, styles.rowTitle, styles.sectionHeader, styles.sectionLine, styles.sectionTitle, tasksById]
  );

  return (
    <>
      <DraggableFlatList
        data={flatListData}
        keyExtractor={(item) => item.key}
        renderItem={renderListItem}
        ListHeaderComponent={
          <View style={styles.sectionHeader}>
            <View style={styles.sectionLine} />
            <Text style={styles.sectionTitle}>{SECTION_TITLES[firstVisibleSection]}</Text>
            <View style={styles.sectionLine} />
          </View>
        }
        containerStyle={{ backgroundColor: Colors[theme].background }}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        activationDistance={12}
        autoscrollSpeed={22}
        animationConfig={{
          damping: 32,
          stiffness: 420,
          mass: 0.22,
          overshootClamping: true,
        }}
        dragItemOverflow
        onDragBegin={(fromIndex) => {
          isDraggingRef.current = true;
          placeholderIndexRef.current = fromIndex;
          setFlatListData(listData);
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
        }}
        onPlaceholderIndexChange={(index) => {
          placeholderIndexRef.current = index;
        }}
        onRelease={(fromIndex) => {
          // `onDragEnd` fires after animation completion; this runs immediately on finger-up.
          // Also update `data` immediately to avoid any transient render of the old ordering
          // when the dragged cell transitions back to the list.
          const toIndex = placeholderIndexRef.current;
          if (toIndex >= 0 && fromIndex >= 0 && toIndex !== fromIndex) {
            setFlatListData((prev) => {
              if (fromIndex >= prev.length || toIndex >= prev.length) return prev;
              const next = [...prev];
              const [moved] = next.splice(fromIndex, 1);
              if (!moved) return prev;
              next.splice(toIndex, 0, moved);
              return next;
            });
          }
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        }}
        onDragEnd={({ data }) => {
          // Prevent any transient render of the old ordering when the library clears its activeKey.
          setFlatListData(data);
          isDraggingRef.current = false;
          applyOrderFromListData(data);
        }}
        showsVerticalScrollIndicator={false}
      />
    </>
  );
}

const createStyles = (theme: ThemeName) => {
  const isDark = theme === 'dark';
  const text = Colors[theme].text;

  const hairline = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)';
  const cardBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

  return StyleSheet.create({
    content: {
      paddingHorizontal: 16,
      paddingTop: 0,
      paddingBottom: 120,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 8,
      marginBottom: 4,
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
    row: {
      minHeight: 56,
      borderRadius: 12,
      backgroundColor: cardBg,
      justifyContent: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 4,
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
  });
};
