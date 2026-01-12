import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useHeaderHeight } from '@react-navigation/elements';
import React, { useMemo, useState } from 'react';
import { LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GlassSurface, withAlpha } from '@/components/ui/glass-surface';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ChartDataPoint, useStreaks } from '@/hooks/use-streaks';

type RangeOption = '7d' | '14d' | '1m' | '1y' | 'max';

function ChartBar({ item, max, color, isMonthView }: { item: ChartDataPoint; max: number; color: string; isMonthView: boolean }) {
  const heightPercent = max > 0 ? (item.count / max) * 100 : 0;
  // Min height for visibility
  const barHeight = item.count > 0 ? `${Math.max(8, heightPercent)}%` : '4%';
  const isZero = item.count === 0;

  return (
    <View style={styles.barContainer}>
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            {
              height: barHeight as any,
              backgroundColor: item.count > 0 ? (item.isToday ? '#EF4444' : color) : 'transparent',
              opacity: item.count > 0 ? (item.isToday ? 1 : 0.8) : 0
            },
            isZero && { backgroundColor: color, height: 4, borderRadius: 2, opacity: 0.1 }
          ]}
        />
      </View>
      <Text style={[
        styles.barLabel,
        {
          color: item.isToday ? '#EF4444' : color,
          opacity: item.isToday ? 1 : 0.5,
          fontWeight: item.isToday ? '800' : '600'
        }
      ]} numberOfLines={1}>
        {item.label[0]}
      </Text>
    </View>
  );
}

export default function StreaksScreen() {
  const theme = useColorScheme() ?? 'light';
  const isDark = theme === 'dark';
  const headerHeight = useHeaderHeight();

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
  const subTextColor = theme === 'dark' ? '#9CA3AF' : '#6B7280';
  const fireColor = currentStreak > 0 ? '#F59E0B' : '#9CA3AF'; // Amber

  const backgroundColor = Colors[theme].background;

  // Reuse glass styles
  const glassTint = withAlpha(backgroundColor, isDark ? 0.18 : 0.28);
  const glassFallback = isDark ? '#1C1C1E' : '#F2F2F7';

  const renderStatCard = (title: string, value: number | string, icon: keyof typeof MaterialIcons.glyphMap, color: string) => (
    <GlassSurface
      style={styles.statCard}
      glassEffectStyle="regular"
      tintColor={glassTint}
      fallbackBackgroundColor={glassFallback}
    >
      <View style={styles.statHeader}>
        <View style={[styles.iconBadge, { backgroundColor: withAlpha(color, 0.15) }]}>
          <MaterialIcons name={icon} size={20} color={color} />
        </View>
        <Text style={[styles.statTitle, { color: subTextColor }]}>{title}</Text>
      </View>
      <Text style={[styles.statValue, { color: textColor }]}>{value}</Text>
    </GlassSurface>
  );

  const ranges: { label: string; value: RangeOption }[] = [
    { label: '7 T', value: '7d' },
    { label: '14 T', value: '14d' },
    { label: '1 M', value: '1m' },
    { label: '1 J', value: '1y' },
    { label: 'Max', value: 'max' },
  ];

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        { backgroundColor, paddingTop: headerHeight + 16 }
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero Streak Section */}
      <View style={styles.hero}>
        <View style={styles.fireContainer}>
          <MaterialIcons name="local-fire-department" size={56} color={fireColor} />
          {currentStreak > 0 && <View style={[styles.glow, { backgroundColor: fireColor }]} />}
        </View>
        <View>
          <Text style={[styles.bigNumber, { color: textColor }]}>{currentStreak}</Text>
          <Text style={[styles.heroSubtitle, { color: subTextColor }]}>
            {currentStreak === 1 ? 'Tag Streak' : 'Tage Streak'}
          </Text>
        </View>
      </View>

      {/* 2x2 Stats Grid */}
      <View style={styles.gridContainer}>
        <View style={styles.gridRow}>
          {renderStatCard('Heute', todayCompletedCount, 'check-circle', '#10B981')}
          {renderStatCard('Diese Woche', last7DaysCount, 'date-range', '#3B82F6')}
        </View>
        <View style={styles.gridRow}>
          {renderStatCard('Rekord', mostTasksInOneDay, 'emoji-events', '#F59E0B')}
          {renderStatCard('Längster', longestStreak, 'local-fire-department', '#EF4444')}
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
          <Text style={[styles.cardTitle, { color: textColor }]}>Aktivität</Text>
          {/* Segmented Control */}
          <View style={[styles.segmentedControl, { backgroundColor: withAlpha(textColor, 0.05) }]}>
            {ranges.map((r) => {
              const isActive = range === r.value;
              return (
                <Pressable
                  key={r.value}
                  style={[
                    styles.segment,
                    isActive && { backgroundColor: isDark ? '#374151' : '#FFFFFF', shadowOpacity: 0.1 }
                  ]}
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setRange(r.value);
                  }}
                >
                  <Text style={[
                    styles.segmentText,
                    { color: isActive ? textColor : subTextColor, fontWeight: isActive ? '700' : '500' }
                  ]}>
                    {r.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        <View style={styles.chartBody}>
          {chartData.map((item, index) => (
            <ChartBar
              key={index}
              item={item}
              max={maxVal}
              color={textColor}
              isMonthView={range === '1y' || range === 'max'}
            />
          ))}
          {chartData.length === 0 && (
            <View style={styles.emptyChart}>
              <Text style={{ color: subTextColor }}>Keine Daten verfügbar</Text>
            </View>
          )}
        </View>
      </GlassSurface>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 24,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 10,
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
  },
  heroSubtitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  gridContainer: {
    gap: 12,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 20,
    padding: 16, // Consistent padding
    overflow: 'hidden',
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  chartCard: {
    borderRadius: 24,
    padding: 20,
    overflow: 'hidden',
    minHeight: 280, // prevent collapse
  },
  chartHeader: {
    marginBottom: 24,
    gap: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  segmentedControl: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 12,
    height: 36,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  segmentText: {
    fontSize: 12,
  },
  chartBody: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 160,
    paddingBottom: 4,
  },
  barContainer: {
    flex: 1,
    alignItems: 'center', // Center label
    height: '100%',
    justifyContent: 'flex-end',
    gap: 8,
  },
  barTrack: {
    width: '60%', // Relative width for gap
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
    fontSize: 10,
    textAlign: 'center',
    width: 20,
  },
  emptyChart: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
});
