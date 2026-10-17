import DateTimePicker from "@react-native-community/datetimepicker";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSheetHeaderActions } from "@/components/navigation/sheet-header-actions";
import { GlassSurface, withAlpha } from "@/components/ui/glass-surface";
import { ripple, rippleClip } from "@/components/ui/ripple";
import { Colors, contrastAlpha } from "@/constants/theme";
import { submitHomeDayPickerDate } from "@/context/home-day-picker-bridge";
import { getAccentColorValue, useAppSettings } from "@/context/settings-store";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { t } from "@/i18n";
import { getStartOfLocalDayMs } from "@/utils/task-dates";

const addDays = (timestamp: number, days: number) => {
  const d = new Date(timestamp);
  d.setDate(d.getDate() + days);
  return getStartOfLocalDayMs(d);
};

/**
 * Native bottom sheet for jumping the Today screen to a day. Close discards
 * the picked day, Done applies it; Today and Tomorrow apply right away.
 */
export default function DayPickerSheet() {
  const router = useRouter();
  const { date } = useLocalSearchParams<{ date?: string }>();
  const theme = useColorScheme() ?? "light";
  const { accentColor } = useAppSettings();
  const accent = getAccentColorValue(accentColor);
  const headerHeight = useHeaderHeight();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const [draft, setDraft] = React.useState(() => {
    const parsed = Number(date);
    return new Date(
      Number.isFinite(parsed) && parsed > 0 ? parsed : getStartOfLocalDayMs(),
    );
  });

  const apply = React.useCallback(
    (dateStart: number) => {
      submitHomeDayPickerDate(dateStart);
      router.back();
    },
    [router],
  );

  const handleClose = React.useCallback(() => {
    router.back();
  }, [router]);
  const handleDone = React.useCallback(() => {
    apply(getStartOfLocalDayMs(draft));
  }, [apply, draft]);

  const sheetHeaderActions = useSheetHeaderActions({
    onClose: handleClose,
    onDone: handleDone,
    native: true,
    doneTintColor: accent,
  });

  const todayStart = getStartOfLocalDayMs();

  return (
    <View
      style={[
        styles.container,
        { paddingTop: headerHeight + 8, paddingBottom: insets.bottom + 16 },
      ]}
    >
      <Stack.Screen
        options={{
          title: t("a11y.home.pickDate"),
          ...sheetHeaderActions,
          headerShown: true,
          // The sheet brings its own glass backdrop; the header and content
          // sit on it directly.
          headerTransparent: true,
          headerStyle: { backgroundColor: "transparent" },
          headerShadowVisible: false,
        }}
      />

      <View style={styles.quickActionsRow}>
        {[
          { label: t("common.today"), dateStart: todayStart },
          {
            label: t("taskDetail.relative.tomorrow"),
            dateStart: addDays(todayStart, 1),
          },
        ].map(({ label, dateStart }) => (
          // Liquid Glass buttons on the sheet's own glass, no extra fill.
          <GlassSurface
            key={label}
            isInteractive
            fallbackBackgroundColor={styles.quickActionFallback.backgroundColor}
            style={styles.quickActionButton}
          >
            <Pressable
              android_ripple={ripple()}
              accessibilityRole="button"
              style={[styles.quickActionPressable, rippleClip(14)]}
              onPress={() => apply(dateStart)}
            >
              <Text style={styles.quickActionText}>{label}</Text>
            </Pressable>
          </GlassSurface>
        ))}
      </View>

      <View style={styles.pickerContainer}>
        <DateTimePicker
          value={draft}
          mode="date"
          display="inline"
          onChange={(_: unknown, next?: Date) => {
            if (next) setDraft(next);
          }}
          textColor={Colors[theme].text}
          themeVariant={theme}
          accentColor={accent}
        />
      </View>
    </View>
  );
}

const createStyles = (theme: keyof typeof Colors) => {
  const isDark = theme === "dark";
  const text = Colors[theme].text;

  return StyleSheet.create({
    container: {
      paddingHorizontal: 16,
    },
    quickActionsRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 12,
    },
    quickActionButton: {
      flex: 1,
      borderRadius: 14,
      overflow: "hidden",
    },
    quickActionPressable: {
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    quickActionFallback: {
      backgroundColor: withAlpha(text, contrastAlpha(isDark ? 0.08 : 0.05)),
    },
    quickActionText: {
      fontSize: 15,
      fontWeight: "600",
      color: text,
    },
    // The inline calendar keeps its own intrinsic width; center it so the
    // margins match on both sides.
    pickerContainer: {
      alignItems: "center",
    },
  });
};
