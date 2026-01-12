import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useHeaderHeight } from '@react-navigation/elements';
import React, { useMemo, useState } from 'react';
import { LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GlassSurface, withAlpha } from '@/components/ui/glass-surface';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ChartDataPoint, useStreaks } from '@/hooks/use-streaks';

type ThemeName = keyof typeof Colors;
type RangeOption = '7d' | '14d' | '1m' | '1y' | 'max';

// Reusing QuickNavGrid style logic from home/index.tsx
const createStyles = (theme: ThemeName) => {
  const isDark = theme === 'dark';
  const text = Colors[theme].text;
  const hairline = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)';
  const cardBg = isDark ? '#1C1C1E' : '#F2F2F7';
  const quickTileSubtitle = withAlpha(text, 0.62);

  return StyleSheet.create({
    container: {
      paddingHorizontal: 16,
      paddingBottom: 40,
      gap: 20,
    },
    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      paddingVertical: 16,
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
      color: quickTileSubtitle,
    },
    // QuickTile-style grid
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    tilePressable: {
      width: '48%',
      flexGrow: 1,
    },
    tile: {
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hairline,
      overflow: 'hidden',
      backgroundColor: cardBg,
      minHeight: 100,
    },
    tileInner: {
      paddingHorizontal: 12,
      paddingVertical: 12,
      gap: 6,
      flex: 1,
      justifyContent: 'space-between',
    },
    tileIconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    tileIconBadge: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tileTitle: {
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: 0.2,
      color: quickTileSubtitle,
    },
    tileValue: {
      fontSize: 24,
      fontWeight: '800',
      color: text,
      letterSpacing: -0.5,
    },
    // Chart Card
    chartCard: {
      borderRadius: 20,
      padding: 16,
      overflow: 'hidden',
      backgroundColor: cardBg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hairline,
    },
    chartHeader: {
      marginBottom: 16,
      gap: 12,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: text,
    },
    segmentedControl: {
      flexDirection: 'row',
      padding: 4,
      borderRadius: 10,
      height: 32,
      backgroundColor: withAlpha(text, 0.05),
    },
    segment: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 6,
    },
    segmentText: {
      fontSize: 11,
      fontWeight: '500',
      color: quickTileSubtitle,
    },
    segmentActive: {
      backgroundColor: isDark ? '#374151' : '#FFFFFF',
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
    },
    segmentTextActive: {
      fontWeight: '700',
      color: text,
    },
    chartBody: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      height: 140,
      paddingBottom: 4,
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
  const styles = createStyles(isDark ? 'dark' : 'light');
  const heightPercent = max > 0 ? (item.count / max) * 100 : 0;
  const barHeight = item.count > 0 ? `${Math.max(8, heightPercent)}%` : '0%';
  const isZero = item.count === 0;
  const barColor = item.isToday ? '#EF4444' : withAlpha(textColor, 0.7);

  return (
    <View style={styles.barContainer}>
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            {
              height: barHeight as any,
              backgroundColor: isZero ? withAlpha(textColor, 0.1) : barColor,
            },
            isZero && { height: 4 }
          ]}
        />
      </View>
      <Text
        style={[
          styles.barLabel,
          {
            color: item.isToday ? '#EF4444' : withAlpha(textColor, 0.5),
            fontWeight: item.isToday ? '700' : '500'
          }
        ]}
        numberOfLines={1}
      >
        {item.label[0]}
      </Text>
    </View>
  );
}

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
    <View style={styles.tilePressable}>
      <GlassSurface
        style={styles.tile}
        glassEffectStyle="regular"
        tintColor={glassTint}
        fallbackBackgroundColor={glassFallback}
      >
        <View style={styles.tileInner}>
          <View style={styles.tileIconRow}>
            <View style={[styles.tileIconBadge, { backgroundColor: withAlpha(iconColor, 0.15) }]}>
              <MaterialIcons name={icon} size={18} color={iconColor} />
            </View>
          </View>
          <View>
            <Text style={styles.tileTitle}>{title}</Text>
            <Text style={styles.tileValue}>{value}</Text>
          </View>
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

  const glassTint = withAlpha(backgroundColor, isDark ? 0.18 : 0.28);
  const glassFallback = isDark ? '#1C1C1E' : '#F2F2F7';

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
          <Text style={styles.bigNumber}>{currentStreak}</Text>
          <Text style={styles.heroSubtitle}>
            {currentStreak === 1 ? 'Tag Streak' : 'Tage Streak'}
          </Text>
        </View>
      </View>

      {/* Stats Grid - QuickTile Style */}
      <View style={styles.grid}>
        <StatTile
          title="Heute"
          value={todayCompletedCount}
          icon="check-circle"
          iconColor="#10B981"
          styles={styles}
          glassTint={glassTint}
          glassFallback={glassFallback}
        />
        <StatTile
          title="Diese Woche"
          value={last7DaysCount}
          icon="date-range"
          iconColor="#3B82F6"
          styles={styles}
          glassTint={glassTint}
          glassFallback={glassFallback}
        />
        <StatTile
          title="Rekord/Tag"
          value={mostTasksInOneDay}
          icon="emoji-events"
          iconColor="#F59E0B"
          styles={styles}
          glassTint={glassTint}
          glassFallback={glassFallback}
        />
        <StatTile
          title="Längster Streak"
          value={longestStreak}
          icon="local-fire-department"
          iconColor="#EF4444"
          styles={styles}
          glassTint={glassTint}
          glassFallback={glassFallback}
        />
      </View>

      {/* Chart Section */}
      <GlassSurface
        style={styles.chartCard}
        glassEffectStyle="regular"
        tintColor={glassTint}
        fallbackBackgroundColor={glassFallback}
      >
        <View style={styles.chartHeader}>
          <Text style={styles.cardTitle}>Aktivität</Text>
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
              <Text style={{ color: withAlpha(textColor, 0.5) }}>Keine Daten</Text>
            </View>
          )}
        </View>
      </GlassSurface>
    </ScrollView>
  );
}
