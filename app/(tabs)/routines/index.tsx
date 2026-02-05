import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { withAlpha } from "@/components/ui/glass-surface";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { t } from "@/i18n";

type ThemeName = keyof typeof Colors;

const createStyles = (theme: ThemeName) => {
  const isDark = theme === "dark";
  const text = Colors[theme].text;
  const hairline = isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.12)";

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors[theme].background,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 180,
      gap: 10,
    },
    intro: {
      marginBottom: 6,
      paddingHorizontal: 2,
      gap: 4,
    },
    title: {
      fontSize: 26,
      fontWeight: "800",
      color: text,
    },
    subtitle: {
      fontSize: 13,
      fontWeight: "600",
      color: withAlpha(text, 0.62),
    },
    card: {
      minHeight: 72,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hairline,
      backgroundColor: isDark ? "#1C1C1E" : "#F2F2F7",
      justifyContent: "center",
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 4,
    },
    cardTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: text,
    },
    cardSubtitle: {
      fontSize: 12,
      fontWeight: "600",
      color: withAlpha(text, 0.58),
    },
  });
};

export default function RoutinesTabMinimizeTestScreen() {
  const theme = useColorScheme() ?? "light";
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  const rows = React.useMemo(
    () => Array.from({ length: 80 }, (_, index) => index + 1),
    [],
  );

  return (
    <View style={styles.container}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <Text style={styles.subtitle}>{t("routinesTest.subtitle")}</Text>
        </View>

        {rows.map((row) => (
          <View key={row} style={styles.card}>
            <Text style={styles.cardTitle}>
              {t("routinesTest.rowTitle", { row })}
            </Text>
            <Text style={styles.cardSubtitle}>
              {t("routinesTest.rowSubtitle")}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
