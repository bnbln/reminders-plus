import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSheetHeaderActions } from '@/components/navigation/sheet-header-actions';
import { withAlpha } from '@/components/ui/glass-surface';
import { SFSymbol } from '@/components/ui/sfsymbol';
import { usePremium } from '@/context/premium-store';
import { Colors, contrastAlpha, PICKER_SHEET_DARK_ROW, PICKER_SHEET_DARK_ROW_BORDER } from '@/constants/theme';
import { useTasksStore } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { t } from '@/i18n';
import { shouldRouteToProjectLimitGate } from '@/utils/project-creation-gate';
import { ripple, rippleClip } from "@/components/ui/ripple";
import { useThemedStyles } from "@/hooks/use-themed-styles";

export default function ProjectPickerScreen() {
    const router = useRouter();
    const { taskId: taskIdParam } = useLocalSearchParams<{ taskId?: string | string[] }>();
    const taskId = React.useMemo(() => {
        const rawTaskId = Array.isArray(taskIdParam) ? taskIdParam[0] : taskIdParam;
        if (typeof rawTaskId !== 'string') return '';
        return rawTaskId.trim();
    }, [taskIdParam]);
    const theme = useColorScheme() ?? 'light';
    const isDark = theme === 'dark';
    const styles = useThemedStyles(() => createStyles(theme), [theme]);
    const insets = useSafeAreaInsets();

    const { tasks, setTasks, projects } = useTasksStore();
    const { hasPremiumAccess, isReady } = usePremium();
    const task = React.useMemo(() => tasks.find((t) => t.id === taskId), [tasks, taskId]);
    const visibleProjects = React.useMemo(() => projects.filter((project) => !project.deletedAt), [projects]);
    const activeProjectCount = React.useMemo(
        () => projects.filter((project) => !project.deletedAt).length,
        [projects]
    );
    const selectedProjectId = task?.projectId?.trim().length ? task.projectId : null;

    const applyProjectSelectionAndClose = React.useCallback((nextProjectId: string | null) => {
        if (!taskId) {
            router.back();
            return;
        }

        setTasks((prev) => prev.map((t) => (t.id === taskId ? {
            ...t,
            projectId: nextProjectId ?? '',
        } : t)));
        router.back();
    }, [router, setTasks, taskId]);

    const handleCancel = React.useCallback(() => {
        router.back();
    }, [router]);
    const sheetHeaderActions = useSheetHeaderActions({ onClose: handleCancel });

    const handleCreateProject = React.useCallback(() => {
        // Navigate to create project modal
        // Since we are in a modal, pushing another modal might stack them
        router.push(
            shouldRouteToProjectLimitGate({
                activeProjectCount,
                hasPremiumAccess,
                isReady,
            })
                ? '/project/limit-modal'
                : '/project/create-modal'
        );
    }, [activeProjectCount, hasPremiumAccess, isReady, router]);


    return (
        <View style={styles.container}>
            <Stack.Screen
                options={{
                    title: t('projectPicker.title'),
                    ...sheetHeaderActions,
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
                    contentInsetAdjustmentBehavior="automatic"
                    contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
                    showsVerticalScrollIndicator={false}
                >
                    {/* New Project Button */}
                    <Pressable
                      android_ripple={ripple()}
                        onPress={handleCreateProject}
                        style={[styles.optionRow, rippleClip(14), { marginBottom: 24, justifyContent: 'center' }]}
                    >
                        <MaterialIcons name="add" size={20} color={Colors[theme].tint} style={{ marginRight: 8 }} />
                        <Text style={[styles.optionLabel, { color: Colors[theme].tint }]}>{t('projectPicker.newProject')}</Text>
                    </Pressable>

                    {/* No Project Option */}
                    <Pressable
                      android_ripple={ripple()}
                        onPress={() => applyProjectSelectionAndClose(null)}
                        style={[styles.optionRow, rippleClip(14), (selectedProjectId ?? null) === null && styles.optionRowActive]}
                    >
                        <View style={[styles.optionIcon, { backgroundColor: withAlpha(Colors[theme].text, contrastAlpha(isDark ? 0.15 : 0.1)) }]}>
                            <MaterialIcons name="folder-off" size={20} color={withAlpha(Colors[theme].text, contrastAlpha(0.6))} />
                        </View>
                        <View style={styles.optionBody}>
                            <Text style={styles.optionLabel}>{t('projectPicker.noProject')}</Text>
                        </View>
                        {(selectedProjectId ?? null) === null && <MaterialIcons name="check" size={20} color={Colors[theme].tint} />}
                    </Pressable>

                    <View style={styles.divider} />

                    {/* Project List */}
                    {visibleProjects.map((p) => {
                        const isActive = selectedProjectId === p.id;
                        return (
                            <Pressable
                              android_ripple={ripple()}
                                key={p.id}
                                onPress={() => applyProjectSelectionAndClose(p.id)}
                                style={[styles.optionRow, rippleClip(14), isActive && styles.optionRowActive]}
                            >
                                <View style={[styles.optionIcon, { backgroundColor: withAlpha(p.color, 0.15) }]}>
                                    {p.emoji ? (
                                        <Text style={styles.optionEmoji}>{p.emoji}</Text>
                                    ) : (
                                        <SFSymbol name={p.icon} size={20} color={p.color} />
                                    )}
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
            borderWidth: isDark ? 1 : StyleSheet.hairlineWidth,
            borderColor: isDark ? PICKER_SHEET_DARK_ROW_BORDER : hairline,
            backgroundColor: isDark ? PICKER_SHEET_DARK_ROW : withAlpha(text, contrastAlpha(0.03)),
        },
        optionRowActive: {
            borderWidth: isDark ? 1.5 : StyleSheet.hairlineWidth,
            borderColor: isDark ? Colors[theme].tint : withAlpha(Colors[theme].tint, 0.45),
            backgroundColor: withAlpha(Colors[theme].tint, isDark ? 0.18 : 0.12),
        },
        optionIcon: {
            width: 36,
            height: 36,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
        },
        optionEmoji: {
            fontSize: 20,
            lineHeight: 24,
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
            color: withAlpha(text, contrastAlpha(0.5)),
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
