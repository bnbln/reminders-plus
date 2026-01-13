import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { withAlpha } from '@/components/ui/glass-surface';
import { Colors } from '@/constants/theme';
import { RoutineType, useTasksStore } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';

type ThemeName = keyof typeof Colors;

const ROUTINE_OPTIONS: { value: RoutineType | null; label: string; icon: React.ComponentProps<typeof MaterialIcons>['name'] }[] = [
    { value: null, label: 'Nie', icon: 'block' },
    { value: 'hourly', label: 'Stündlich', icon: 'schedule' },
    { value: 'daily', label: 'Täglich', icon: 'today' },
    { value: 'weekdays', label: 'An Wochentagen', icon: 'work' },
    { value: 'weekends', label: 'An Wochenenden', icon: 'weekend' },
    { value: 'weekly', label: 'Wöchentlich', icon: 'date-range' },
    { value: 'biweekly', label: 'Alle 2 Wochen', icon: 'event-repeat' },
    { value: 'monthly', label: 'Monatlich', icon: 'calendar-month' },
    { value: 'quarterly', label: 'Alle 3 Monate', icon: 'event-note' },
    { value: 'biannually', label: 'Alle 6 Monate', icon: 'event-available' },
    { value: 'yearly', label: 'Jährlich', icon: 'cake' },
    { value: 'custom', label: 'Eigene', icon: 'tune' },
];

export default function RoutinePickerScreen() {
    const router = useRouter();
    const { taskId } = useLocalSearchParams<{ taskId: string }>();
    const theme = useColorScheme() ?? 'light';
    const isDark = theme === 'dark';
    const styles = React.useMemo(() => createStyles(theme), [theme]);

    const { tasks, setTasks } = useTasksStore();
    const task = React.useMemo(() => tasks.find((t) => t.id === taskId), [tasks, taskId]);

    // Local state for the selected routine
    const [selectedType, setSelectedType] = React.useState<RoutineType | null | undefined>(
        task?.isRoutine ? (task.routineType || task.routineInterval) : null
    );

    // Initialize state when task loads (if not already set)
    React.useEffect(() => {
        if (task && selectedType === undefined) {
            setSelectedType(task.isRoutine ? (task.routineType || task.routineInterval) : null);
        }
    }, [task]);

    // Save changes
    const handleSave = React.useCallback(() => {
        if (!taskId) return;

        if (selectedType === null) {
            setTasks((prev) => prev.map((t) => (t.id === taskId ? {
                ...t,
                isRoutine: false,
                routineType: undefined,
                routineInterval: undefined,
            } : t)));
        } else {
            setTasks((prev) => prev.map((t) => (t.id === taskId ? {
                ...t,
                isRoutine: true,
                routineType: selectedType,
                routineInterval: selectedType as any,
            } : t)));
        }
        router.back();
    }, [taskId, selectedType, setTasks, router]);

    // Cancel changes
    const handleCancel = React.useCallback(() => {
        router.back();
    }, [router]);

    if (!task) {
        return (
            <View style={styles.container}>
                <Stack.Screen
                    options={{
                        presentation: 'formSheet',
                        // sheetCornerRadius: 50,
                        // contentStyle: { backgroundColor: 'transparent' },
                        headerShown: true,
                    } as any}
                />
                <Text style={styles.errorText}>Task nicht gefunden</Text>
            </View>
        );
    }

    const insets = useSafeAreaInsets();

    return (
        <View style={styles.container}>
            <Stack.Screen
                options={{
                    presentation: 'formSheet',
                    headerTitle: 'Wiederholung',
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
                    headerShadowVisible: false, // Optional: removes the hairline border if desired for cleaner look
                } as any}
            />

            <View style={styles.sheet}>
                <ScrollView
                    style={styles.content}
                    contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
                    showsVerticalScrollIndicator={false}
                >
                    {ROUTINE_OPTIONS.map((option) => {
                        const isActive = selectedType === option.value;
                        const isNone = option.value === null;

                        return (
                            <Pressable
                                key={option.label}
                                onPress={() => setSelectedType(option.value)}
                                style={[styles.optionRow, isActive && styles.optionRowActive]}
                            >
                                <View style={[styles.optionIcon, { backgroundColor: withAlpha(isNone ? Colors[theme].text : '#0A84FF', isDark ? 0.15 : 0.12) }]}>
                                    <MaterialIcons name={option.icon} size={20} color={isNone ? withAlpha(Colors[theme].text, 0.6) : '#0A84FF'} />
                                </View>
                                <View style={styles.optionBody}>
                                    <Text style={styles.optionLabel}>{option.label}</Text>
                                </View>
                                {isActive && <MaterialIcons name="check" size={20} color="#0A84FF" />}
                            </Pressable>
                        );
                    })}
                </ScrollView>
            </View>
        </View>
    );
}

const createStyles = (theme: ThemeName) => {
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
            // Header is natively handled, so no top radius needed if native sheet
            // but if we want the glass effect to fill the sheet:
            // borderTopLeftRadius: 0,
            // borderTopRightRadius: 0,
            // overflow: 'hidden',
        },
        // Header styles removed
        doneText: {
            fontSize: 17,
            fontWeight: '600',
            color: '#0A84FF',
        },
        cancelText: {
            fontSize: 17,
            color: '#0A84FF',
        },
        content: {
            flex: 1,
            padding: 16,
            backgroundColor: isDark ? '#000000' : '#F2F2F7',
        },
        errorText: {
            fontSize: 16,
            color: text,
            textAlign: 'center',
            marginTop: 40,
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
            borderColor: withAlpha('#0A84FF', 0.45),
            backgroundColor: withAlpha('#0A84FF', isDark ? 0.18 : 0.12),
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
    });
};
