import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import React from "react";
import {
  Alert,
  Button,
  Platform,
  Share,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { type PremiumPlan } from "@/constants/premium";
import { Colors } from "@/constants/theme";
import {
  TAG_ORDER,
  type TagId,
  useHomeFilters,
} from "@/context/home-filters-store";
import { usePremium } from "@/context/premium-store";
import {
  ACCENT_COLORS,
  APP_BADGE_MODES,
  DEFAULT_APP_BADGE_MODE,
  DEFAULT_DAILY_SUMMARY_MINUTES,
  type AccentColorId,
  type AppBadgeMode,
  type AppearanceMode,
  useAppSettings,
} from "@/context/settings-store";
import { type Project, type Task, useTasksStore } from "@/context/tasks-store";
import {
  type CloudSyncAccountStatus,
  type CloudSyncStatus,
  getCloudSyncStatus,
  setNativeCloudSyncEnabled,
  subscribeToCloudSyncStatus,
  syncCloudNow,
} from "@/services/cloud-sync";

export type ThemeName = keyof typeof Colors;

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

  if (parsed.schemaVersion !== BACKUP_SCHEMA_VERSION) {
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

export type PremiumSyncBackupController = {
  hasPremiumAccess: boolean;
  isPremiumReady: boolean;
  plan: PremiumPlan;
  cloudSyncEnabled: boolean;
  effectiveCloudSyncEnabled: boolean;
  isCloudSyncBusy: boolean;
  cloudSyncStatusText: string;
  isExportingBackup: boolean;
  isRestoringBackup: boolean;
  backupStatusText: string;
  onToggleCloudSync: (enabled: boolean) => Promise<void>;
  onCloudSyncNow: () => Promise<void>;
  onExportBackup: () => Promise<void>;
  onRestoreBackup: () => Promise<void>;
};

export function usePremiumSyncBackupController(): PremiumSyncBackupController {
  const router = useRouter();
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
    appearanceMode,
    accentColor,
    hapticsEnabled,
    reduceMotionEnabled,
    appBadgeMode,
    dailySummaryEnabled,
    dailySummaryMinutes,
    cloudSyncEnabled,
    setCloudSyncEnabled,
    setAppearanceMode,
    setAccentColor,
    setHapticsEnabled,
    setReduceMotionEnabled,
    setAppBadgeMode,
    setDailySummaryEnabled,
    setDailySummaryMinutes,
  } = useAppSettings();
  const { hasPremiumAccess, isReady: isPremiumReady, plan } = usePremium();
  const [isExportingBackup, setIsExportingBackup] = React.useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = React.useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] =
    React.useState<CloudSyncStatus | null>(null);
  const [isCloudSyncBusy, setIsCloudSyncBusy] = React.useState(false);
  const effectiveCloudSyncEnabled =
    Platform.OS === "ios" && cloudSyncEnabled && hasPremiumAccess;

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

  const openPremiumOffer = React.useCallback(() => {
    router.push({ pathname: "/plus", params: { source: "sync" } });
  }, [router]);

  const onToggleCloudSync = React.useCallback(
    async (enabled: boolean) => {
      if (Platform.OS !== "ios") return;
      if (!hasPremiumAccess) {
        Alert.alert(
          "Reminders+ erforderlich",
          "Cloud Sync ist Teil von Reminders+ und wird erst nach der Freischaltung aktiviert.",
        );
        openPremiumOffer();
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
    [
      hasPremiumAccess,
      openPremiumOffer,
      refreshCloudSyncStatus,
      setCloudSyncEnabled,
    ],
  );

  const onCloudSyncNow = React.useCallback(async () => {
    if (Platform.OS !== "ios") return;
    if (!hasPremiumAccess) {
      Alert.alert(
        "Reminders+ erforderlich",
        "Cloud Sync ist Teil von Reminders+ und steht nach der Freischaltung bereit.",
      );
      openPremiumOffer();
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
    openPremiumOffer,
    refreshCloudSyncStatus,
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
    if (isExportingBackup || isRestoringBackup) return;
    if (!hasPremiumAccess) {
      Alert.alert(
        "Reminders+ erforderlich",
        "Datensicherung und Wiederherstellung werden mit Reminders+ freigeschaltet.",
      );
      openPremiumOffer();
      return;
    }

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
    cloudSyncEnabled,
    dailySummaryEnabled,
    dailySummaryMinutes,
    enabledTags,
    hasPremiumAccess,
    hapticsEnabled,
    isExportingBackup,
    isRestoringBackup,
    openPremiumOffer,
    projects,
    reduceMotionEnabled,
    showCompactSubtasks,
    showTagIcons,
    tasks,
  ]);

  const onRestoreBackup = React.useCallback(async () => {
    if (isExportingBackup || isRestoringBackup) return;
    if (!hasPremiumAccess) {
      Alert.alert(
        "Reminders+ erforderlich",
        "Datensicherung und Wiederherstellung werden mit Reminders+ freigeschaltet.",
      );
      openPremiumOffer();
      return;
    }

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
    hasPremiumAccess,
    isExportingBackup,
    isRestoringBackup,
    openPremiumOffer,
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

  const backupStatusText = React.useMemo(() => {
    if (!isPremiumReady) {
      return "Dein Plan wird gerade geprueft.";
    }
    if (!hasPremiumAccess) {
      return "Datensicherung und Wiederherstellung werden mit Reminders+ freigeschaltet.";
    }
    return "Exportiere eine JSON-Sicherung oder spiele einen vorhandenen Stand wieder ein.";
  }, [hasPremiumAccess, isPremiumReady]);

  return {
    hasPremiumAccess,
    isPremiumReady,
    plan,
    cloudSyncEnabled,
    effectiveCloudSyncEnabled,
    isCloudSyncBusy,
    cloudSyncStatusText,
    isExportingBackup,
    isRestoringBackup,
    backupStatusText,
    onToggleCloudSync,
    onCloudSyncNow,
    onExportBackup,
    onRestoreBackup,
  };
}

function DisabledWrap({
  disabled,
  children,
}: {
  disabled: boolean;
  children: React.ReactNode;
}) {
  return <View style={disabled ? styles.disabledBlock : undefined}>{children}</View>;
}

type PremiumBlockProps = {
  controller: PremiumSyncBackupController;
  theme: ThemeName;
  borderColor: string;
  muted: string;
  disabled?: boolean;
};

export function PremiumCloudSyncBlock({
  controller,
  theme,
  borderColor,
  muted,
  disabled = false,
}: PremiumBlockProps) {
  const blockDisabled = disabled || Platform.OS !== "ios";

  return (
    <DisabledWrap disabled={blockDisabled}>
      <View style={styles.switchRow}>
        <View style={styles.switchLabelWrap}>
          <Text style={[styles.rowLabel, { color: Colors[theme].text }]}>
            iCloud-Sync
          </Text>
          <Text style={[styles.helperInlineText, { color: muted }]}>
            {controller.effectiveCloudSyncEnabled ? "Aktiv" : "Aus"}
          </Text>
        </View>
        <Switch
          value={Platform.OS === "ios" ? controller.cloudSyncEnabled : false}
          onValueChange={controller.onToggleCloudSync}
          disabled={blockDisabled || controller.isCloudSyncBusy}
          trackColor={{ false: "#7A7A7A", true: "#34C759" }}
        />
      </View>

      <View style={[styles.separator, { backgroundColor: borderColor }]} />

      <Text style={[styles.helperText, { color: muted }]}>
        {controller.cloudSyncStatusText}
      </Text>

      <View style={styles.buttonRow}>
        <Button
          title={
            Platform.OS !== "ios"
              ? "Nur auf iPhone/iPad"
              : controller.isCloudSyncBusy
                ? "Synchronisiere..."
                : controller.cloudSyncEnabled
                  ? "Jetzt synchronisieren"
                  : "Sync aktivieren & starten"
          }
          onPress={controller.onCloudSyncNow}
          disabled={blockDisabled || controller.isCloudSyncBusy}
        />
      </View>
    </DisabledWrap>
  );
}

export function PremiumBackupBlock({
  controller,
  theme,
  muted,
  title,
  disabled = false,
}: Omit<PremiumBlockProps, "borderColor"> & { title?: string }) {
  const blockDisabled = disabled;

  return (
    <DisabledWrap disabled={blockDisabled}>
      {title ? (
        <View style={styles.rowBlock}>
          <Text style={[styles.rowLabel, { color: Colors[theme].text }]}>
            {title}
          </Text>
        </View>
      ) : null}

      <Text style={[styles.helperText, { color: muted }]}>
        {controller.backupStatusText}
      </Text>

      <View style={styles.buttonStack}>
        <Button
          title={
            controller.isExportingBackup
              ? "Exportiere Sicherung..."
              : "Sichern & Exportieren"
          }
          onPress={controller.onExportBackup}
          disabled={
            blockDisabled ||
            controller.isExportingBackup ||
            controller.isRestoringBackup
          }
        />
        <Button
          title={
            controller.isRestoringBackup
              ? "Stelle Sicherung wieder her..."
              : "Aus Sicherung wiederherstellen"
          }
          onPress={controller.onRestoreBackup}
          disabled={
            blockDisabled ||
            controller.isExportingBackup ||
            controller.isRestoringBackup
          }
        />
      </View>
    </DisabledWrap>
  );
}

const styles = StyleSheet.create({
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
  disabledBlock: {
    opacity: 0.48,
  },
});
