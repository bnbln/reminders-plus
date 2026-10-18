import { usePageColumnPadding } from "@/components/navigation/page-column";
import {
  ACCENT_COLORS,
  type AccentColorId,
  APP_BADGE_MODES,
  type AppBadgeMode,
  APPEARANCE_MODES,
  getAccentColorValue,
  IS_MATERIAL_YOU_SUPPORTED,
  MATERIAL_YOU_ACCENT_ID,
  useAppSettings,
} from "@/context/settings-store";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import {
  type MenuAction,
  type MenuComponentRef,
} from "@react-native-menu/menu";
import { SegmentedControl } from "@/components/ui/segmented-control";
import * as Calendar from "expo-calendar/legacy";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import React from "react";
import { useReducedMotion } from "react-native-reanimated";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { PlusHeroCard } from "@/components/settings/plus-hero-card";
import {
  SettingsRow,
  SettingsSection,
  SettingsSeparator,
  SettingsValuePill,
  useSettingsPalette,
} from "@/components/settings/settings-rows";
import {
  PremiumBackupBlock,
  PremiumCloudSyncBlock,
  type ThemeName,
  usePremiumSyncBackupController,
} from "@/components/settings/premium-sync-backup";
import {
  type Project,
  type SectionId,
  useTasksStore,
} from "@/context/tasks-store";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { type AppLocale, t } from "@/i18n";
import { IS_CLOUD_SYNC_SUPPORTED } from "@/utils/assist-availability";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { SettingsButton } from "@/components/ui/settings-button";
import { SettingsSwitch } from "@/components/ui/settings-switch";
import { supportsAlternateAppIconsAsync } from "@/modules/app-icon";
import { syncAppIconToAccent } from "@/utils/app-icon";
import { useStreakCelebration } from "@/context/streak-celebration-store";
import { localizeExistingOnboardingSeedData } from "@/storage/tasks-onboarding-seed";
import { deriveActiveSectionFromDueAt } from "@/utils/task-dates";
import { ripple } from "@/components/ui/ripple";

const APPEARANCE_LABEL_KEYS = [
  "settings.appearance.option.adaptive",
  "settings.appearance.option.alwaysLight",
  "settings.appearance.option.alwaysDark",
] as const;

const APP_BADGE_LABEL_KEYS: Record<AppBadgeMode, string> = {
  dueToday: "settings.badge.mode.dueToday",
  overdueOnly: "settings.badge.mode.overdueOnly",
  allOpenTasks: "settings.badge.mode.allOpenTasks",
  completedToday: "settings.badge.mode.completedToday",
  hidden: "settings.badge.mode.hidden",
};

const SHOW_APPLE_IMPORT_SECTION = false;

const DEV_LANGUAGE_OPTIONS: readonly {
  id: "system" | AppLocale;
  locale: AppLocale | null;
  label: string;
}[] = [
  { id: "system", locale: null, label: "System" },
  { id: "de", locale: "de", label: "Deutsch" },
  { id: "en", locale: "en", label: "English" },
  { id: "es", locale: "es", label: "Español" },
  { id: "fr", locale: "fr", label: "Français" },
  { id: "pt", locale: "pt", label: "Português" },
  { id: "hi", locale: "hi", label: "हिन्दी" },
  { id: "zh", locale: "zh", label: "中文" },
  { id: "ja", locale: "ja", label: "日本語" },
  { id: "it", locale: "it", label: "Italiano" },
  { id: "sv", locale: "sv", label: "Svenska" },
  { id: "da", locale: "da", label: "Dansk" },
  { id: "fi", locale: "fi", label: "Suomi" },
  { id: "pl", locale: "pl", label: "Polski" },
  { id: "nl", locale: "nl", label: "Nederlands" },
  { id: "tr", locale: "tr", label: "Türkçe" },
  { id: "cs", locale: "cs", label: "Čeština" },
  { id: "hu", locale: "hu", label: "Magyar" },
  { id: "ro", locale: "ro", label: "Română" },
  { id: "el", locale: "el", label: "Ελληνικά" },
  { id: "id", locale: "id", label: "Bahasa Indonesia" },
  { id: "vi", locale: "vi", label: "Tiếng Việt" },
  { id: "ko", locale: "ko", label: "한국어" },
  { id: "uk", locale: "uk", label: "Українська" },
  { id: "ru", locale: "ru", label: "Русский" },
  { id: "ar", locale: "ar", label: "العربية" },
] as const;

function isAppBadgeMode(value: unknown): value is AppBadgeMode {
  return APP_BADGE_MODES.some((mode) => mode === value);
}

function normalizeHexColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  const fullHexMatch = withHash.match(/^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/);
  if (fullHexMatch) return `#${fullHexMatch[1]!.toUpperCase()}`;
  const fallbackHexMatch = withHash.match(/([0-9a-fA-F]{6})/);
  if (!fallbackHexMatch) return undefined;
  return `#${fallbackHexMatch[1]!.toUpperCase()}`;
}

function parseDateToTimestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = new Date(value).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  if (value instanceof Date) {
    const parsed = value.getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return t("common.unknownError");
}

function formatTime(value: Date) {
  return value.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SettingsScreen() {
  const pageColumnPadding = usePageColumnPadding();
  const headerHeight = useHeaderHeight();
  const router = useRouter();
  const theme = (useColorScheme() ?? "light") as ThemeName;
  const isDark = theme === "dark";
  const menuRef = React.useRef<MenuComponentRef>(null);
  const devLanguageMenuRef = React.useRef<MenuComponentRef>(null);
  const { tasks, setTasks, projects, setProjects } = useTasksStore();
  const {
    accentColor,
    appIconFollowsAccent,
    appearanceMode,
    hapticsEnabled,
    streakCelebrationEnabled,
    localeOverride,
    appBadgeMode,
    dailySummaryEnabled,
    dailySummaryMinutes,
    fakeStatsEnabled,
    setAccentColor,
    setAppIconFollowsAccent,
    setAppearanceMode,
    setHapticsEnabled,
    setStreakCelebrationEnabled,
    setLocaleOverride,
    setAppBadgeMode,
    setDailySummaryEnabled,
    setDailySummaryMinutes,
    setFakeStatsEnabled,
  } = useAppSettings();
  const { playPreview: playStreakCelebrationPreview } = useStreakCelebration();
  const premiumController = usePremiumSyncBackupController();
  const remindersPlusDisabled =
    !premiumController.isPremiumReady || !premiumController.hasPremiumAccess;

  const isMaterialYouSelected = accentColor === MATERIAL_YOU_ACCENT_ID;
  const materialYouAccentValue = React.useMemo(
    () =>
      IS_MATERIAL_YOU_SUPPORTED
        ? getAccentColorValue(MATERIAL_YOU_ACCENT_ID)
        : undefined,
    // `isDark` isn't read directly, but the Material You scheme depends on
    // the resolved theme the same way `theme` below does — recompute together.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isDark],
  );

  const [supportsAlternateIcons, setSupportsAlternateIcons] =
    React.useState(false);
  React.useEffect(() => {
    let mounted = true;
    void supportsAlternateAppIconsAsync().then((supported) => {
      if (mounted) setSupportsAlternateIcons(supported);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const onSelectAccentColor = React.useCallback(
    (nextAccent: AccentColorId) => {
      setAccentColor(nextAccent);
      if (appIconFollowsAccent) {
        syncAppIconToAccent(nextAccent).catch(() => undefined);
      }
    },
    [appIconFollowsAccent, setAccentColor],
  );

  const onToggleAppIconFollowsAccent = React.useCallback(
    (enabled: boolean) => {
      setAppIconFollowsAccent(enabled);
      syncAppIconToAccent(enabled ? accentColor : null).catch(() => {
        // Keep the switch honest when iOS refused the change.
        if (enabled) setAppIconFollowsAccent(false);
      });
    },
    [accentColor, setAppIconFollowsAccent],
  );

  const dailySummaryTime = React.useMemo(() => {
    const initial = new Date();
    initial.setHours(
      Math.floor(dailySummaryMinutes / 60),
      dailySummaryMinutes % 60,
      0,
      0,
    );
    return initial;
  }, [dailySummaryMinutes]);
  const [showDailySummaryPicker, setShowDailySummaryPicker] =
    React.useState(false);
  const [isImportingAppleData, setIsImportingAppleData] = React.useState(false);

  const palette = useSettingsPalette();
  const systemReduceMotion = useReducedMotion();

  const appBadgeActions = React.useMemo<MenuAction[]>(() => {
    return APP_BADGE_MODES.map((option) => ({
      id: option,
      title: t(APP_BADGE_LABEL_KEYS[option]),
      state:
        Platform.OS === "ios"
          ? appBadgeMode === option
            ? "on"
            : "off"
          : undefined,
    }));
  }, [appBadgeMode]);
  const appearanceLabels = React.useMemo(
    () => APPEARANCE_LABEL_KEYS.map((key) => t(key)),
    [],
  );
  const devLanguageActions = React.useMemo<MenuAction[]>(() => {
    return DEV_LANGUAGE_OPTIONS.map((option) => ({
      id: option.id,
      title: option.label,
      state:
        Platform.OS === "ios"
          ? localeOverride === option.locale
            ? "on"
            : "off"
          : undefined,
    }));
  }, [localeOverride]);
  const selectedDevLanguageLabel = React.useMemo(() => {
    return (
      DEV_LANGUAGE_OPTIONS.find((option) => option.locale === localeOverride)
        ?.label ?? "System"
    );
  }, [localeOverride]);

  const onPressBadgeAction = React.useCallback(
    ({ nativeEvent: { event } }: any) => {
      if (isAppBadgeMode(event)) {
        setAppBadgeMode(event);
      }
    },
    [setAppBadgeMode],
  );

  const onChangeAppearance = React.useCallback(
    (index: number) => {
      const next = APPEARANCE_MODES[index] ?? "adaptive";
      setAppearanceMode(next);
    },
    [setAppearanceMode],
  );

  const onPressDevLanguageAction = React.useCallback(
    ({ nativeEvent: { event } }: any) => {
      const nextOption =
        DEV_LANGUAGE_OPTIONS.find((option) => option.id === event) ?? null;
      if (!nextOption || localeOverride === nextOption.locale) return;

      setLocaleOverride(nextOption.locale);
      const localized = localizeExistingOnboardingSeedData(tasks, projects);
      if (localized.changed) {
        setProjects(localized.projects);
        setTasks(localized.tasks);
      }
    },
    [
      localeOverride,
      projects,
      setLocaleOverride,
      setProjects,
      setTasks,
      tasks,
    ],
  );

  const onChangeSummaryTime = React.useCallback(
    (event: DateTimePickerEvent, selectedDate?: Date) => {
      if (event.type === "dismissed") {
        if (Platform.OS !== "ios") setShowDailySummaryPicker(false);
        return;
      }

      if (selectedDate) {
        setDailySummaryMinutes(
          selectedDate.getHours() * 60 + selectedDate.getMinutes(),
        );
      }

      if (Platform.OS !== "ios") {
        setShowDailySummaryPicker(false);
      }
    },
    [setDailySummaryMinutes],
  );

  const onImportAppleData = React.useCallback(async () => {
    if (isImportingAppleData) return;
    if (Platform.OS !== "ios") {
      Alert.alert(
        t("settings.import.unavailableTitle"),
        t("settings.import.unavailableBody"),
      );
      return;
    }

    setIsImportingAppleData(true);
    try {
      const calendarPermission =
        await Calendar.requestCalendarPermissionsAsync();
      if (calendarPermission.status !== "granted") {
        Alert.alert(
          t("settings.import.permissionTitle"),
          t("settings.import.permissionBody"),
        );
        return;
      }

      const remindersPermission =
        await Calendar.requestRemindersPermissionsAsync();
      const remindersAllowed = remindersPermission.status === "granted";

      const eventCalendars = await Calendar.getCalendarsAsync(
        Calendar.EntityTypes.EVENT,
      );
      const reminderCalendars = remindersAllowed
        ? await Calendar.getCalendarsAsync(Calendar.EntityTypes.REMINDER)
        : [];

      const rangeStart = new Date();
      rangeStart.setMonth(rangeStart.getMonth() - 1);
      const rangeEnd = new Date();
      rangeEnd.setFullYear(rangeEnd.getFullYear() + 1);

      const [events, reminders] = await Promise.all([
        eventCalendars.length > 0
          ? Calendar.getEventsAsync(
              eventCalendars.map((calendar) => calendar.id),
              rangeStart,
              rangeEnd,
            )
          : Promise.resolve([]),
        remindersAllowed && reminderCalendars.length > 0
          ? Calendar.getRemindersAsync(
              reminderCalendars.map((calendar) => calendar.id),
              null,
              null,
              null,
            )
          : Promise.resolve([]),
      ]);

      const nextProjects = [...projects];
      const nextProjectsById = new Map(
        nextProjects.map((project) => [project.id, project] as const),
      );

      const ensureImportedProject = (
        calendar: Calendar.Calendar,
        source: "event" | "reminder",
      ): string => {
        const projectId = `apple-${source}-${calendar.id}`;
        const existing = nextProjectsById.get(projectId);
        const normalizedColor = normalizeHexColor(calendar.color);
        const nextProject: Project = {
          id: projectId,
          name:
            source === "event"
              ? t("settings.import.project.calendar", {
                  title: calendar.title,
                })
              : t("settings.import.project.reminders", {
                  title: calendar.title,
                }),
          color:
            normalizedColor ?? (source === "event" ? "#007AFF" : "#34C759"),
          emoji: source === "event" ? "📅" : "✅",
          icon: source === "event" ? "calendar" : "checkmark.circle",
          completed: false,
          deletedAt: undefined,
        };

        if (!existing) {
          nextProjects.push(nextProject);
          nextProjectsById.set(projectId, nextProject);
        } else {
          const merged: Project = {
            ...existing,
            ...nextProject,
            id: existing.id,
            description: existing.description,
          };
          const index = nextProjects.findIndex(
            (project) => project.id === projectId,
          );
          if (index >= 0) nextProjects[index] = merged;
          nextProjectsById.set(projectId, merged);
        }

        return projectId;
      };

      const nextTasksById = new Map(
        tasks.map((task) => [task.id, task] as const),
      );
      const maxRankBySection: Record<SectionId, number> = {
        today: 0,
        upcoming: 0,
        completed: 0,
      };

      for (const task of nextTasksById.values()) {
        const section = task.section;
        if (task.orderRank > maxRankBySection[section]) {
          maxRankBySection[section] = task.orderRank;
        }
      }

      const nextOrderRank = (section: SectionId) => {
        maxRankBySection[section] += 1000;
        return maxRankBySection[section];
      };

      let createdCount = 0;
      let updatedCount = 0;

      const upsertImportedTask = (
        importedTaskId: string,
        values: {
          title: string;
          subtitle?: string;
          notes?: string;
          location?: string;
          projectId: string;
          dueAt: number;
          dueHasTime: boolean;
          section: SectionId;
          completedAt?: number;
          emoji: string;
        },
      ) => {
        const existing = nextTasksById.get(importedTaskId);
        if (existing?.deletedAt) return;

        if (existing) {
          updatedCount += 1;
          nextTasksById.set(importedTaskId, {
            ...existing,
            title: values.title,
            subtitle: values.subtitle,
            notes: values.notes,
            location: values.location,
            projectId: values.projectId,
            dueAt: values.dueAt,
            dueHasTime: values.dueHasTime,
            section: values.section,
            completedAt: values.completedAt,
            emoji: values.emoji,
          });
          return;
        }

        createdCount += 1;
        nextTasksById.set(importedTaskId, {
          id: importedTaskId,
          title: values.title,
          subtitle: values.subtitle,
          emoji: values.emoji,
          projectId: values.projectId,
          dueAt: values.dueAt,
          dueHasTime: values.dueHasTime,
          completedAt: values.completedAt,
          location: values.location,
          notes: values.notes,
          subtasks: undefined,
          section: values.section,
          orderRank: nextOrderRank(values.section),
          color: undefined,
          deletedAt: undefined,
          isRoutine: undefined,
          routineType: undefined,
          routineInterval: undefined,
          routineWeekday: undefined,
          routineNthWeek: undefined,
          routineMonthDay: undefined,
          routineMonth: undefined,
        });
      };

      for (const event of events) {
        const startTimestamp = parseDateToTimestamp(event.startDate);
        if (startTimestamp <= 0) continue;

        const projectId = ensureImportedProject(
          eventCalendars.find((entry) => entry.id === event.calendarId) ?? {
            id: event.calendarId,
            title: t("settings.import.defaultCalendar"),
            color: "#007AFF",
            source: { id: "", name: "", type: "local" },
            allowsModifications: false,
            allowedAvailabilities: [],
          },
          "event",
        );

        const section = deriveActiveSectionFromDueAt(startTimestamp);
        const eventUniqueId = event.instanceId
          ? `${event.id}-${event.instanceId}`
          : event.id;
        const importedTaskId = `apple-event-${eventUniqueId}`;

        upsertImportedTask(importedTaskId, {
          title: event.title?.trim() || t("settings.import.defaultEvent"),
          subtitle: event.location?.trim() || undefined,
          notes: event.notes?.trim() || undefined,
          location: event.location?.trim() || undefined,
          projectId,
          dueAt: startTimestamp,
          dueHasTime: event.allDay ? false : true,
          section,
          completedAt: undefined,
          emoji: "📅",
        });
      }

      for (const reminder of reminders) {
        if (!reminder.id) continue;
        const calendarId = reminder.calendarId ?? "";
        const projectId = ensureImportedProject(
          reminderCalendars.find((entry) => entry.id === calendarId) ?? {
            id: calendarId || "default",
            title: t("settings.import.defaultReminderList"),
            color: "#34C759",
            source: { id: "", name: "", type: "local" },
            allowsModifications: false,
            allowedAvailabilities: [],
          },
          "reminder",
        );

        const dueTimestamp = parseDateToTimestamp(reminder.dueDate);
        const completionTimestamp = parseDateToTimestamp(
          reminder.completionDate,
        );
        const isCompleted = reminder.completed === true;
        const section: SectionId = isCompleted
          ? "completed"
          : dueTimestamp > 0
            ? deriveActiveSectionFromDueAt(dueTimestamp)
            : "upcoming";

        upsertImportedTask(`apple-reminder-${reminder.id}`, {
          title: reminder.title?.trim() || t("settings.import.defaultReminder"),
          subtitle: reminder.location?.trim() || undefined,
          notes: reminder.notes?.trim() || undefined,
          location: reminder.location?.trim() || undefined,
          projectId,
          dueAt: dueTimestamp,
          dueHasTime: dueTimestamp > 0 ? reminder.allDay !== true : false,
          section,
          completedAt: isCompleted
            ? completionTimestamp > 0
              ? completionTimestamp
              : Date.now()
            : undefined,
          emoji: "✅",
        });
      }

      setProjects(nextProjects);
      setTasks(Array.from(nextTasksById.values()));

      Alert.alert(
        t("settings.import.completedTitle"),
        t("settings.import.completedBody", {
          created: createdCount,
          updated: updatedCount,
        }),
      );
    } catch (error) {
      Alert.alert(t("settings.import.failedTitle"), toErrorMessage(error));
    } finally {
      setIsImportingAppleData(false);
    }
  }, [
    isImportingAppleData,
    projects,
    setProjects,
    setTasks,
    tasks,
  ]);

  const openPlus = React.useCallback(() => {
    if (premiumController.hasPremiumAccess) {
      router.push("/plus");
      return;
    }
    router.push({ pathname: "/plus", params: { source: "sync" } });
  }, [premiumController.hasPremiumAccess, router]);

  return (
    <View style={{ flex: 1, backgroundColor: "transparent" }}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          pageColumnPadding,
          // Header is transparent; iOS insets automatically, Android does not.
          Platform.OS === "android" ? { paddingTop: headerHeight } : null,
        ]}
        contentInsetAdjustmentBehavior="automatic"
        alwaysBounceVertical
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <PlusHeroCard
          isReady={premiumController.isPremiumReady}
          hasPremiumAccess={premiumController.hasPremiumAccess}
          plan={premiumController.plan}
          onPress={openPlus}
        />

        <SettingsSection title={t("settings.section.syncBackup")}>
          {/* Cloud Sync is CloudKit-only; hidden rather than shown disabled. */}
          {IS_CLOUD_SYNC_SUPPORTED ? (
            <>
              <PremiumCloudSyncBlock
                controller={premiumController}
                theme={theme}
                muted={palette.muted}
                disabled={remindersPlusDisabled}
              />
              <SettingsSeparator />
            </>
          ) : null}

          <PremiumBackupBlock
            controller={premiumController}
            theme={theme}
            muted={palette.muted}
            title={t("cloudSync.section.backup")}
            disabled={remindersPlusDisabled}
          />
        </SettingsSection>

        <SettingsSection
          title={t("settings.section.appearance")}
          footer={
            supportsAlternateIcons
              ? t("settings.appearance.appIconFollowsAccentHint")
              : undefined
          }
        >
          <SettingsRow
            icon="circle.lefthalf.filled"
            iconColor="#5856D6"
            label={t("settings.appearance.mode")}
          >
            <SegmentedControl
              values={appearanceLabels}
              selectedIndex={APPEARANCE_MODES.indexOf(appearanceMode)}
              onChange={(event) =>
                onChangeAppearance(event.nativeEvent.selectedSegmentIndex)
              }
            />
          </SettingsRow>

          <SettingsSeparator />

          <SettingsRow
            icon="paintpalette.fill"
            iconColor={getAccentColorValue(accentColor)}
            label={t("projectEdit.color")}
          >
            <View style={styles.colorRow}>
              {ACCENT_COLORS.map((color) => {
                const selected = accentColor === color.id;
                return (
                  <Pressable
                    android_ripple={ripple()}
                    key={color.id}
                    accessibilityRole="button"
                    accessibilityLabel={t(`taskCreate.color.${color.id}`)}
                    accessibilityState={{ selected }}
                    hitSlop={6}
                    onPress={() => onSelectAccentColor(color.id)}
                    style={[
                      styles.colorButton,
                      selected
                        ? { borderColor: color.value }
                        : styles.colorButtonIdle,
                    ]}
                  >
                    <View
                      style={[styles.colorDot, { backgroundColor: color.value }]}
                    >
                      {selected ? (
                        <MaterialIcons name="check" size={16} color="#fff" />
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
              {IS_MATERIAL_YOU_SUPPORTED ? (
                <Pressable
                  android_ripple={ripple()}
                  accessibilityRole="button"
                  accessibilityLabel={t("settings.appearance.materialYou")}
                  accessibilityState={{ selected: isMaterialYouSelected }}
                  hitSlop={6}
                  onPress={() => onSelectAccentColor(MATERIAL_YOU_ACCENT_ID)}
                  style={[
                    styles.colorButton,
                    isMaterialYouSelected && materialYouAccentValue
                      ? { borderColor: materialYouAccentValue }
                      : styles.colorButtonIdle,
                  ]}
                >
                  <View
                    style={[
                      styles.colorDot,
                      { backgroundColor: materialYouAccentValue },
                    ]}
                  >
                    <MaterialIcons
                      name={isMaterialYouSelected ? "check" : "auto-awesome"}
                      size={16}
                      color="#fff"
                    />
                  </View>
                </Pressable>
              ) : null}
            </View>
          </SettingsRow>

          {supportsAlternateIcons ? (
            <>
              <SettingsSeparator />
              <SettingsRow
                icon="square.grid.2x2.fill"
                iconColor="#007AFF"
                label={t("settings.appearance.appIconFollowsAccent")}
                trailing={
                  <SettingsSwitch
                    accessibilityLabel={t(
                      "settings.appearance.appIconFollowsAccent",
                    )}
                    value={appIconFollowsAccent}
                    onValueChange={onToggleAppIconFollowsAccent}
                  />
                }
              />
            </>
          ) : null}
        </SettingsSection>

        {SHOW_APPLE_IMPORT_SECTION ? (
          <SettingsSection title={t("settings.section.import")}>
            <View style={styles.buttonRow}>
              <SettingsButton
                title={
                  isImportingAppleData
                    ? t("settings.import.action.loading")
                    : t("settings.import.action.start")
                }
                onPress={onImportAppleData}
                disabled={isImportingAppleData}
              />
            </View>
          </SettingsSection>
        ) : null}

        <SettingsSection title={t("settings.section.notifications")}>
          <SettingsRow
            icon="app.badge.fill"
            iconColor="#FF3B30"
            label={t("settings.badge.title")}
            trailing={
              <DropdownMenu
                ref={menuRef}
                actions={appBadgeActions}
                onPressAction={onPressBadgeAction}
                shouldOpenOnLongPress={false}
                themeVariant={Platform.OS === "ios" ? theme : undefined}
                isAnchoredToRight
              >
                <SettingsValuePill
                  value={t(APP_BADGE_LABEL_KEYS[appBadgeMode])}
                />
              </DropdownMenu>
            }
          />

          <SettingsSeparator />

          <SettingsRow
            icon="sun.max.fill"
            iconColor="#FF9500"
            label={t("settings.notifications.dailySummary")}
            trailing={
              <SettingsSwitch
                accessibilityLabel={t("settings.notifications.dailySummary")}
                value={dailySummaryEnabled}
                onValueChange={(enabled) => {
                  setDailySummaryEnabled(enabled);
                  if (!enabled) setShowDailySummaryPicker(false);
                }}
              />
            }
          />

          {dailySummaryEnabled ? (
            <>
              <SettingsSeparator />
              <SettingsRow
                icon="clock.fill"
                iconColor="#5856D6"
                label={t("common.time")}
                accessibilityLabel={`${t("a11y.settings.dailySummaryTime")}: ${formatTime(dailySummaryTime)}`}
                accessibilityState={{ expanded: showDailySummaryPicker }}
                onPress={() => setShowDailySummaryPicker((current) => !current)}
                trailing={
                  <SettingsValuePill
                    value={formatTime(dailySummaryTime)}
                    active={showDailySummaryPicker}
                    activeColor={getAccentColorValue(accentColor)}
                  />
                }
              />
              {showDailySummaryPicker ? (
                <View style={styles.timePickerWrap}>
                  <DateTimePicker
                    mode="time"
                    value={dailySummaryTime}
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={onChangeSummaryTime}
                  />
                </View>
              ) : null}
            </>
          ) : null}
        </SettingsSection>

        <SettingsSection
          title={t("settings.section.interactions")}
          // No in-app switch for reduced motion: native transitions, sheets and
          // system controls only follow the OS setting, so an app-only switch
          // could never cover them all.
          footer={t("settings.interactions.reduceMotionSystemHint")}
        >
          <SettingsRow
            icon="iphone.radiowaves.left.and.right"
            iconColor="#FF2D55"
            label={t("settings.interactions.haptics")}
            trailing={
              <SettingsSwitch
                accessibilityLabel={t("settings.interactions.haptics")}
                value={hapticsEnabled}
                onValueChange={setHapticsEnabled}
              />
            }
          />

          <SettingsSeparator />

          <SettingsRow
            icon="flame.fill"
            iconColor="#FF7A1F"
            label={t("settings.interactions.streakCelebration")}
            hint={t("settings.interactions.streakCelebrationHint")}
            trailing={
              <SettingsSwitch
                accessibilityLabel={t("settings.interactions.streakCelebration")}
                value={streakCelebrationEnabled}
                onValueChange={setStreakCelebrationEnabled}
              />
            }
          />

          <SettingsSeparator />

          <SettingsRow
            icon="figure.walk.motion"
            iconColor="#30B0C7"
            label={t("settings.interactions.reduceMotion")}
            trailing={
              <Text style={[styles.trailingValue, { color: palette.muted }]}>
                {systemReduceMotion ? t("common.active") : t("common.off")}
              </Text>
            }
          />
        </SettingsSection>

        <SettingsSection title={t("settings.section.legal")}>
          <SettingsRow
            icon="doc.text.fill"
            iconColor="#8E8E93"
            label={t("settings.legal.open")}
            onPress={() => router.push("/legal" as never)}
            trailing={
              <MaterialIcons
                name="chevron-right"
                size={22}
                color={palette.muted}
              />
            }
          />
        </SettingsSection>

        {__DEV__ ? (
          <SettingsSection title="Developer">
            <SettingsRow
              icon="wrench.and.screwdriver.fill"
              iconColor="#8E8E93"
              label="App Language"
              trailing={
                <DropdownMenu
                  ref={devLanguageMenuRef}
                  actions={devLanguageActions}
                  onPressAction={onPressDevLanguageAction}
                  shouldOpenOnLongPress={false}
                  themeVariant={Platform.OS === "ios" ? theme : undefined}
                  isAnchoredToRight
                >
                  <SettingsValuePill value={selectedDevLanguageLabel} />
                </DropdownMenu>
              }
            />

            <SettingsSeparator />

            <SettingsRow
              icon="chart.bar.fill"
              iconColor="#8E8E93"
              label="Fake Stats (Screenshots)"
              hint="Uses simulated streak and status history for App Store screenshots."
              trailing={
                <SettingsSwitch
                  value={fakeStatsEnabled}
                  onValueChange={setFakeStatsEnabled}
                />
              }
            />

            <SettingsSeparator />

            <SettingsRow
              icon="flame.fill"
              iconColor="#8E8E93"
              label={t("settings.interactions.streakCelebrationPreview")}
              onPress={playStreakCelebrationPreview}
              trailing={
                <MaterialIcons
                  name="play-arrow"
                  size={22}
                  color={palette.muted}
                />
              }
            />
          </SettingsSection>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
    gap: 28,
  },
  buttonRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  colorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  // A ring around the dot marks the selected colour, like the system pickers.
  colorButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  colorButtonIdle: {
    borderColor: "transparent",
  },
  colorDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  trailingValue: {
    fontSize: 15,
  },
  timePickerWrap: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
});
