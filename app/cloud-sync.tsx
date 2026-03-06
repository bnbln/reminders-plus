import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { useRouter } from "expo-router";

import {
  PremiumBackupBlock,
  PremiumCloudSyncBlock,
  type ThemeName,
  usePremiumSyncBackupController,
} from "@/components/settings/premium-sync-backup";
import { useColorScheme } from "@/hooks/use-color-scheme";

function Section({
  title,
  children,
  cardStyle,
}: {
  title: string;
  children: React.ReactNode;
  cardStyle?: ViewStyle;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={[styles.sectionCard, cardStyle]}>{children}</View>
    </View>
  );
}

export default function CloudSyncScreen() {
  const router = useRouter();
  const theme = (useColorScheme() ?? "light") as ThemeName;
  const isDark = theme === "dark";
  const controller = usePremiumSyncBackupController();
  const premiumLocked = !controller.isPremiumReady || !controller.hasPremiumAccess;

  React.useEffect(() => {
    if (controller.isPremiumReady && !controller.hasPremiumAccess) {
      router.replace({ pathname: "/plus", params: { source: "sync" } });
    }
  }, [controller.hasPremiumAccess, controller.isPremiumReady, router]);

  const borderColor = isDark ? "rgba(255,255,255,0.11)" : "rgba(17,24,28,0.09)";
  const cardBackground = isDark ? "#1C1C1E" : "#F2F2F7";
  const muted = isDark ? "rgba(236,237,238,0.67)" : "rgba(17,24,28,0.66)";
  const sectionCardStyle = React.useMemo(
    () => ({ borderColor, backgroundColor: cardBackground }),
    [borderColor, cardBackground],
  );

  return (
    <View style={{ flex: 1, backgroundColor: "transparent" }}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        alwaysBounceVertical
        showsVerticalScrollIndicator={false}
      >
        <Section title="CloudSync" cardStyle={sectionCardStyle}>
          <PremiumCloudSyncBlock
            controller={controller}
            theme={theme}
            borderColor={borderColor}
            muted={muted}
            disabled={premiumLocked}
          />
        </Section>

        <Section title="Datensicherung" cardStyle={sectionCardStyle}>
          <PremiumBackupBlock
            controller={controller}
            theme={theme}
            muted={muted}
            disabled={premiumLocked}
          />
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 34,
    gap: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
    color: "#6B7280",
    paddingHorizontal: 2,
  },
  sectionCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
});
