import { Platform } from "react-native";

/**
 * Assist is built on Apple Foundation Models via `@react-native-ai/apple`, which
 * ships no Android implementation.
 *
 * The nearest Android API is ML Kit's GenAI Prompt API (on-device Gemini Nano),
 * but it exposes no tool/function calling — and Assist is built entirely around
 * tools that create, find and move tasks and projects. It also caps input at
 * ~4k tokens and only runs on recent Tensor/Snapdragon/Dimensity devices. So
 * rather than ship a degraded imitation, Assist is hidden on Android.
 *
 * This does not affect the local text matching in task creation: date parsing,
 * emoji inference and task lookup in `utils/assist-task-tools` are plain
 * TypeScript and run on every platform.
 */
export const IS_ASSIST_SUPPORTED = Platform.OS === "ios";

/**
 * Marketing copy that lists Assist alongside the other Reminders+ benefits needs
 * an Assist-free variant on Android. Each `<key>` has a matching `<key>.noAssist`
 * entry; locales without the variant fall back to English, same as any other key.
 */
export function assistCopyKey(baseKey: string): string {
  return IS_ASSIST_SUPPORTED ? baseKey : `${baseKey}.noAssist`;
}

/**
 * Cloud Sync is CloudKit behind the `CloudSyncBridge` native module, so it only
 * exists on Apple platforms. Android has no equivalent and no fallback, so the
 * feature is hidden there entirely rather than shown as a permanently disabled
 * toggle next to an "Only on iPhone/iPad" button.
 */
export const IS_CLOUD_SYNC_SUPPORTED = Platform.OS === "ios";
