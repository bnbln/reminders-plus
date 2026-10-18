import { Stack, useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OVERLAY_CARD_MAX_WIDTH, usePageMaxWidthStyle } from "@/components/navigation/page-column";
import { usePageInsets } from "@/components/navigation/vertical-bar-safe-area";
import { GlassSurface, withAlpha } from "@/components/ui/glass-surface";
import { FREE_PROJECT_LIMIT } from "@/constants/premium";
import { Colors, contrastAlpha } from "@/constants/theme";
import { usePremium } from "@/context/premium-store";
import { useTasksStore } from "@/context/tasks-store";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { t } from "@/i18n";
import { assistCopyKey } from "@/utils/assist-availability";
import { ripple } from '@/components/ui/ripple';
import { useThemedStyles } from "@/hooks/use-themed-styles";

type ThemeName = keyof typeof Colors;

export default function ProjectLimitModal() {
  const router = useRouter();
  const theme = (useColorScheme() ?? "light") as ThemeName;
  const isDark = theme === "dark";
  const styles = useThemedStyles(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const pageInsets = usePageInsets();
  // Same width as the task composer on large screens.
  const overlayWidthStyle = usePageMaxWidthStyle(OVERLAY_CARD_MAX_WIDTH);
  const { hasPremiumAccess, isReady } = usePremium();
  const { projects } = useTasksStore();

  const activeProjectCount = React.useMemo(
    () => projects.filter((project) => !project.deletedAt).length,
    [projects],
  );

  React.useEffect(() => {
    if (!isReady) return;

    if (hasPremiumAccess || activeProjectCount < FREE_PROJECT_LIMIT) {
      router.replace("/project/create-modal");
    }
  }, [activeProjectCount, hasPremiumAccess, isReady, router]);

  const onClose = React.useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/explore");
  }, [router]);

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: t("projectEdit.newProject"),
          headerShown: false,
          contentStyle: { backgroundColor: "transparent" },
          presentation: "transparentModal",
          animation: "fade",
        }}
      />

      <Pressable
        style={[
          styles.backdrop,
          { left: -pageInsets.leftInset, right: -pageInsets.rightInset },
        ]}
        accessibilityRole="button"
        accessibilityLabel={t("taskCreate.close")}
        onPress={onClose}
      />

      <View
        style={[
          styles.lockHost,
          { paddingBottom: Math.max(16, insets.bottom - 8) },
        ]}
        pointerEvents="box-none"
      >
        <GlassSurface
          style={[styles.lockCard, overlayWidthStyle]}
          glassEffectStyle="regular"
          tintColor={withAlpha(Colors[theme].background, isDark ? 0.18 : 0.34)}
          fallbackBackgroundColor={withAlpha(
            Colors[theme].background,
            isDark ? 0.92 : 0.96,
          )}
          isInteractive
        >
          {!isReady ? (
            <View style={styles.lockLoadingState}>
              <ActivityIndicator color={Colors[theme].text} />
              <Text style={styles.lockBody}>
                {t("projectLimit.loading")}
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.lockTitle}>
                {t("projectLimit.title", { count: FREE_PROJECT_LIMIT })}
              </Text>
              <Text style={styles.lockBody}>
                {t(assistCopyKey("projectLimit.body"), { count: FREE_PROJECT_LIMIT })}
              </Text>

              <View style={styles.lockButtonRow}>
                <Pressable
                  android_ripple={ripple()}
                  accessibilityRole="button"
                  onPress={onClose}
                  style={({ pressed }) => [
                    styles.secondaryAction,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.secondaryActionText}>
                    {t("projectLimit.action.later")}
                  </Text>
                </Pressable>

                <Pressable
                  android_ripple={ripple()}
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: "/plus",
                      params: { source: "projects" },
                    })
                  }
                  style={({ pressed }) => [
                    styles.primaryAction,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.primaryActionText}>
                    {t("projectLimit.action.openPlus")}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </GlassSurface>
      </View>
    </View>
  );
}

const createStyles = (theme: ThemeName) => {
  const isDark = theme === "dark";
  const text = Colors[theme].text;
  const cardBorder = isDark
    ? "rgba(255,255,255,0.1)"
    : "rgba(255,255,255,0.34)";

  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: "transparent",
    },
    lockHost: {
      flex: 1,
      justifyContent: "flex-end",
      paddingHorizontal: 12,
      paddingTop: 12,
    },
    lockCard: {
      borderRadius: 26,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: cardBorder,
      paddingHorizontal: 18,
      paddingVertical: 18,
      gap: 14,
      shadowColor: "#000",
      shadowOpacity: isDark ? 0.34 : 0.16,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
    },
    lockLoadingState: {
      minHeight: 90,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
    },
    lockTitle: {
      fontSize: 24,
      lineHeight: 28,
      fontWeight: "800",
      letterSpacing: -0.6,
      color: text,
    },
    lockBody: {
      fontSize: 15,
      lineHeight: 22,
      color: withAlpha(text, contrastAlpha(0.72)),
    },
    lockButtonRow: {
      flexDirection: "row",
      gap: 10,
    },
    secondaryAction: {
      flex: 1,
      minHeight: 46,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: withAlpha(text, contrastAlpha(isDark ? 0.08 : 0.06)),
    },
    secondaryActionText: {
      fontSize: 15,
      fontWeight: "700",
      color: text,
    },
    primaryAction: {
      flex: 1.3,
      minHeight: 46,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#FF8A00",
    },
    primaryActionText: {
      fontSize: 15,
      fontWeight: "700",
      color: "#FFFFFF",
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: isDark ? "rgba(0,0,0,0.58)" : "rgba(0,0,0,0.14)",
    },
    buttonPressed: {
      opacity: 0.86,
      transform: [{ scale: 0.98 }],
    },
  });
};
