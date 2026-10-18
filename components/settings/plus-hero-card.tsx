import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { withAlpha } from "@/components/ui/glass-surface";
import { ripple } from "@/components/ui/ripple";
import { getPremiumPlanLabel, type PremiumPlan } from "@/constants/premium";
import { VISIBLE_PREMIUM_BENEFITS } from "@/constants/premium-benefits";
import { getAccentColorValue, useAppSettings } from "@/context/settings-store";
import { useThemedStyles } from "@/hooks/use-themed-styles";
import { t } from "@/i18n";
import { assistCopyKey } from "@/utils/assist-availability";

/**
 * The entry to the settings screen: what Reminders+ is, which plan is active,
 * and one clear action. Free users see the pitch and the benefits; subscribers
 * see the same benefits checked off.
 */
export function PlusHeroCard({
  isReady,
  hasPremiumAccess,
  plan,
  onPress,
}: {
  isReady: boolean;
  hasPremiumAccess: boolean;
  plan: PremiumPlan;
  onPress: () => void;
}) {
  const { accentColor } = useAppSettings();
  const accent = useThemedStyles(
    () => getAccentColorValue(accentColor),
    [accentColor],
  );
  const isActive = isReady && hasPremiumAccess;

  const statusLabel = !isReady
    ? t("common.planChecking")
    : isActive
      ? `${t("common.active")} · ${getPremiumPlanLabel(plan)}`
      : getPremiumPlanLabel(plan);

  return (
    <LinearGradient
      colors={["#05070B", "#0B1424"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      {/* Soft glow in the user's accent so the card belongs to their app. */}
      <View
        pointerEvents="none"
        style={[styles.glow, { backgroundColor: withAlpha(accent, 0.42) }]}
      />

      <View style={styles.topRow}>
        <View style={styles.brand}>
          <View style={[styles.brandMark, { backgroundColor: accent }]}>
            <MaterialIcons name="auto-awesome" size={16} color="#FFFFFF" />
          </View>
          <Text style={styles.brandText}>Reminders+</Text>
        </View>
        <View
          style={[
            styles.statusChip,
            isActive ? { backgroundColor: withAlpha("#34C759", 0.22) } : null,
          ]}
        >
          {isActive ? (
            <MaterialIcons name="verified" size={13} color="#4ADE80" />
          ) : null}
          <Text
            numberOfLines={1}
            style={[styles.statusText, isActive ? { color: "#BBF7D0" } : null]}
          >
            {statusLabel}
          </Text>
        </View>
      </View>

      <View style={styles.copy}>
        <Text accessibilityRole="header" style={styles.title}>
          {isActive
            ? t("settings.remindsPlus.hero.activeTitle")
            : t("plus.hero.title")}
        </Text>
        <Text style={styles.subtitle}>
          {isActive
            ? t("settings.remindsPlus.hero.activeBody")
            : t(assistCopyKey("plus.source.default"))}
        </Text>
      </View>

      <View style={styles.benefits}>
        {VISIBLE_PREMIUM_BENEFITS.map((benefit) => (
          <View key={benefit.id} style={styles.benefitRow}>
            <View
              style={[
                styles.benefitIcon,
                { backgroundColor: withAlpha(benefit.tint, 0.2) },
              ]}
            >
              <MaterialIcons name={benefit.icon} size={17} color={benefit.tint} />
            </View>
            <Text style={styles.benefitText}>{t(benefit.titleKey)}</Text>
            {isActive ? (
              <MaterialIcons name="check" size={18} color="#4ADE80" />
            ) : null}
          </View>
        ))}
      </View>

      <Pressable
        android_ripple={ripple("rgba(0,0,0,0.12)")}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.cta, pressed ? styles.ctaPressed : null]}
      >
        <Text style={styles.ctaText}>
          {isActive
            ? t("settings.remindsPlus.action.showOptions")
            : t("settings.remindsPlus.action.discover")}
        </Text>
        <MaterialIcons name="arrow-forward" size={18} color="#0B0F17" />
      </Pressable>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    borderCurve: "continuous",
    overflow: "hidden",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    gap: 20,
  },
  glow: {
    position: "absolute",
    top: -120,
    right: -90,
    width: 260,
    height: 260,
    borderRadius: 130,
    opacity: 0.7,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandMark: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  brandText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  statusText: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 13,
    fontWeight: "600",
  },
  copy: {
    gap: 8,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  subtitle: {
    color: "rgba(226,232,240,0.76)",
    fontSize: 15,
    lineHeight: 21,
  },
  benefits: {
    borderRadius: 20,
    borderCurve: "continuous",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  benefitIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  benefitText: {
    flex: 1,
    color: "#F8FAFC",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
  },
  cta: {
    minHeight: 50,
    borderRadius: 25,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 20,
  },
  ctaPressed: {
    opacity: 0.85,
  },
  ctaText: {
    color: "#0B0F17",
    fontSize: 16,
    fontWeight: "700",
  },
});
