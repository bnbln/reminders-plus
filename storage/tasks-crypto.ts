import nacl from 'tweetnacl';
import { decodeBase64, decodeUTF8, encodeBase64, encodeUTF8 } from 'tweetnacl-util';

export type EncryptedEnvelopeV1 = {
  v: 1;
  alg: 'nacl.secretbox';
  nonceB64: string;
  boxB64: string;
};

const STORAGE_KEYS = {
  secretKey: 'reminds.tasks.secretKey.v1',
} as const;

async function getSecureStore() {
  try {
    const mod = await import('expo-secure-store');
    if (typeof mod?.getItemAsync === 'function' && typeof mod?.setItemAsync === 'function') return mod;
  } catch {
    // ignore
  }
  return null;
}

async function getCrypto() {
  try {
    const mod = await import('expo-crypto');
    if (typeof mod?.getRandomBytesAsync === 'function') return mod;
  } catch {
    // ignore
  }
  return null;
}

async function getTasksSecretKey(): Promise<Uint8Array | null> {
  const SecureStore = await getSecureStore();
  if (!SecureStore) {
    if (__DEV__) console.warn('[tasks-crypto] SecureStore unavailable');
    return null;
  }

  const stored = await SecureStore.getItemAsync(STORAGE_KEYS.secretKey);
  if (stored) {
    try {
      const key = decodeBase64(stored);
      if (key.length === nacl.secretbox.keyLength) return key;
    } catch {
      // fall through
    }
  }

  return null;
}

async function createAndStoreTasksSecretKey(): Promise<Uint8Array | null> {
  const SecureStore = await getSecureStore();
  if (!SecureStore) {
    if (__DEV__) console.warn('[tasks-crypto] SecureStore unavailable (create)');
    return null;
  }

  const Crypto = await getCrypto();
  if (!Crypto) {
    if (__DEV__) console.warn('[tasks-crypto] Crypto unavailable');
    return null;
  }

  const key = await Crypto.getRandomBytesAsync(nacl.secretbox.keyLength);
  await SecureStore.setItemAsync(STORAGE_KEYS.secretKey, encodeBase64(key));
  if (__DEV__) console.log('[tasks-crypto] created new secret key');
  return key;
}

export async function encryptStringToEnvelope(plaintext: string): Promise<EncryptedEnvelopeV1 | null> {
  const key = (await getTasksSecretKey()) ?? (await createAndStoreTasksSecretKey());
  if (!key) return null;

  const Crypto = await getCrypto();
  if (!Crypto) return null;

  const nonce = await Crypto.getRandomBytesAsync(nacl.secretbox.nonceLength);
  const msg = decodeUTF8(plaintext);
  const box = nacl.secretbox(msg, nonce, key);

  return {
    v: 1,
    alg: 'nacl.secretbox',
    nonceB64: encodeBase64(nonce),
    boxB64: encodeBase64(box),
  };
}

export async function decryptEnvelopeToString(envelope: EncryptedEnvelopeV1): Promise<string | null> {
  // IMPORTANT: do not create a new key during decrypt.
  // If the key is missing (e.g. SecureStore unavailable), creating a new key would permanently make existing ciphertext undecryptable.
  const key = await getTasksSecretKey();
  if (!key) {
    if (__DEV__) console.warn('[tasks-crypto] missing secret key for decrypt');
    return null;
  }

  try {
    const nonce = decodeBase64(envelope.nonceB64);
    const box = decodeBase64(envelope.boxB64);
    const opened = nacl.secretbox.open(box, nonce, key);
    if (!opened) return null;
    return encodeUTF8(opened);
  } catch {
    return null;
  }
}
