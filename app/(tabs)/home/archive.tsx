import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { SwipeTaskRow } from '@/components/tasks/swipe-task-row';
import { GlassSurface, withAlpha } from '@/components/ui/glass-surface';
import { Colors } from '@/constants/theme';
import { useHomeFilters } from '@/context/home-filters-store';
import { getDueAtForSection, type Task, useTasksStore } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { t } from '@/i18n';
import { deriveActiveSectionFromDueAt, hasValidDueAt } from '@/utils/task-dates';

type TabId = 'completed' | 'trash';

function formatCountLabel(count: number) {
  return count === 1 ? t('archive.count.one', { count }) : t('archive.count.other', { count });
}

export default function ArchiveScreen() {
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const isDark = theme === 'dark';
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  const { enabledTags, showTagIcons } = useHomeFilters();

  const emojiTint = React.useMemo(() => withAlpha(Colors[theme].background, isDark ? 0.12 : 0.22), [isDark, theme]);
  const emojiFallback = React.useMemo(() => withAlpha(Colors[theme].background, isDark ? 0.52 : 0.74), [isDark, theme]);

  const swipeGreenBg = React.useMemo(() => (isDark ? '#30D158' : '#34C759'), [isDark]);
  const swipeRedBg = React.useMemo(() => (isDark ? '#FF453A' : '#FF3B30'), [isDark]);

  const { tasks, setTasks, projects } = useTasksStore();
  const projectsById = React.useMemo(() => new Map(projects.map((p) => [p.id, p] as const)), [projects]);

  const completed = React.useMemo(
    () => tasks
      .filter((t) => t.section === 'completed' && !t.deletedAt)
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)),
    [tasks]
  );

  const trashed = React.useMemo(
    () => tasks.filter((t) => !!t.deletedAt).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)),
    [tasks]
  );

  const [tab, setTab] = React.useState<TabId>(() => {
    if (completed.length > 0) return 'completed';
    if (trashed.length > 0) return 'trash';
    return 'completed';
  });

  const onPressTask = React.useCallback(
    (taskId: string) => {
      router.push(`/task/${taskId}`);
    },
    [router]
  );

  const openTaskIdRef = React.useRef<string | null>(null);
  const closersRef = React.useRef(new Map<string, () => void>());
  const beginSwipe = React.useCallback((taskId: string) => {
    const open = openTaskIdRef.current;
    if (open && open !== taskId) {
      const close = closersRef.current.get(open);
      close?.();
    }
    openTaskIdRef.current = taskId;
  }, []);

  const endSwipe = React.useCallback((taskId: string) => {
    if (openTaskIdRef.current === taskId) openTaskIdRef.current = null;
  }, []);

  const registerClose = React.useCallback((taskId: string, close: () => void) => {
    closersRef.current.set(taskId, close);
  }, []);

  const unregisterClose = React.useCallback((taskId: string) => {
    closersRef.current.delete(taskId);
    if (openTaskIdRef.current === taskId) openTaskIdRef.current = null;
  }, []);

  const closeAnyOpen = React.useCallback(() => {
    const open = openTaskIdRef.current;
    if (!open) return;
    const close = closersRef.current.get(open);
    close?.();
    openTaskIdRef.current = null;
  }, []);

  const handlePressTask = React.useCallback(
    (taskId: string) => {
      // First tap closes swipe if anything is open.
      if (openTaskIdRef.current) {
        closeAnyOpen();
        return;
      }
      onPressTask(taskId);
    },
    [closeAnyOpen, onPressTask]
  );

  const moveCompletedBackToToday = React.useCallback(
    (taskId: string) => {
      setTasks((prev) => {
        const current = prev.find((t) => t.id === taskId);
        if (!current) return prev;
        const hasDueAt = hasValidDueAt(current.dueAt);
        const restoredSection = hasDueAt
          ? deriveActiveSectionFromDueAt(current.dueAt)
          : 'today';

        const activeInSection = prev
          .filter((t) => t.section === restoredSection && !t.deletedAt && t.id !== taskId)
          .sort((a, b) => a.orderRank - b.orderRank);
        const minRank = activeInSection.length ? activeInSection[0]!.orderRank : 1000;
        const nextRank = Math.max(0, minRank - 1000);

        return prev.map((t) => {
          if (t.id !== taskId) return t;
          return {
            ...t,
            section: restoredSection,
            completedAt: undefined,
            ...(hasDueAt
              ? {}
              : {
                  dueAt: getDueAtForSection('today'),
                  dueHasTime: true,
                }),
            orderRank: nextRank,
          };
        });
      });
    },
    [setTasks]
  );

  const restoreFromTrash = React.useCallback(
    (taskId: string) => {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, deletedAt: undefined } : t)));
    },
    [setTasks]
  );

  const moveToTrash = React.useCallback(
    (taskId: string) => {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, deletedAt: Date.now() } : t)));
    },
    [setTasks]
  );

  const deleteForever = React.useCallback(
    (taskId: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    },
    [setTasks]
  );

  const data = tab === 'completed' ? completed : trashed;

  const title = tab === 'completed' ? t('archive.tab.completed') : t('archive.tab.trash');
  const subtitle =
    tab === 'completed'
      ? formatCountLabel(completed.length)
      : formatCountLabel(trashed.length);

  const listHeader = React.useMemo(() => {
    return (
      <View style={styles.header}>
        <View style={styles.headerMeta}>
          <Text style={styles.titleText}>{title}</Text>
          <Text style={styles.subtitleText}>{subtitle}</Text>
        </View>

        <GlassSurface
          tintColor={withAlpha(Colors[theme].background, isDark ? 0.14 : 0.22)}
          fallbackBackgroundColor={withAlpha(Colors[theme].background, isDark ? 0.86 : 0.92)}
          style={styles.segmentWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('archive.tab.completed')}
            onPress={() => {
              closeAnyOpen();
              setTab('completed');
            }}
            style={({ pressed }) => [styles.segment, tab === 'completed' && styles.segmentActive, pressed && { opacity: 0.9 }]}>
            <Text style={[styles.segmentText, tab === 'completed' && styles.segmentTextActive]}>
              {`${t('archive.tab.completed')} (${completed.length})`}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('archive.tab.trash')}
            onPress={() => {
              closeAnyOpen();
              setTab('trash');
            }}
            style={({ pressed }) => [styles.segment, tab === 'trash' && styles.segmentActive, pressed && { opacity: 0.9 }]}>
            <Text style={[styles.segmentText, tab === 'trash' && styles.segmentTextActive]}>
              {`${t('archive.tab.trash')} (${trashed.length})`}
            </Text>
          </Pressable>
        </GlassSurface>
      </View>
    );
  }, [
    closeAnyOpen,
    completed.length,
    isDark,
    styles,
    tab,
    theme,
    title,
    subtitle,
    trashed.length,
  ]);

  const renderRow = React.useCallback(
    ({ item }: { item: Task }) => {
      return (
        <SwipeTaskRow
          task={item}
          project={projectsById.get(item.projectId)}
          drag={() => undefined}
          isActive={false}
          styles={styles}
          emojiTint={emojiTint}
          emojiFallback={emojiFallback}
          swipeCompleteBg={swipeGreenBg}
          swipeDeleteBg={swipeRedBg}
          leftAction={
            tab === 'trash'
              ? {
                  icon: 'restore',
                  backgroundColor: swipeGreenBg,
                  onTrigger: (taskId) => restoreFromTrash(taskId),
                }
              : undefined
          }
          rightAction={
            tab === 'trash'
              ? {
                  icon: 'delete-forever',
                  backgroundColor: swipeRedBg,
                  onTrigger: (taskId) => deleteForever(taskId),
                }
              : undefined
          }
          enabledTags={enabledTags}
          showTaskIcons={showTagIcons}
          beginSwipe={beginSwipe}
          endSwipe={endSwipe}
          registerClose={registerClose}
          unregisterClose={unregisterClose}
          closeAnyOpen={closeAnyOpen}
          onPressTask={handlePressTask}
          toggleComplete={(taskId) => moveCompletedBackToToday(taskId)}
          deleteTask={(taskId) => moveToTrash(taskId)}
        />
      );
    },
    [
      beginSwipe,
      closeAnyOpen,
      deleteForever,
      endSwipe,
      enabledTags,
      emojiFallback,
      emojiTint,
      handlePressTask,
      moveCompletedBackToToday,
      moveToTrash,
      projectsById,
      registerClose,
      restoreFromTrash,
      showTagIcons,
      styles,
      tab,
      unregisterClose,
      swipeGreenBg,
      swipeRedBg,
    ]
  );

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: t('archive.title'),
          headerTitle: t('archive.title'),
          //headerBackTitle: ' ',
          headerBackButtonDisplayMode: 'minimal',
          //headerTransparent: true,
          //headerShadowVisible: false,
          //headerStyle: { backgroundColor: 'transparent' },
          //headerBackButtonDisplayMode: 'minimal',
        } as any}
      />

      <FlatList
        data={data}
        keyExtractor={(t) => `${t.id}:${tab}`}
        renderItem={renderRow}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{tab === 'completed' ? t('archive.empty.completedTitle') : t('archive.empty.trashTitle')}</Text>
            <Text style={styles.emptySubtitle}>
              {tab === 'completed'
                ? t('archive.empty.completedBody')
                : t('archive.empty.trashBody')}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const createStyles = (theme: keyof typeof Colors) => {
  const isDark = theme === 'dark';
  const text = Colors[theme].text;
  const rowSurface = Colors[theme].background;
  const hairline = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';

  const rowDivider = isDark ? 'rgba(255,255,255,0.24)' : 'rgba(0,0,0,0.16)';
  const tagBg = withAlpha(text, isDark ? 0.10 : 0.08);
  const tagText = withAlpha(text, 0.78);
  const dangerBg = isDark ? 'rgba(255,69,58,0.18)' : 'rgba(255,59,48,0.14)';
  const dangerBorder = isDark ? 'rgba(255,69,58,0.32)' : 'rgba(255,59,48,0.26)';
  const rowMetaText = withAlpha(text, isDark ? 0.5 : 0.42);

  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: Colors[theme].background,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 56,
    },

    header: {
      gap: 10,
      marginBottom: 12,
    },
    headerMeta: {
      flex: 1,
      gap: 3,
    },

    titleText: {
      fontSize: 24,
      lineHeight: 30,
      fontWeight: '700',
      letterSpacing: -0.1,
      color: text,
    },
    subtitleText: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
      color: withAlpha(text, 0.7),
    },

    segmentWrap: {
      flexDirection: 'row',
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hairline,
      overflow: 'hidden',
    },
    segment: {
      flex: 1,
      paddingVertical: 9,
      paddingHorizontal: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentActive: {
      backgroundColor: withAlpha(text, isDark ? 0.16 : 0.08),
    },
    segmentText: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
      color: withAlpha(text, 0.7),
    },
    segmentTextActive: {
      color: text,
    },

    // --- shared task row styles (same contract as Home SwipeTaskRow) ---
    itemSpacer: {
      marginBottom: 0,
    },
    swipeClip: {
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: rowSurface,
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
      width: 40,
      height: 40,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    row: {
      minHeight: 60,
      borderRadius: 0,
      backgroundColor: rowSurface,
      justifyContent: 'center',
      paddingHorizontal: 8,
      paddingVertical: 8,
      gap: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: rowDivider,
    },
    dragRow: {
      borderRadius: 0,
      backgroundColor: rowSurface,
      borderWidth: 0,
      opacity: 1,
    },
    rowInner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    emojiTile: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      marginTop: 1,
    },
    emojiText: {
      fontSize: 17,
    },
    textStack: {
      flex: 1,
      gap: 2,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    rowTitle: {
      flex: 1,
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '700',
      color: text,
      letterSpacing: -0.2,
    },
    rowMeta: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '700',
      color: rowMetaText,
      letterSpacing: 0.15,
    },
    rowSubtitle: {
      fontSize: 13,
      lineHeight: 17,
      fontWeight: '600',
      color: withAlpha(text, 0.72),
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
    tagChipText: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
      color: tagText,
      maxWidth: 220,
    },

    empty: {
      paddingTop: 22,
      paddingHorizontal: 8,
      alignItems: 'center',
      gap: 6,
    },
    emptyTitle: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '700',
      color: text,
    },
    emptySubtitle: {
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '600',
      color: withAlpha(text, 0.65),
      textAlign: 'center',
    },
  });
};
