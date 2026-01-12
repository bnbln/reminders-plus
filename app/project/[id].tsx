
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Dimensions, LayoutRectangle, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
    measure,
    MeasuredDimensions,
    runOnJS,
    useAnimatedRef,
    useAnimatedStyle,
    useSharedValue,
    withSpring
} from 'react-native-reanimated';

import { GlassSurface, withAlpha } from '@/components/ui/glass-surface';
import { SFSymbol } from '@/components/ui/sfsymbol';
import { Colors } from '@/constants/theme';
import { SectionId, Task, useTasksStore } from '@/context/tasks-store';
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

type DragInfo = {
    taskId: string;
    originalSection: SectionId;
    width: number;
    height: number;
    x: number;
    y: number;
    emoji: string;
    title: string;
    subtitle?: string;
};

// --- Components ---

function KanbanTaskCard({
    task,
    onPress,
    styles,
    theme,
    isDark,
    onLongPress,
    isHidden
}: {
    task: Task;
    onPress: () => void;
    styles: any;
    theme: any;
    isDark: boolean;
    onLongPress: (task: Task, measurement: MeasuredDimensions) => void;
    isHidden: boolean;
}) {
    const bg = theme === 'dark' ? '#1C1C1E' : '#F2F2F7'; // Match cardBg from home
    const aref = useAnimatedRef<View>();
    const isCompletedSection = task.section === 'completed';

    // Match home/index.tsx tints
    const emojiTint = React.useMemo(() => withAlpha(Colors[theme].background, isDark ? 0.12 : 0.22), [theme, isDark]);
    const emojiFallback = React.useMemo(() => withAlpha(Colors[theme].background, isDark ? 0.52 : 0.74), [theme, isDark]);

    const longPress = Gesture.LongPress()
        .minDuration(300)
        .onStart(() => {
            const measurement = measure(aref);
            if (measurement) {
                runOnJS(onLongPress)(task, measurement);
            }
        });

    return (
        <GestureDetector gesture={longPress}>
            <Pressable
                ref={aref}
                onPress={onPress}
                style={({ pressed }) => [
                    styles.card,
                    { backgroundColor: bg, borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)', borderWidth: StyleSheet.hairlineWidth },
                    pressed && { opacity: 0.92 },
                    isHidden && { opacity: 0 },
                    isCompletedSection && { opacity: 0.5 }
                ]}
            >
                <View style={styles.cardInner}>
                    <GlassSurface
                        style={styles.emojiTile}
                        glassEffectStyle="regular"
                        tintColor={emojiTint}
                        fallbackBackgroundColor={emojiFallback}
                    >
                        <Text style={styles.emoji}>{task.emoji}</Text>
                    </GlassSurface>

                    <View style={styles.textStack}>
                        <Text numberOfLines={2} style={styles.cardTitle}>{task.title}</Text>
                        {task.subtitle ? (
                            <Text numberOfLines={1} style={styles.cardSubtitle}>{task.subtitle}</Text>
                        ) : null}
                    </View>
                </View>
            </Pressable>
        </GestureDetector>
    );
}

function KanbanColumn({
    section,
    tasks,
    onPressTask,
    styles,
    theme,
    isDark,
    onLongPressTask,
    hiddenTaskId,
    onLayout
}: {
    section: SectionId;
    tasks: Task[];
    onPressTask: (id: string) => void;
    styles: any;
    theme: any;
    isDark: boolean;
    onLongPressTask: (task: Task, measurement: MeasuredDimensions) => void;
    hiddenTaskId: string | null;
    onLayout: (section: SectionId, layout: LayoutRectangle) => void;
}) {
    return (
        <View
            style={styles.column}
            onLayout={(e) => onLayout(section, e.nativeEvent.layout)}
        >
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
            <ScrollView
                contentContainerStyle={styles.columnContent}
                showsVerticalScrollIndicator={false}
            >
                {tasks.map((task) => (
                    <KanbanTaskCard
                        key={task.id}
                        task={task}
                        onPress={() => onPressTask(task.id)}
                        styles={styles}
                        theme={theme}
                        isDark={isDark}
                        onLongPress={onLongPressTask}
                        isHidden={hiddenTaskId === task.id}
                    />
                ))}
                {tasks.length === 0 && (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyText}>Keine Tasks</Text>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

export default function ProjectDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const isDark = theme === 'dark';
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const { projects, tasks, setTasks } = useTasksStore();

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
        return grouped;
    }, [projectTasks]);

    const onPressTask = React.useCallback((taskId: string) => {
        router.push({ pathname: '/task/[id]', params: { id: taskId } });
    }, [router]);

    const onEditProject = React.useCallback(() => {
        router.push({ pathname: '/project/edit-modal', params: { id } });
    }, [id, router]);

    // --- Drag and Drop State ---
    const [dragItem, setDragItem] = React.useState<DragInfo | null>(null);
    const [columnLayouts, setColumnLayouts] = React.useState<Record<SectionId, LayoutRectangle>>({
        today: { x: 0, y: 0, width: 0, height: 0 },
        upcoming: { x: 0, y: 0, width: 0, height: 0 },
        completed: { x: 0, y: 0, width: 0, height: 0 }
    });

    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const isDragging = useSharedValue(false);
    const scale = useSharedValue(1);
    const scrollX = useSharedValue(0);

    const handleLongPress = React.useCallback((task: Task, measurement: MeasuredDimensions) => {
        if (measurement) {
            setDragItem({
                taskId: task.id,
                originalSection: task.section,
                width: measurement.width,
                height: measurement.height,
                x: measurement.pageX,
                y: measurement.pageY,
                emoji: task.emoji,
                title: task.title,
                subtitle: task.subtitle
            });
            translateX.value = measurement.pageX;
            translateY.value = measurement.pageY;
            isDragging.value = true;
            scale.value = withSpring(1.05);
        }
    }, []);

    const onColumnLayout = React.useCallback((section: SectionId, layout: LayoutRectangle) => {
        setColumnLayouts(prev => ({ ...prev, [section]: layout }));
    }, []);

    const panGesture = Gesture.Pan()
        .manualActivation(true)
        .onTouchesMove((e, state) => {
            if (dragItem) {
                state.activate();
            } else {
                state.fail();
            }
        })
        .onUpdate((e) => {
            translateX.value = e.absoluteX - (dragItem?.width || 0) / 2;
            translateY.value = e.absoluteY - (dragItem?.height || 0) / 2;
        })
        .onEnd((e) => {
            const dropX = e.absoluteX;
            const dropY = e.absoluteY;
            const contentX = scrollX.value + dropX;

            // Padding Horizontal is 16.
            const relativeX = contentX - 16;

            // Width 78%, Gap 12.
            // Width approx 300. Gap 12.
            // Split points roughly at Width + Gap/2.

            let targetSection: SectionId | null = null;
            if (relativeX < COLUMN_WIDTH + COLUMN_GAP / 2) targetSection = 'upcoming';
            else if (relativeX < 2 * COLUMN_WIDTH + 1.5 * COLUMN_GAP) targetSection = 'today';
            else targetSection = 'completed';

            if (dropY < 180) targetSection = null;

            if (targetSection && targetSection !== dragItem?.originalSection) {
                runOnJS(handleDrop)(dragItem!.taskId, targetSection);
            } else {
                runOnJS(cancelDrag)();
            }
        });

    const handleDrop = (taskId: string, newSection: SectionId) => {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, section: newSection } : t));
        cancelDrag();
    };

    const cancelDrag = () => {
        setDragItem(null);
        isDragging.value = false;
        scale.value = 1;
    };

    const animatedDragStyle = useAnimatedStyle(() => {
        if (!dragItem) return { display: 'none' };
        return {
            position: 'absolute',
            top: 0,
            left: 0,
            width: dragItem.width,
            height: dragItem.height,
            transform: [
                { translateX: translateX.value },
                { translateY: translateY.value },
                { scale: scale.value }
            ],
            zIndex: 1000
        };
    });

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
                <Animated.ScrollView
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
                    onScroll={(e) => { scrollX.value = e.nativeEvent.contentOffset.x }}
                    scrollEventThrottle={16}
                    contentOffset={{ x: SNAP_OFFSETS[1], y: 0 }} // Start focused on Today
                >
                    {SECTIONS.map((section) => (
                        <KanbanColumn
                            key={section}
                            section={section}
                            tasks={tasksBySection[section]}
                            onPressTask={onPressTask}
                            styles={styles}
                            theme={theme}
                            isDark={isDark}
                            onLongPressTask={handleLongPress}
                            hiddenTaskId={dragItem?.taskId ?? null}
                            onLayout={onColumnLayout}
                        />
                    ))}
                </Animated.ScrollView>

                {/* Drag Overlay */}
                {dragItem && (
                    <GestureDetector gesture={panGesture}>
                        <Animated.View style={[
                            styles.card,
                            {
                                backgroundColor: theme === 'dark' ? '#1C1C1E' : '#F2F2F7',
                                borderColor: theme === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)',
                                borderWidth: StyleSheet.hairlineWidth,
                                shadowOpacity: 0.2, // Increased shadow for lift
                                shadowRadius: 8,
                                elevation: 5
                            },
                            animatedDragStyle
                        ]}>
                            <View style={styles.cardInner}>
                                <GlassSurface
                                    style={styles.emojiTile}
                                    glassEffectStyle="regular"
                                    tintColor={withAlpha(Colors[theme].background, isDark ? 0.12 : 0.22)}
                                    fallbackBackgroundColor={withAlpha(Colors[theme].background, isDark ? 0.52 : 0.74)}
                                >
                                    <Text style={styles.emoji}>{dragItem.emoji}</Text>
                                </GlassSurface>
                                <View style={styles.textStack}>
                                    <Text numberOfLines={2} style={styles.cardTitle}>{dragItem.title}</Text>
                                    {dragItem.subtitle && (
                                        <Text numberOfLines={1} style={styles.cardSubtitle}>{dragItem.subtitle}</Text>
                                    )}
                                </View>
                            </View>
                        </Animated.View>
                    </GestureDetector>
                )}
            </View>
        </GestureHandlerRootView>
    );
}

const createStyles = (theme: 'light' | 'dark') =>
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
