import { Redirect } from "expo-router";
import React from "react";

import AssistScreen from "@/app/assist";
import PlusScreen from "@/app/plus";
import { usePremium } from "@/context/premium-store";
import { t } from "@/i18n";
import { IS_ASSIST_SUPPORTED } from "@/utils/assist-availability";

export default function AssistantTabScreen() {
  const { hasPremiumAccess, isReady } = usePremium();

  // Assist has no Android backend; never strand the user on an empty screen.
  if (!IS_ASSIST_SUPPORTED) {
    return <Redirect href="/home" />;
  }

  if (!isReady || hasPremiumAccess) {
    return <AssistScreen />;
  }

  return (
    <PlusScreen
      sourceOverride="assist"
      closeFallbackHref="/home"
      headerTitle={t("plus.title")}
      showsCloseButton={false}
    />
  );
}
