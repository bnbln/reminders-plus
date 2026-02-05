import { Platform } from 'react-native';

const parseMajorVersion = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string') {
    const match = value.match(/\d+/);
    if (match) {
      const parsed = Number.parseInt(match[0], 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
};

export const getIOSMajorVersion = (): number | null => {
  if (Platform.OS !== 'ios') return null;

  const constants = Platform.constants as {
    osVersion?: string;
    systemVersion?: string;
  };

  const candidates: unknown[] = [Platform.Version, constants.osVersion, constants.systemVersion];
  for (const candidate of candidates) {
    const major = parseMajorVersion(candidate);
    if (major !== null) {
      return major;
    }
  }

  return null;
};

export const isIOS26OrNewer = (): boolean => {
  const major = getIOSMajorVersion();
  return major !== null && major >= 26;
};
