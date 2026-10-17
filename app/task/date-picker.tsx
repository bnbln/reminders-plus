import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSheetHeaderActions } from '@/components/navigation/sheet-header-actions';
import { withAlpha } from '@/components/ui/glass-surface';
import { Colors, contrastAlpha, PICKER_SHEET_DARK_ROW, PICKER_SHEET_DARK_ROW_BORDER, TASK_SHEET_ACCENTS } from '@/constants/theme';
import { useTasksStore } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { t } from '@/i18n';
import { deriveActiveSectionFromDueAt } from '@/utils/task-dates';
import { ripple, rippleClip } from "@/components/ui/ripple";
import { useThemedStyles } from "@/hooks/use-themed-styles";

const ACCENT = TASK_SHEET_ACCENTS.date;

const pad2 = (n: number) => String(n).padStart(2, '0');

const normalizeDateWithTimeFlag = (date: Date, hasTime: boolean, previous: Date) => {
    const d = new Date(date);
    if (!hasTime) {
        d.setHours(12, 0, 0, 0);
        return d;
    }
    // Respect time if hasTime is true, but date part comes from picker
    // Usually picker sets both if mode='datetime', but we usually separate date/time or use combined.
    // Here we trust the picker's date fully if inline.
    return d;
};

export default function DatePickerScreen() {
    const router = useRouter();
    const { taskId } = useLocalSearchParams<{ taskId: string }>();
    const theme = useColorScheme() ?? 'light';
    const isDark = theme === 'dark';
    const styles = useThemedStyles(() => createStyles(theme), [theme]);
    const insets = useSafeAreaInsets();

    const { tasks, setTasks } = useTasksStore();
    const task = React.useMemo(() => tasks.find((t) => t.id === taskId), [tasks, taskId]);

    // Local state
    // Default to today if no date set
    const initialDate = React.useMemo(() => {
        if (task && task.dueAt && task.dueAt > 0) return new Date(task.dueAt);
        return new Date();
    }, [task]);

    const [dueDraft, setDueDraft] = React.useState<Date>(initialDate);
    const [dueHasTimeDraft, setDueHasTimeDraft] = React.useState(task?.dueHasTime ?? true);
    // A task without a due date starts in the "No date" state, so tapping Done
    // without touching the picker keeps it undated instead of saving today.
    const [isCleared, setIsCleared] = React.useState(() => !(task?.dueAt && task.dueAt > 0));

    // Initialize state
    React.useEffect(() => {
        if (task && !isCleared) {
            if (task.dueAt && task.dueAt > 0) {
                setDueDraft(new Date(task.dueAt));
                setDueHasTimeDraft(task.dueHasTime ?? true);
            }
        }
    }, [task]); // Careful with loop if isCleared check missing, but we only set on load mostly

    const handleSave = React.useCallback(() => {
        if (!taskId) return;

        if (isCleared) {
            setTasks((prev) => prev.map((t) => (t.id === taskId ? {
                ...t,
                dueAt: 0,
                dueHasTime: false,
                section: t.section === 'today' ? 'upcoming' : t.section // Move out of today if cleared? Or keep? Logic in original was mostly about ensuring upcoming
            } : t)));
            router.back();
            return;
        }

        const next = new Date(dueDraft);
        if (!dueHasTimeDraft) {
            next.setHours(12, 0, 0, 0);
        }

        const nextDueAt = next.getTime();
        let nextSection = task?.section;

        // Simple section logic update
        if (task && task.section !== 'completed') {
            nextSection = deriveActiveSectionFromDueAt(nextDueAt);
        }

        setTasks((prev) => prev.map((t) => (t.id === taskId ? {
            ...t,
            dueAt: nextDueAt,
            dueHasTime: dueHasTimeDraft,
            section: nextSection || t.section,
        } : t)));

        router.back();
    }, [taskId, dueDraft, dueHasTimeDraft, isCleared, setTasks, router, task]);

    const handleCancel = React.useCallback(() => {
        router.back();
    }, [router]);

    const handleClear = React.useCallback(() => {
        setIsCleared(true);
        // We don't save yet, just mark as cleared visually? 
        // Or we can treat "None" as a selectable state.
        // Let's toggle.
        setDueDraft(new Date()); // Reset to Today for UX if they re-enable
    }, []);

    const sheetHeaderActions = useSheetHeaderActions({ onClose: handleCancel, onDone: handleSave, doneTintColor: ACCENT });

    // If cleared, user interacts with picker -> uncleared
    const onDateChange = (_: any, date?: Date) => {
        if (date) {
            setIsCleared(false);
            setDueDraft(date);
        }
    };

    return (
        <View style={styles.container}>
            <Stack.Screen
                options={{
                    title: t('datePicker.title'),
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
                    {/* Clear Button / Status */}
                    <Pressable
                      android_ripple={ripple()}
                        onPress={handleClear}
                        style={[styles.optionRow, rippleClip(14), isCleared && styles.optionRowActive]}
                    >
                        <View style={[styles.optionIcon, { backgroundColor: withAlpha(Colors[theme].text, contrastAlpha(isDark ? 0.15 : 0.1)) }]}>
                            <MaterialIcons name="event-busy" size={20} color={withAlpha(Colors[theme].text, contrastAlpha(0.6))} />
                        </View>
                        <View style={styles.optionBody}>
                            <Text style={styles.optionLabel}>{t('datePicker.noDate')}</Text>
                        </View>
                        {isCleared && <MaterialIcons name="check" size={20} color={ACCENT} />}
                    </Pressable>

                    <View style={styles.divider} />

                    {/* Date Picker */}
                    <View style={styles.pickerContainer}>
                        <DateTimePicker
                            value={dueDraft}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'inline' : 'default'}
                            onChange={onDateChange}
                            textColor={Colors[theme].text}
                            themeVariant={theme}
                            accentColor={ACCENT}
                            style={styles.datePicker}
                        />
                    </View>

                    {/* Time Switch */}
                    <View style={[styles.optionRow, rippleClip(14), { justifyContent: 'space-between' }]}>
                        <Text style={styles.optionLabel}>{t('datePicker.time')}</Text>
                        <Switch
                            value={dueHasTimeDraft}
                            onValueChange={(v) => {
                                setDueHasTimeDraft(v);
                                setIsCleared(false);
                            }}
                        />
                    </View>

                    {/* Time Picker */}
                    {dueHasTimeDraft && (
                        <View style={styles.pickerContainer}>
                            <DateTimePicker
                                value={dueDraft}
                                mode="time"
                                display="spinner"
                                onChange={onDateChange}
                                textColor={Colors[theme].text}
                                themeVariant={theme}
                            accentColor={ACCENT}
                            />
                        </View>
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
            borderColor: isDark ? ACCENT : withAlpha(ACCENT, 0.45),
            backgroundColor: withAlpha(ACCENT, isDark ? 0.18 : 0.12),
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
        },
        pickerContainer: {
            backgroundColor: isDark ? PICKER_SHEET_DARK_ROW : withAlpha(text, contrastAlpha(0.03)),
            borderWidth: isDark ? 1 : 0,
            borderColor: PICKER_SHEET_DARK_ROW_BORDER,
            borderRadius: 14,
            marginBottom: 16,
            overflow: 'hidden',
            padding: 8,
        },
        datePicker: {
            width: '100%',
        }
    });
};
