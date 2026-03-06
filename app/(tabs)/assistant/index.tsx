import React from "react";

import AssistScreen from "@/app/assist";
import PlusScreen from "@/app/plus";
import { usePremium } from "@/context/premium-store";

export default function AssistantTabScreen() {
  const { hasPremiumAccess, isReady } = usePremium();

  if (!isReady || hasPremiumAccess) {
    return <AssistScreen />;
  }

  return (
    <PlusScreen
      sourceOverride="assist"
      closeFallbackHref="/home"
      headerTitle="Plus"
      showsCloseButton={false}
    />
  );
}
