import {
  ACCENT_COLORS,
  type AccentColorId,
  APP_BADGE_MODES,
  type AppBadgeMode,
  APPEARANCE_MODES,
  type AppearanceMode,
  DEFAULT_APP_BADGE_MODE,
  DEFAULT_DAILY_SUMMARY_MINUTES,
  useAppSettings,
} from "@/context/settings-store";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import React from "react";
import {
  Alert,
  Button,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  View,
  type ViewStyle,
} from "react-native";

import { getPremiumPlanLabel } from "@/constants/premium";
import { Colors } from "@/constants/theme";
import {
  TAG_ORDER,
  type TagId,
  useHomeFilters,
} from "@/context/home-filters-store";
import { usePremium } from "@/context/premium-store";
import {
  type Project,
  type SectionId,
  type Task,
  useTasksStore,
} from "@/context/tasks-store";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  type CloudSyncAccountStatus,
  type CloudSyncStatus,
  getCloudSyncStatus,
  setNativeCloudSyncEnabled,
  subscribeToCloudSyncStatus,
  syncCloudNow,
} from "@/services/cloud-sync";
import { deriveActiveSectionFromDueAt } from "@/utils/task-dates";

type ThemeName = keyof typeof Colors;

const APPEARANCE_LABELS = ["Adaptive", "Always light", "Always dark"] as const;

const APP_BADGE_LABELS: Record<AppBadgeMode, string> = {
  dueToday: "Due Today",
  overdueOnly: "Overdue Only",
  allOpenTasks: "All Open Tasks",
  completedToday: "Completed Today",
  hidden: "Hidden",
};

const SHOW_APPLE_IMPORT_SECTION = false;

type BackupSchemaVersion = 1;

type AppBackupPayload = {
  schemaVersion: BackupSchemaVersion;
  app: "reminds";
  exportedAt: string;
  tasks: Task[];
  projects: Project[];
  appSettings: {
    appearanceMode: AppearanceMode;
    accentColor: AccentColorId;
    hapticsEnabled: boolean;
    reduceMotionEnabled: boolean;
    appBadgeMode: AppBadgeMode;
    dailySummaryEnabled: boolean;
    dailySummaryMinutes: number;
    cloudSyncEnabled: boolean;
  };
  homeFilters: {
    enabledTags: TagId[];
    showTagIcons: boolean;
    showCompactSubtasks: boolean;
  };
  persistedValues: Record<string, string>;
};

const BACKUP_SCHEMA_VERSION: BackupSchemaVersion = 1;

const BACKUP_PERSISTED_KEYS = [
  "reminds.settings.v1",
  "reminds.homeFilters.tags",
  "reminds.homeFilters.tagIcons",
  "reminds.homeFilters.compactSubtasks",
  "reminds.tasks.onboardingSeeded.v1",
  "reminds.home.onboarding.gestures.v1",
  "reminds.home.onboarding.dragDropTargets.v1",
  "@reminds/assist_messages",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAppearanceMode(value: unknown): value is AppearanceMode {
  return (
    value === "adaptive" || value === "alwaysLight" || value === "alwaysDark"
  );
}

function isAccentColorId(value: unknown): value is AccentColorId {
  return ACCENT_COLORS.some((entry) => entry.id === value);
}

function isAppBadgeMode(value: unknown): value is AppBadgeMode {
  return APP_BADGE_MODES.some((mode) => mode === value);
}

function normalizeDailySummaryMinutes(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_DAILY_SUMMARY_MINUTES;
  }
  const rounded = Math.round(value);
  return ((rounded % 1440) + 1440) % 1440;
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

function formatStatusDateTime(value: number | null): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function getCloudSyncAccountMessage(
  accountStatus: CloudSyncAccountStatus,
): string {
  switch (accountStatus) {
    case "available":
      return "Aufgaben und Projekte werden über iCloud zwischen deinen Apple-Geraeten abgeglichen.";
    case "noAccount":
      return "Bitte melde dich in den iOS Einstellungen mit einer Apple-ID bei iCloud an.";
    case "restricted":
      return "iCloud ist auf diesem Geraet aktuell eingeschraenkt.";
    case "couldNotDetermine":
      return "Der iCloud-Status konnte gerade nicht bestimmt werden.";
    case "temporarilyUnavailable":
      return "iCloud ist gerade nicht erreichbar. Der Sync versucht es spaeter erneut.";
    default:
      return "Der iCloud-Status ist aktuell unbekannt.";
  }
}

function sanitizeTagIds(value: unknown): TagId[] {
  if (!Array.isArray(value)) return [];
  const available = new Set<TagId>(TAG_ORDER);
  const seen = new Set<TagId>();
  const result: TagId[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    if (!available.has(entry as TagId)) continue;
    if (seen.has(entry as TagId)) continue;
    seen.add(entry as TagId);
    result.push(entry as TagId);
  }
  return result;
}

async function readPersistedValues(
  keys: readonly string[],
): Promise<Record<string, string>> {
  if (Platform.OS === "web") {
    if (typeof localStorage === "undefined") return {};
    const result: Record<string, string> = {};
    for (const key of keys) {
      const value = localStorage.getItem(key);
      if (value != null) result[key] = value;
    }
    return result;
  }

  const entries = await AsyncStorage.multiGet([...keys]);
  const result: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (value != null) result[key] = value;
  }
  return result;
}

async function applyPersistedValues(
  keys: readonly string[],
  values: Record<string, string>,
): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof localStorage === "undefined") return;
    for (const key of keys) {
      const next = values[key];
      if (typeof next === "string") localStorage.setItem(key, next);
      else localStorage.removeItem(key);
    }
    return;
  }

  const setEntries: [string, string][] = [];
  const removeKeys: string[] = [];
  for (const key of keys) {
    const next = values[key];
    if (typeof next === "string") setEntries.push([key, next]);
    else removeKeys.push(key);
  }
  if (setEntries.length > 0) {
    await AsyncStorage.multiSet(setEntries);
  }
  if (removeKeys.length > 0) {
    await AsyncStorage.multiRemove(removeKeys);
  }
}

async function saveJsonBackupWithShare(
  payload: AppBackupPayload,
): Promise<void> {
  const fileName = `reminds-backup-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.json`;
  const json = JSON.stringify(payload, null, 2);

  if (Platform.OS === "web") {
    if (typeof document === "undefined") {
      throw new Error("Datei-Export ist auf dieser Plattform nicht verfügbar.");
    }
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  if (!baseDir) {
    throw new Error("Kein lokaler Speicher für den Export verfügbar.");
  }

  const normalizedBaseDir = baseDir.endsWith("/") ? baseDir : `${baseDir}/`;
  const fileUri = `${normalizedBaseDir}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, json, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  await Share.share({
    url: fileUri,
    title: "Reminds Sicherung",
    message: "Reminds Datensicherung (JSON)",
  });
}

async function pickBackupJsonText(): Promise<string | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "text/json", "*/*"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled) return null;
  const asset = picked.assets?.[0];
  if (!asset) return null;

  const maybeFile = asset as typeof asset & {
    file?: { text?: () => Promise<string> };
  };
  if (maybeFile.file?.text) {
    return maybeFile.file.text();
  }

  try {
    return await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch {
    const response = await fetch(asset.uri);
    return response.text();
  }
}

function parseBackupPayload(rawJson: string): AppBackupPayload {
  const parsed: unknown = JSON.parse(rawJson);
  if (!isRecord(parsed)) {
    throw new Error("Ungültige Sicherungsdatei.");
  }

  const schemaVersion = parsed.schemaVersion;
  if (schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error("Nicht unterstützte Sicherungsversion.");
  }

  const tasks = Array.isArray(parsed.tasks) ? (parsed.tasks as Task[]) : [];
  const projects = Array.isArray(parsed.projects)
    ? (parsed.projects as Project[])
    : [];
  const appSettings = isRecord(parsed.appSettings) ? parsed.appSettings : {};
  const homeFilters = isRecord(parsed.homeFilters) ? parsed.homeFilters : {};
  const persistedValues = isRecord(parsed.persistedValues)
    ? parsed.persistedValues
    : {};

  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    app: "reminds",
    exportedAt:
      typeof parsed.exportedAt === "string"
        ? parsed.exportedAt
        : new Date().toISOString(),
    tasks,
    projects,
    appSettings: {
      appearanceMode: isAppearanceMode(appSettings.appearanceMode)
        ? appSettings.appearanceMode
        : "adaptive",
      accentColor: isAccentColorId(appSettings.accentColor)
        ? appSettings.accentColor
        : "blue",
      hapticsEnabled:
        typeof appSettings.hapticsEnabled === "boolean"
          ? appSettings.hapticsEnabled
          : true,
      reduceMotionEnabled:
        typeof appSettings.reduceMotionEnabled === "boolean"
          ? appSettings.reduceMotionEnabled
          : false,
      appBadgeMode: isAppBadgeMode(appSettings.appBadgeMode)
        ? appSettings.appBadgeMode
        : DEFAULT_APP_BADGE_MODE,
      dailySummaryEnabled:
        typeof appSettings.dailySummaryEnabled === "boolean"
          ? appSettings.dailySummaryEnabled
          : false,
      dailySummaryMinutes: normalizeDailySummaryMinutes(
        appSettings.dailySummaryMinutes,
      ),
      cloudSyncEnabled:
        typeof appSettings.cloudSyncEnabled === "boolean"
          ? appSettings.cloudSyncEnabled
          : false,
    },
    homeFilters: {
      enabledTags: sanitizeTagIds(homeFilters.enabledTags),
      showTagIcons:
        typeof homeFilters.showTagIcons === "boolean"
          ? homeFilters.showTagIcons
          : true,
      showCompactSubtasks:
        typeof homeFilters.showCompactSubtasks === "boolean"
          ? homeFilters.showCompactSubtasks
          : false,
    },
    persistedValues: Object.entries(persistedValues).reduce<
      Record<string, string>
    >((acc, [key, value]) => {
      if (typeof value === "string") acc[key] = value;
      return acc;
    }, {}),
  };
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
    enabledTags,
    setEnabledTags,
    showTagIcons,
    setShowTagIcons,
    showCompactSubtasks,
    setShowCompactSubtasks,
  } = useHomeFilters();
  const {
    accentColor,
    appearanceMode,
    hapticsEnabled,
    reduceMotionEnabled,
    appBadgeMode,
    dailySummaryEnabled,
    dailySummaryMinutes,
    cloudSyncEnabled,
    setAccentColor,
    setAppearanceMode,
    setHapticsEnabled,
    setReduceMotionEnabled,
    setAppBadgeMode,
    setDailySummaryEnabled,
    setDailySummaryMinutes,
    setCloudSyncEnabled,
  } = useAppSettings();

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

  const [isExportingBackup, setIsExportingBackup] = React.useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = React.useState(false);
  const [isImportingAppleData, setIsImportingAppleData] = React.useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] =
    React.useState<CloudSyncStatus | null>(null);
  const [isCloudSyncBusy, setIsCloudSyncBusy] = React.useState(false);
  const { hasPremiumAccess, isReady: isPremiumReady, plan } = usePremium();
  const effectiveCloudSyncEnabled =
    Platform.OS === "ios" && cloudSyncEnabled && hasPremiumAccess;

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

  const refreshCloudSyncStatus = React.useCallback(async () => {
    if (Platform.OS !== "ios") return;
    const status = await getCloudSyncStatus();
    setCloudSyncStatus(status);
  }, []);

  React.useEffect(() => {
    if (Platform.OS !== "ios") return;
    void refreshCloudSyncStatus();
    const subscription = subscribeToCloudSyncStatus((status) => {
      setCloudSyncStatus(status);
    });

    return () => {
      subscription?.remove();
    };
  }, [refreshCloudSyncStatus]);

  const onToggleCloudSync = React.useCallback(
    async (enabled: boolean) => {
      if (Platform.OS !== "ios") return;
      if (enabled && !hasPremiumAccess) {
        Alert.alert(
          "Reminders+ erforderlich",
          "Cloud Sync ist Teil von Reminders+ und wird erst nach der Freischaltung aktiviert.",
        );
        router.push("/plus?source=sync");
        return;
      }

      setIsCloudSyncBusy(true);
      try {
        const status = await setNativeCloudSyncEnabled(enabled);
        setCloudSyncEnabled(enabled);
        setCloudSyncStatus(status);

        if (enabled && status.accountStatus !== "available") {
          Alert.alert(
            "iCloud erforderlich",
            getCloudSyncAccountMessage(status.accountStatus),
          );
        } else if (enabled && status.lastError) {
          Alert.alert("Cloud Sync", status.lastError);
        }
      } catch (error) {
        Alert.alert("Cloud Sync fehlgeschlagen", toErrorMessage(error));
        await refreshCloudSyncStatus();
      } finally {
        setIsCloudSyncBusy(false);
      }
    },
    [hasPremiumAccess, refreshCloudSyncStatus, router, setCloudSyncEnabled],
  );

  const onCloudSyncNow = React.useCallback(async () => {
    if (Platform.OS !== "ios") return;
    if (!hasPremiumAccess) {
      Alert.alert(
        "Reminders+ erforderlich",
        "Cloud Sync ist Teil von Reminders+ und steht nach der Freischaltung bereit.",
      );
      router.push("/plus?source=sync");
      return;
    }
    if (!cloudSyncEnabled) {
      await onToggleCloudSync(true);
      return;
    }

    setIsCloudSyncBusy(true);
    try {
      const result = await syncCloudNow();
      setCloudSyncStatus(result);

      if (result.accountStatus !== "available") {
        Alert.alert(
          "iCloud erforderlich",
          getCloudSyncAccountMessage(result.accountStatus),
        );
        return;
      }

      if (result.lastError) {
        Alert.alert("Cloud Sync", result.lastError);
        return;
      }

      const summary = result.didPullRemote
        ? "Die neuesten Aenderungen wurden aus iCloud geladen."
        : result.didPushLocal
          ? "Deine lokalen Aenderungen wurden nach iCloud geladen."
          : "Alle Geraete sind bereits auf dem aktuellen Stand.";
      Alert.alert("Synchronisierung abgeschlossen", summary);
    } catch (error) {
      Alert.alert("Synchronisierung fehlgeschlagen", toErrorMessage(error));
      await refreshCloudSyncStatus();
    } finally {
      setIsCloudSyncBusy(false);
    }
  }, [
    cloudSyncEnabled,
    hasPremiumAccess,
    onToggleCloudSync,
    refreshCloudSyncStatus,
    router,
  ]);

  const cloudSyncStatusText = React.useMemo(() => {
    if (Platform.OS !== "ios") {
      return "Cloud Sync ist nur auf iPhone und iPad verfuegbar.";
    }

    if (!hasPremiumAccess) {
      return cloudSyncEnabled
        ? "Cloud Sync ist vorgemerkt, bleibt aber ohne Reminders+ pausiert."
        : "Cloud Sync teilt Aufgaben und Projekte zwischen deinen Apple-Geraeten und ist Teil von Reminders+.";
    }

    if (!cloudSyncEnabled) {
      return "Nach dem Einschalten werden Aufgaben und Projekte bei App-Start, Rueckkehr in die App und im Hintergrund synchronisiert.";
    }

    const lastSync = formatStatusDateTime(cloudSyncStatus?.lastSyncAt ?? null);
    const accountMessage = getCloudSyncAccountMessage(
      cloudSyncStatus?.accountStatus ?? "unknown",
    );

    if (cloudSyncStatus?.lastError) {
      return `${accountMessage} Letzter Fehler: ${cloudSyncStatus.lastError}`;
    }

    if (lastSync) {
      return `${accountMessage} Letzter erfolgreicher Sync: ${lastSync}.`;
    }

    return accountMessage;
  }, [cloudSyncEnabled, cloudSyncStatus, hasPremiumAccess]);

  const onExportBackup = React.useCallback(async () => {
    if (isExportingBackup || isRestoringBackup || isImportingAppleData) return;
    setIsExportingBackup(true);
    try {
      const persistedValues = await readPersistedValues(BACKUP_PERSISTED_KEYS);
      const payload: AppBackupPayload = {
        schemaVersion: BACKUP_SCHEMA_VERSION,
        app: "reminds",
        exportedAt: new Date().toISOString(),
        tasks,
        projects,
        appSettings: {
          appearanceMode,
          accentColor,
          hapticsEnabled,
          reduceMotionEnabled,
          appBadgeMode,
          dailySummaryEnabled,
          dailySummaryMinutes,
          cloudSyncEnabled,
        },
        homeFilters: {
          enabledTags: TAG_ORDER.filter((tagId) => enabledTags.has(tagId)),
          showTagIcons,
          showCompactSubtasks,
        },
        persistedValues,
      };

      await saveJsonBackupWithShare(payload);
      Alert.alert("Export abgeschlossen", "Die JSON-Sicherung wurde erstellt.");
    } catch (error) {
      Alert.alert("Export fehlgeschlagen", toErrorMessage(error));
    } finally {
      setIsExportingBackup(false);
    }
  }, [
    accentColor,
    appBadgeMode,
    appearanceMode,
    dailySummaryEnabled,
    dailySummaryMinutes,
    cloudSyncEnabled,
    enabledTags,
    hapticsEnabled,
    isExportingBackup,
    isImportingAppleData,
    isRestoringBackup,
    projects,
    reduceMotionEnabled,
    showCompactSubtasks,
    showTagIcons,
    tasks,
  ]);

  const onRestoreBackup = React.useCallback(async () => {
    if (isExportingBackup || isRestoringBackup || isImportingAppleData) return;
    setIsRestoringBackup(true);
    try {
      const rawJson = await pickBackupJsonText();
      if (!rawJson) return;

      const backup = parseBackupPayload(rawJson);
      await applyPersistedValues(BACKUP_PERSISTED_KEYS, backup.persistedValues);

      setProjects(Array.isArray(backup.projects) ? backup.projects : []);
      setTasks(Array.isArray(backup.tasks) ? backup.tasks : []);

      setAppearanceMode(backup.appSettings.appearanceMode);
      setAccentColor(backup.appSettings.accentColor);
      setHapticsEnabled(backup.appSettings.hapticsEnabled);
      setReduceMotionEnabled(backup.appSettings.reduceMotionEnabled);
      setAppBadgeMode(backup.appSettings.appBadgeMode);
      setDailySummaryEnabled(backup.appSettings.dailySummaryEnabled);
      setDailySummaryMinutes(backup.appSettings.dailySummaryMinutes);
      setCloudSyncEnabled(backup.appSettings.cloudSyncEnabled);

      const nextEnabledTags = new Set<TagId>(backup.homeFilters.enabledTags);
      setEnabledTags(() => nextEnabledTags);
      setShowTagIcons(backup.homeFilters.showTagIcons);
      setShowCompactSubtasks(backup.homeFilters.showCompactSubtasks);

      Alert.alert(
        "Wiederherstellung abgeschlossen",
        "Die Sicherung wurde eingelesen und angewendet.",
      );
    } catch (error) {
      Alert.alert("Wiederherstellung fehlgeschlagen", toErrorMessage(error));
    } finally {
      setIsRestoringBackup(false);
    }
  }, [
    isExportingBackup,
    isImportingAppleData,
    isRestoringBackup,
    setAccentColor,
    setAppBadgeMode,
    setCloudSyncEnabled,
    setAppearanceMode,
    setDailySummaryEnabled,
    setDailySummaryMinutes,
    setEnabledTags,
    setHapticsEnabled,
    setProjects,
    setReduceMotionEnabled,
    setShowCompactSubtasks,
    setShowTagIcons,
    setTasks,
  ]);

  const onImportAppleData = React.useCallback(async () => {
    if (isExportingBackup || isRestoringBackup || isImportingAppleData) return;
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
    isExportingBackup,
    isImportingAppleData,
    isRestoringBackup,
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
              {!isPremiumReady ? "Wird geprueft..." : getPremiumPlanLabel(plan)}
            </Text>
          </View>

          <View style={[styles.separator, { backgroundColor: borderColor }]} />

          <Text style={[styles.helperText, { color: muted }]}>
            AI-Assist, mehr als 4 Projekte und die Cloud-Sync-Freischaltung fuer
            Apple-Geraete.
          </Text>

          <View style={styles.buttonRow}>
            <Button
              title={
                hasPremiumAccess ? "Kaufoptionen anzeigen" : "Angebot oeffnen"
              }
              onPress={() => router.push("/plus")}
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

        {Platform.OS === "ios" ? (
          <Section title="Cloud Sync" cardStyle={sectionCardStyle}>
            <View style={styles.switchRow}>
              <View style={styles.switchLabelWrap}>
                <Text style={[styles.rowLabel, { color: Colors[theme].text }]}>
                  iCloud-Sync
                </Text>
                <Text style={[styles.helperInlineText, { color: muted }]}>
                  {effectiveCloudSyncEnabled ? "Aktiv" : "Aus"}
                </Text>
              </View>
              <Switch
                value={cloudSyncEnabled}
                onValueChange={onToggleCloudSync}
                disabled={isCloudSyncBusy}
                trackColor={{ false: "#7A7A7A", true: "#34C759" }}
              />
            </View>

            <View
              style={[styles.separator, { backgroundColor: borderColor }]}
            />

            <Text style={[styles.helperText, { color: muted }]}>
              {cloudSyncStatusText}
            </Text>

            <View style={styles.buttonRow}>
              <Button
                title={
                  isCloudSyncBusy
                    ? "Synchronisiere..."
                    : cloudSyncEnabled
                      ? "Jetzt synchronisieren"
                      : "Sync aktivieren & starten"
                }
                onPress={onCloudSyncNow}
                disabled={isCloudSyncBusy}
              />
            </View>
          </Section>
        ) : null}

        <Section title="Datensicherung" cardStyle={sectionCardStyle}>
          <View style={styles.buttonStack}>
            <Button
              title={
                isExportingBackup
                  ? "Exportiere Sicherung..."
                  : "Sichern & Exportieren"
              }
              onPress={onExportBackup}
              disabled={
                isExportingBackup || isRestoringBackup || isImportingAppleData
              }
            />
            <Button
              title={
                isRestoringBackup
                  ? "Stelle Sicherung wieder her..."
                  : "Aus Sicherung wiederherstellen"
              }
              onPress={onRestoreBackup}
              disabled={
                isExportingBackup || isRestoringBackup || isImportingAppleData
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
                disabled={
                  isExportingBackup || isRestoringBackup || isImportingAppleData
                }
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
