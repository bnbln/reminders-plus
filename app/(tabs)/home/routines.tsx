import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FloatingAddButton } from '@/components/ui/floating-add-button';
import { GlassSurface, withAlpha } from '@/components/ui/glass-surface';
import { Colors } from '@/constants/theme';
import { Task, useTasksStore } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { countLabel, getIntlLocale, t } from '@/i18n';
import { isIOS26OrNewer } from '@/utils/ios-version';

type ThemeName = keyof typeof Colors;

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

const formatNextDue = (ms: number) => {
  if (!Number.isFinite(ms) || ms <= 0) return t('routines.noDate');
  const d = new Date(ms);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (d.toDateString() === today.toDateString()) return t('taskDetail.relative.today');
  if (d.toDateString() === tomorrow.toDateString()) return t('taskDetail.relative.tomorrow');

  return d.toLocaleDateString(getIntlLocale(), { weekday: 'short', day: '2-digit', month: 'short' });
};

const createStyles = (theme: ThemeName) => {
  const isDark = theme === 'dark';
  const text = Colors[theme].text;
  const hairline = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)';
  const cardBg = isDark ? '#1C1C1E' : '#F2F2F7';
  const subtitleColor = withAlpha(text, 0.62);

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors[theme].background,
    },
    content: {
      paddingHorizontal: 16,
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
      gap: 16,
      paddingVertical: 20,
    },
    iconContainer: {
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
    },
    glow: {
      position: 'absolute',
      width: 30,
      height: 30,
      borderRadius: 15,
      opacity: 0.4,
      transform: [{ scale: 1.8 }],
      zIndex: -1,
    },
    bigNumber: {
      fontSize: 48,
      fontWeight: '900',
      letterSpacing: -1,
      lineHeight: 48,
      color: text,
    },
    heroSubtitle: {
      fontSize: 16,
      fontWeight: '600',
      color: subtitleColor,
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
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hairline,
      overflow: 'hidden',
      backgroundColor: cardBg,
    },
    statCardInner: {
      paddingHorizontal: 12,
      paddingVertical: 12,
      gap: 6,
    },
    statIconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    statIconBadge: {
      width: 36,
      height: 36,
      borderRadius: 18,
      padding: 8,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    statTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: text,
      letterSpacing: 0.2,
    },
    statSubtitle: {
      fontSize: 12,
      fontWeight: '700',
      color: subtitleColor,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: text,
      letterSpacing: 0.2,
      marginBottom: 8,
    },
    routinesList: {
      gap: 10,
    },
    routineCard: {
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hairline,
      overflow: 'hidden',
      backgroundColor: cardBg,
    },
    routineCardInner: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      gap: 12,
    },
    routineEmoji: {
      fontSize: 28,
    },
    routineBody: {
      flex: 1,
      gap: 4,
    },
    routineTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: text,
    },
    routineMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    intervalBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    intervalText: {
      fontSize: 11,
      fontWeight: '700',
    },
    nextDueText: {
      fontSize: 12,
      fontWeight: '600',
      color: subtitleColor,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
      gap: 12,
    },
    emptyText: {
      fontSize: 14,
      fontWeight: '600',
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
  isDark,
}: {
  title: string;
  value: number | string;
  icon: keyof typeof MaterialIcons.glyphMap;
  iconColor: string;
  styles: ReturnType<typeof createStyles>;
  glassTint: string;
  glassFallback: string;
  isDark: boolean;
}) {
  const badgeTint = withAlpha(iconColor, isDark ? 0.22 : 0.18);
  const badgeFallback = withAlpha(iconColor, isDark ? 0.26 : 0.18);

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
            <GlassSurface
              style={styles.statIconBadge}
              glassEffectStyle="regular"
              tintColor={badgeTint}
              fallbackBackgroundColor={badgeFallback}
            >
              <MaterialIcons name={icon} size={18} color={iconColor} />
            </GlassSurface>
          </View>
          <Text style={styles.statTitle}>{title}</Text>
          <Text style={styles.statSubtitle}>{value}</Text>
        </View>
      </GlassSurface>
    </View>
  );
}

export default function RoutinesScreen() {
  const theme = useColorScheme() ?? 'light';
  const isDark = theme === 'dark';
  const router = useRouter();
  const scrollRef = React.useRef<ScrollView | null>(null);
  const showFloatingAddButton = Platform.OS === 'ios' && !isIOS26OrNewer();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { tasks } = useTasksStore();

  // Filter to active routine tasks
  const routineTasks = useMemo(() => {
    return tasks.filter(
      (t): t is Task & { isRoutine: true } =>
        t.isRoutine === true && (!!t.routineType || !!t.routineInterval) && !t.deletedAt
    );
  }, [tasks]);

  const routinesCount = routineTasks.length;

  // Stats
  const dailyCount = routineTasks.filter(t => t.routineInterval === 'daily').length;
  const weeklyCount = routineTasks.filter(t => t.routineInterval === 'weekly').length;
  const monthlyCount = routineTasks.filter(t => t.routineInterval === 'monthly' || t.routineInterval === 'yearly').length;

  // Routines due today
  const today = new Date();
  const dueTodayCount = routineTasks.filter(t => {
    if (!t.dueAt || t.dueAt <= 0) return false;
    return new Date(t.dueAt).toDateString() === today.toDateString();
  }).length;

  const textColor = Colors[theme].text;
  const backgroundColor = Colors[theme].background;
  const iconColor = routinesCount > 0 ? '#0A84FF' : '#9CA3AF';

  const glassTint = withAlpha(backgroundColor, isDark ? 0.18 : 0.28);
  const glassFallback = isDark ? '#1C1C1E' : '#F2F2F7';

  const handleAddTask = React.useCallback(() => {
    router.push('/task/create-modal');
  }, [router]);

  useFocusEffect(
    React.useCallback(() => {
      const frame = requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      });
      return () => cancelAnimationFrame(frame);
    }, [])
  );

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentInsetAdjustmentBehavior="automatic"
        alwaysBounceVertical
        contentContainerStyle={[styles.content, showFloatingAddButton ? styles.contentWithFab : null]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <View style={styles.hero}>
          <View style={styles.iconContainer}>
            <MaterialIcons name="loop" size={56} color={iconColor} />
            {routinesCount > 0 && <View style={[styles.glow, { backgroundColor: iconColor }]} />}
          </View>
          <View>
            <Text style={styles.bigNumber}>{routinesCount}</Text>
            <Text style={styles.heroSubtitle}>
              {routinesCount === 1 ? t('routines.hero.one') : t('routines.hero.other')}
            </Text>
          </View>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <StatTile
            title={t('routines.stats.dueToday')}
            value={countLabel(dueTodayCount, 'routines.count.tasks.one', 'routines.count.tasks.other')}
            icon="today"
            iconColor="#10B981"
            styles={styles}
            glassTint={glassTint}
            glassFallback={glassFallback}
            isDark={isDark}
          />
          <StatTile
            title={t('routines.stats.daily')}
            value={countLabel(dailyCount, 'routines.count.routines.one', 'routines.count.routines.other')}
            icon="repeat"
            iconColor="#0A84FF"
            styles={styles}
            glassTint={glassTint}
            glassFallback={glassFallback}
            isDark={isDark}
          />
          <StatTile
            title={t('routines.stats.weekly')}
            value={countLabel(weeklyCount, 'routines.count.routines.one', 'routines.count.routines.other')}
            icon="date-range"
            iconColor="#8B5CF6"
            styles={styles}
            glassTint={glassTint}
            glassFallback={glassFallback}
            isDark={isDark}
          />
          <StatTile
            title={t('routines.stats.monthlyPlus')}
            value={countLabel(monthlyCount, 'routines.count.routines.one', 'routines.count.routines.other')}
            icon="calendar-today"
            iconColor="#F59E0B"
            styles={styles}
            glassTint={glassTint}
            glassFallback={glassFallback}
            isDark={isDark}
          />
        </View>

        {/* Routines List */}
        <View>
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
                const type = routine.routineType || routine.routineInterval;
                const intervalColor = (type === 'daily' || type === 'hourly') ? '#0A84FF' :
                  (type === 'weekly' || type === 'weekdays' || type === 'weekends' || type === 'biweekly') ? '#8B5CF6' :
                    (type === 'monthly' || type === 'quarterly' || type === 'biannually') ? '#F59E0B' : '#10B981';

                return (
                  <Pressable
                    key={routine.id}
                    onPress={() => router.push(`/task/${routine.id}`)}
                  >
                    <GlassSurface
                      style={styles.routineCard}
                      glassEffectStyle="regular"
                      tintColor={glassTint}
                      fallbackBackgroundColor={glassFallback}
                    >
                      <View style={styles.routineCardInner}>
                        <Text style={styles.routineEmoji}>{routine.emoji}</Text>
                        <View style={styles.routineBody}>
                          <Text style={styles.routineTitle} numberOfLines={1}>{routine.title}</Text>
                          <View style={styles.routineMeta}>
                            <View style={[styles.intervalBadge, { backgroundColor: withAlpha(intervalColor, isDark ? 0.2 : 0.15) }]}>
                              <Text style={[styles.intervalText, { color: intervalColor }]}>{intervalLabel}</Text>
                            </View>
                            <Text style={styles.nextDueText}>{t('routines.next', { value: formatNextDue(routine.dueAt) })}</Text>
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
