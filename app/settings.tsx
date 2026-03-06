import {
  ACCENT_COLORS,
  APP_BADGE_MODES,
  type AppBadgeMode,
  APPEARANCE_MODES,
  useAppSettings,
} from "@/context/settings-store";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import {
  type MenuAction,
  type MenuComponentRef,
  MenuView,
} from "@react-native-menu/menu";
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import * as Calendar from "expo-calendar";
import { useRouter } from "expo-router";
import React from "react";
import {
  Alert,
  Button,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type ViewStyle,
} from "react-native";

import {
  PremiumBackupBlock,
  PremiumCloudSyncBlock,
  type ThemeName,
  usePremiumSyncBackupController,
} from "@/components/settings/premium-sync-backup";
import { getPremiumPlanLabel } from "@/constants/premium";
import { Colors } from "@/constants/theme";
import {
  type Project,
  type SectionId,
  useTasksStore,
} from "@/context/tasks-store";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { deriveActiveSectionFromDueAt } from "@/utils/task-dates";

const APPEARANCE_LABELS = ["Adaptive", "Always light", "Always dark"] as const;

const APP_BADGE_LABELS: Record<AppBadgeMode, string> = {
  dueToday: "Due Today",
  overdueOnly: "Overdue Only",
  allOpenTasks: "All Open Tasks",
  completedToday: "Completed Today",
  hidden: "Hidden",
};

const SHOW_APPLE_IMPORT_SECTION = false;

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
  return "Unbekannter Fehler";
}

function formatTime(value: Date) {
  return value.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Section({
  title,
  children,
  cardStyle,
}: {
  title: string;
  children: React.ReactNode;
  cardStyle?: ViewStyle;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={[styles.sectionCard, cardStyle]}>{children}</View>
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const theme = (useColorScheme() ?? "light") as ThemeName;
  const isDark = theme === "dark";
  const menuRef = React.useRef<MenuComponentRef>(null);
  const { tasks, setTasks, projects, setProjects } = useTasksStore();
  const {
    accentColor,
    appearanceMode,
    hapticsEnabled,
    reduceMotionEnabled,
    appBadgeMode,
    dailySummaryEnabled,
    dailySummaryMinutes,
    setAccentColor,
    setAppearanceMode,
    setHapticsEnabled,
    setReduceMotionEnabled,
    setAppBadgeMode,
    setDailySummaryEnabled,
    setDailySummaryMinutes,
  } = useAppSettings();
  const premiumController = usePremiumSyncBackupController();
  const remindersPlusDisabled =
    !premiumController.isPremiumReady || !premiumController.hasPremiumAccess;

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

  const borderColor = isDark ? "rgba(255,255,255,0.11)" : "rgba(17,24,28,0.09)";
  const cardBackground = isDark ? "#1C1C1E" : "#F2F2F7";
  const muted = isDark ? "rgba(236,237,238,0.67)" : "rgba(17,24,28,0.66)";
  const sectionCardStyle = React.useMemo(
    () => ({ borderColor, backgroundColor: cardBackground }),
    [borderColor, cardBackground],
  );

  const appBadgeActions = React.useMemo<MenuAction[]>(() => {
    return APP_BADGE_MODES.map((option) => ({
      id: option,
      title: APP_BADGE_LABELS[option],
      state:
        Platform.OS === "ios"
          ? appBadgeMode === option
            ? "on"
            : "off"
          : undefined,
    }));
  }, [appBadgeMode]);

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
        "Nicht verfügbar",
        "Apple Kalender/Erinnerungen sind nur auf iOS verfügbar.",
      );
      return;
    }

    setIsImportingAppleData(true);
    try {
      const calendarPermission =
        await Calendar.requestCalendarPermissionsAsync();
      if (calendarPermission.status !== "granted") {
        Alert.alert(
          "Keine Berechtigung",
          "Bitte erlaube den Zugriff auf Kalender in den iOS Einstellungen.",
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
              ? `Kalender · ${calendar.title}`
              : `Erinnerungen · ${calendar.title}`,
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
            title: "Kalender",
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
          title: event.title?.trim() || "Kalender-Eintrag",
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
            title: "Erinnerungen",
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
          title: reminder.title?.trim() || "Erinnerung",
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
        "Import abgeschlossen",
        `${createdCount} neue und ${updatedCount} bestehende Einträge wurden aus Apple Kalender/Erinnerungen übernommen.`,
      );
    } catch (error) {
      Alert.alert("Import fehlgeschlagen", toErrorMessage(error));
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

  return (
    <View style={{ flex: 1, backgroundColor: "transparent" }}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        alwaysBounceVertical
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Section title="Reminders+" cardStyle={sectionCardStyle}>
          <View style={styles.rowBlock}>
            <Text style={[styles.rowLabel, { color: Colors[theme].text }]}>
              Plan
            </Text>
            <Text style={[styles.rowValue, { color: Colors[theme].text }]}>
              {!premiumController.isPremiumReady
                ? "Wird geprueft..."
                : getPremiumPlanLabel(premiumController.plan)}
            </Text>
          </View>

          <View style={[styles.separator, { backgroundColor: borderColor }]} />

          <Text style={[styles.helperText, { color: muted }]}>
            AI-Assist, mehr als 4 Projekte und die Cloud-Sync-Freischaltung fuer
            Apple-Geraete.
          </Text>

          <View style={[styles.separator, { backgroundColor: borderColor }]} />

          <PremiumCloudSyncBlock
            controller={premiumController}
            theme={theme}
            borderColor={borderColor}
            muted={muted}
            disabled={remindersPlusDisabled}
          />

          <View style={[styles.separator, { backgroundColor: borderColor }]} />

          <PremiumBackupBlock
            controller={premiumController}
            theme={theme}
            muted={muted}
            title="Datensicherung"
            disabled={remindersPlusDisabled}
          />

          <View style={[styles.separator, { backgroundColor: borderColor }]} />

          <View style={styles.buttonRow}>
            <Button
              title={
                premiumController.hasPremiumAccess
                  ? "Kaufoptionen anzeigen"
                  : "Angebot oeffnen"
              }
              onPress={() => {
                if (premiumController.hasPremiumAccess) {
                  router.push("/plus");
                  return;
                }

                router.push({ pathname: "/plus", params: { source: "sync" } });
              }}
            />
          </View>
        </Section>

        <Section title="Darstellung" cardStyle={sectionCardStyle}>
          <View style={styles.rowBlock}>
            <Text style={[styles.rowLabel, { color: Colors[theme].text }]}>
              Farbe
            </Text>
            <View style={styles.colorRow}>
              {ACCENT_COLORS.map((color) => {
                const selected = accentColor === color.id;
                return (
                  <Pressable
                    key={color.id}
                    accessibilityRole="button"
                    accessibilityLabel={color.label}
                    onPress={() => setAccentColor(color.id)}
                    style={[
                      styles.colorButton,
                      {
                        backgroundColor: color.value,
                        borderColor: selected
                          ? Colors[theme].text
                          : isDark
                            ? "rgba(255,255,255,0.24)"
                            : "rgba(17,24,28,0.18)",
                        borderWidth: selected ? 2 : 1,
                      },
                    ]}
                  >
                    {selected ? (
                      <MaterialIcons name="check" size={14} color="#fff" />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={[styles.separator, { backgroundColor: borderColor }]} />

          <View style={styles.rowBlock}>
            <Text style={[styles.rowLabel, { color: Colors[theme].text }]}>
              Farbmodus
            </Text>
            <SegmentedControl
              values={[...APPEARANCE_LABELS]}
              selectedIndex={APPEARANCE_MODES.indexOf(appearanceMode)}
              onChange={(event) =>
                onChangeAppearance(event.nativeEvent.selectedSegmentIndex)
              }
            />
          </View>
        </Section>

        {SHOW_APPLE_IMPORT_SECTION ? (
          <Section title="Import" cardStyle={sectionCardStyle}>
            <View style={styles.buttonRow}>
              <Button
                title={
                  isImportingAppleData
                    ? "Importiere Apple Daten..."
                    : "Apple Erinnerungen & Kalender importieren"
                }
                onPress={onImportAppleData}
                disabled={isImportingAppleData}
              />
            </View>
          </Section>
        ) : null}

        <Section title="Mitteilungen" cardStyle={sectionCardStyle}>
          <View style={styles.rowBlock}>
            <Text style={[styles.rowLabel, { color: Colors[theme].text }]}>
              App-Badge
            </Text>

            <MenuView
              ref={menuRef}
              actions={appBadgeActions}
              onPressAction={onPressBadgeAction}
              shouldOpenOnLongPress={false}
              themeVariant={Platform.OS === "ios" ? theme : undefined}
              isAnchoredToRight={Platform.OS === "android" ? true : undefined}
              style={styles.badgeMenuAnchor}
            >
              {Platform.OS === "android" ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="App-Badge auswählen"
                  onPress={() => menuRef.current?.show?.()}
                  style={styles.badgeMenuTrigger}
                >
                  <Text
                    style={[styles.badgeValue, { color: Colors[theme].text }]}
                  >
                    {APP_BADGE_LABELS[appBadgeMode]}
                  </Text>
                  <MaterialIcons
                    name="keyboard-arrow-down"
                    size={18}
                    color={muted}
                  />
                </Pressable>
              ) : (
                <View style={styles.badgeMenuTrigger}>
                  <Text
                    style={[styles.badgeValue, { color: Colors[theme].text }]}
                  >
                    {APP_BADGE_LABELS[appBadgeMode]}
                  </Text>
                  <MaterialIcons
                    name="keyboard-arrow-down"
                    size={18}
                    color={muted}
                  />
                </View>
              )}
            </MenuView>
          </View>

          <View style={[styles.separator, { backgroundColor: borderColor }]} />

          <View style={styles.switchRow}>
            <Text style={[styles.rowLabel, { color: Colors[theme].text }]}>
              Tägliche Zusammenfassung
            </Text>
            <Switch
              value={dailySummaryEnabled}
              onValueChange={(enabled) => {
                setDailySummaryEnabled(enabled);
                if (!enabled) setShowDailySummaryPicker(false);
              }}
              trackColor={{ false: "#7A7A7A", true: "#34C759" }}
            />
          </View>

          <View style={[styles.separator, { backgroundColor: borderColor }]} />

          <View style={styles.rowBlock}>
            <Text
              style={[
                styles.rowLabel,
                { color: dailySummaryEnabled ? Colors[theme].text : muted },
              ]}
            >
              Uhrzeit
            </Text>
            <Pressable
              disabled={!dailySummaryEnabled}
              onPress={() => setShowDailySummaryPicker((current) => !current)}
              style={styles.timeButton}
            >
              <Text
                style={[
                  styles.timeButtonText,
                  { color: dailySummaryEnabled ? Colors[theme].text : muted },
                ]}
              >
                {formatTime(dailySummaryTime)}
              </Text>
              <MaterialIcons
                name={
                  showDailySummaryPicker
                    ? "keyboard-arrow-up"
                    : "keyboard-arrow-down"
                }
                size={18}
                color={dailySummaryEnabled ? muted : `${muted}80`}
              />
            </Pressable>
          </View>

          {showDailySummaryPicker && dailySummaryEnabled ? (
            <View style={styles.timePickerWrap}>
              <DateTimePicker
                mode="time"
                value={dailySummaryTime}
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={onChangeSummaryTime}
              />
            </View>
          ) : null}
        </Section>

        <Section title="Interaktionen" cardStyle={sectionCardStyle}>
          <View style={styles.switchRow}>
            <Text style={[styles.rowLabel, { color: Colors[theme].text }]}>
              Haptik aktivieren
            </Text>
            <Switch
              value={hapticsEnabled}
              onValueChange={setHapticsEnabled}
              trackColor={{ false: "#7A7A7A", true: "#34C759" }}
            />
          </View>

          <View style={[styles.separator, { backgroundColor: borderColor }]} />

          <View style={styles.switchRow}>
            <Text style={[styles.rowLabel, { color: Colors[theme].text }]}>
              Bewegung reduzieren
            </Text>
            <Switch
              value={reduceMotionEnabled}
              onValueChange={setReduceMotionEnabled}
              trackColor={{ false: "#7A7A7A", true: "#34C759" }}
            />
          </View>
        </Section>

        {/* <View
        style={[
          styles.footerNote,
          {
            borderColor,
            backgroundColor: cardBackground,
          },
        ]}
      >
        <Text style={[styles.footerText, { color: muted }]}>
          Datensicherung ist aktiv. Cloud-Sync und Apple-Import sind aktuell ausgeblendet.
        </Text>
        </View> */}
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
    paddingBottom: 34,
    gap: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
    color: "#6B7280",
    paddingHorizontal: 2,
  },
  sectionCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  rowBlock: {
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  switchLabelWrap: {
    flexShrink: 1,
    gap: 2,
    paddingRight: 12,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: "500",
  },
  helperInlineText: {
    fontSize: 12,
    lineHeight: 16,
  },
  rowValue: {
    fontSize: 15,
    fontWeight: "700",
  },
  helperText: {
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 14,
  },
  buttonRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonStack: {
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
  },
  colorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  colorButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeMenuAnchor: {
    alignSelf: "flex-start",
  },
  badgeMenuTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(122,122,122,0.45)",
  },
  badgeValue: {
    fontSize: 14,
    fontWeight: "500",
  },
  timeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
  },
  timeButtonText: {
    fontSize: 15,
    fontWeight: "500",
  },
  timePickerWrap: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  footerNote: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  footerText: {
    fontSize: 12,
    lineHeight: 17,
  },
});
