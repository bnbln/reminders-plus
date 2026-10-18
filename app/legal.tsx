import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useHeaderHeight } from "expo-router/react-navigation";
import React from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { usePageColumnPadding } from "@/components/navigation/page-column";
import { ripple } from "@/components/ui/ripple";
import { Colors } from "@/constants/theme";
import {
  LEGAL_ACCESSIBILITY_FEEDBACK_EMAIL,
  LEGAL_IMPRINT_URL,
  LEGAL_PRIVACY_URL,
  LEGAL_TERMS_URL,
} from "@/constants/legal";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { t } from "@/i18n";

type LinkRow = { key: string; label: string; url: string };

export default function LegalScreen() {
  const pageColumnPadding = usePageColumnPadding();
  const headerHeight = useHeaderHeight();
  const isDark = (useColorScheme() ?? "light") === "dark";
  const theme = isDark ? "dark" : "light";
  const text = Colors[theme].text;
  const muted = isDark ? "rgba(236,237,238,0.72)" : "rgba(17,24,28,0.72)";
  const borderColor = isDark ? "rgba(255,255,255,0.11)" : "rgba(17,24,28,0.09)";
  const cardStyle = {
    borderColor,
    backgroundColor: isDark ? "#1C1C1E" : "#F2F2F7",
  };

  const documents = React.useMemo<LinkRow[]>(
    () =>
      [
        { key: "privacy", label: t("legal.privacy"), url: LEGAL_PRIVACY_URL },
        { key: "imprint", label: t("legal.imprint"), url: LEGAL_IMPRINT_URL },
        { key: "terms", label: t("legal.terms"), url: LEGAL_TERMS_URL },
      ].filter((row) => row.url.length > 0),
    [],
  );

  const open = React.useCallback((url: string) => {
    Linking.openURL(url).catch(() =>
      Alert.alert(t("legal.openFailed")),
    );
  }, []);

  const renderLink = (label: string, url: string, showSeparator: boolean) => (
    <React.Fragment key={url}>
      {showSeparator ? (
        <View style={[styles.separator, { backgroundColor: borderColor }]} />
      ) : null}
      <Pressable
        android_ripple={ripple()}
        accessibilityRole="link"
        accessibilityLabel={label}
        accessibilityHint={t("legal.opensInBrowser")}
        onPress={() => open(url)}
        style={styles.linkRow}
      >
        <Text style={[styles.rowLabel, { color: text }]}>{label}</Text>
        <MaterialIcons name="open-in-new" size={18} color={muted} />
      </Pressable>
    </React.Fragment>
  );

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.content,
        pageColumnPadding,
        Platform.OS === "android" ? { paddingTop: headerHeight } : null,
      ]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      {documents.length > 0 ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            {t("legal.section.documents")}
          </Text>
          <View style={[styles.card, cardStyle]}>
            {documents.map((row, index) =>
              renderLink(row.label, row.url, index > 0),
            )}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          {t("legal.section.accessibility")}
        </Text>
        <View style={[styles.card, cardStyle]}>
          <Text style={[styles.body, { color: muted }]}>
            {t("legal.accessibility.body")}
          </Text>
          {LEGAL_ACCESSIBILITY_FEEDBACK_EMAIL
            ? renderLink(
                t("legal.accessibility.feedback"),
                `mailto:${LEGAL_ACCESSIBILITY_FEEDBACK_EMAIL}`,
                true,
              )
            : null}
        </View>
      </View>

      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          {t("legal.section.ai")}
        </Text>
        <View style={[styles.card, cardStyle]}>
          <Text style={[styles.body, { color: muted }]}>
            {t("legal.ai.body")}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 34, gap: 14 },
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
    color: "#5B6270",
    paddingHorizontal: 2,
  },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  linkRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowLabel: { fontSize: 16, fontWeight: "500", flexShrink: 1 },
  body: { fontSize: 14, lineHeight: 21, paddingHorizontal: 14, paddingVertical: 12 },
  separator: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
});
