import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSheetHeaderActions } from '@/components/navigation/sheet-header-actions';
import { withAlpha } from '@/components/ui/glass-surface';
import { Colors, contrastAlpha, PICKER_SHEET_DARK_ROW, TASK_SHEET_ACCENTS } from '@/constants/theme';
import { useTasksStore } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { t } from '@/i18n';
import { ripple } from "@/components/ui/ripple";
import { m3InputProps } from '@/components/ui/m3-input';
import { useThemedStyles } from "@/hooks/use-themed-styles";

const ACCENT = TASK_SHEET_ACCENTS.location;

export default function LocationPickerScreen() {
  const router = useRouter();
  const { taskId: taskIdParam } = useLocalSearchParams<{ taskId?: string | string[] }>();
  const taskId = React.useMemo(() => {
    const rawTaskId = Array.isArray(taskIdParam) ? taskIdParam[0] : taskIdParam;
    if (typeof rawTaskId !== 'string') return '';
    return rawTaskId.trim();
  }, [taskIdParam]);
  const theme = useColorScheme() ?? 'light';
  const isDark = theme === 'dark';
  const styles = useThemedStyles(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const { tasks, setTasks } = useTasksStore();
  const task = React.useMemo(() => tasks.find((candidate) => candidate.id === taskId), [taskId, tasks]);

  const [locationDraft, setLocationDraft] = React.useState<string | undefined>(undefined);
  const [isLocating, setIsLocating] = React.useState(false);
  const isLocatingRef = React.useRef(false);
  // Set once the sheet is closing, so a location lookup that resolves later
  // does not call router.back() a second time and pop the screen below.
  const isClosedRef = React.useRef(false);

  React.useEffect(() => () => {
    isClosedRef.current = true;
  }, []);

  React.useEffect(() => {
    if (locationDraft !== undefined) return;
    setLocationDraft(task?.location ?? '');
  }, [locationDraft, task?.location]);

  const applyLocationAndClose = React.useCallback((nextLocation: string | undefined) => {
    if (isClosedRef.current) return;
    isClosedRef.current = true;
    if (!taskId) {
      router.back();
      return;
    }

    const normalizedLocation = (nextLocation ?? '').trim();
    setTasks((prev) =>
      prev.map((candidate) =>
        candidate.id === taskId
          ? {
            ...candidate,
            location: normalizedLocation.length > 0 ? normalizedLocation : undefined,
          }
          : candidate
      )
    );

    router.back();
  }, [router, setTasks, taskId]);

  const handleSave = React.useCallback(() => {
    applyLocationAndClose(locationDraft);
  }, [applyLocationAndClose, locationDraft]);

  const handleCancel = React.useCallback(() => {
    if (isClosedRef.current) return;
    isClosedRef.current = true;
    router.back();
  }, [router]);

  const handleUseCurrentLocation = React.useCallback(async () => {
    if (isLocatingRef.current) return;
    isLocatingRef.current = true;
    setIsLocating(true);
    try {
      let Location: typeof import('expo-location');
      try {
        Location = await import('expo-location');
      } catch {
        Alert.alert(t('taskCreate.locationUnavailableTitle'), t('taskCreate.locationErrorBody'));
        return;
      }

      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert(t('taskCreate.locationDeniedTitle'), t('taskCreate.locationDeniedBody'));
        return;
      }

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [rev] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      if (isClosedRef.current) return;

      // reverseGeocodeAsync can resolve to an empty list; fall back to coordinates.
      const parts = [rev?.name, rev?.street, rev?.district, rev?.city].filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0
      );
      const label =
        parts.slice(0, 2).join(' · ') ||
        `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;

      setLocationDraft(label);
      applyLocationAndClose(label);
    } catch {
      if (!isClosedRef.current) {
        Alert.alert(t('taskCreate.locationErrorTitle'), t('taskCreate.locationErrorBody'));
      }
    } finally {
      isLocatingRef.current = false;
      setIsLocating(false);
    }
  }, [applyLocationAndClose]);

  const isLocationEmpty = (locationDraft ?? '').trim().length === 0;
  const sheetHeaderActions = useSheetHeaderActions({ onClose: handleCancel, onDone: handleSave, doneTintColor: ACCENT });

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={
          {
            title: t('locationPicker.title'),
            ...sheetHeaderActions,
            headerShown: true,
            headerStyle: {
              backgroundColor: isDark ? '#000000' : '#F2F2F7',
            },
            headerShadowVisible: false,
          } as any
        }
      />

      <View style={styles.sheet}>
        <ScrollView
          style={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            android_ripple={ripple()}
            onPress={handleUseCurrentLocation}
            disabled={isLocating}
            style={({ pressed }) => [
              styles.optionRow,
              pressed && styles.optionRowPressed,
            ]}
          >
            <View
              style={[
                styles.optionIcon,
                { backgroundColor: withAlpha('#34C759', isDark ? 0.22 : 0.14) },
              ]}
            >
              <MaterialIcons name="my-location" size={20} color="#34C759" />
            </View>
            <View style={styles.optionBody}>
              <Text style={styles.optionLabel}>{t('locationPicker.useCurrent')}</Text>
              <Text style={styles.optionSubLabel}>{t('locationPicker.useCurrentHint')}</Text>
            </View>
            {isLocating ? (
              <ActivityIndicator size="small" color={ACCENT} />
            ) : (
              <MaterialIcons name="chevron-right" size={20} color={withAlpha(Colors[theme].text, contrastAlpha(0.45))} />
            )}
          </Pressable>

          <Pressable
            android_ripple={ripple()}
            onPress={() => applyLocationAndClose(undefined)}
            style={({ pressed }) => [
              styles.optionRow,
              isLocationEmpty && styles.optionRowActive,
              pressed && styles.optionRowPressed,
            ]}
          >
            <View
              style={[
                styles.optionIcon,
                { backgroundColor: withAlpha(Colors[theme].text, contrastAlpha(isDark ? 0.15 : 0.1)) },
              ]}
            >
              <MaterialIcons name="location-off" size={20} color={withAlpha(Colors[theme].text, contrastAlpha(0.6))} />
            </View>
            <View style={styles.optionBody}>
              <Text style={styles.optionLabel}>{t('locationPicker.noLocation')}</Text>
            </View>
            {isLocationEmpty ? <MaterialIcons name="check" size={20} color={ACCENT} /> : null}
          </Pressable>

          <View style={styles.divider} />

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t('locationPicker.custom')}</Text>
            <View style={styles.inputShell}>
              <MaterialIcons
                name="place"
                size={18}
                color={withAlpha(Colors[theme].text, contrastAlpha(isLocationEmpty ? 0.45 : 0.75))}
                style={styles.inputIcon}
              />
              <TextInput
                {...m3InputProps()}
                value={locationDraft ?? ''}
                onChangeText={setLocationDraft}
                placeholder={t('locationPicker.placeholder.custom')}
                placeholderTextColor={withAlpha(Colors[theme].text, contrastAlpha(0.42))}
                returnKeyType="done"
                autoCapitalize="words"
                autoCorrect
                onSubmitEditing={handleSave}
                style={styles.input}
              />
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const createStyles = (theme: keyof typeof Colors) => {
  const isDark = theme === 'dark';
  const text = Colors[theme].text;
  const hairline = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#000000' : '#F2F2F7',
    },
    sheet: {
      flex: 1,
      backgroundColor: isDark ? '#000000' : '#F2F2F7',
    },
    content: {
      flex: 1,
      padding: 16,
      backgroundColor: isDark ? '#000000' : '#F2F2F7',
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 14,
      marginBottom: 8,
      borderWidth: isDark ? 0 : StyleSheet.hairlineWidth,
      borderColor: hairline,
      backgroundColor: isDark ? PICKER_SHEET_DARK_ROW : withAlpha(text, contrastAlpha(0.03)),
    },
    optionRowActive: {
      borderWidth: isDark ? 0 : StyleSheet.hairlineWidth,
      borderColor: withAlpha(ACCENT, 0.45),
      backgroundColor: withAlpha(ACCENT, isDark ? 0.26 : 0.12),
    },
    optionRowPressed: {
      opacity: 0.9,
    },
    optionIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionBody: {
      flex: 1,
      gap: 2,
    },
    optionLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: text,
    },
    optionSubLabel: {
      fontSize: 12,
      color: withAlpha(text, contrastAlpha(0.55)),
    },
    iconButton: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressableIcon: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    divider: {
      height: 1,
      backgroundColor: hairline,
      marginVertical: 16,
    },
    inputGroup: {
      gap: 10,
    },
    inputLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: withAlpha(text, contrastAlpha(0.72)),
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    inputShell: {
      minHeight: 48,
      borderRadius: 14,
      borderWidth: isDark ? 0 : StyleSheet.hairlineWidth,
      borderColor: hairline,
      backgroundColor: isDark ? PICKER_SHEET_DARK_ROW : withAlpha(text, contrastAlpha(0.03)),
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      gap: 10,
    },
    inputIcon: {
      marginTop: 1,
    },
    input: {
      flex: 1,
      minHeight: 40,
      fontSize: 16,
      color: text,
      paddingVertical: 0,
    },
  });
};
