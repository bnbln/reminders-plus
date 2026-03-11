import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

import { getAppSettingsSnapshot } from "@/context/settings-store";

function shouldTriggerHaptics() {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return false;
  return getAppSettingsSnapshot().hapticsEnabled;
}

export function triggerSelectionHaptic() {
  if (!shouldTriggerHaptics()) return;
  void Haptics.selectionAsync().catch(() => undefined);
}

export function triggerImpactHaptic(
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light,
) {
  if (!shouldTriggerHaptics()) return;
  void Haptics.impactAsync(style).catch(() => undefined);
}

export function triggerNotificationHaptic(
  type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success,
) {
  if (!shouldTriggerHaptics()) return;
  void Haptics.notificationAsync(type).catch(() => undefined);
}
