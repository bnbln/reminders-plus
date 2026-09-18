import { usePageDimensions } from "@/components/navigation/vertical-bar-safe-area";
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from "expo-router";
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { NativeModules, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FloatingAddButton } from '@/components/ui/floating-add-button';
import { GlassSurface, withAlpha } from '@/components/ui/glass-surface';
import { StreakAccentBackground } from '@/components/ui/streak-accent-background';
import { Colors } from '@/constants/theme';
import { useTaskCreateContext } from '@/context/task-create-context';
import { Task, useTasksStore } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { countLabel, getIntlLocale, t } from '@/i18n';
import { isIOS26OrNewer } from '@/utils/ios-version';
import { hasValidDueAt } from '@/utils/task-dates';
import { ripple, rippleClip } from '@/components/ui/ripple';

type ThemeName = keyof typeof Colors;
type RoutineStatsBucket = 'daily' | 'weekly' | 'monthlyPlus';
type TaskAccessoryContextBridge = {
  setContext?: (
    mode: 'task' | 'today' | 'routine' | 'project' | 'inProject',
    projectId?: string | null,
    projectLabel?: string | null,
  ) => void;
};

const DAILY_ROUTINE_TYPES = new Set(['hourly', 'daily']);
const WEEKLY_ROUTINE_TYPES = new Set(['weekdays', 'weekends', 'weekly', 'biweekly']);
const MONTHLY_PLUS_ROUTINE_TYPES = new Set(['monthly', 'quarterly', 'biannually', 'yearly']);
const TASK_LIST_WIDE_LAYOUT_BREAKPOINT = 900;
const TASK_LIST_MAX_CONTENT_WIDTH = 760;

const getRoutineLabel = (task: Task): string => {
  const type = task.routineType || task.routineInterval;
  if (!type) return t('taskDetail.routine.default');

  switch (type) {
    case 'hourly': return t('taskDetail.routine.hourly');
    case 'daily': return t('taskDetail.routine.daily');
    case 'weekdays': return t('taskDetail.routine.weekdays');
    case 'weekends': return t('taskDetail.routine.weekends');
    case 'weekly': return t('taskDetail.routine.weekly');
    case 'biweekly': return t('taskDetail.routine.biweekly');
    case 'monthly': return t('taskDetail.routine.monthly');
    case 'quarterly': return t('taskDetail.routine.quarterly');
    case 'biannually': return t('taskDetail.routine.biannually');
    case 'yearly': return t('taskDetail.routine.yearly');
    case 'custom': return t('taskDetail.routine.custom');
    default: return t('taskDetail.routine.default');
  }
};

const formatNextDue = (task: Pick<Task, 'dueAt' | 'dueHasTime'>): string | null => {
  if (!Number.isFinite(task.dueAt) || task.dueAt <= 0) return null;
  const d = new Date(task.dueAt);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const hasTime = task.dueHasTime === true;

  const formatTime = () =>
    d.toLocaleTimeString(getIntlLocale(), { hour: '2-digit', minute: '2-digit' });

  if (d.toDateString() === today.toDateString()) {
    return hasTime ? `${t('taskDetail.relative.today')}, ${formatTime()}` : t('taskDetail.relative.today');
  }
  if (d.toDateString() === tomorrow.toDateString()) {
    return hasTime ? `${t('taskDetail.relative.tomorrow')}, ${formatTime()}` : t('taskDetail.relative.tomorrow');
  }

  return d.toLocaleDateString(
    getIntlLocale(),
    hasTime
      ? { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }
      : { weekday: 'short', day: '2-digit', month: 'short' },
  );
};

const isSameLocalDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const isDueOnDate = (dueAt: number, date: Date) => {
  if (!Number.isFinite(dueAt) || dueAt <= 0) return false;
  return isSameLocalDay(new Date(dueAt), date);
};

const getRoutineStatsBucket = (task: Task): RoutineStatsBucket => {
  const type = task.routineType;

  if (type) {
    if (DAILY_ROUTINE_TYPES.has(type)) return 'daily';
    if (WEEKLY_ROUTINE_TYPES.has(type)) return 'weekly';
    if (MONTHLY_PLUS_ROUTINE_TYPES.has(type)) return 'monthlyPlus';
    if (type === 'custom') {
      if (typeof task.routineMonthDay === 'number' || typeof task.routineMonth === 'number') {
        return 'monthlyPlus';
      }
      if (typeof task.routineWeekday === 'number' || typeof task.routineNthWeek === 'number') {
        return 'weekly';
      }
      // `custom` advances daily in getNextRoutineDate today, so default to daily bucket.
      return 'daily';
    }
  }

  // Legacy fallback for older snapshots.
  switch (task.routineInterval) {
    case 'daily':
      return 'daily';
    case 'weekly':
      return 'weekly';
    case 'monthly':
    case 'yearly':
      return 'monthlyPlus';
    default:
      return 'daily';
  }
};

const getRoutineAccentColor = (task: Task) => {
  const bucket = getRoutineStatsBucket(task);
  if (bucket === 'daily') return '#0A84FF';
  if (bucket === 'weekly') return '#8B5CF6';
  return '#F59E0B';
};

const createStyles = (theme: ThemeName, compact: boolean) => {
  const isDark = theme === 'dark';
  const text = Colors[theme].text;
  const cardBorder = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(17,24,28,0.09)';
  const cardBg = isDark ? '#1C1C1E' : '#F2F2F7';
  const subtitleColor = withAlpha(text, 0.62);

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 32,
      gap: 16,
    },
    contentWithFab: {
      paddingBottom: 168,
    },
    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: compact ? 10 : 14,
      paddingVertical: compact ? 10 : 14,
      marginBottom: 8,
    },
    heroIcon: {
      marginTop: compact ? -2 : -4,
    },
    heroTextWrap: {
      alignItems: 'flex-start',
      gap: 2,
    },
    bigNumber: {
      fontSize: compact ? 54 : 64,
      fontWeight: '900',
      letterSpacing: -0.8,
      lineHeight: compact ? 54 : 64,
      color: text,
    },
    heroSubtitle: {
      fontSize: compact ? 15 : 16,
      fontWeight: '700',
      lineHeight: compact ? 19 : 20,
      color: subtitleColor,
    },
    statsGridWrap: {
      marginBottom: 16,
    },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    statTile: {
      width: '48.5%',
    },
    statCard: {
      borderRadius: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: cardBorder,
      overflow: 'hidden',
      backgroundColor: cardBg,
      minHeight: 110,
    },
    statCardInner: {
      paddingHorizontal: 20,
      paddingVertical: 20,
      justifyContent: 'center',
      gap: 8,
    },
    statIconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    statTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: subtitleColor,
      letterSpacing: 0.2,
    },
    statSubtitle: {
      fontSize: compact ? 18 : 22,
      lineHeight: compact ? 22 : 26,
      fontWeight: '700',
      color: text,
      letterSpacing: -0.2,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: text,
      letterSpacing: 0.2,
      marginBottom: 10,
    },
    routinesList: {
      gap: 10,
    },
    routineCard: {
      borderRadius: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: cardBorder,
      overflow: 'hidden',
      backgroundColor: cardBg,
    },
    routineCardInner: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 18,
      paddingVertical: 16,
      gap: 12,
    },
    routineEmoji: {
      fontSize: 28,
    },
    routineBody: {
      flex: 1,
      gap: 6,
    },
    routineTitle: {
      fontSize: 16,
      lineHeight: 20,
      fontWeight: '700',
      color: text,
    },
    routineMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
    },
    intervalBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
    },
    intervalText: {
      fontSize: 11,
      fontWeight: '700',
    },
    nextDueText: {
      fontSize: 12,
      fontWeight: '700',
      color: subtitleColor,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
      gap: 12,
    },
    emptyText: {
      fontSize: 14,
      fontWeight: '700',
      color: subtitleColor,
      textAlign: 'center',
    },
  });
};

function StatTile({
  title,
  value,
  icon,
  iconColor,
  styles,
  glassTint,
  glassFallback,
}: {
  title: string;
  value: number | string;
  icon: keyof typeof MaterialIcons.glyphMap;
  iconColor: string;
  styles: ReturnType<typeof createStyles>;
  glassTint: string;
  glassFallback: string;
}) {
  return (
    <View style={styles.statTile}>
      <GlassSurface
        style={styles.statCard}
        glassEffectStyle="regular"
        tintColor={glassTint}
        fallbackBackgroundColor={glassFallback}
      >
        <View style={styles.statCardInner}>
          <View style={styles.statIconRow}>
            <MaterialIcons name={icon} size={16} color={iconColor} />
            <Text style={styles.statTitle} numberOfLines={1}>
              {title}
            </Text>
          </View>
          <Text
            style={styles.statSubtitle}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {value}
          </Text>
        </View>
      </GlassSurface>
    </View>
  );
}

export default function RoutinesScreen() {
  const { width } = usePageDimensions();
  const theme = useColorScheme() ?? 'light';
  const isDark = theme === 'dark';
  const compact = width < 390;
  const router = useRouter();
  const accessoryBridge = NativeModules
    .TaskAccessoryContextBridge as TaskAccessoryContextBridge | undefined;
  const showFloatingAddButton = Platform.OS === 'ios' && !isIOS26OrNewer();
  const styles = useMemo(() => createStyles(theme, compact), [compact, theme]);
  const constrainedTaskContentStyle = React.useMemo(() => {
    if (width < TASK_LIST_WIDE_LAYOUT_BREAKPOINT) return null;
    return {
      width: '100%' as const,
      maxWidth: Math.min(TASK_LIST_MAX_CONTENT_WIDTH, width - 32),
      alignSelf: 'center' as const,
    };
  }, [width]);
  const { setMode } = useTaskCreateContext();
  const { tasks } = useTasksStore();

  useFocusEffect(
    React.useCallback(() => {
      setMode('routine');
      if (Platform.OS !== 'ios' || !isIOS26OrNewer()) return undefined;
      accessoryBridge?.setContext?.('routine', null, null);
      return undefined;
    }, [accessoryBridge, setMode]),
  );

  // Filter to active routine tasks
  const routineTasks = useMemo(() => {
    return tasks.filter(
      (t): t is Task & { isRoutine: true } =>
        t.isRoutine === true &&
        (!!t.routineType || !!t.routineInterval) &&
        !t.deletedAt &&
        t.section !== 'completed' &&
        !hasValidDueAt(t.completedAt)
    );
  }, [tasks]);

  const routinesCount = routineTasks.length;

  const routineStats = useMemo(() => {
    const today = new Date();

    return routineTasks.reduce(
      (acc, task) => {
        if (isDueOnDate(task.dueAt, today)) {
          acc.dueToday += 1;
        }

        const bucket = getRoutineStatsBucket(task);
        if (bucket === 'daily') acc.daily += 1;
        if (bucket === 'weekly') acc.weekly += 1;
        if (bucket === 'monthlyPlus') acc.monthlyPlus += 1;

        return acc;
      },
      { dueToday: 0, daily: 0, weekly: 0, monthlyPlus: 0 },
    );
  }, [routineTasks]);

  const dailyCount = routineStats.daily;
  const weeklyCount = routineStats.weekly;
  const monthlyCount = routineStats.monthlyPlus;
  const dueTodayCount = routineStats.dueToday;

  const textColor = Colors[theme].text;
  const iconColor = routinesCount > 0 ? '#0A84FF' : '#9CA3AF';
  const tileSurfaceBg = isDark ? '#1C1C1E' : '#F2F2F7';
  const gridGlassTint = isDark ? withAlpha(tileSurfaceBg, 0.22) : tileSurfaceBg;
  const gridGlassFallback = tileSurfaceBg;
  const cardGlassTint = withAlpha(Colors[theme].background, isDark ? 0.18 : 0.28);
  const cardGlassFallback = tileSurfaceBg;

  const handleAddTask = React.useCallback(() => {
    router.push({ pathname: '/task/create-modal', params: { preset: 'routine' } });
  }, [router]);

  return (
    <View style={styles.container}>
      <StreakAccentBackground isDark={isDark} />
      <ScrollView
        style={styles.container}
        contentInsetAdjustmentBehavior="automatic"
        alwaysBounceVertical
        contentContainerStyle={[styles.content, showFloatingAddButton ? styles.contentWithFab : null]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <View style={styles.hero}>
          <MaterialIcons
            name="loop"
            size={compact ? 34 : 40}
            color={iconColor}
            style={styles.heroIcon}
          />
          <View style={styles.heroTextWrap}>
            <Text style={styles.bigNumber}>{routinesCount}</Text>
            <Text style={styles.heroSubtitle}>
              {routinesCount === 1 ? t('routines.hero.one') : t('routines.hero.other')}
            </Text>
          </View>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGridWrap}>
          <View style={styles.statsGrid}>
            <StatTile
              title={t('routines.stats.dueToday')}
              value={countLabel(dueTodayCount, 'routines.count.tasks.one', 'routines.count.tasks.other')}
              icon="today"
              iconColor="#10B981"
              styles={styles}
              glassTint={gridGlassTint}
              glassFallback={gridGlassFallback}
            />
            <StatTile
              title={t('routines.stats.daily')}
              value={countLabel(dailyCount, 'routines.count.routines.one', 'routines.count.routines.other')}
              icon="repeat"
              iconColor="#0A84FF"
              styles={styles}
              glassTint={gridGlassTint}
              glassFallback={gridGlassFallback}
            />
            <StatTile
              title={t('routines.stats.weekly')}
              value={countLabel(weeklyCount, 'routines.count.routines.one', 'routines.count.routines.other')}
              icon="date-range"
              iconColor="#8B5CF6"
              styles={styles}
              glassTint={gridGlassTint}
              glassFallback={gridGlassFallback}
            />
            <StatTile
              title={t('routines.stats.monthlyPlus')}
              value={countLabel(monthlyCount, 'routines.count.routines.one', 'routines.count.routines.other')}
              icon="calendar-today"
              iconColor="#F59E0B"
              styles={styles}
              glassTint={gridGlassTint}
              glassFallback={gridGlassFallback}
            />
          </View>
        </View>

        {/* Routines List */}
        <View style={constrainedTaskContentStyle}>
          <Text style={styles.sectionTitle}>{t('routines.section.all')}</Text>
          {routineTasks.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="loop" size={40} color={withAlpha(textColor, 0.25)} />
              <Text style={styles.emptyText}>
                {t('routines.empty.title')}{'\n'}{t('routines.empty.subtitle')}
              </Text>
            </View>
          ) : (
            <View style={styles.routinesList}>
              {routineTasks.map((routine) => {
                const intervalLabel = getRoutineLabel(routine);
                const intervalColor = getRoutineAccentColor(routine);
                const nextDueLabel = formatNextDue(routine);

                return (
                  <Pressable
                    android_ripple={ripple()}
                    key={routine.id}
                    onPress={() => router.push(`/task/${routine.id}`)}
                    style={rippleClip(24)}
                  >
                    <GlassSurface
                      style={styles.routineCard}
                      glassEffectStyle="regular"
                      tintColor={cardGlassTint}
                      fallbackBackgroundColor={cardGlassFallback}
                    >
                      <View style={styles.routineCardInner}>
                        <Text style={styles.routineEmoji}>{routine.emoji}</Text>
                        <View style={styles.routineBody}>
                          <Text style={styles.routineTitle} numberOfLines={1}>{routine.title}</Text>
                          <View style={styles.routineMeta}>
                            <View style={[styles.intervalBadge, { backgroundColor: withAlpha(intervalColor, isDark ? 0.2 : 0.15) }]}>
                              <Text style={[styles.intervalText, { color: intervalColor }]}>{intervalLabel}</Text>
                            </View>
                            {nextDueLabel ? <Text style={styles.nextDueText}>{nextDueLabel}</Text> : null}
                          </View>
                        </View>
                        <MaterialIcons name="chevron-right" size={20} color={withAlpha(textColor, 0.4)} />
                      </View>
                    </GlassSurface>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {showFloatingAddButton ? <FloatingAddButton onPress={handleAddTask} /> : null}
    </View>
  );
}
