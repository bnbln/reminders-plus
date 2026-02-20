const fs = require('fs');
const filepath = 'app/(tabs)/home/index.tsx';
let code = fs.readFileSync(filepath, 'utf8');

// 1. Add SFSymbol import
code = code.replace(
  'import { FloatingAddButton } from "@/components/ui/floating-add-button";',
  'import { FloatingAddButton } from "@/components/ui/floating-add-button";\nimport { SFSymbol } from "@/components/ui/sfsymbol";'
);

// 2. Replace QuickTile / QuickNavTheme / QuickNavGrid types and components
const oldComponentRegex = /type QuickTile = {[\s\S]*?function QuickNavGrid[^]*?  \);\n}\n/m;
const newComponentCode = `type HomeMetricsProps = {
  completionPercentage: number;
  currentStreak: number;
  onPress: () => void;
};

type HomeMetricsTheme = {
  topSurface: string;
  cardBackgroundColor: string;
  borderColor: string;
  primaryText: string;
  mutedText: string;
};

function HomeMetricsGrid({
  metrics,
  styles,
  theme,
}: {
  metrics: HomeMetricsProps;
  styles: ReturnType<typeof createStyles>;
  theme: HomeMetricsTheme;
}) {
  return (
    <View style={styles.metricsGridWrap}>
      <View style={styles.metricsGrid}>
        
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={\`status: \${metrics.completionPercentage}%\`}
          onPress={metrics.onPress}
          hitSlop={8}
          style={({ pressed }) => [
            styles.metricsCardPressable,
            pressed && { opacity: 0.9 },
            { transform: [{ scale: pressed ? 0.98 : 1 }] }
          ]}
        >
          <GlassSurface
            style={styles.metricsCard}
            glassEffectStyle="regular"
            tintColor={theme.cardBackgroundColor}
            fallbackBackgroundColor={theme.cardBackgroundColor}
            isInteractive
          >
            <View style={styles.metricsCardInner}>
              <View style={styles.metricsHeaderRow}>
                <SFSymbol name="arrow.up.right" size={16} color="#22C55E" weight="bold" />
                <Text style={[styles.metricsHeaderLabel, { color: theme.mutedText }]}>STATUS</Text>
              </View>
              <Text style={[styles.metricsPrimaryValue, { color: theme.primaryText }]}>
                {metrics.completionPercentage}%
              </Text>
            </View>
          </GlassSurface>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={\`streak: \${metrics.currentStreak}\`}
          onPress={metrics.onPress}
          hitSlop={8}
          style={({ pressed }) => [
            styles.metricsCardPressable,
            pressed && { opacity: 0.9 },
            { transform: [{ scale: pressed ? 0.98 : 1 }] }
          ]}
        >
          <GlassSurface
            style={styles.metricsCard}
            glassEffectStyle="regular"
            tintColor={theme.cardBackgroundColor}
            fallbackBackgroundColor={theme.cardBackgroundColor}
            isInteractive
          >
            <View style={styles.metricsCardInner}>
              <View style={styles.metricsHeaderRow}>
                <SFSymbol name="flame.fill" size={16} color="#F97316" />
                <Text style={[styles.metricsHeaderLabel, { color: theme.mutedText }]}>STREAK</Text>
              </View>
              <Text style={[styles.metricsPrimaryValue, { color: theme.primaryText }]}>
                {metrics.currentStreak}
              </Text>
            </View>
          </GlassSurface>
        </Pressable>

      </View>
    </View>
  );
}
`;
code = code.replace(oldComponentRegex, newComponentCode);


// 3. Replace styles
const oldStylesRegex = /quickGridWrap: {[\s\S]*?streakProgressDotCurrent: {\n      transform: \[\{ scale: 1\.08 \}\],\n    },/m;
const newStylesCode = `metricsGridWrap: {
      marginTop: 0,
      marginBottom: 0,
      paddingHorizontal: GRID_HORIZONTAL_PADDING,
    },
    metricsGrid: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 16,
    },
    metricsCardPressable: {
      flex: 1,
    },
    metricsCard: {
      borderRadius: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: heroCardBorder,
      overflow: "hidden",
      minHeight: 110,
    },
    metricsCardInner: {
      paddingHorizontal: 20,
      paddingVertical: 20,
      justifyContent: "center",
      gap: 8,
    },
    metricsHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    metricsHeaderLabel: {
      fontSize: 13,
      fontWeight: WEIGHT_HEADING,
      letterSpacing: 0.5,
    },
    metricsPrimaryValue: {
      fontSize: 40,
      fontWeight: WEIGHT_HERO,
      letterSpacing: -0.5,
    },`;
code = code.replace(oldStylesRegex, newStylesCode);

// 4. Update useStreaks destructuring to remove longestStreak / mostTasksInOneDay
code = code.replace(
  'const { currentStreak, longestStreak, mostTasksInOneDay } = useStreaks();',
  'const { currentStreak } = useStreaks();'
);

// 5. Replace quickTiles and quickNavTheme
const oldStateRegex = /const quickTiles = React\.useMemo<QuickTile\[\]>\([^]*?\}\n    return \{\n      topSurface,[\s\S]*?streakProgressFill: accent,\n    \};\n  \}, \[isDark, theme\]\);/m;
const newStateCode = `const completionPercentage = React.useMemo(() => {
    let todayTotal = 0;
    let todayCompleted = 0;
    const todayStart = getStartOfToday();

    for (const task of tasks) {
      if (task.deletedAt) continue;
      
      const isDueToday = hasValidDueAt(task.dueAt) && isSameLocalDay(task.dueAt, todayStart);
      const isCompletedToday = task.completedAt && isSameLocalDay(task.completedAt, todayStart);

      if (isDueToday || isCompletedToday) {
        todayTotal++;
        if (task.completedAt) {
          todayCompleted++;
        }
      }
    }

    if (todayTotal === 0) return 0;
    return Math.round((todayCompleted / todayTotal) * 100);
  }, [tasks]);

  const homeMetricsProps = React.useMemo<HomeMetricsProps>(() => {
    return {
      completionPercentage,
      currentStreak,
      onPress: () => router.push("/home/streaks"),
    };
  }, [completionPercentage, currentStreak, router]);

  const homeMetricsTheme = React.useMemo<HomeMetricsTheme>(() => {
    return {
      topSurface: Colors[theme].background,
      cardBackgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
      borderColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)",
      primaryText: isDark ? "#FFFFFF" : "#000000",
      mutedText: "#94A3B8",
    };
  }, [isDark, theme]);`;
code = code.replace(oldStateRegex, newStateCode);

// 6. Replace quickNavTheme references in listHeader
const oldHeaderRegex = /backgroundColor: quickNavTheme\.topSurface,[\s\S]*?isCompactHero={isCompactHero}\n            \/>/m;

const newHeaderCode = `backgroundColor: homeMetricsTheme.topSurface,
              },
            ]}
          >
            <HomeMetricsGrid
              metrics={homeMetricsProps}
              styles={styles}
              theme={homeMetricsTheme}
            />`;
code = code.replace(oldHeaderRegex, newHeaderCode);

fs.writeFileSync(filepath, code, 'utf8');
console.log("Replacement completed.");
