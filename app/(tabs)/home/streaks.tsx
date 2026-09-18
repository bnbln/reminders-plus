import { usePageDimensions } from "@/components/navigation/vertical-bar-safe-area";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SegmentedControl } from "@/components/ui/segmented-control";
import React, { useMemo, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { GlassSurface, withAlpha } from "@/components/ui/glass-surface";
import { SFSymbol } from "@/components/ui/sfsymbol";
import { StreakAccentBackground } from "@/components/ui/streak-accent-background";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ChartDataPoint, useStreaks } from "@/hooks/use-streaks";
import { countLabel, t } from "@/i18n";

type ThemeName = keyof typeof Colors;
type RangeOption = "7d" | "14d" | "1m" | "1y" | "max";

// Metrics-style glass card styles
const createStyles = (theme: ThemeName, compact: boolean) => {
  const isDark = theme === "dark";
  const text = Colors[theme].text;
  const cardBorder = isDark ? "rgba(255,255,255,0.09)" : "rgba(17,24,28,0.09)";
  const cardBg = isDark ? "#1C1C1E" : "#F2F2F7";
  const subtitleColor = withAlpha(text, 0.62);

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "transparent",
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 32,
      gap: 16,
    },
    // Hero section
    hero: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: compact ? 10 : 14,
      paddingVertical: compact ? 10 : 14,
      marginBottom: 8,
    },
    heroFlame: {
      marginTop: compact ? -2 : -4,
    },
    heroTextWrap: {
      alignItems: "flex-start",
      gap: 2,
    },
    bigNumber: {
      fontSize: compact ? 54 : 64,
      fontWeight: "900",
      letterSpacing: -0.8,
      lineHeight: compact ? 54 : 64,
      color: text,
    },
    heroSubtitle: {
      fontSize: compact ? 15 : 16,
      fontWeight: "700",
      lineHeight: compact ? 19 : 20,
      color: subtitleColor,
    },
    // Stat card grid
    quickGridWrap: {
      marginBottom: 16,
    },
    quickGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    quickTilePressable: {
      width: "48.5%",
    },
    quickTile: {
      borderRadius: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: cardBorder,
      overflow: "hidden",
      backgroundColor: cardBg,
      minHeight: 110,
    },
    quickTileInner: {
      paddingHorizontal: 20,
      paddingVertical: 20,
      justifyContent: "center",
      gap: 8,
    },
    quickTileIconRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    quickTileTitle: {
      fontSize: 13,
      fontWeight: "800",
      color: subtitleColor,
      letterSpacing: 0.2,
    },
    quickTileSubtitle: {
      fontSize: compact ? 18 : 22,
      lineHeight: compact ? 22 : 26,
      fontWeight: "700",
      color: text,
      letterSpacing: -0.2,
    },
    // Chart styles
    chartCard: {
      borderRadius: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: cardBorder,
      overflow: "hidden",
      backgroundColor: cardBg,
      padding: 20,
    },
    chartHeader: {
      marginBottom: 16,
      gap: 12,
    },
    cardTitle: {
      fontSize: 14,
      fontWeight: "800",
      color: text,
      letterSpacing: 0.2,
    },
    segmentedControl: {
      height: 36,
    },
    chartBody: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      height: 120,
      paddingTop: 8,
    },
    barContainer: {
      flex: 1,
      alignItems: "center",
      height: "100%",
      justifyContent: "flex-end",
      gap: 6,
    },
    barTrack: {
      width: "55%",
      height: "100%",
      justifyContent: "flex-end",
      borderRadius: 999,
    },
    barFill: {
      width: "100%",
      borderRadius: 999,
      minHeight: 4,
    },
    barLabel: {
      fontSize: 10,
      fontWeight: "700",
      textAlign: "center",
      width: 26,
    },
    emptyChart: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
    },
  });
};

function ChartBar({
  item,
  max,
  textColor,
  isDark,
}: {
  item: ChartDataPoint;
  max: number;
  textColor: string;
  isDark: boolean;
}) {
  const heightPercent = max > 0 ? (item.count / max) * 100 : 0;
  const barHeight = item.count > 0 ? `${Math.max(8, heightPercent)}%` : "0%";
  const isZero = item.count === 0;
  const barColor = item.isToday ? "#EF4444" : withAlpha(textColor, 0.6);

  const styles = createStyles(isDark ? "dark" : "light", false);

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
            color: item.isToday ? "#EF4444" : withAlpha(textColor, 0.45),
            fontWeight: item.isToday ? "800" : "700",
          },
        ]}
        numberOfLines={1}
      >
        {item.label}
      </Text>
    </View>
  );
}

// Metrics-style stat card with colorized icon (no icon background)
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

export default function StreaksScreen() {
  const { width } = usePageDimensions();
  const theme = useColorScheme() ?? "light";
  const isDark = theme === "dark";
  const compact = width < 390;
  const styles = useMemo(() => createStyles(theme, compact), [compact, theme]);

  const {
    currentStreak,
    longestStreak,
    todayCompletedCount,
    last7DaysCount,
    mostTasksInOneDay,
    getChartData,
  } = useStreaks();

  const [range, setRange] = useState<RangeOption>("14d");

  const chartData = useMemo(() => getChartData(range), [range, getChartData]);
  const maxVal = useMemo(
    () => Math.max(...chartData.map((d) => d.count), 5),
    [chartData],
  );

  const textColor = Colors[theme].text;
  const fireColor = "#F97316";

  const tileSurfaceBg = isDark ? "#1C1C1E" : "#F2F2F7";
  const gridGlassTint = isDark ? withAlpha(tileSurfaceBg, 0.22) : tileSurfaceBg;
  const gridGlassFallback = tileSurfaceBg;
  const chartGlassTint = withAlpha(
    Colors[theme].background,
    isDark ? 0.18 : 0.28,
  );
  const chartGlassFallback = tileSurfaceBg;
  const ranges: { label: string; value: RangeOption }[] = [
    { label: t("streaks.range.7d"), value: "7d" },
    { label: t("streaks.range.14d"), value: "14d" },
    { label: t("streaks.range.1m"), value: "1m" },
    { label: t("streaks.range.1y"), value: "1y" },
    { label: t("streaks.range.max"), value: "max" },
  ];
  const activeRangeIndex = Math.max(
    ranges.findIndex((item) => item.value === range),
    0,
  );

  return (
    <View style={[styles.container, { backgroundColor: "transparent" }]}>
      <StreakAccentBackground isDark={isDark} />
      <ScrollView
        style={styles.scroll}
        contentInsetAdjustmentBehavior="automatic"
        alwaysBounceVertical
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Streak Section */}
        <View style={styles.hero}>
        {Platform.OS === "ios" ? (
          <SFSymbol
            name="flame.fill"
            size={compact ? 38 : 44}
            color={fireColor}
            style={styles.heroFlame}
            weight="bold"
          />
        ) : (
          <MaterialIcons
            name="whatshot"
            size={compact ? 34 : 40}
            color={fireColor}
            style={styles.heroFlame}
          />
        )}
        <View style={styles.heroTextWrap}>
          <Text style={styles.bigNumber}>{currentStreak}</Text>
          <Text style={styles.heroSubtitle}>
            {currentStreak === 1
              ? t("streaks.hero.one")
              : t("streaks.hero.other")}
          </Text>
        </View>
      </View>

        {/* Stats Grid - Exact QuickNavGrid style */}
        <View style={styles.quickGridWrap}>
          <View style={styles.quickGrid}>
          <StatTile
            title={t("streaks.stats.today")}
            value={countLabel(
              todayCompletedCount,
              "streaks.count.tasks.one",
              "streaks.count.tasks.other",
            )}
            icon="check-circle"
            iconColor="#10B981"
            styles={styles}
            glassTint={gridGlassTint}
            glassFallback={gridGlassFallback}
          />
          <StatTile
            title={t("streaks.stats.thisWeek")}
            value={countLabel(
              last7DaysCount,
              "streaks.count.tasks.one",
              "streaks.count.tasks.other",
            )}
            icon="date-range"
            iconColor="#3B82F6"
            styles={styles}
            glassTint={gridGlassTint}
            glassFallback={gridGlassFallback}
          />
          <StatTile
            title={t("streaks.stats.record")}
            value={t("streaks.count.inOneDay", { count: mostTasksInOneDay })}
            icon="emoji-events"
            iconColor="#F59E0B"
            styles={styles}
            glassTint={gridGlassTint}
            glassFallback={gridGlassFallback}
          />
          <StatTile
            title={t("streaks.stats.longest")}
            value={countLabel(
              longestStreak,
              "streaks.count.days.one",
              "streaks.count.days.other",
            )}
            icon="local-fire-department"
            iconColor="#EF4444"
            styles={styles}
            glassTint={gridGlassTint}
            glassFallback={gridGlassFallback}
          />
          </View>
        </View>

        {/* Chart Section */}
        <GlassSurface
          style={styles.chartCard}
          glassEffectStyle="regular"
          tintColor={chartGlassTint}
          fallbackBackgroundColor={chartGlassFallback}
        >
          <View style={styles.chartHeader}>
            <Text style={styles.cardTitle}>{t("streaks.chart.activity")}</Text>
            {/* Segmented Control */}
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
                <Text
                  style={{
                    color: withAlpha(textColor, 0.5),
                    fontSize: 12,
                    fontWeight: "700",
                  }}
                >
                  {t("streaks.chart.noData")}
                </Text>
              </View>
            )}
          </View>
        </GlassSurface>
      </ScrollView>
    </View>
  );
}
