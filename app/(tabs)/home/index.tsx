import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

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

type LayoutRect = { x: number; y: number; width: number; height: number };

type LayoutCache = {
  sections: Record<SectionId, LayoutRect>;
  items: Record<SectionId, { id: string; rect: LayoutRect }[]>;
};

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

const measureView = (view: View | null) =>
  new Promise<LayoutRect | null>((resolve) => {
    if (!view) {
      resolve(null);
      return;
    }
    view.measureInWindow((x, y, width, height) => {
      resolve({ x, y, width, height });
    });
  });

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

const reseedRanks = (tasks: Task[]) =>
  tasks.map((task, index) => ({
    ...task,
    orderRank: (index + 1) * 1000,
  }));

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

const moveTask = (tasks: Task[], id: string, targetSection: SectionId, targetIndex: number) => {
  const dragging = tasks.find((task) => task.id === id);
  if (!dragging) return tasks;

  const bySection: Record<SectionId, Task[]> = {
    today: [],
    upcoming: [],
    completed: [],
  };

  for (const task of tasks) {
    if (task.id === id) continue;
    bySection[task.section].push(task);
  }

  for (const sectionId of SECTION_ORDER) {
    bySection[sectionId] = [...bySection[sectionId]].sort((a, b) => a.orderRank - b.orderRank);
  }

  const insertInto = [...bySection[targetSection]];
  const clampedIndex = Math.max(0, Math.min(insertInto.length, targetIndex));
  insertInto.splice(clampedIndex, 0, adjustDueAtOnSectionChange(dragging, targetSection));
  bySection[targetSection] = insertInto;

  return [...reseedRanks(bySection.today), ...reseedRanks(bySection.upcoming), ...reseedRanks(bySection.completed)];
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
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [dragLayout, setDragLayout] = React.useState<LayoutRect | null>(null);
  const [dragHover, setDragHover] = React.useState<{ sectionId: SectionId | null; index: number | null } | null>(null);

  const visibleTasks = React.useMemo(() => {
    const base = tasks.filter((t) => enabledSections.includes(t.section));
    if (!withNotesEnabled) return base;
    return base.filter((t) => !!t.subtitle);
  }, [enabledSections, tasks, withNotesEnabled]);

  const visibleSections = React.useMemo(() => {
    return SECTION_ORDER.filter((s) => enabledSections.includes(s));
  }, [enabledSections]);

  const dragLayoutRef = React.useRef<LayoutRect | null>(null);
  const layoutCacheRef = React.useRef<LayoutCache | null>(null);

  const sectionRefs = React.useRef<Record<SectionId, View | null>>({
    today: null,
    upcoming: null,
    completed: null,
  });

  const itemRefs = React.useRef<Record<string, View | null>>({});

  const dragTranslateX = useSharedValue(0);
  const dragTranslateY = useSharedValue(0);
  const dragScale = useSharedValue(1);
  const dragShadow = useSharedValue(0);

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

  const hapticLift = React.useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  }, []);

  const hapticDrop = React.useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }, []);

  const startDrag = React.useCallback(
    async (id: string) => {
      const dragNode = itemRefs.current[id];
      const dragRect = await measureView(dragNode);
      if (!dragRect) return;

      const sectionLayouts: Record<SectionId, LayoutRect> = {
        today: { x: 0, y: 0, width: 0, height: 0 },
        upcoming: { x: 0, y: 0, width: 0, height: 0 },
        completed: { x: 0, y: 0, width: 0, height: 0 },
      };

      for (const sectionId of visibleSections) {
        const sectionRect = await measureView(sectionRefs.current[sectionId]);
        if (sectionRect) sectionLayouts[sectionId] = sectionRect;
      }

      const itemLayouts: Record<SectionId, { id: string; rect: LayoutRect }[]> = {
        today: [],
        upcoming: [],
        completed: [],
      };

      await Promise.all(
        Object.entries(itemRefs.current).map(async ([taskId, node]) => {
          const itemRect = await measureView(node);
          const task = tasksById.get(taskId);
          if (!itemRect || !task) return;
          itemLayouts[task.section].push({ id: taskId, rect: itemRect });
        })
      );

      for (const sectionId of visibleSections) {
        itemLayouts[sectionId] = [...itemLayouts[sectionId]].sort((a, b) => a.rect.y - b.rect.y);
      }

      layoutCacheRef.current = { sections: sectionLayouts, items: itemLayouts };
      dragLayoutRef.current = dragRect;
      setDragLayout(dragRect);
      const initialSection = tasksById.get(id)?.section ?? null;
      setDraggingId(id);
      setDragHover({ sectionId: initialSection, index: null });
    },
    [tasksById, visibleSections]
  );

  const updateHoverFromGesture = React.useCallback(
    (translationX: number, translationY: number) => {
      const layout = dragLayoutRef.current;
      const cache = layoutCacheRef.current;
      if (!layout || !cache || !draggingId) return;

      const centerX = layout.x + layout.width / 2 + translationX;
      const centerY = layout.y + layout.height / 2 + translationY;

      let targetSection: SectionId | null = null;
      for (const sectionId of visibleSections) {
        const rect = cache.sections[sectionId];
        if (
          centerX >= rect.x &&
          centerX <= rect.x + rect.width &&
          centerY >= rect.y &&
          centerY <= rect.y + rect.height
        ) {
          targetSection = sectionId;
          break;
        }
      }

      if (!targetSection) {
        setDragHover({ sectionId: null, index: null });
        return;
      }

      const items = cache.items[targetSection].filter((item) => item.id !== draggingId);
      const foundIndex = items.findIndex((item) => centerY < item.rect.y + item.rect.height / 2);
      const resolvedIndex = foundIndex === -1 ? items.length : foundIndex;

      setDragHover({ sectionId: targetSection, index: resolvedIndex });
    },
    [draggingId, visibleSections]
  );

  const finishDrag = React.useCallback(() => {
    if (!draggingId || !dragHover?.sectionId || dragHover.index == null) {
      setDraggingId(null);
      setDragLayout(null);
      setDragHover(null);
      dragLayoutRef.current = null;
      layoutCacheRef.current = null;
      return;
    }

    setTasks((prev) => moveTask(prev, draggingId, dragHover.sectionId!, dragHover.index!));

    setDraggingId(null);
    setDragLayout(null);
    setDragHover(null);
    dragLayoutRef.current = null;
    layoutCacheRef.current = null;
  }, [dragHover, draggingId]);

  const createDragGesture = React.useCallback(
    (id: string) =>
      Gesture.Pan()
        .activateAfterLongPress(220)
        .onStart(() => {
          dragTranslateX.value = 0;
          dragTranslateY.value = 0;
          dragScale.value = withSpring(1.04, { damping: 18, stiffness: 260 });
          dragShadow.value = withSpring(0.28, { damping: 20, stiffness: 220 });
          runOnJS(hapticLift)();
          runOnJS(startDrag)(id);
        })
        .onUpdate((event) => {
          dragTranslateX.value = event.translationX;
          dragTranslateY.value = event.translationY;
          runOnJS(updateHoverFromGesture)(event.translationX, event.translationY);
        })
        .onEnd(() => {
          dragTranslateX.value = 0;
          dragTranslateY.value = 0;
          dragScale.value = withSpring(1, { damping: 20, stiffness: 240 });
          dragShadow.value = withSpring(0, { damping: 20, stiffness: 240 });
          runOnJS(finishDrag)();
          runOnJS(hapticDrop)();
        }),
    [dragScale, dragShadow, dragTranslateX, dragTranslateY, finishDrag, hapticDrop, hapticLift, startDrag, updateHoverFromGesture]
  );

  const dragGestureStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dragTranslateX.value }, { translateY: dragTranslateY.value }, { scale: dragScale.value }],
    shadowOpacity: dragShadow.value,
  }));

  const dragOverlayStyle = dragLayout
    ? [
        styles.dragOverlay,
        {
          top: dragLayout.y,
          left: dragLayout.x,
          width: dragLayout.width,
        },
      ]
    : null;

  const draggingTask = draggingId ? tasksById.get(draggingId) : undefined;

  return (
    <>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        scrollEnabled={!draggingId}
        style={{ backgroundColor: Colors[theme].background }}
        contentContainerStyle={styles.content}>
        {visibleSections.map((sectionId) => {
          const sectionTasks = tasksBySection[sectionId];
          const dropIndex = dragHover?.sectionId === sectionId && dragHover.index != null ? dragHover.index : null;

          const itemsWithDrop = sectionTasks.flatMap((task, index) => {
            const entry: React.ReactNode[] = [];
            if (dropIndex === index) {
              entry.push(<View key={`drop-${sectionId}-${index}`} style={styles.dropMarker} />);
            }

            entry.push(
              <View
                key={task.id}
                ref={(node) => {
                  itemRefs.current[task.id] = node;
                }}
              >
                <GestureDetector gesture={createDragGesture(task.id)}>
                  <View style={[styles.row, draggingId === task.id ? styles.rowHidden : null]}>
                    <Text style={styles.rowTitle}>{task.title}</Text>
                    {task.subtitle ? <Text style={styles.rowSubtitle}>{task.subtitle}</Text> : null}
                  </View>
                </GestureDetector>
              </View>
            );

            return entry;
          });

          if (dropIndex === sectionTasks.length) {
            itemsWithDrop.push(<View key={`drop-${sectionId}-end`} style={styles.dropMarker} />);
          }

          return (
            <View
              key={sectionId}
              ref={(node) => {
                sectionRefs.current[sectionId] = node;
              }}
              style={styles.section}
            >
              <View style={styles.sectionHeader}>
                <View style={styles.sectionLine} />
                <Text style={styles.sectionTitle}>{SECTION_TITLES[sectionId]}</Text>
                <View style={styles.sectionLine} />
              </View>
              <View style={styles.sectionBody}>{itemsWithDrop}</View>
            </View>
          );
        })}
      </ScrollView>

      {draggingId && dragLayout && draggingTask ? (
        <Animated.View style={dragOverlayStyle} pointerEvents="none">
          <Animated.View style={dragGestureStyle}>
            <GlassSurface
              style={[styles.row, styles.dragRow]}
              glassEffectStyle="regular"
              tintColor={glassDragTint}
              fallbackBackgroundColor={glassDragFallback}
            >
              <Text style={styles.rowTitle}>{draggingTask.title}</Text>
              {draggingTask.subtitle ? <Text style={styles.rowSubtitle}>{draggingTask.subtitle}</Text> : null}
            </GlassSurface>
          </Animated.View>
        </Animated.View>
      ) : null}
    </>
  );
}

const createStyles = (theme: ThemeName) => {
  const isDark = theme === 'dark';
  const text = Colors[theme].text;

  const hairline = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)';
  const cardBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const dropMarkerBg = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.22)';

  return StyleSheet.create({
    content: {
      paddingHorizontal: 16,
      paddingTop: 0,
      paddingBottom: 120,
      gap: 12,
    },
    section: {
      gap: 10,
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
    rowHidden: {
      opacity: 0,
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
    sectionBody: {
      gap: 12,
    },
    dropMarker: {
      height: 6,
      borderRadius: 999,
      backgroundColor: dropMarkerBg,
    },
    dragOverlay: {
      position: 'absolute',
      zIndex: 999,
    },
  });
};
