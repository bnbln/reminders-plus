
import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FloatingAddButton } from '@/components/ui/floating-add-button';
import { GlassSurface, withAlpha } from '@/components/ui/glass-surface';
import { SFSymbol } from '@/components/ui/sfsymbol';
import { Colors } from '@/constants/theme';
import { Project, useTasksStore } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { isIOS26OrNewer } from '@/utils/ios-version';

type ThemeName = keyof typeof Colors;

// Reusing style logic from home/index.tsx
const createStyles = (theme: ThemeName) => {
  const isDark = theme === 'dark';
  const text = Colors[theme].text;
  const hairline = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)';
  const cardBg = isDark ? '#1C1C1E' : '#F2F2F7';
  const quickTileSubtitle = withAlpha(text, 0.62);

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors[theme].background,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 16, // Add some top padding below header
      paddingBottom: 168,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    tilePressable: {
      width: '48%', // Approx half with gap
      flexGrow: 0,
    },
    tile: {
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hairline,
      overflow: 'hidden',
      backgroundColor: cardBg,
      minHeight: 110, // Ensure consistent height
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
      // Note: Project icon badge background comes from project color dynamically
    },
    tileTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: text,
      letterSpacing: 0.2,
      marginTop: 4,
    },
    tileSubtitle: {
      fontSize: 13,
      fontWeight: '600',
      color: quickTileSubtitle,
    },
  });
};

function ProjectTile({
  project,
  taskCount,
  onPress,
  styles,
  theme,
  isDark
}: {
  project: Project;
  taskCount: number;
  onPress: () => void;
  styles: any;
  theme: ThemeName;
  isDark: boolean;
}) {
  const tileTintColor = withAlpha(Colors[theme].background, isDark ? 0.18 : 0.28);
  const tileFallbackBg = isDark ? '#1C1C1E' : '#F2F2F7';
  const chevronColor = withAlpha(Colors[theme].text, 0.45);
  const iconColor = project.color; // Use project color for icon
  const badgeBg = withAlpha(project.color, 0.15); // Subtle background matching project color

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${project.name}: ${taskCount} tasks`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tilePressable,
        pressed && { opacity: 0.9 },
        { transform: [{ scale: pressed ? 0.98 : 1 }] }
      ]}
    >
      <GlassSurface
        style={styles.tile}
        glassEffectStyle="regular"
        tintColor={tileTintColor}
        fallbackBackgroundColor={tileFallbackBg}
        isInteractive
      >
        <View style={styles.tileInner}>
          <View style={styles.tileIconRow}>
            <View style={[styles.tileIconBadge, { backgroundColor: badgeBg }]}>
              <SFSymbol name={project.icon} size={18} color={iconColor} />
            </View>
            <SFSymbol name="chevron.right" size={14} color={chevronColor} weight="bold" />
          </View>

          <View>
            <Text numberOfLines={2} style={styles.tileTitle}>{project.name}</Text>
            <Text numberOfLines={1} style={styles.tileSubtitle}>
              {taskCount} {taskCount === 1 ? 'Task' : 'Tasks'}
            </Text>
          </View>
        </View>
      </GlassSurface>
    </Pressable>
  );
}

export default function ExploreScreen() {
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const isDark = theme === 'dark';
  const showFloatingAddButton = Platform.OS === 'ios' && !isIOS26OrNewer();
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  const { projects, tasks } = useTasksStore();

  const taskCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      if (!task.deletedAt && task.section !== 'completed') {
        counts.set(task.projectId, (counts.get(task.projectId) || 0) + 1);
      }
    }
    return counts;
  }, [tasks]);

  const visibleProjects = React.useMemo(() => {
    return projects.filter((p) => !p.deletedAt);
  }, [projects]);

  const onCreateProject = React.useCallback(() => {
    router.push('/project/edit-modal');
  }, [router]);

  const onPressProject = React.useCallback(
    (id: string) => {
      router.push({ pathname: '/explore/[id]', params: { id } });
    },
    [router]
  );

  return (
    <View style={styles.container}>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        alwaysBounceVertical
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {visibleProjects.map((project) => (
            <ProjectTile
              key={project.id}
              project={project}
              taskCount={taskCounts.get(project.id) || 0}
              onPress={() => onPressProject(project.id)}
              styles={styles}
              theme={theme}
              isDark={isDark}
            />
          ))}
        </View>
      </ScrollView>
      {showFloatingAddButton ? <FloatingAddButton onPress={onCreateProject} /> : null}
    </View>
  );
}
