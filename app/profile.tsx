import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { getPremiumPlanLabel } from "@/constants/premium";
import { Colors } from "@/constants/theme";
import { usePremium } from "@/context/premium-store";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { t } from "@/i18n";

type ThemeName = keyof typeof Colors;

const createStyles = (theme: ThemeName) => {
  const isDark = theme === "dark";
  const text = Colors[theme].text;
  const cardBackground = isDark ? "#1C1C1E" : "#F2F2F7";
  const borderColor = isDark ? "rgba(255,255,255,0.09)" : "rgba(17,24,28,0.09)";

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors[theme].background,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 32,
      gap: 12,
    },
    card: {
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor,
      backgroundColor: cardBackground,
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 10,
    },
    title: {
      fontSize: 15,
      fontWeight: "700",
      color: text,
    },
    subtitle: {
      fontSize: 14,
      lineHeight: 20,
      color: isDark ? "rgba(236,237,238,0.74)" : "rgba(17,24,28,0.72)",
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    rowLabel: {
      fontSize: 14,
      color: isDark ? "rgba(236,237,238,0.68)" : "rgba(17,24,28,0.66)",
    },
    rowValue: {
      fontSize: 14,
      fontWeight: "600",
      color: text,
    },
    ctaButton: {
      marginTop: 6,
      minHeight: 44,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: Colors[theme].tint,
      paddingHorizontal: 14,
    },
    ctaButtonText: {
      fontSize: 14,
      fontWeight: "700",
      color: "#FFFFFF",
    },
  });
};

export default function ProfileScreen() {
  const router = useRouter();
  const theme = (useColorScheme() ?? "light") as ThemeName;
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const { hasPremiumAccess, isReady, plan } = usePremium();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      alwaysBounceVertical
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        <Text style={styles.title}>{t("profile.title")}</Text>
        <Text style={styles.subtitle}>
          {t("profile.subtitle")}
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t("profile.field.name")}</Text>
          <Text style={styles.rowValue}>{t("profile.value.name")}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t("profile.field.email")}</Text>
          <Text style={styles.rowValue}>{t("profile.value.email")}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t("profile.field.plan")}</Text>
          <Text style={styles.rowValue}>
            {isReady ? getPremiumPlanLabel(plan) : t("common.planChecking")}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/plus")}
          style={({ pressed }) => [
            styles.ctaButton,
            pressed && { opacity: 0.86 },
          ]}
        >
          <Text style={styles.ctaButtonText}>
            {hasPremiumAccess
              ? t("profile.cta.manage")
              : t("profile.cta.view")}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
