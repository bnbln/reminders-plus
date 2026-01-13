import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { withAlpha } from '@/components/ui/glass-surface';
import { Colors } from '@/constants/theme';
import { useTasksStore } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';

const COLOR_SWATCHES = [
    '#34C759',
    '#0A84FF',
    '#FF9500',
    '#FF3B30',
    '#AF52DE',
    '#5E5CE6',
    '#32D74B',
    '#FFD60A',
    '#64D2FF',
    '#FF2D55',
    '#8E8E93',
    '#1C1C1E',
] as const;

const EMOJI_SWATCHES = [
    '✅',
    '🧠',
    '🧹',
    '🎧',
    '📞',
    '🧾',
    '🗂️',
    '🧭',
    '🧪',
    '🧩',
    '📝',
    '📅',
    '📌',
    '📦',
    '📍',
    '🛒',
    '🏃‍♂️',
    '🚶‍♂️',
    '🧘‍♂️',
    '🍽️',
    '☕️',
    '💡',
    '✨',
    '🎯',
    '🎨',
    '🖼️',
    '📚',
    '🛠️',
    '🧑‍💻',
    '🤝',
    '🧷',
    '🔒',
] as const;

export default function EmojiPickerScreen() {
    const router = useRouter();
    const { taskId } = useLocalSearchParams<{ taskId: string }>();
    const theme = useColorScheme() ?? 'light';
    const isDark = theme === 'dark';
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const insets = useSafeAreaInsets();

    const { tasks, setTasks } = useTasksStore();
    const task = React.useMemo(() => tasks.find((t) => t.id === taskId), [tasks, taskId]);

    // Local state
    const [emoji, setEmoji] = React.useState(task?.emoji ?? '✅');
    const [color, setColor] = React.useState<string | undefined>(task?.color);

    // Initialize state
    React.useEffect(() => {
        if (task) {
            setEmoji(task.emoji);
            setColor(task.color);
        }
    }, [task]);

    const handleSave = React.useCallback(() => {
        if (!taskId) return;
        setTasks((prev) => prev.map((t) => (t.id === taskId ? {
            ...t,
            emoji,
            color,
        } : t)));
        router.back();
    }, [taskId, emoji, color, setTasks, router]);

    const handleCancel = React.useCallback(() => {
        router.back();
    }, [router]);

    return (
        <View style={styles.container}>
            <Stack.Screen
                options={{
                    title: 'Emoji & Farbe',
                    headerLeft: () => (
                        <View style={styles.iconButton}>
                            <Pressable onPress={handleCancel} hitSlop={10} style={styles.pressableIcon}>
                                <MaterialIcons name="close" size={24} color={Colors[theme].text} />
                            </Pressable>
                        </View>
                    ),
                    headerRight: () => (
                        <View style={styles.iconButton}>
                            <Pressable onPress={handleSave} hitSlop={10} style={styles.pressableIcon}>
                                <MaterialIcons name="check" size={24} color={Colors[theme].text} />
                            </Pressable>
                        </View>
                    ),
                    headerShown: true,
                    headerStyle: {
                        backgroundColor: isDark ? '#000000' : '#F2F2F7',
                    },
                    headerShadowVisible: false,
                } as any}
            />

            <View style={styles.sheet}>
                <ScrollView
                    style={styles.content}
                    contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
                    showsVerticalScrollIndicator={false}
                >
                    <Text style={styles.sectionTitle}>Emoji</Text>
                    <View style={styles.grid}>
                        {EMOJI_SWATCHES.map((e) => (
                            <Pressable
                                key={e}
                                onPress={() => setEmoji(e)}
                                style={[
                                    styles.emojiSwatch,
                                    e === emoji && styles.selectedSwatch
                                ]}
                            >
                                <Text style={styles.emojiText}>{e}</Text>
                            </Pressable>
                        ))}
                    </View>

                    <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Farbe</Text>
                    <View style={styles.grid}>
                        {COLOR_SWATCHES.map((c) => (
                            <Pressable
                                key={c}
                                onPress={() => setColor(c)}
                                style={[
                                    styles.colorSwatch,
                                    { backgroundColor: c },
                                    color === c && styles.selectedSwatch
                                ]}
                            />
                        ))}
                    </View>

                    {color && (
                        <Pressable
                            onPress={() => setColor(undefined)}
                            style={styles.resetButton}
                        >
                            <Text style={styles.resetText}>Farbe zurücksetzen</Text>
                        </Pressable>
                    )}
                </ScrollView>
            </View>
        </View>
    );
}

const createStyles = (theme: keyof typeof Colors) => {
    const isDark = theme === 'dark';
    const text = Colors[theme].text;
    const hairline = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';

    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: isDark ? '#000000' : '#F2F2F7',
        },
        sheet: {
            flex: 1,
            backgroundColor: isDark ? '#000000' : '#F2F2F7',
        },
        content: {
            flex: 1,
            padding: 16,
            backgroundColor: isDark ? '#000000' : '#F2F2F7',
        },
        sectionTitle: {
            fontSize: 13,
            fontWeight: '600',
            color: isDark ? '#8E8E93' : '#6E6E73',
            marginBottom: 12,
            marginLeft: 4,
            textTransform: 'uppercase',
        },
        grid: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 12,
        },
        emojiSwatch: {
            width: 44,
            height: 44,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: withAlpha(text, isDark ? 0.05 : 0.04),
        },
        emojiText: {
            fontSize: 24,
        },
        colorSwatch: {
            width: 44,
            height: 44,
            borderRadius: 22,
        },
        selectedSwatch: {
            borderWidth: 2,
            borderColor: Colors[theme].tint,
        },
        resetButton: {
            marginTop: 24,
            alignItems: 'center',
            padding: 8,
        },
        resetText: {
            fontSize: 15,
            color: withAlpha(text, 0.6),
        },
        iconButton: {
            width: 32,
            height: 32,
            alignItems: 'center',
            justifyContent: 'center',
        },
        pressableIcon: {
            width: '100%',
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
        },
    });
};
