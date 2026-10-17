import {
  NativeEventEmitter,
  NativeModules,
  Platform,
  type EmitterSubscription,
} from "react-native";

export type CloudSyncAccountStatus =
  | "available"
  | "noAccount"
  | "restricted"
  | "couldNotDetermine"
  | "temporarilyUnavailable"
  | "unknown";

export type CloudSyncStatus = {
  isSupported: boolean;
  isEnabled: boolean;
  isSyncing: boolean;
  accountStatus: CloudSyncAccountStatus;
  lastSyncAt: number | null;
  lastPushAt: number | null;
  lastPullAt: number | null;
  lastKnownLocalSavedAt: number | null;
  lastKnownRemoteSavedAt: number | null;
  lastError: string | null;
  containerIdentifier: string | null;
};

export type CloudSyncResult = CloudSyncStatus & {
  didPullRemote: boolean;
  didPushLocal: boolean;
};

type NativeCloudSyncModule = {
  getStatus: () => Promise<CloudSyncStatus>;
  setEnabled: (enabled: boolean) => Promise<CloudSyncStatus>;
  syncNow: () => Promise<CloudSyncResult>;
};

const FALLBACK_STATUS: CloudSyncStatus = {
  isSupported: false,
  isEnabled: false,
  isSyncing: false,
  accountStatus: "unknown",
  lastSyncAt: null,
  lastPushAt: null,
  lastPullAt: null,
  lastKnownLocalSavedAt: null,
  lastKnownRemoteSavedAt: null,
  lastError: null,
  containerIdentifier: null,
};

const cloudSyncNativeModule: NativeCloudSyncModule | null =
  Platform.OS === "ios"
    ? ((NativeModules.CloudSyncBridge as NativeCloudSyncModule | undefined) ??
      null)
    : null;

const cloudSyncEmitter =
  cloudSyncNativeModule != null
    ? new NativeEventEmitter<{
        cloudSyncStatusChanged: [CloudSyncStatus];
        cloudSyncRemoteSnapshotApplied: [{ savedAt: number | null }];
      }>(NativeModules.CloudSyncBridge)
    : null;

export function isCloudSyncSupported() {
  return cloudSyncNativeModule != null;
}

export async function getCloudSyncStatus(): Promise<CloudSyncStatus> {
  if (!cloudSyncNativeModule) return FALLBACK_STATUS;
  try {
    return await cloudSyncNativeModule.getStatus();
  } catch {
    return FALLBACK_STATUS;
  }
}

export async function setNativeCloudSyncEnabled(
  enabled: boolean,
): Promise<CloudSyncStatus> {
  if (!cloudSyncNativeModule) return FALLBACK_STATUS;
  return cloudSyncNativeModule.setEnabled(enabled);
}

export async function syncCloudNow(): Promise<CloudSyncResult> {
  if (!cloudSyncNativeModule) {
    return {
      ...FALLBACK_STATUS,
      didPullRemote: false,
      didPushLocal: false,
    };
  }
  return cloudSyncNativeModule.syncNow();
}

export function subscribeToCloudSyncStatus(
  listener: (status: CloudSyncStatus) => void,
): EmitterSubscription | null {
  if (!cloudSyncEmitter) return null;
  return cloudSyncEmitter.addListener("cloudSyncStatusChanged", listener);
}

export function subscribeToCloudSyncRemoteApplies(
  listener: (payload: { savedAt: number | null }) => void,
): EmitterSubscription | null {
  if (!cloudSyncEmitter) return null;
  return cloudSyncEmitter.addListener(
    "cloudSyncRemoteSnapshotApplied",
    listener,
  );
}
