import { Platform } from 'react-native';

import { requireOptionalNativeModule } from 'expo-modules-core';

import { decryptEnvelopeToString, encryptStringToEnvelope, type EncryptedEnvelopeV1 } from './tasks-crypto';

const FILES = {
  data: 'reminds.tasks.v1.enc.json',
  tmp: 'reminds.tasks.v1.enc.tmp.json',
  bak: 'reminds.tasks.v1.enc.bak.json',
} as const;

async function getFileSystem() {
  try {
    // Prefer legacy API for now to avoid SDK 54 deprecation warnings and to keep using
    // readAsStringAsync/writeAsStringAsync/getInfoAsync.
    const FileSystemMod = await import('expo-file-system/legacy').catch(() => import('expo-file-system'));
    const candidates: any[] = [
      (FileSystemMod as any)?.default,
      (FileSystemMod as any)?.FileSystem,
      FileSystemMod,
    ].filter(Boolean);

    for (const candidate of candidates) {
      let baseDir: unknown = candidate?.documentDirectory ?? candidate?.cacheDirectory;

      // Some environments expose the functions but leave the directory constants unset.
      // In that case, try to read them from the underlying native module.
      if (typeof baseDir !== 'string') {
        const native: any =
          requireOptionalNativeModule('ExpoFileSystem') ?? requireOptionalNativeModule('ExponentFileSystem');

        const nativeDocumentDirectory: unknown =
          native?.documentDirectory ?? native?.documentDirectoryUri ?? native?.constants?.documentDirectory;
        const nativeCacheDirectory: unknown =
          native?.cacheDirectory ?? native?.cacheDirectoryUri ?? native?.constants?.cacheDirectory;

        if (typeof nativeDocumentDirectory === 'string') {
          candidate.documentDirectory = nativeDocumentDirectory;
          baseDir = nativeDocumentDirectory;
        } else if (typeof nativeCacheDirectory === 'string') {
          candidate.cacheDirectory = nativeCacheDirectory;
          baseDir = nativeCacheDirectory;
        }
      }
      const ok =
        typeof baseDir === 'string' &&
        typeof candidate?.readAsStringAsync === 'function' &&
        typeof candidate?.writeAsStringAsync === 'function' &&
        typeof candidate?.getInfoAsync === 'function' &&
        typeof candidate?.deleteAsync === 'function' &&
        (typeof candidate?.moveAsync === 'function' || typeof candidate?.copyAsync === 'function');

      if (ok) {
        if (__DEV__ && candidate?.documentDirectory == null && candidate?.cacheDirectory != null) {
          console.warn('[tasks-storage] documentDirectory null, falling back to cacheDirectory');
        }
        return candidate;
      }

      if (__DEV__) {
        const missing: string[] = [];
        if (typeof baseDir !== 'string') missing.push('documentDirectory|cacheDirectory');
        if (typeof candidate?.readAsStringAsync !== 'function') missing.push('readAsStringAsync');
        if (typeof candidate?.writeAsStringAsync !== 'function') missing.push('writeAsStringAsync');
        if (typeof candidate?.getInfoAsync !== 'function') missing.push('getInfoAsync');
        if (typeof candidate?.deleteAsync !== 'function') missing.push('deleteAsync');
        if (typeof candidate?.moveAsync !== 'function' && typeof candidate?.copyAsync !== 'function') missing.push('moveAsync|copyAsync');
        console.warn('[tasks-storage] FileSystem candidate missing:', missing.join(', '));
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function normalizeBaseDir(base: string) {
  return base.endsWith('/') ? base : `${base}/`;
}

function getUris(FileSystem: any) {
  const baseRaw = (FileSystem.documentDirectory ?? FileSystem.cacheDirectory) as string;
  const base = normalizeBaseDir(baseRaw);
  return {
    dataUri: `${base}${FILES.data}`,
    tmpUri: `${base}${FILES.tmp}`,
    bakUri: `${base}${FILES.bak}`,
  };
}

export type TasksSnapshotLoadResult =
  | { status: 'ok'; snapshot: any }
  | { status: 'missing' }
  | { status: 'unavailable' }
  | { status: 'error'; reason: string };

export async function loadEncryptedTasksSnapshot(): Promise<TasksSnapshotLoadResult> {
  // iOS-only for now; keep everything else non-fatal.
  if (Platform.OS !== 'ios') return { status: 'unavailable' };

  const FileSystem = await getFileSystem();
  if (!FileSystem) {
    if (__DEV__) console.warn('[tasks-storage] FileSystem unavailable');
    return { status: 'unavailable' };
  }

  const { dataUri } = getUris(FileSystem);

  try {
    const info = await FileSystem.getInfoAsync(dataUri);
    if (!info.exists) {
      if (__DEV__) console.log('[tasks-storage] snapshot missing');
      return { status: 'missing' };
    }

    const raw = await FileSystem.readAsStringAsync(dataUri);
    const envelope = JSON.parse(raw) as EncryptedEnvelopeV1;
    if (!envelope || envelope.v !== 1 || envelope.alg !== 'nacl.secretbox') {
      if (__DEV__) console.warn('[tasks-storage] invalid envelope');
      return { status: 'error', reason: 'invalid-envelope' };
    }

    const decrypted = await decryptEnvelopeToString(envelope);
    if (decrypted == null) {
      if (__DEV__) console.warn('[tasks-storage] decrypt failed');
      return { status: 'error', reason: 'decrypt-failed' };
    }

    const snapshot = JSON.parse(decrypted);
    if (!snapshot || typeof snapshot !== 'object') {
      if (__DEV__) console.warn('[tasks-storage] invalid snapshot JSON');
      return { status: 'error', reason: 'invalid-snapshot' };
    }

    if (__DEV__) console.log('[tasks-storage] snapshot loaded');
    return { status: 'ok', snapshot };
  } catch (e) {
    if (__DEV__) console.warn('[tasks-storage] load failed', { dataUri, error: String(e) });
    return { status: 'error', reason: 'load-failed' };
  }
}

export async function saveEncryptedTasksSnapshot(snapshot: any): Promise<void> {
  if (Platform.OS !== 'ios') return;

  const FileSystem = await getFileSystem();
  if (!FileSystem) {
    if (__DEV__) console.warn('[tasks-storage] skip save: FileSystem unavailable');
    return;
  }

  const { dataUri, tmpUri, bakUri } = getUris(FileSystem);

  try {
    const plaintext = JSON.stringify(snapshot);
    const envelope = await encryptStringToEnvelope(plaintext);
    if (!envelope) {
      if (__DEV__) console.warn('[tasks-storage] skip save: encryption unavailable');
      return;
    }

    await FileSystem.writeAsStringAsync(tmpUri, JSON.stringify(envelope), {
      encoding: FileSystem?.EncodingType?.UTF8,
    });

    // Safer replace when moveAsync is available.
    if (typeof FileSystem?.moveAsync === 'function') {
      const info = await FileSystem.getInfoAsync(dataUri);
      if (info.exists) {
        try {
          await FileSystem.deleteAsync(bakUri, { idempotent: true });
        } catch {
          // ignore
        }
        try {
          await FileSystem.moveAsync({ from: dataUri, to: bakUri });
        } catch {
          // ignore (fallback to delete below)
          try {
            await FileSystem.deleteAsync(dataUri, { idempotent: true });
          } catch {
            // ignore
          }
        }
      }

      try {
        await FileSystem.moveAsync({ from: tmpUri, to: dataUri });
        try {
          await FileSystem.deleteAsync(bakUri, { idempotent: true });
        } catch {
          // ignore
        }
      } catch {
        // Restore previous snapshot if we moved it to bak.
        try {
          const bakInfo = await FileSystem.getInfoAsync(bakUri);
          if (bakInfo.exists) {
            await FileSystem.deleteAsync(dataUri, { idempotent: true });
            await FileSystem.moveAsync({ from: bakUri, to: dataUri });
          }
        } catch {
          // ignore
        }
      } finally {
        try {
          await FileSystem.deleteAsync(tmpUri, { idempotent: true });
        } catch {
          // ignore
        }
      }
      return;
    }

    // Fallback: overwrite in place (less safe, but better than skipping saves).
    await FileSystem.writeAsStringAsync(dataUri, JSON.stringify(envelope), {
      encoding: FileSystem?.EncodingType?.UTF8,
    });
    try {
      await FileSystem.deleteAsync(tmpUri, { idempotent: true });
    } catch {
      // ignore
    }
  } catch {
    // ignore
  }
}

export async function clearEncryptedTasksSnapshot(): Promise<void> {
  if (Platform.OS !== 'ios') return;

  const FileSystem = await getFileSystem();
  if (!FileSystem) return;

  const { dataUri, tmpUri, bakUri } = getUris(FileSystem);
  try {
    await FileSystem.deleteAsync(tmpUri, { idempotent: true });
  } catch {
    // ignore
  }
  try {
    await FileSystem.deleteAsync(bakUri, { idempotent: true });
  } catch {
    // ignore
  }
  try {
    await FileSystem.deleteAsync(dataUri, { idempotent: true });
  } catch {
    // ignore
  }
}
