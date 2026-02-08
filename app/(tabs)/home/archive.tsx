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

  const hairline = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';

  const cardBg = isDark ? '#1C1C1E' : '#F2F2F7';
  const glassTint = withAlpha(Colors[theme].text, isDark ? 0.12 : 0.06);
  const glassFallback = withAlpha(cardBg, isDark ? 0.92 : 1);

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

        const todayActive = prev
          .filter((t) => t.section === 'today' && !t.deletedAt)
          .sort((a, b) => a.orderRank - b.orderRank);
        const minRank = todayActive.length ? todayActive[0]!.orderRank : 1000;
        const nextRank = Math.max(0, minRank - 1000);

        return prev.map((t) => {
          if (t.id !== taskId) return t;
          const hasDueAt = typeof t.dueAt === 'number' && Number.isFinite(t.dueAt) && t.dueAt > 0;
          return {
            ...t,
            section: 'today',
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

  const headerEmoji = tab === 'completed' ? '✅' : '🧹';

  const listHeader = React.useMemo(() => {
    return (
      <View style={styles.header}>
        <View style={styles.headerRow}>

          {/* <View style={[styles.headerEmojiTile, { borderColor: hairline }]}>
            <GlassSurface
              style={styles.headerEmojiTileInner}
              glassEffectStyle="regular"
              tintColor={glassTint}
              fallbackBackgroundColor={glassFallback}>
              <Text style={styles.headerEmojiText}>{headerEmoji}</Text>
            </GlassSurface>
          </View> */}

          {/* <View style={styles.headerMeta}>
            <Text style={[styles.titleText, { color: Colors[theme].text }]}>{title}</Text>
            <Text style={[styles.subtitleText, { color: withAlpha(Colors[theme].text, 0.72) }]}>{subtitle}</Text>
          </View> */}
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
    glassFallback,
    glassTint,
    hairline,
    headerEmoji,
    isDark,
    styles,
    subtitle,
    tab,
    theme,
    title,
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
  const hairline = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';

  const cardBg = isDark ? '#1C1C1E' : '#F2F2F7';
  const tagBg = withAlpha(text, isDark ? 0.10 : 0.08);
  const tagText = withAlpha(text, 0.78);
  const dangerBg = isDark ? 'rgba(255,69,58,0.18)' : 'rgba(255,59,48,0.14)';
  const dangerBorder = isDark ? 'rgba(255,69,58,0.32)' : 'rgba(255,59,48,0.26)';

  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: Colors[theme].background,
    },
    content: {
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 44,
    },

    header: {
      gap: 14,
      marginBottom: 14,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 14,
    },
    headerMeta: {
      flex: 1,
      gap: 6,
    },

    headerEmojiTile: {
      width: 64,
      height: 64,
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
    },
    headerEmojiTileInner: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerEmojiText: {
      fontSize: 30,
    },

    titleText: {
      fontSize: 30,
      fontWeight: '900',
      letterSpacing: -0.2,
    },
    subtitleText: {
      fontSize: 15,
      fontWeight: '600',
      lineHeight: 20,
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
      paddingVertical: 10,
      paddingHorizontal: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentActive: {
      backgroundColor: withAlpha(text, isDark ? 0.16 : 0.08),
    },
    segmentText: {
      fontSize: 12,
      fontWeight: '800',
      color: withAlpha(text, 0.7),
    },
    segmentTextActive: {
      color: text,
    },

    // --- shared task row styles (same contract as Home SwipeTaskRow) ---
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
    row: {
      minHeight: 56,
      borderRadius: 12,
      backgroundColor: cardBg,
      justifyContent: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hairline,
    },
    dragRow: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hairline,
      shadowColor: '#000',
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
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
      fontWeight: '600',
      color: tagText,
      maxWidth: 220,
    },

    empty: {
      paddingTop: 18,
      paddingHorizontal: 8,
      alignItems: 'center',
      gap: 6,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: text,
    },
    emptySubtitle: {
      fontSize: 13,
      fontWeight: '600',
      color: withAlpha(text, 0.65),
      textAlign: 'center',
    },
  });
};
