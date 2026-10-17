import {
  useIsRegularWidth,
  usePageDimensions,
} from "@/components/navigation/vertical-bar-safe-area";
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SegmentedControl } from "@/components/ui/segmented-control";
import React, { useMemo, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { GlassSurface, withAlpha } from '@/components/ui/glass-surface';
import { SFSymbol } from '@/components/ui/sfsymbol';
import { StatHero } from '@/components/ui/stat-hero';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  type StatusChartDataPoint,
  type StatusRangeOption,
  useStatusStats,
} from '@/hooks/use-status-stats';
import { t } from '@/i18n';
import { useHeaderHeight } from "expo-router/react-navigation";

type ThemeName = keyof typeof Colors;
type RangeOption = StatusRangeOption;

const createStyles = (
  theme: ThemeName,
  compact: boolean,
  regular: boolean,
) => {
  const isDark = theme === 'dark';
  const text = Colors[theme].text;
  const cardBorder = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(17,24,28,0.09)';
  const cardBg = isDark ? '#1C1C1E' : '#F2F2F7';
  const subtitleColor = withAlpha(text, 0.62);

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors[theme].background,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 32,
      gap: 16,
    },
    heroIcon: {
      marginTop: compact ? -2 : -4,
    },
    quickGridWrap: {
      marginBottom: 16,
    },
    quickGrid: {
      flexDirection: 'row',
      // Regular width: all four tiles in one row instead of 2 × 2.
      flexWrap: regular ? 'nowrap' : 'wrap',
      gap: 10,
    },
    quickTilePressable: regular
      ? { flexGrow: 1, flexBasis: 0 }
      : { width: '48.5%' },
    quickTile: {
      borderRadius: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: cardBorder,
      overflow: 'hidden',
      backgroundColor: cardBg,
      minHeight: 110,
    },
    quickTileInner: {
      paddingHorizontal: 20,
      paddingVertical: 20,
      justifyContent: 'center',
      gap: 8,
    },
    quickTileIconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    quickTileTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: subtitleColor,
      letterSpacing: 0.2,
    },
    quickTileSubtitle: {
      fontSize: compact ? 18 : 22,
      lineHeight: compact ? 22 : 26,
      fontWeight: '700',
      color: text,
      letterSpacing: -0.2,
    },
    chartCard: {
      borderRadius: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: cardBorder,
      overflow: 'hidden',
      backgroundColor: cardBg,
      padding: 20,
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
      height: 36,
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
      borderRadius: 999,
    },
    barFill: {
      width: '100%',
      borderRadius: 999,
      minHeight: 4,
    },
    barLabel: {
      fontSize: 10,
      fontWeight: '700',
      textAlign: 'center',
      width: 26,
    },
    emptyChart: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
    },
  });
};

function ChartBar({
  item,
  max,
  textColor,
  isDark,
}: {
  item: StatusChartDataPoint;
  max: number;
  textColor: string;
  isDark: boolean;
}) {
  const heightPercent = max > 0 ? (item.completionRate / max) * 100 : 0;
  const isZero = item.totalCount === 0;
  const barHeight = !isZero ? `${Math.max(8, heightPercent)}%` : '0%';
  const barColor = item.isToday ? '#22C55E' : withAlpha(textColor, 0.6);
  const styles = createStyles(isDark ? 'dark' : 'light', false, false);

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
            isZero && { height: 4 },
          ]}
        />
      </View>
      <Text
        style={[
          styles.barLabel,
          {
            color: item.isToday ? '#22C55E' : withAlpha(textColor, 0.45),
            fontWeight: item.isToday ? '800' : '700',
          },
        ]}
        numberOfLines={1}
      >
        {item.label}
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
  value: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  iconColor: string;
  styles: ReturnType<typeof createStyles>;
  glassTint: string;
  glassFallback: string;
}) {
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
            <MaterialIcons name={icon} size={16} color={iconColor} />
            <Text style={styles.quickTileTitle} numberOfLines={1}>
              {title}
            </Text>
          </View>
          <Text
            style={styles.quickTileSubtitle}
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

function formatRatioValue({
  completedCount,
  totalCount,
  completionRate,
}: {
  completedCount: number;
  totalCount: number;
  completionRate: number;
}) {
  if (totalCount <= 0) return t('status.count.none');
  return t('status.count.doneOfTotal', {
    done: completedCount,
    total: totalCount,
    percent: completionRate,
  });
}

export default function StatusScreen() {
  const headerHeight = useHeaderHeight();
  const { width } = usePageDimensions();
  const theme = useColorScheme() ?? 'light';
  const isDark = theme === 'dark';
  const compact = width < 390;
  const regular = useIsRegularWidth();
  const styles = useMemo(
    () => createStyles(theme, compact, regular),
    [compact, regular, theme],
  );

  const {
    todayCompletedCount,
    todayTotalCount,
    todayCompletionRate,
    last7DaysCompletedCount,
    last7DaysTotalCount,
    last7DaysCompletionRate,
    overallCompletedCount,
    overallTasksCount,
    overallCompletionRate,
    bestDayCompletedCount,
    bestDayTotalCount,
    bestDayCompletionRate,
    getChartData,
  } = useStatusStats();

  const [range, setRange] = useState<RangeOption>('14d');

  const chartData = useMemo(() => getChartData(range), [range, getChartData]);
  const maxVal = 100;

  const textColor = Colors[theme].text;
  const statusColor = '#22C55E';

  const tileSurfaceBg = isDark ? '#1C1C1E' : '#F2F2F7';
  const gridGlassTint = isDark ? withAlpha(tileSurfaceBg, 0.22) : tileSurfaceBg;
  const gridGlassFallback = tileSurfaceBg;
  const chartGlassTint = withAlpha(
    Colors[theme].background,
    isDark ? 0.18 : 0.28,
  );
  const chartGlassFallback = tileSurfaceBg;

  const ranges: { label: string; value: RangeOption }[] = [
    { label: t('status.range.7d'), value: '7d' },
    { label: t('status.range.14d'), value: '14d' },
    { label: t('status.range.1m'), value: '1m' },
    { label: t('status.range.1y'), value: '1y' },
    { label: t('status.range.max'), value: 'max' },
  ];
  const activeRangeIndex = Math.max(
    ranges.findIndex((item) => item.value === range),
    0,
  );

  const todayValue = formatRatioValue({
    completedCount: todayCompletedCount,
    totalCount: todayTotalCount,
    completionRate: todayCompletionRate,
  });
  const weekValue = formatRatioValue({
    completedCount: last7DaysCompletedCount,
    totalCount: last7DaysTotalCount,
    completionRate: last7DaysCompletionRate,
  });
  const bestDayValue = formatRatioValue({
    completedCount: bestDayCompletedCount,
    totalCount: bestDayTotalCount,
    completionRate: bestDayCompletionRate,
  });
  const overallValue = formatRatioValue({
    completedCount: overallCompletedCount,
    totalCount: overallTasksCount,
    completionRate: overallCompletionRate,
  });
  const heroSubtitle =
    todayTotalCount > 0
      ? t('status.hero.withTasks', {
          done: todayCompletedCount,
          total: todayTotalCount,
        })
      : t('status.hero.empty');
  return (
    <ScrollView
      style={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      alwaysBounceVertical
      contentContainerStyle={[
          styles.content,
          // Header is transparent; iOS insets automatically, Android does not.
          Platform.OS === "android" ? { paddingTop: headerHeight } : null,
        ]}
      showsVerticalScrollIndicator={false}
    >
      <StatHero
        icon={
          Platform.OS === 'ios' ? (
            <SFSymbol
              name="chart.bar.fill"
              size={compact ? 36 : 42}
              color={statusColor}
              style={styles.heroIcon}
              weight="bold"
            />
          ) : (
            <MaterialIcons
              name="insights"
              size={compact ? 34 : 40}
              color={statusColor}
              style={styles.heroIcon}
            />
          )
        }
        value={`${todayCompletionRate}%`}
        subtitle={heroSubtitle}
        compact={compact}
        textColor={textColor}
        subtitleColor={withAlpha(textColor, 0.62)}
      />

      <View style={styles.quickGridWrap}>
        <View style={styles.quickGrid}>
          <StatTile
            title={t('status.stats.today')}
            value={todayValue}
            icon="check-circle"
            iconColor="#10B981"
            styles={styles}
            glassTint={gridGlassTint}
            glassFallback={gridGlassFallback}
          />
          <StatTile
            title={t('status.stats.thisWeek')}
            value={weekValue}
            icon="date-range"
            iconColor="#3B82F6"
            styles={styles}
            glassTint={gridGlassTint}
            glassFallback={gridGlassFallback}
          />
          <StatTile
            title={t('status.stats.bestDay')}
            value={bestDayValue}
            icon="emoji-events"
            iconColor="#F59E0B"
            styles={styles}
            glassTint={gridGlassTint}
            glassFallback={gridGlassFallback}
          />
          <StatTile
            title={t('status.stats.overall')}
            value={overallValue}
            icon="donut-large"
            iconColor="#8B5CF6"
            styles={styles}
            glassTint={gridGlassTint}
            glassFallback={gridGlassFallback}
          />
        </View>
      </View>

      <GlassSurface
        style={styles.chartCard}
        glassEffectStyle="regular"
        tintColor={chartGlassTint}
        fallbackBackgroundColor={chartGlassFallback}
      >
        <View style={styles.chartHeader}>
          <Text style={styles.cardTitle}>{t('status.chart.completion')}</Text>
          <SegmentedControl
            style={styles.segmentedControl}
            values={ranges.map((item) => item.label)}
            selectedIndex={activeRangeIndex}
            onChange={(event) => {
              const nextIndex = event.nativeEvent.selectedSegmentIndex;
              const nextRange = ranges[nextIndex]?.value;
              if (!nextRange || nextRange === range) return;
              setRange(nextRange);
            }}
          />
        </View>

        <View style={styles.chartBody}>
          {chartData.map((item) => (
            <ChartBar
              key={item.dateStr}
              item={item}
              max={maxVal}
              textColor={textColor}
              isDark={isDark}
            />
          ))}
          {chartData.length === 0 && (
            <View style={styles.emptyChart}>
              <Text
                style={{
                  color: withAlpha(textColor, 0.5),
                  fontSize: 12,
                  fontWeight: '700',
                }}
              >
                {t('status.chart.noData')}
              </Text>
            </View>
          )}
        </View>
      </GlassSurface>
    </ScrollView>
  );
}
