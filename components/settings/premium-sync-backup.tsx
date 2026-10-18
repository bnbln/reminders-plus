import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import React from "react";
import {
  Alert,
  Platform,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { type PremiumPlan } from "@/constants/premium";
import { SettingsIcon } from "@/components/settings/settings-rows";
import { SettingsButton } from "@/components/ui/settings-button";
import { SettingsSwitch } from "@/components/ui/settings-switch";
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
import {
  type CompletionHistory,
  type Project,
  type Task,
  useTasksStore,
} from "@/context/tasks-store";
import {
  type CloudSyncAccountStatus,
  type CloudSyncStatus,
  getCloudSyncStatus,
  setNativeCloudSyncEnabled,
  subscribeToCloudSyncStatus,
  syncCloudNow,
} from "@/services/cloud-sync";
import { t } from "@/i18n";

export type ThemeName = keyof typeof Colors;

type BackupSchemaVersion = 1;

type AppBackupPayload = {
  schemaVersion: BackupSchemaVersion;
  app: "reminds";
  exportedAt: string;
  tasks: Task[];
  projects: Project[];
  /** Completions per day, exported for completeness; restore does not read it. */
  completionHistory?: CompletionHistory;
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
    showProjectNames: boolean;
    showCompactSubtasks: boolean;
    // Optional: backups written before these filters existed lack them.
    showCompletedTasks?: boolean;
    showProjectTasks?: boolean;
    showRoutineTasks?: boolean;
  };
  persistedValues: Record<string, string>;
};

const BACKUP_SCHEMA_VERSION: BackupSchemaVersion = 1;

const BACKUP_PERSISTED_KEYS = [
  "reminds.settings.v1",
  "reminds.homeFilters.tags",
  "reminds.homeFilters.tagIcons",
  "reminds.homeFilters.projectNames",
  "reminds.homeFilters.compactSubtasks",
  "reminds.tasks.onboardingSeeded.v1",
  "reminds.home.onboarding.gestures.v1",
  "reminds.home.onboarding.dragDropTargets.v1",
  "@reminds/assist_messages",
] as const;

function isBackupTask(value: unknown): value is Task {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.section === "string"
  );
}

function isBackupProject(value: unknown): value is Project {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string"
  );
}

function confirmBackupRestore(taskCount: number, projectCount: number) {
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      t("backup.alert.restoreConfirmTitle"),
      t("backup.alert.restoreConfirmBody", {
        tasks: taskCount,
        projects: projectCount,
      }),
      [
        { text: t("common.cancel"), style: "cancel", onPress: () => resolve(false) },
        {
          text: t("backup.alert.restoreConfirmAction"),
          style: "destructive",
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
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
  return t("common.unknownError");
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
      return t("cloudSync.account.available");
    case "noAccount":
      return t("cloudSync.account.noAccount");
    case "restricted":
      return t("cloudSync.account.restricted");
    case "couldNotDetermine":
      return t("cloudSync.account.couldNotDetermine");
    case "temporarilyUnavailable":
      return t("cloudSync.account.temporarilyUnavailable");
    default:
      return t("cloudSync.account.unknown");
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
      throw new Error(t("backup.error.exportUnavailable"));
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
    throw new Error(t("backup.error.noLocalStorage"));
  }

  const normalizedBaseDir = baseDir.endsWith("/") ? baseDir : `${baseDir}/`;
  const fileUri = `${normalizedBaseDir}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, json, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  await Share.share({
    url: fileUri,
    title: t("backup.share.title"),
    message: t("backup.share.message"),
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
    throw new Error(t("backup.error.invalidFile"));
  }

  if (parsed.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error(t("backup.error.unsupportedVersion"));
  }

  if (!Array.isArray(parsed.tasks) || !Array.isArray(parsed.projects)) {
    throw new Error(t("backup.error.invalidFile"));
  }
  // Drop entries that cannot be rendered instead of writing them into the store.
  const tasks = parsed.tasks.filter(isBackupTask);
  const projects = parsed.projects.filter(isBackupProject);
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
      showProjectNames:
        typeof homeFilters.showProjectNames === "boolean"
          ? homeFilters.showProjectNames
          : false,
      showCompactSubtasks:
        typeof homeFilters.showCompactSubtasks === "boolean"
          ? homeFilters.showCompactSubtasks
          : false,
      showCompletedTasks: optionalBoolean(homeFilters.showCompletedTasks),
      showProjectTasks: optionalBoolean(homeFilters.showProjectTasks),
      showRoutineTasks: optionalBoolean(homeFilters.showRoutineTasks),
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
  /** False until tasks are loaded from disk; exporting earlier would be empty. */
  isBackupDataReady: boolean;
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
  const {
    tasks,
    setTasks,
    projects,
    setProjects,
    completionHistory,
    hasHydrated: isBackupDataReady,
  } = useTasksStore();
  const {
    enabledTags,
    setEnabledTags,
    showTagIcons,
    setShowTagIcons,
    showProjectNames,
    setShowProjectNames,
    showCompactSubtasks,
    setShowCompactSubtasks,
    showCompletedTasks,
    setShowCompletedTasks,
    showProjectTasks,
    setShowProjectTasks,
    showRoutineTasks,
    setShowRoutineTasks,
  } = useHomeFilters();
  const {
    appearanceMode,
    accentColor,
    hapticsEnabled,
    appBadgeMode,
    dailySummaryEnabled,
    dailySummaryMinutes,
    cloudSyncEnabled,
    setCloudSyncEnabled,
    setAppearanceMode,
    setAccentColor,
    setHapticsEnabled,
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
          t("cloudSync.alert.premiumRequiredTitle"),
          t("cloudSync.alert.premiumRequiredEnableBody"),
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
            t("cloudSync.alert.icloudRequiredTitle"),
            getCloudSyncAccountMessage(status.accountStatus),
          );
        } else if (enabled && status.lastError) {
          Alert.alert(t("screen.cloudSync"), status.lastError);
        }
      } catch (error) {
        Alert.alert(t("cloudSync.alert.failedTitle"), toErrorMessage(error));
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
        t("cloudSync.alert.premiumRequiredTitle"),
        t("cloudSync.alert.premiumRequiredNowBody"),
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
          t("cloudSync.alert.icloudRequiredTitle"),
          getCloudSyncAccountMessage(result.accountStatus),
        );
        return;
      }

      if (result.lastError) {
        Alert.alert(t("screen.cloudSync"), result.lastError);
        return;
      }

      const summary = result.didPullRemote
        ? t("cloudSync.syncSummary.pulled")
        : result.didPushLocal
          ? t("cloudSync.syncSummary.pushed")
          : t("cloudSync.syncSummary.upToDate");
      Alert.alert(t("cloudSync.alert.syncDoneTitle"), summary);
    } catch (error) {
      Alert.alert(t("cloudSync.alert.syncFailedTitle"), toErrorMessage(error));
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
      return t("cloudSync.status.onlyMobileApple");
    }

    if (!hasPremiumAccess) {
      return cloudSyncEnabled
        ? t("cloudSync.status.queuedWithoutPremium")
        : t("cloudSync.status.premiumRequired");
    }

    if (!cloudSyncEnabled) {
      return t("cloudSync.status.enableHint");
    }

    const lastSync = formatStatusDateTime(cloudSyncStatus?.lastSyncAt ?? null);
    const accountMessage = getCloudSyncAccountMessage(
      cloudSyncStatus?.accountStatus ?? "unknown",
    );

    if (cloudSyncStatus?.lastError) {
      return t("cloudSync.status.lastError", {
        account: accountMessage,
        error: cloudSyncStatus.lastError,
      });
    }

    if (lastSync) {
      return t("cloudSync.status.lastSuccess", {
        account: accountMessage,
        time: lastSync,
      });
    }

    return accountMessage;
  }, [cloudSyncEnabled, cloudSyncStatus, hasPremiumAccess]);

  // Export is free for everyone: users must always be able to take their own
  // data out of the app. Only restoring a backup (and Cloud Sync) needs Plus.
  const onExportBackup = React.useCallback(async () => {
    if (isExportingBackup || isRestoringBackup || !isBackupDataReady) return;

    setIsExportingBackup(true);
    try {
      const persistedValues = await readPersistedValues(BACKUP_PERSISTED_KEYS);
      const payload: AppBackupPayload = {
        schemaVersion: BACKUP_SCHEMA_VERSION,
        app: "reminds",
        exportedAt: new Date().toISOString(),
        tasks: tasks.filter((task) => !task.isDraft),
        projects,
        completionHistory,
        appSettings: {
          appearanceMode,
          accentColor,
          hapticsEnabled,
          // Kept for the backup format only: Reduce Motion now follows the OS
          // setting alone and the stored value is ignored.
          reduceMotionEnabled: false,
          appBadgeMode,
          dailySummaryEnabled,
          dailySummaryMinutes,
          cloudSyncEnabled,
        },
        homeFilters: {
          enabledTags: TAG_ORDER.filter((tagId) => enabledTags.has(tagId)),
          showTagIcons,
          showProjectNames,
          showCompactSubtasks,
          showCompletedTasks,
          showProjectTasks,
          showRoutineTasks,
        },
        persistedValues,
      };

      await saveJsonBackupWithShare(payload);
      Alert.alert(t("backup.alert.exportDoneTitle"), t("backup.alert.exportDoneBody"));
    } catch (error) {
      Alert.alert(t("backup.alert.exportFailedTitle"), toErrorMessage(error));
    } finally {
      setIsExportingBackup(false);
    }
  }, [
    accentColor,
    appBadgeMode,
    appearanceMode,
    cloudSyncEnabled,
    completionHistory,
    dailySummaryEnabled,
    dailySummaryMinutes,
    enabledTags,
    hapticsEnabled,
    isBackupDataReady,
    isExportingBackup,
    isRestoringBackup,
    projects,
    showCompactSubtasks,
    showCompletedTasks,
    showProjectNames,
    showProjectTasks,
    showRoutineTasks,
    showTagIcons,
    tasks,
  ]);

  const onRestoreBackup = React.useCallback(async () => {
    if (isExportingBackup || isRestoringBackup) return;
    if (!hasPremiumAccess) {
      Alert.alert(
        t("backup.alert.premiumRequiredTitle"),
        t("backup.alert.premiumRequiredBody"),
      );
      openPremiumOffer();
      return;
    }

    setIsRestoringBackup(true);
    try {
      const rawJson = await pickBackupJsonText();
      if (!rawJson) return;

      const backup = parseBackupPayload(rawJson);
      const confirmed = await confirmBackupRestore(
        backup.tasks.length,
        backup.projects.length,
      );
      if (!confirmed) return;

      await applyPersistedValues(BACKUP_PERSISTED_KEYS, backup.persistedValues);

      setProjects(Array.isArray(backup.projects) ? backup.projects : []);
      setTasks(Array.isArray(backup.tasks) ? backup.tasks : []);

      setAppearanceMode(backup.appSettings.appearanceMode);
      setAccentColor(backup.appSettings.accentColor);
      setHapticsEnabled(backup.appSettings.hapticsEnabled);
      setAppBadgeMode(backup.appSettings.appBadgeMode);
      setDailySummaryEnabled(backup.appSettings.dailySummaryEnabled);
      setDailySummaryMinutes(backup.appSettings.dailySummaryMinutes);
      setCloudSyncEnabled(backup.appSettings.cloudSyncEnabled);

      const nextEnabledTags = new Set<TagId>(backup.homeFilters.enabledTags);
      setEnabledTags(() => nextEnabledTags);
      setShowTagIcons(backup.homeFilters.showTagIcons);
      setShowProjectNames(backup.homeFilters.showProjectNames);
      setShowCompactSubtasks(backup.homeFilters.showCompactSubtasks);
      const { showCompletedTasks, showProjectTasks, showRoutineTasks } =
        backup.homeFilters;
      if (showCompletedTasks !== undefined) setShowCompletedTasks(showCompletedTasks);
      if (showProjectTasks !== undefined) setShowProjectTasks(showProjectTasks);
      if (showRoutineTasks !== undefined) setShowRoutineTasks(showRoutineTasks);

      Alert.alert(
        t("backup.alert.restoreDoneTitle"),
        t("backup.alert.restoreDoneBody"),
      );
    } catch (error) {
      Alert.alert(t("backup.alert.restoreFailedTitle"), toErrorMessage(error));
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
    setShowCompactSubtasks,
    setShowCompletedTasks,
    setShowProjectNames,
    setShowProjectTasks,
    setShowRoutineTasks,
    setShowTagIcons,
    setTasks,
  ]);

  const backupStatusText = React.useMemo(() => {
    if (!isPremiumReady) {
      return t("common.planChecking");
    }
    if (!hasPremiumAccess) {
      return t("backup.status.premiumRequired");
    }
    return t("backup.status.ready");
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
    isBackupDataReady,
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
  muted: string;
  disabled?: boolean;
};

export function PremiumCloudSyncBlock({
  controller,
  theme,
  muted,
  disabled = false,
}: PremiumBlockProps) {
  const blockDisabled = disabled || Platform.OS !== "ios";

  return (
    <DisabledWrap disabled={blockDisabled}>
      <View style={styles.switchRow}>
        <SettingsIcon name="icloud.fill" color="#0A84FF" />
        <View style={styles.switchLabelWrap}>
          <Text style={[styles.rowLabel, { color: Colors[theme].text }]}>
            {t("cloudSync.toggle.label")}
          </Text>
          <Text style={[styles.helperInlineText, { color: muted }]}>
            {controller.effectiveCloudSyncEnabled ? t("common.active") : t("common.off")}
          </Text>
        </View>
        <SettingsSwitch
          value={Platform.OS === "ios" ? controller.cloudSyncEnabled : false}
          onValueChange={controller.onToggleCloudSync}
          disabled={blockDisabled || controller.isCloudSyncBusy}
        />
      </View>

      <Text style={[styles.helperText, { color: muted }]}>
        {controller.cloudSyncStatusText}
      </Text>

      <View style={styles.buttonRow}>
        <SettingsButton
          title={
            Platform.OS !== "ios"
              ? t("cloudSync.action.onlyMobileApple")
              : controller.isCloudSyncBusy
                ? t("cloudSync.action.syncing")
                : controller.cloudSyncEnabled
                  ? t("cloudSync.action.syncNow")
                  : t("cloudSync.action.enableAndStart")
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
}: PremiumBlockProps & { title?: string }) {
  const blockDisabled = disabled;

  return (
    <DisabledWrap disabled={blockDisabled}>
      {title ? (
        <View style={styles.titleRow}>
          <SettingsIcon name="externaldrive.fill" color="#34C759" />
          <Text style={[styles.rowLabel, { color: Colors[theme].text }]}>
            {title}
          </Text>
        </View>
      ) : null}

      <Text
        style={[
          styles.helperText,
          title ? null : styles.helperTextFlush,
          { color: muted },
        ]}
      >
        {controller.backupStatusText}
      </Text>

      <View style={[styles.buttonStack, title ? null : styles.buttonsFlush]}>
        <SettingsButton
          title={
            controller.isExportingBackup
              ? t("backup.action.exporting")
              : t("backup.action.export")
          }
          onPress={controller.onExportBackup}
          disabled={
            blockDisabled ||
            controller.isExportingBackup ||
            controller.isRestoringBackup
          }
        />
        <SettingsButton
          title={
            controller.isRestoringBackup
              ? t("backup.action.restoring")
              : t("backup.action.restore")
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

// Lines up helper text and buttons with the row label next to the icon.
const CONTENT_INSET = 16 + 30 + 14;

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 58,
    paddingHorizontal: 16,
    paddingTop: 13,
    paddingBottom: 6,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 58,
    paddingHorizontal: 16,
    paddingTop: 13,
    paddingBottom: 6,
  },
  switchLabelWrap: {
    flex: 1,
    gap: 3,
    paddingRight: 12,
  },
  rowLabel: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "500",
  },
  helperInlineText: {
    fontSize: 13,
    lineHeight: 17,
  },
  helperText: {
    fontSize: 13,
    lineHeight: 19,
    paddingLeft: CONTENT_INSET,
    paddingRight: 16,
  },
  buttonRow: {
    alignItems: "flex-start",
    paddingLeft: CONTENT_INSET - (Platform.OS === "ios" ? 8 : 0),
    paddingRight: 16,
    paddingTop: 6,
    paddingBottom: 12,
  },
  buttonStack: {
    alignItems: "flex-start",
    gap: Platform.OS === "ios" ? 0 : 10,
    paddingLeft: CONTENT_INSET - (Platform.OS === "ios" ? 8 : 0),
    paddingRight: 16,
    paddingTop: 6,
    paddingBottom: 12,
  },
  // Without a title row there's no icon to line up with.
  helperTextFlush: {
    paddingLeft: 16,
    paddingTop: 14,
  },
  buttonsFlush: {
    paddingLeft: Platform.OS === "ios" ? 8 : 16,
  },
  disabledBlock: {
    opacity: 0.48,
  },
});
