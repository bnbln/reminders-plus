import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";

type AppIconNativeModule = {
  supportsAlternateIconsAsync(): Promise<boolean>;
  getIconNameAsync(): Promise<string | null>;
  setIconNameAsync(name: string | null): Promise<void>;
};

// Optional so Android, web and builds without the native module keep working.
const AppIconNative =
  Platform.OS === "ios"
    ? requireOptionalNativeModule<AppIconNativeModule>("AppIcon")
    : null;

export async function supportsAlternateAppIconsAsync(): Promise<boolean> {
  if (!AppIconNative) return false;
  try {
    return await AppIconNative.supportsAlternateIconsAsync();
  } catch {
    return false;
  }
}

/**
 * Switches the home screen icon; `null` restores the primary icon. No-op when
 * the requested icon is already active, so iOS does not show its alert again.
 */
export async function setAlternateAppIconAsync(name: string | null): Promise<void> {
  if (!AppIconNative) return;
  const current = (await AppIconNative.getIconNameAsync()) ?? null;
  if (current === name) return;
  await AppIconNative.setIconNameAsync(name);
}
