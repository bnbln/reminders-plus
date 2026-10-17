import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSheetHeaderActions } from "@/components/navigation/sheet-header-actions";
import { withAlpha } from "@/components/ui/glass-surface";
import { Colors, contrastAlpha, PICKER_SHEET_DARK_ROW, PICKER_SHEET_DARK_ROW_BORDER, TASK_SHEET_ACCENTS } from "@/constants/theme";
import {
  type RoutineInterval,
  RoutineType,
  useTasksStore,
} from "@/context/tasks-store";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { t } from "@/i18n";
import { ripple } from '@/components/ui/ripple';
import { useThemedStyles } from "@/hooks/use-themed-styles";

const ACCENT = TASK_SHEET_ACCENTS.routine;

type ThemeName = keyof typeof Colors;

const ROUTINE_OPTIONS: {
  value: RoutineType | null;
  labelKey: string;
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
}[] = [
  { value: null, labelKey: "routineOption.never", icon: "block" },
  { value: "hourly", labelKey: "taskDetail.routine.hourly", icon: "schedule" },
  { value: "daily", labelKey: "taskDetail.routine.daily", icon: "today" },
  { value: "weekdays", labelKey: "taskDetail.routine.weekdays", icon: "work" },
  { value: "weekends", labelKey: "taskDetail.routine.weekends", icon: "weekend" },
  { value: "weekly", labelKey: "taskDetail.routine.weekly", icon: "date-range" },
  { value: "biweekly", labelKey: "taskDetail.routine.biweekly", icon: "event-repeat" },
  { value: "monthly", labelKey: "taskDetail.routine.monthly", icon: "calendar-month" },
  { value: "quarterly", labelKey: "taskDetail.routine.quarterly", icon: "event-note" },
  { value: "biannually", labelKey: "taskDetail.routine.biannually", icon: "event-available" },
  { value: "yearly", labelKey: "taskDetail.routine.yearly", icon: "cake" },
  { value: "custom", labelKey: "taskDetail.routine.custom", icon: "tune" },
];

const toLegacyRoutineInterval = (
  type: RoutineType,
): RoutineInterval | undefined => {
  switch (type) {
    case "daily":
    case "weekly":
    case "monthly":
    case "yearly":
      return type;
    default:
      return undefined;
  }
};

export default function RoutinePickerScreen() {
  const router = useRouter();
  const { taskId: taskIdParam, draftId: draftIdParam } = useLocalSearchParams<{
    taskId?: string | string[];
    draftId?: string | string[];
  }>();
  const theme = useColorScheme() ?? "light";
  const isDark = theme === "dark";
  const styles = useThemedStyles(() => createStyles(theme), [theme]);

  const insets = useSafeAreaInsets();

  const { tasks, setTasks } = useTasksStore();
  const draftId = React.useMemo(() => {
    const normalizedDraftId = Array.isArray(draftIdParam) ? draftIdParam[0] : draftIdParam;
    return (typeof normalizedDraftId === "string" ? normalizedDraftId : "").trim();
  }, [draftIdParam]);
  const taskId = React.useMemo(() => {
    const normalizedTaskId = Array.isArray(taskIdParam) ? taskIdParam[0] : taskIdParam;

    const resolvedTaskId = (typeof normalizedTaskId === "string" ? normalizedTaskId : "").trim();
    if (resolvedTaskId.length > 0) return resolvedTaskId;
    return draftId;
  }, [draftId, taskIdParam]);
  const task = React.useMemo(
    () => tasks.find((t) => t.id === taskId),
    [tasks, taskId],
  );
  const canRecoverDraft = taskId.length > 0 && draftId.length > 0 && taskId === draftId;

  React.useEffect(() => {
    if (!canRecoverDraft || task) return;

    setTasks((prev) => {
      if (prev.some((t) => t.id === taskId)) return prev;
      return [
        {
          id: taskId,
          title: "",
          emoji: "📝",
          projectId: "",
          dueAt: 0,
          dueHasTime: false,
          isRoutine: true,
          routineType: undefined,
          routineInterval: undefined,
          section: "upcoming",
          orderRank: 0,
          deletedAt: Date.now(),
        },
        ...prev,
      ];
    });
  }, [canRecoverDraft, setTasks, task, taskId]);

  const selectedTypeFromTask = React.useMemo<RoutineType | null>(
    () =>
      task?.isRoutine ? (task.routineType ?? task.routineInterval ?? null) : null,
    [task],
  );
  const applyRoutineSelectionAndClose = React.useCallback((nextType: RoutineType | null) => {
    if (!taskId) return;

    if (nextType === null) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                isRoutine: false,
                routineType: undefined,
                routineInterval: undefined,
                routineWeekday: undefined,
                routineNthWeek: undefined,
                routineMonthDay: undefined,
                routineMonth: undefined,
              }
            : t,
        ),
      );
    } else {
      const legacyInterval = toLegacyRoutineInterval(nextType);
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                isRoutine: true,
                routineType: nextType,
                routineInterval: legacyInterval,
                routineWeekday:
                  nextType === "custom" ? t.routineWeekday : undefined,
                routineNthWeek:
                  nextType === "custom" ? t.routineNthWeek : undefined,
                routineMonthDay:
                  nextType === "custom" ? t.routineMonthDay : undefined,
                routineMonth:
                  nextType === "custom" ? t.routineMonth : undefined,
              }
            : t,
        ),
      );
    }
    router.back();
  }, [router, setTasks, taskId]);

  const handleCancel = React.useCallback(() => {
    router.back();
  }, [router]);
  const sheetHeaderActions = useSheetHeaderActions({ onClose: handleCancel });

  if (!task && canRecoverDraft) {
    return (
      <View style={[styles.container, styles.centeredState]}>
        <ActivityIndicator size="small" color={withAlpha(Colors[theme].text, contrastAlpha(0.6))} />
      </View>
    );
  }

  if (!task) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={
            {
              presentation: "formSheet",
              // sheetCornerRadius: 50,
              // contentStyle: { backgroundColor: 'transparent' },
              headerShown: true,
            } as any
          }
        />
        <Text style={styles.errorText}>{t('routinePicker.notFound')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={
          {
            presentation: "formSheet",
            headerTitle: t('routinePicker.title'),
            ...sheetHeaderActions,
            headerShown: true,
            headerStyle: {
              backgroundColor: isDark ? "#000000" : "#F2F2F7",
            },
            headerShadowVisible: false, // Optional: removes the hairline border if desired for cleaner look
          } as any
        }
      />

      <View style={styles.sheet}>
        <ScrollView
          style={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
        >
          {ROUTINE_OPTIONS.map((option) => {
            const isActive = selectedTypeFromTask === option.value;
            const isNone = option.value === null;

            return (
              <Pressable
                android_ripple={ripple()}
                key={option.labelKey}
                onPress={() => applyRoutineSelectionAndClose(option.value)}
                style={[styles.optionRow, isActive && styles.optionRowActive]}
              >
                <View
                  style={[
                    styles.optionIcon,
                    {
                      backgroundColor: withAlpha(
                        isNone ? Colors[theme].text : ACCENT,
                        isDark ? 0.15 : 0.12,
                      ),
                    },
                  ]}
                >
                  <MaterialIcons
                    name={option.icon}
                    size={20}
                    color={
                      isNone ? withAlpha(Colors[theme].text, contrastAlpha(0.6)) : ACCENT
                    }
                  />
                </View>
                <View style={styles.optionBody}>
                  <Text style={styles.optionLabel}>{t(option.labelKey)}</Text>
                </View>
                {isActive && (
                  <MaterialIcons name="check" size={20} color={ACCENT} />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const createStyles = (theme: ThemeName) => {
  const isDark = theme === "dark";
  const text = Colors[theme].text;
  const hairline = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)";

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? "#000000" : "#F2F2F7",
    },
    centeredState: {
      alignItems: "center",
      justifyContent: "center",
    },
    sheet: {
      flex: 1,
      backgroundColor: isDark ? "#000000" : "#F2F2F7",
      // Header is natively handled, so no top radius needed if native sheet
      // but if we want the glass effect to fill the sheet:
      // borderTopLeftRadius: 0,
      // borderTopRightRadius: 0,
      // overflow: 'hidden',
    },
    // Header styles removed
    doneText: {
      fontSize: 17,
      fontWeight: "600",
      color: ACCENT,
    },
    cancelText: {
      fontSize: 17,
      color: ACCENT,
    },
    content: {
      flex: 1,
      padding: 16,
      backgroundColor: isDark ? "#000000" : "#F2F2F7",
    },
    errorText: {
      fontSize: 16,
      color: text,
      textAlign: "center",
      marginTop: 40,
    },
    optionRow: {
      flexDirection: "row",
      alignItems: "center",
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
      alignItems: "center",
      justifyContent: "center",
    },
    optionBody: {
      flex: 1,
      gap: 2,
    },
    optionLabel: {
      fontSize: 16,
      fontWeight: "600",
      color: text,
    },
    iconButton: {
      width: 32,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
    },
    pressableIcon: {
      width: "100%",
      height: "100%",
      alignItems: "center",
      justifyContent: "center",
    },
  });
};
