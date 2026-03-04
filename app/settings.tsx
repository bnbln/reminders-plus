import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import {
  ACCENT_COLORS,
  APPEARANCE_MODES,
  useAppSettings,
} from "@/context/settings-store";
import {
  MenuView,
  type MenuAction,
  type MenuComponentRef,
} from "@react-native-menu/menu";
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import React from "react";
import {
  Button,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type ViewStyle,
} from "react-native";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

type ThemeName = keyof typeof Colors;

const APPEARANCE_LABELS = ["Adaptive", "Always light", "Always dark"] as const;

const APP_BADGE_OPTIONS = [
  "Due Today",
  "Overdue Only",
  "All Open Tasks",
  "Completed Today",
  "Hidden",
] as const;

type AppBadgeOption = (typeof APP_BADGE_OPTIONS)[number];

function formatTime(value: Date) {
  return value.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

export default function SettingsScreen() {
  const theme = (useColorScheme() ?? "light") as ThemeName;
  const isDark = theme === "dark";
  const menuRef = React.useRef<MenuComponentRef>(null);
  const { accentColor, appearanceMode, setAccentColor, setAppearanceMode } =
    useAppSettings();

  const [icloudSyncEnabled, setIcloudSyncEnabled] = React.useState(true);
  const [siriShortcutsEnabled, setSiriShortcutsEnabled] = React.useState(true);

  const [appBadge, setAppBadge] = React.useState<AppBadgeOption>("Due Today");
  const [dailySummaryEnabled, setDailySummaryEnabled] = React.useState(false);
  const [dailySummaryTime, setDailySummaryTime] = React.useState(() => {
    const initial = new Date();
    initial.setHours(20, 0, 0, 0);
    return initial;
  });
  const [showDailySummaryPicker, setShowDailySummaryPicker] =
    React.useState(false);

  const [hapticsEnabled, setHapticsEnabled] = React.useState(true);
  const [reduceMotionEnabled, setReduceMotionEnabled] = React.useState(false);

  const borderColor = isDark ? "rgba(255,255,255,0.11)" : "rgba(17,24,28,0.09)";
  const cardBackground = isDark ? "#1C1C1E" : "#F2F2F7";
  const muted = isDark ? "rgba(236,237,238,0.67)" : "rgba(17,24,28,0.66)";
  const sectionCardStyle = React.useMemo(
    () => ({ borderColor, backgroundColor: cardBackground }),
    [borderColor, cardBackground],
  );

  const appBadgeActions = React.useMemo<MenuAction[]>(() => {
    return APP_BADGE_OPTIONS.map((option) => ({
      id: option,
      title: option,
      state:
        Platform.OS === "ios"
          ? appBadge === option
            ? "on"
            : "off"
          : undefined,
    }));
  }, [appBadge]);

  const onPressBadgeAction = React.useCallback(
    ({ nativeEvent: { event } }: any) => {
      setAppBadge(event as AppBadgeOption);
    },
    [],
  );

  const onChangeAppearance = React.useCallback((index: number) => {
    const next = APPEARANCE_MODES[index] ?? "adaptive";
    setAppearanceMode(next);
  }, [setAppearanceMode]);

  const onChangeSummaryTime = React.useCallback(
    (event: DateTimePickerEvent, selectedDate?: Date) => {
      if (event.type === "dismissed") {
        if (Platform.OS !== "ios") setShowDailySummaryPicker(false);
        return;
      }

      if (selectedDate) {
        setDailySummaryTime(selectedDate);
      }

      if (Platform.OS !== "ios") {
        setShowDailySummaryPicker(false);
      }
    },
    [],
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors[theme].background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      alwaysBounceVertical
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Section title="Darstellung" cardStyle={sectionCardStyle}>
        <View style={styles.rowBlock}>
          <Text style={[styles.rowLabel, { color: Colors[theme].text }]}>
            Farbe
          </Text>
          <View style={styles.colorRow}>
            {ACCENT_COLORS.map((color) => {
              const selected = accentColor === color.id;
              return (
                <Pressable
                  key={color.id}
                  accessibilityRole="button"
                  accessibilityLabel={color.label}
                  onPress={() => setAccentColor(color.id)}
                  style={[
                    styles.colorButton,
                    {
                      backgroundColor: color.value,
                      borderColor: selected
                        ? Colors[theme].text
                        : isDark
                          ? "rgba(255,255,255,0.24)"
                          : "rgba(17,24,28,0.18)",
                      borderWidth: selected ? 2 : 1,
                    },
                  ]}
                >
                  {selected ? (
                    <MaterialIcons name="check" size={14} color="#fff" />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.separator, { backgroundColor: borderColor }]} />

        <View style={styles.rowBlock}>
          <Text style={[styles.rowLabel, { color: Colors[theme].text }]}>
            Farbmodus
          </Text>
          <SegmentedControl
            values={[...APPEARANCE_LABELS]}
            selectedIndex={APPEARANCE_MODES.indexOf(appearanceMode)}
            onChange={(event) =>
              onChangeAppearance(event.nativeEvent.selectedSegmentIndex)
            }
          />
        </View>
      </Section>

      <Section title="Sync & Integration" cardStyle={sectionCardStyle}>
        <View style={styles.switchRow}>
          <Text style={[styles.rowLabel, { color: Colors[theme].text }]}>
            iCloud-Sync
          </Text>
          <Switch
            value={icloudSyncEnabled}
            onValueChange={setIcloudSyncEnabled}
            trackColor={{ false: "#7A7A7A", true: "#34C759" }}
          />
        </View>

        <View style={[styles.separator, { backgroundColor: borderColor }]} />

        <View style={styles.switchRow}>
          <Text style={[styles.rowLabel, { color: Colors[theme].text }]}>
            Siri & Kurzbefehle
          </Text>
          <Switch
            value={siriShortcutsEnabled}
            onValueChange={setSiriShortcutsEnabled}
            trackColor={{ false: "#7A7A7A", true: "#34C759" }}
          />
        </View>

        <View style={[styles.separator, { backgroundColor: borderColor }]} />

        <View style={styles.buttonRow}>
          <Button title="Jetzt synchronisieren" onPress={() => {}} />
        </View>
      </Section>

      <Section title="Datensicherung" cardStyle={sectionCardStyle}>
        <View style={styles.buttonStack}>
          <Button title="Sichern & Exportieren" onPress={() => {}} />
          <Button title="Aus Sicherung wiederherstellen" onPress={() => {}} />
        </View>
      </Section>

      <Section title="Import" cardStyle={sectionCardStyle}>
        <View style={styles.buttonRow}>
          <Button
            title="Apple Erinnerungen & Kalender importieren"
            onPress={() => {}}
          />
        </View>
      </Section>

      <Section title="Mitteilungen" cardStyle={sectionCardStyle}>
        <View style={styles.rowBlock}>
          <Text style={[styles.rowLabel, { color: Colors[theme].text }]}>
            App-Badge
          </Text>

          <MenuView
            ref={menuRef}
            actions={appBadgeActions}
            onPressAction={onPressBadgeAction}
            shouldOpenOnLongPress={false}
            themeVariant={Platform.OS === "ios" ? theme : undefined}
            isAnchoredToRight={Platform.OS === "android" ? true : undefined}
            style={styles.badgeMenuAnchor}
          >
            {Platform.OS === "android" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="App-Badge auswählen"
                onPress={() => menuRef.current?.show?.()}
                style={styles.badgeMenuTrigger}
              >
                <Text
                  style={[styles.badgeValue, { color: Colors[theme].text }]}
                >
                  {appBadge}
                </Text>
                <MaterialIcons
                  name="keyboard-arrow-down"
                  size={18}
                  color={muted}
                />
              </Pressable>
            ) : (
              <View style={styles.badgeMenuTrigger}>
                <Text
                  style={[styles.badgeValue, { color: Colors[theme].text }]}
                >
                  {appBadge}
                </Text>
                <MaterialIcons
                  name="keyboard-arrow-down"
                  size={18}
                  color={muted}
                />
              </View>
            )}
          </MenuView>
        </View>

        <View style={[styles.separator, { backgroundColor: borderColor }]} />

        <View style={styles.switchRow}>
          <Text style={[styles.rowLabel, { color: Colors[theme].text }]}>
            Tägliche Zusammenfassung
          </Text>
          <Switch
            value={dailySummaryEnabled}
            onValueChange={(enabled) => {
              setDailySummaryEnabled(enabled);
              if (!enabled) setShowDailySummaryPicker(false);
            }}
            trackColor={{ false: "#7A7A7A", true: "#34C759" }}
          />
        </View>

        <View style={[styles.separator, { backgroundColor: borderColor }]} />

        <View style={styles.rowBlock}>
          <Text
            style={[
              styles.rowLabel,
              { color: dailySummaryEnabled ? Colors[theme].text : muted },
            ]}
          >
            Uhrzeit
          </Text>
          <Pressable
            disabled={!dailySummaryEnabled}
            onPress={() => setShowDailySummaryPicker((current) => !current)}
            style={styles.timeButton}
          >
            <Text
              style={[
                styles.timeButtonText,
                { color: dailySummaryEnabled ? Colors[theme].text : muted },
              ]}
            >
              {formatTime(dailySummaryTime)}
            </Text>
            <MaterialIcons
              name={
                showDailySummaryPicker
                  ? "keyboard-arrow-up"
                  : "keyboard-arrow-down"
              }
              size={18}
              color={dailySummaryEnabled ? muted : `${muted}80`}
            />
          </Pressable>
        </View>

        {showDailySummaryPicker && dailySummaryEnabled ? (
          <View style={styles.timePickerWrap}>
            <DateTimePicker
              mode="time"
              value={dailySummaryTime}
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={onChangeSummaryTime}
            />
          </View>
        ) : null}
      </Section>

      <Section title="Interaktionen" cardStyle={sectionCardStyle}>
        <View style={styles.switchRow}>
          <Text style={[styles.rowLabel, { color: Colors[theme].text }]}>
            Haptik aktivieren
          </Text>
          <Switch
            value={hapticsEnabled}
            onValueChange={setHapticsEnabled}
            trackColor={{ false: "#7A7A7A", true: "#34C759" }}
          />
        </View>

        <View style={[styles.separator, { backgroundColor: borderColor }]} />

        <View style={styles.switchRow}>
          <Text style={[styles.rowLabel, { color: Colors[theme].text }]}>
            Bewegung reduzieren
          </Text>
          <Switch
            value={reduceMotionEnabled}
            onValueChange={setReduceMotionEnabled}
            trackColor={{ false: "#7A7A7A", true: "#34C759" }}
          />
        </View>
      </Section>

      <View
        style={[
          styles.footerNote,
          {
            borderColor,
            backgroundColor: cardBackground,
          },
        ]}
      >
        <Text style={[styles.footerText, { color: muted }]}>
          Nicht alle Optionen sind bereits mit Logik verbunden.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  rowBlock: {
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: "500",
  },
  buttonRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonStack: {
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
  },
  colorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  colorButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeMenuAnchor: {
    alignSelf: "flex-start",
  },
  badgeMenuTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(122,122,122,0.45)",
  },
  badgeValue: {
    fontSize: 14,
    fontWeight: "500",
  },
  timeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
  },
  timeButtonText: {
    fontSize: 15,
    fontWeight: "500",
  },
  timePickerWrap: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  footerNote: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  footerText: {
    fontSize: 12,
    lineHeight: 17,
  },
});
