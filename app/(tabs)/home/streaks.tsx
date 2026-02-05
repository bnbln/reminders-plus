import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useHeaderHeight } from '@react-navigation/elements';
import React, { useMemo, useState } from 'react';
import { LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GlassSurface, withAlpha } from '@/components/ui/glass-surface';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ChartDataPoint, useStreaks } from '@/hooks/use-streaks';
import { countLabel, t } from '@/i18n';

type ThemeName = keyof typeof Colors;
type RangeOption = '7d' | '14d' | '1m' | '1y' | 'max';

// Exact styles from home/index.tsx QuickNavGrid
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
    // Hero section
    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      paddingVertical: 20,
      marginBottom: 8,
    },
    fireContainer: {
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
    // QuickTile grid (exact copy from home/index.tsx)
    quickGridWrap: {
      marginBottom: 16,
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
      color: subtitleColor,
    },
    // Chart styles
    chartCard: {
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hairline,
      overflow: 'hidden',
      backgroundColor: cardBg,
      padding: 16,
    },
    chartHeader: {
      marginBottom: 16,
      gap: 12,
    },
    cardTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: text,
      letterSpacing: 0.2,
    },
    segmentedControl: {
      flexDirection: 'row',
      padding: 3,
      borderRadius: 10,
      height: 32,
      backgroundColor: withAlpha(text, isDark ? 0.08 : 0.06),
    },
    segment: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 7,
    },
    segmentActive: {
      backgroundColor: cardBg,
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.3 : 0.1,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
    },
    segmentText: {
      fontSize: 11,
      fontWeight: '600',
      color: subtitleColor,
    },
    segmentTextActive: {
      fontWeight: '700',
      color: text,
    },
    chartBody: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      height: 120,
      paddingTop: 8,
    },
    barContainer: {
      flex: 1,
      alignItems: 'center',
      height: '100%',
      justifyContent: 'flex-end',
      gap: 6,
    },
    barTrack: {
      width: '55%',
      height: '100%',
      justifyContent: 'flex-end',
      borderRadius: 4,
    },
    barFill: {
      width: '100%',
      borderRadius: 4,
      minHeight: 4,
    },
    barLabel: {
      fontSize: 9,
      fontWeight: '600',
      textAlign: 'center',
      width: 18,
    },
    emptyChart: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
    },
  });
};

function ChartBar({ item, max, textColor, isDark }: { item: ChartDataPoint; max: number; textColor: string; isDark: boolean }) {
  const heightPercent = max > 0 ? (item.count / max) * 100 : 0;
  const barHeight = item.count > 0 ? `${Math.max(8, heightPercent)}%` : '0%';
  const isZero = item.count === 0;
  const barColor = item.isToday ? '#EF4444' : withAlpha(textColor, 0.6);

  const styles = createStyles(isDark ? 'dark' : 'light');

  return (
    <View style={styles.barContainer}>
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            {
              height: barHeight as any,
              backgroundColor: isZero ? withAlpha(textColor, 0.08) : barColor,
            },
            isZero && { height: 4 }
          ]}
        />
      </View>
      <Text
        style={[
          styles.barLabel,
          {
            color: item.isToday ? '#EF4444' : withAlpha(textColor, 0.45),
            fontWeight: item.isToday ? '700' : '600'
          }
        ]}
        numberOfLines={1}
      >
        {item.label[0]}
      </Text>
    </View>
  );
}

// QuickTile-style stat card (matches home/index.tsx exactly)
function StatTile({
  title,
  value,
  icon,
  iconColor,
  styles,
  glassTint,
  glassFallback,
  chevronColor,
  isDark,
}: {
  title: string;
  value: number | string;
  icon: keyof typeof MaterialIcons.glyphMap;
  iconColor: string;
  styles: ReturnType<typeof createStyles>;
  glassTint: string;
  glassFallback: string;
  chevronColor: string;
  isDark: boolean;
}) {
  const badgeBg = withAlpha(iconColor, isDark ? 0.15 : 0.12);

  return (
    <View style={styles.quickTilePressable}>
      <GlassSurface
        style={styles.quickTile}
        glassEffectStyle="regular"
        tintColor={glassTint}
        fallbackBackgroundColor={glassFallback}
      >
        <View style={styles.quickTileInner}>
          <View style={styles.quickTileIconRow}>
            <View style={[styles.quickTileIconBadge, { backgroundColor: badgeBg }]}>
              <MaterialIcons name={icon} size={18} color={iconColor} />
            </View>
            <MaterialIcons name="chevron-right" size={18} color={chevronColor} />
          </View>
          <Text style={styles.quickTileTitle}>{title}</Text>
          <Text style={styles.quickTileSubtitle}>{value}</Text>
        </View>
      </GlassSurface>
    </View>
  );
}

export default function StreaksScreen() {
  const theme = useColorScheme() ?? 'light';
  const isDark = theme === 'dark';
  const headerHeight = useHeaderHeight();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const {
    currentStreak,
    longestStreak,
    todayCompletedCount,
    last7DaysCount,
    mostTasksInOneDay,
    getChartData
  } = useStreaks();

  const [range, setRange] = useState<RangeOption>('14d');

  const chartData = useMemo(() => getChartData(range), [range, getChartData]);
  const maxVal = useMemo(() => Math.max(...chartData.map(d => d.count), 5), [chartData]);

  const textColor = Colors[theme].text;
  const backgroundColor = Colors[theme].background;
  const fireColor = currentStreak > 0 ? '#F59E0B' : '#9CA3AF';

  // Match home/index.tsx QuickNavTheme exactly
  const glassTint = withAlpha(backgroundColor, isDark ? 0.18 : 0.28);
  const glassFallback = isDark ? '#1C1C1E' : '#F2F2F7';
  const chevronColor = withAlpha(textColor, 0.45);

  const ranges: { label: string; value: RangeOption }[] = [
    { label: t('streaks.range.7d'), value: '7d' },
    { label: t('streaks.range.14d'), value: '14d' },
    { label: t('streaks.range.1m'), value: '1m' },
    { label: t('streaks.range.1y'), value: '1y' },
    { label: t('streaks.range.max'), value: 'max' },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero Streak Section */}
      <View style={styles.hero}>
        <View style={styles.fireContainer}>
          <MaterialIcons name="local-fire-department" size={56} color={fireColor} />
          {currentStreak > 0 && <View style={[styles.glow, { backgroundColor: fireColor }]} />}
        </View>
        <View>
          <Text style={styles.bigNumber}>{currentStreak}</Text>
          <Text style={styles.heroSubtitle}>
            {currentStreak === 1 ? t('streaks.hero.one') : t('streaks.hero.other')}
          </Text>
        </View>
      </View>

      {/* Stats Grid - Exact QuickNavGrid style */}
      <View style={styles.quickGridWrap}>
        <View style={styles.quickGrid}>
          <StatTile
            title={t('streaks.stats.today')}
            value={countLabel(todayCompletedCount, 'streaks.count.tasks.one', 'streaks.count.tasks.other')}
            icon="check-circle"
            iconColor="#10B981"
            styles={styles}
            glassTint={glassTint}
            glassFallback={glassFallback}
            chevronColor={chevronColor}
            isDark={isDark}
          />
          <StatTile
            title={t('streaks.stats.thisWeek')}
            value={countLabel(last7DaysCount, 'streaks.count.tasks.one', 'streaks.count.tasks.other')}
            icon="date-range"
            iconColor="#3B82F6"
            styles={styles}
            glassTint={glassTint}
            glassFallback={glassFallback}
            chevronColor={chevronColor}
            isDark={isDark}
          />
          <StatTile
            title={t('streaks.stats.record')}
            value={t('streaks.count.inOneDay', { count: mostTasksInOneDay })}
            icon="emoji-events"
            iconColor="#F59E0B"
            styles={styles}
            glassTint={glassTint}
            glassFallback={glassFallback}
            chevronColor={chevronColor}
            isDark={isDark}
          />
          <StatTile
            title={t('streaks.stats.longest')}
            value={countLabel(longestStreak, 'streaks.count.days.one', 'streaks.count.days.other')}
            icon="local-fire-department"
            iconColor="#EF4444"
            styles={styles}
            glassTint={glassTint}
            glassFallback={glassFallback}
            chevronColor={chevronColor}
            isDark={isDark}
          />
        </View>
      </View>

      {/* Chart Section */}
      <GlassSurface
        style={styles.chartCard}
        glassEffectStyle="regular"
        tintColor={glassTint}
        fallbackBackgroundColor={glassFallback}
      >
        <View style={styles.chartHeader}>
          <Text style={styles.cardTitle}>{t('streaks.chart.activity')}</Text>
          {/* Segmented Control */}
          <View style={styles.segmentedControl}>
            {ranges.map((r) => {
              const isActive = range === r.value;
              return (
                <Pressable
                  key={r.value}
                  style={[styles.segment, isActive && styles.segmentActive]}
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setRange(r.value);
                  }}
                >
                  <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                    {r.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.chartBody}>
          {chartData.map((item, index) => (
            <ChartBar
              key={index}
              item={item}
              max={maxVal}
              textColor={textColor}
              isDark={isDark}
            />
          ))}
          {chartData.length === 0 && (
            <View style={styles.emptyChart}>
              <Text style={{ color: withAlpha(textColor, 0.5), fontSize: 12, fontWeight: '600' }}>{t('streaks.chart.noData')}</Text>
            </View>
          )}
        </View>
      </GlassSurface>
    </ScrollView>
  );
}
