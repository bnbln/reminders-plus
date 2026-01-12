
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import type { SwipeTaskRowStyles } from '@/components/tasks/swipe-task-row';
import { TaskSwipeDraggableList } from '@/components/tasks/task-swipe-draggable-list';
import { GlassSurface, withAlpha } from '@/components/ui/glass-surface';
import { SFSymbol } from '@/components/ui/sfsymbol';
import { Colors } from '@/constants/theme';
import { getDueAtForSection, Project, SectionId, Task, useTasksStore } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';

const SCREEN_WIDTH = Dimensions.get('window').width;
const COLUMN_WIDTH = SCREEN_WIDTH * 0.78; // Narrower to show peers
const COLUMN_GAP = 12; // Slightly smaller gap
const HEADER_HEIGHT = 140;

const SNAP_OFFSETS = [
    0,
    (16 + COLUMN_WIDTH + COLUMN_GAP + COLUMN_WIDTH / 2) - SCREEN_WIDTH / 2,
    (16 + 2 * (COLUMN_WIDTH + COLUMN_GAP) + COLUMN_WIDTH) - (SCREEN_WIDTH - 16)
];

// Updated Order: Upcoming -> Today -> Completed
const SECTIONS: SectionId[] = ['upcoming', 'today', 'completed'];
const SECTION_TITLES: Record<SectionId, string> = {
    today: 'Heute',
    upcoming: 'Demnächst',
    completed: 'Abgeschlossen',
};

type ThemeName = keyof typeof Colors;

// --- Components ---

function KanbanColumn({
    section,
    tasks,
    onPressTask,
    theme,
    isDark,
    styles,
    rowStyles,
    projectsById,
    toggleComplete,
    deleteTask,
    onReorderSection
}: {
    section: SectionId;
    tasks: Task[];
    onPressTask: (id: string) => void;
    theme: ThemeName;
    isDark: boolean;
    styles: ReturnType<typeof createStyles>;
    rowStyles: SwipeTaskRowStyles;
    projectsById: Map<string, Project>;
    toggleComplete: (taskId: string) => void;
    deleteTask: (taskId: string) => void;
    onReorderSection: (sectionId: SectionId, orderedTaskIds: string[]) => void;
}) {
    return (
        <View style={styles.column}>
            <View style={styles.columnHeader}>
                <Text style={styles.columnTitle}>{SECTION_TITLES[section]}</Text>
                <GlassSurface
                    style={styles.countBadge}
                    glassEffectStyle="regular"
                    tintColor={withAlpha(Colors[theme].text, 0.1)}
                    fallbackBackgroundColor={withAlpha(Colors[theme].text, 0.1)}
                >
                    <Text style={styles.countText}>{tasks.length}</Text>
                </GlassSurface>
            </View>

            <TaskSwipeDraggableList
                theme={theme}
                tasks={tasks}
                projectsById={projectsById}
                rowStyles={rowStyles}
                enabledTags={new Set()}
                showTaskIcons={true}
                contentContainerStyle={styles.columnContent}
                containerStyle={{ backgroundColor: 'transparent' }}
                contentInsetAdjustmentBehavior="never"
                empty={
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyText}>Keine Tasks</Text>
                    </View>
                }
                onPressTask={onPressTask}
                toggleComplete={toggleComplete}
                deleteTask={deleteTask}
                onReorder={(orderedTaskIds) => onReorderSection(section, orderedTaskIds)}
            />
        </View>
    );
}

export default function ProjectDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const theme = (useColorScheme() ?? 'light') as ThemeName;
    const isDark = theme === 'dark';
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const rowStyles = React.useMemo(() => createRowStyles(theme), [theme]);
    const { projects, tasks, setTasks } = useTasksStore();

    const projectsById = React.useMemo(() => new Map(projects.map((p) => [p.id, p] as const)), [projects]);

    const project = React.useMemo(() => projects.find((p) => p.id === id), [projects, id]);

    const projectTasks = React.useMemo(() => {
        return tasks.filter(t => t.projectId === id && !t.deletedAt);
    }, [tasks, id]);

    const tasksBySection = React.useMemo(() => {
        const grouped: Record<SectionId, Task[]> = { today: [], upcoming: [], completed: [] };
        for (const t of projectTasks) {
            if (grouped[t.section]) {
                grouped[t.section].push(t);
            }
        }
        for (const sectionId of SECTIONS) {
            grouped[sectionId] = [...grouped[sectionId]].sort((a, b) => (a.orderRank ?? 0) - (b.orderRank ?? 0));
        }
        return grouped;
    }, [projectTasks]);

    const onPressTask = React.useCallback((taskId: string) => {
        router.push({ pathname: '/task/[id]', params: { id: taskId } });
    }, [router]);

    const onEditProject = React.useCallback(() => {
        router.push({ pathname: '/project/edit-modal', params: { id } });
    }, [id, router]);

    const onReorderSection = React.useCallback(
        (section: SectionId, orderedTaskIds: string[]) => {
            const orderIndex = new Map(orderedTaskIds.map((taskId, i) => [taskId, i] as const));
            setTasks((prev) =>
                prev.map((t) => {
                    const idx = orderIndex.get(t.id);
                    if (idx === undefined) return t;
                    return { ...t, orderRank: (idx + 1) * 1000 };
                })
            );
        },
        [setTasks]
    );

    const toggleComplete = React.useCallback(
        (taskId: string) => {
            setTasks((prev) => {
                const task = prev.find((t) => t.id === taskId);
                if (!task) return prev;

                const fromSection = task.section;
                const toSection: SectionId = fromSection === 'completed' ? 'today' : 'completed';

                const next = prev.map((t) =>
                    t.id === taskId
                        ? {
                            ...t,
                            section: toSection,
                            dueAt: getDueAtForSection(toSection),
                            dueHasTime: true,
                        }
                        : t
                );

                // Keep ordering tidy within the destination section by putting moved task at the top.
                const moved = next.find((t) => t.id === taskId);
                if (!moved) return next;

                const others = next.filter((t) => t.id !== taskId);
                const dest = others
                    .filter((t) => t.section === toSection)
                    .sort((a, b) => (a.orderRank ?? 0) - (b.orderRank ?? 0));
                const rest = others.filter((t) => t.section !== toSection);

                const withInserted = [...rest, moved, ...dest];

                const reseed = (items: Task[], sectionId: SectionId) => {
                    const sectionIds = items
                        .filter((t) => t.section === sectionId)
                        .sort((a, b) => (a.orderRank ?? 0) - (b.orderRank ?? 0))
                        .map((t) => t.id);
                    const byId = new Map(items.map((t) => [t.id, t] as const));
                    sectionIds.forEach((id, index) => {
                        const current = byId.get(id);
                        if (!current) return;
                        byId.set(id, { ...current, orderRank: (index + 1) * 1000 });
                    });
                    return items.map((t) => byId.get(t.id) ?? t);
                };

                const reseededFrom = reseed(withInserted, fromSection);
                const reseededBoth = reseed(reseededFrom, toSection);
                return reseededBoth;
            });
        },
        [setTasks]
    );

    const deleteTask = React.useCallback(
        (taskId: string) => {
            setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, deletedAt: Date.now() } : t)));
        },
        [setTasks]
    );

    if (!project) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: Colors[theme].text }}>Projekt nicht gefunden</Text>
            </View>
        );
    }

    const headerCardBg = withAlpha(project.color, isDark ? 0.2 : 0.15);

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <View style={styles.container}>
                <Stack.Screen
                    options={{
                        title: '',
                        headerTransparent: true,
                        headerShadowVisible: false,
                        headerBackTitle: 'Projekte',
                        headerTintColor: Colors[theme].tint,
                        headerStyle: { backgroundColor: 'transparent' },
                        headerRight: () => (
                            <Pressable onPress={onEditProject} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 8 })}>
                                <MaterialIcons name="edit" size={24} color={Colors[theme].tint} />
                            </Pressable>
                        ),
                    }}
                />

                {/* Header Card */}
                <View style={{ paddingTop: 120, paddingHorizontal: 16, paddingBottom: 16 }}>
                    <View
                        style={[
                            styles.headerCard,
                            { backgroundColor: headerCardBg },
                        ]}
                    >
                        <View style={styles.headerIconContainer}>
                            <SFSymbol name={project.icon} size={32} color={project.color} />
                        </View>
                        <View style={{ flex: 1, gap: 4 }}>
                            <Text style={styles.headerTitle}>{project.name}</Text>
                            {project.description ? (
                                <Text style={styles.headerDesc} numberOfLines={2}>{project.description}</Text>
                            ) : (
                                <Text style={[styles.headerDesc, { opacity: 0.5 }]}>Keine Beschreibung</Text>
                            )}
                        </View>
                    </View>
                </View>

                {/* Main Board */}
                <ScrollView
                    horizontal
                    pagingEnabled={false}
                    snapToOffsets={SNAP_OFFSETS}
                    decelerationRate="fast"
                    contentContainerStyle={[
                        styles.boardContent,
                        { paddingHorizontal: 16 }
                    ]}
                    showsHorizontalScrollIndicator={false}
                    contentInsetAdjustmentBehavior="never"
                    contentOffset={{ x: SNAP_OFFSETS[1], y: 0 }} // Start focused on Today
                >
                    {SECTIONS.map((section) => (
                        <KanbanColumn
                            key={section}
                            section={section}
                            tasks={tasksBySection[section]}
                            onPressTask={onPressTask}
                            theme={theme}
                            isDark={isDark}
                            styles={styles}
                            rowStyles={rowStyles}
                            projectsById={projectsById}
                            toggleComplete={toggleComplete}
                            deleteTask={deleteTask}
                            onReorderSection={onReorderSection}
                        />
                    ))}
                </ScrollView>
            </View>
        </GestureHandlerRootView>
    );
}

const createStyles = (theme: ThemeName) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: Colors[theme].background,
        },
        headerCard: {
            flexDirection: 'row',
            alignItems: 'center',
            padding: 16,
            borderRadius: 20,
            gap: 16,
        },
        headerIconContainer: {
            width: 56,
            height: 56,
            borderRadius: 16,
            backgroundColor: withAlpha(Colors[theme].background, 0.5), // Slight contrast
            alignItems: 'center',
            justifyContent: 'center',
        },
        headerTitle: {
            fontSize: 22,
            fontWeight: '700',
            color: Colors[theme].text,
            letterSpacing: 0.3,
        },
        headerDesc: {
            fontSize: 15,
            color: withAlpha(Colors[theme].text, 0.7),
            lineHeight: 20,
        },
        boardContent: {
            paddingTop: 10,
            paddingBottom: 40,
            gap: COLUMN_GAP,
            // paddingHorizontal is handled dynamically in style prop
        },
        column: {
            width: COLUMN_WIDTH,
            backgroundColor: theme === 'dark' ? '#2C2C2E' : '#F2F2F7',
            borderRadius: 16,
            padding: 12,
            maxHeight: '100%',
        },
        columnHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
            paddingHorizontal: 4,
        },
        columnTitle: {
            fontSize: 17,
            fontWeight: '600',
            color: Colors[theme].text,
        },
        countBadge: {
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 12,
            overflow: 'hidden',
        },
        countText: {
            fontSize: 13,
            fontWeight: '500',
            color: withAlpha(Colors[theme].text, 0.6),
        },
        columnContent: {
            gap: 12,
            paddingBottom: 20,
        },
        card: {
            borderRadius: 12,
            padding: 12, // Reduced padding slightly as rowInner has gap
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 4,
            elevation: 2,
            justifyContent: 'center',
        },
        cardInner: {
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
        emoji: {
            fontSize: 18,
        },
        textStack: {
            flex: 1,
            gap: 2,
        },
        cardTitle: {
            fontSize: 15,
            fontWeight: '700',
            color: Colors[theme].text,
            lineHeight: 20,
        },
        cardSubtitle: {
            fontSize: 12,
            fontWeight: '600',
            color: withAlpha(Colors[theme].text, 0.7),
        },
        emptyState: {
            padding: 20,
            alignItems: 'center',
        },
        emptyText: {
            color: withAlpha(Colors[theme].text, 0.4),
            fontStyle: 'italic',
        },
    });

const createRowStyles = (theme: ThemeName): SwipeTaskRowStyles => {
    const isDark = theme === 'dark';
    const text = Colors[theme].text;
    const hairline = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)';
    const cardBg = isDark ? '#1C1C1E' : '#F2F2F7';
    const tagBg = withAlpha(text, isDark ? 0.10 : 0.08);
    const tagText = withAlpha(text, 0.78);
    const dangerBg = isDark ? 'rgba(255,69,58,0.18)' : 'rgba(255,59,48,0.14)';
    const dangerBorder = isDark ? 'rgba(255,69,58,0.32)' : 'rgba(255,59,48,0.26)';

    return StyleSheet.create({
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
    }) as unknown as SwipeTaskRowStyles;
};
