import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { withAlpha } from '@/components/ui/glass-surface';
import { SFSymbol } from '@/components/ui/sfsymbol';
import { Colors } from '@/constants/theme';
import { useTasksStore } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { t } from '@/i18n';

export default function ProjectPickerScreen() {
    const router = useRouter();
    const { taskId } = useLocalSearchParams<{ taskId: string }>();
    const theme = useColorScheme() ?? 'light';
    const isDark = theme === 'dark';
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const insets = useSafeAreaInsets();

    const { tasks, setTasks, projects } = useTasksStore();
    const task = React.useMemo(() => tasks.find((t) => t.id === taskId), [tasks, taskId]);

    // Local state
    const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(
        task?.projectId || null
    );

    // Initialize state
    React.useEffect(() => {
        if (task && selectedProjectId === undefined) {
            setSelectedProjectId(task.projectId || null);
        }
    }, [task]);

    const handleSave = React.useCallback(() => {
        if (!taskId) return;
        setTasks((prev) => prev.map((t) => (t.id === taskId ? {
            ...t,
            projectId: selectedProjectId || '',
        } : t)));
        router.back();
    }, [taskId, selectedProjectId, setTasks, router]);

    const handleCancel = React.useCallback(() => {
        router.back();
    }, [router]);

    const handleCreateProject = React.useCallback(() => {
        // Navigate to create project modal
        // Since we are in a modal, pushing another modal might stack them
        router.push('/project/edit-modal');
    }, [router]);


    return (
        <View style={styles.container}>
            <Stack.Screen
                options={{
                    title: t('projectPicker.title'),
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
                    {/* New Project Button */}
                    <Pressable
                        onPress={handleCreateProject}
                        style={[styles.optionRow, { marginBottom: 24, justifyContent: 'center' }]}
                    >
                        <MaterialIcons name="add" size={20} color={Colors[theme].tint} style={{ marginRight: 8 }} />
                        <Text style={[styles.optionLabel, { color: Colors[theme].tint }]}>{t('projectPicker.newProject')}</Text>
                    </Pressable>

                    {/* No Project Option */}
                    <Pressable
                        onPress={() => setSelectedProjectId(null)}
                        style={[styles.optionRow, selectedProjectId === null && styles.optionRowActive]}
                    >
                        <View style={[styles.optionIcon, { backgroundColor: withAlpha(Colors[theme].text, isDark ? 0.15 : 0.1) }]}>
                            <MaterialIcons name="folder-off" size={20} color={withAlpha(Colors[theme].text, 0.6)} />
                        </View>
                        <View style={styles.optionBody}>
                            <Text style={styles.optionLabel}>{t('projectPicker.noProject')}</Text>
                        </View>
                        {selectedProjectId === null && <MaterialIcons name="check" size={20} color={Colors[theme].tint} />}
                    </Pressable>

                    <View style={styles.divider} />

                    {/* Project List */}
                    {projects.map((p) => {
                        const isActive = selectedProjectId === p.id;
                        return (
                            <Pressable
                                key={p.id}
                                onPress={() => setSelectedProjectId(p.id)}
                                style={[styles.optionRow, isActive && styles.optionRowActive]}
                            >
                                <View style={[styles.optionIcon, { backgroundColor: withAlpha(p.color, 0.15) }]}>
                                    <SFSymbol name={p.icon} size={20} color={p.color} />
                                </View>
                                <View style={styles.optionBody}>
                                    <Text style={styles.optionLabel}>{p.name}</Text>
                                    <Text style={styles.optionSubLabel} numberOfLines={1}>{p.description || t('common.noDescription')}</Text>
                                </View>
                                {isActive && <MaterialIcons name="check" size={20} color={Colors[theme].tint} />}
                            </Pressable>
                        );
                    })}
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
        optionRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 14,
            marginBottom: 8,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: hairline,
            backgroundColor: withAlpha(text, isDark ? 0.04 : 0.03),
        },
        optionRowActive: {
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: withAlpha(Colors[theme].tint, 0.45),
            backgroundColor: withAlpha(Colors[theme].tint, isDark ? 0.18 : 0.12),
        },
        optionIcon: {
            width: 36,
            height: 36,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
        },
        optionBody: {
            flex: 1,
            gap: 2,
        },
        optionLabel: {
            fontSize: 16,
            fontWeight: '600',
            color: text,
        },
        optionSubLabel: {
            fontSize: 12,
            color: withAlpha(text, 0.5),
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
        divider: {
            height: 1,
            backgroundColor: hairline,
            marginVertical: 16,
        }
    });
};
