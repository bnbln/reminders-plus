import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { MenuAction } from '@react-native-menu/menu';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import Animated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useVerticalBarActive } from '@/components/navigation/vertical-bar-safe-area';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { GlassSurface, withAlpha } from '@/components/ui/glass-surface';
import { SFSymbol } from '@/components/ui/sfsymbol';
import { Colors, contrastAlpha } from '@/constants/theme';
import {
  createRoutineCompletionTransition,
  getDueAtForSection,
  Subtask,
  Task,
  useTasksStore,
} from '@/context/tasks-store';
import { useSnackbar } from '@/context/snackbar-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getIntlLocale, t } from '@/i18n';
import { deriveActiveSectionFromDueAt, hasValidDueAt } from '@/utils/task-dates';
import { ripple } from "@/components/ui/ripple";
import { useTextDraft } from '@/hooks/use-text-draft';
import { m3InputProps } from '@/components/ui/m3-input';
import { useThemedStyles } from "@/hooks/use-themed-styles";




// ... imports



const getRoutineLabel = (task: Task): string => {
  const type = task.routineType || task.routineInterval;
  if (!type) return t('taskDetail.routine.inactive');

  switch (type) {
    case 'hourly': return t('taskDetail.routine.hourly');
    case 'daily': return t('taskDetail.routine.daily');
    case 'weekdays': return t('taskDetail.routine.weekdays');
    case 'weekends': return t('taskDetail.routine.weekends');
    case 'weekly': return t('taskDetail.routine.weekly');
    case 'biweekly': return t('taskDetail.routine.biweekly');
    case 'monthly': return t('taskDetail.routine.monthly');
    case 'quarterly': return t('taskDetail.routine.quarterly');
    case 'biannually': return t('taskDetail.routine.biannually');
    case 'yearly': return t('taskDetail.routine.yearly');
    case 'custom': return t('taskDetail.routine.custom');
    default: return t('taskDetail.routine.default');
  }
};


// One spacing/radius scale for every card on the page (property tiles, the
// subtask panel and notes) so the stack reads as one rhythm.
const SECTION_GAP = 12;
const CARD_RADIUS = 20;
const CARD_PADDING_H = 14;
const CARD_PADDING_V = 12;

type DetailMenuActionId = 'toggleComplete' | 'delete';

const pad2 = (n: number) => String(n).padStart(2, '0');

const formatDueLabel = (ms: number, hasTime: boolean) => {
  if (!Number.isFinite(ms) || ms <= 0) return t('taskDetail.due.none');
  const d = new Date(ms);
  const date = d.toLocaleDateString(getIntlLocale(), { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  if (!hasTime) return date;
  return `${date} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;



export function TaskDetailContent({ taskId: id, onClose, headerHeight = 0 }: {
  taskId: string;
  onClose: () => void;
  headerHeight?: number;
}) {
  const router = useRouter();
  const { tasks, setTasks, projects } = useTasksStore();
  const theme = useColorScheme() ?? 'light';
  const isDark = theme === 'dark';

  const styles = useThemedStyles(() => createStyles(theme), [theme]);

  const task = React.useMemo(() => tasks.find((t) => t.id === id), [id, tasks]);

  const project = React.useMemo(() => {
    if (!task) return undefined;
    if (!task.projectId) return undefined;
    return projects.find((p) => p.id === task.projectId);
  }, [projects, task]);

  const projectColor = project?.color;
  const taskColor = task?.color;
  const accent = taskColor ?? projectColor ?? (isDark ? '#30D158' : '#34C759');
  const glassTint = React.useMemo(() => withAlpha(Colors[theme].background, isDark ? 0.12 : 0.2), [isDark, theme]);
  const glassFallback = React.useMemo(() => withAlpha(Colors[theme].background, isDark ? 0.62 : 0.78), [isDark, theme]);
  const hairline = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const placeholder = withAlpha(Colors[theme].text, contrastAlpha(0.35));

  const completeBg = isDark ? '#30D158' : '#34C759';
  const repeatBg = isDark ? '#8E8E93' : '#9ea4aa';

  // Animation for completion state
  const isCompleted = task?.section === 'completed';
  const completionProgress = useSharedValue(isCompleted ? 1 : 0);

  React.useEffect(() => {
    completionProgress.value = withTiming(isCompleted ? 1 : 0, { duration: 300 });
  }, [completionProgress, isCompleted]);

  const activeStyle = useAnimatedStyle(() => ({
    opacity: 1 - completionProgress.value,
    transform: [{ scale: 1 - completionProgress.value * 0.05 }],
  }));

  const doneStyle = useAnimatedStyle(() => ({
    opacity: completionProgress.value,
    transform: [{ scale: 0.95 + completionProgress.value * 0.05 }],
  }));

  const updateTask = React.useCallback(
    (patch: Partial<Task>) => {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    },
    [id, setTasks]
  );

  // Text fields keep a local draft and write to the store once typing pauses.
  const titleDraft = useTextDraft(task?.title ?? '', (v) => updateTask({ title: v }));
  const subtitleDraft = useTextDraft(task?.subtitle ?? '', (v) =>
    updateTask({ subtitle: v.trim().length ? v : undefined })
  );
  const locationDraft = useTextDraft(task?.location ?? '', (v) =>
    updateTask({ location: v.trim().length ? v : undefined })
  );
  const notesDraft = useTextDraft(task?.notes ?? '', (v) =>
    updateTask({ notes: v.length ? v : undefined })
  );

  const [paneWidth, setPaneWidth] = React.useState(0);
  const [isLocating, setIsLocating] = React.useState(false);
  const isLocatingRef = React.useRef(false);
  const [titleHeight, setTitleHeight] = React.useState<number>(0);
  const [subtitleHeight, setSubtitleHeight] = React.useState<number>(0);

  const scrollRef = React.useRef<React.ComponentRef<typeof ScrollView>>(null);
  const { showSnackbar } = useSnackbar();

  const scrollToBottom = React.useCallback(() => {
    // Wait slightly for keyboard to animate / spacer to appear
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 300);
  }, []);

  const onUseCurrentLocation = React.useCallback(async () => {
    if (!task || isLocatingRef.current) return;
    isLocatingRef.current = true;
    try {
      setIsLocating(true);
      let Location: typeof import('expo-location');
      try {
        Location = await import('expo-location');
      } catch {
        Alert.alert(
          t('taskDetail.alert.locationUnavailableTitle'),
          t('taskDetail.alert.locationErrorBody')
        );
        return;
      }

      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert(t('taskDetail.alert.locationDeniedTitle'), t('taskDetail.alert.locationDeniedBody'));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [rev] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });

      // reverseGeocodeAsync can resolve to an empty list; fall back to coordinates.
      const parts = [rev?.name, rev?.street, rev?.district, rev?.city, rev?.region].filter(
        (v): v is string => typeof v === 'string' && v.trim().length > 0
      );
      const label = parts.slice(0, 2).join(' · ') || `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
      updateTask({ location: label });
    } catch {
      Alert.alert(t('taskDetail.alert.locationErrorTitle'), t('taskDetail.alert.locationErrorBody'));
    } finally {
      isLocatingRef.current = false;
      setIsLocating(false);
    }
  }, [task, updateTask]);

  const onToggleComplete = React.useCallback(() => {
    if (!task) return;
    if (task.section === 'completed') {
      const hasDueAt = hasValidDueAt(task.dueAt);
      const restoredSection = hasDueAt ? deriveActiveSectionFromDueAt(task.dueAt) : 'today';
      updateTask(
        hasDueAt
          ? { section: restoredSection, completedAt: undefined }
          : { section: 'today', completedAt: undefined, dueAt: getDueAtForSection('today'), dueHasTime: true }
      );
      return;
    }

    const now = Date.now();
    const routineTransition = createRoutineCompletionTransition(
      task,
      now,
      new Set(tasks.map((candidate) => candidate.id)),
    );
    if (routineTransition) {
      setTasks((prev) => {
        const current = prev.find((candidate) => candidate.id === task.id);
        if (!current) return prev;
        const resolvedTransition = createRoutineCompletionTransition(
          current,
          now,
          new Set(prev.map((candidate) => candidate.id)),
        );
        if (!resolvedTransition) return prev;
        const next = prev.map((candidate) =>
          candidate.id === task.id ? resolvedTransition.nextTask : candidate,
        );
        return [...next, resolvedTransition.completedTask];
      });
      return;
    }

    updateTask({ section: 'completed', completedAt: now });
  }, [setTasks, task, tasks, updateTask]);

  const onDelete = React.useCallback(() => {
    if (!task) return;

    const taskId = task.id;
    const softDelete = () =>
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, deletedAt: Date.now() } : t))
      );

    if (Platform.OS === 'android') {
      // Android convention: delete immediately and offer Undo. The delete is a
      // soft delete already, so undoing is just clearing `deletedAt`.
      softDelete();
      onClose();
      showSnackbar({
        message: t('taskDetail.snackbar.deleted'),
        actionLabel: t('common.undo'),
        onAction: () =>
          setTasks((prev) =>
            prev.map((t) => (t.id === taskId ? { ...t, deletedAt: undefined } : t))
          ),
      });
      return;
    }

    Alert.alert(t('taskDetail.alert.deleteTitle'), t('taskDetail.alert.deleteBody'), [
      { text: t('taskDetail.alert.cancel'), style: 'cancel' },
      {
        text: t('taskDetail.alert.delete'),
        style: 'destructive',
        onPress: () => {
          softDelete();
          onClose();
        },
      },
    ]);
  }, [onClose, setTasks, showSnackbar, task]);

  const insets = useSafeAreaInsets();
  const hasVerticalBar = useVerticalBarActive();
  const [footerHeight, setFooterHeight] = React.useState(0);
  const [keyboardVisible, setKeyboardVisible] = React.useState(false);

  // The footer is pinned to the window bottom. Android resizes the window for
  // the keyboard, which would float the button above it; hide it while typing.
  React.useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const toggleCompleteLabel = isCompleted ? t('a11y.task.reopen') : t('a11y.task.complete');

  const menuActions = React.useMemo<MenuAction[]>(() => {
    const isIOS = Platform.OS === 'ios';
    return [
      {
        id: 'toggleComplete',
        title: toggleCompleteLabel,
        image: isIOS ? (isCompleted ? 'arrow.uturn.backward.circle' : 'checkmark.circle') : undefined,
        imageColor: isIOS ? Colors[theme].text : undefined,
      },
      {
        id: 'delete',
        title: t('taskDetail.alert.delete'),
        image: isIOS ? 'trash' : undefined,
        attributes: { destructive: true },
      },
    ];
  }, [isCompleted, theme, toggleCompleteLabel]);

  const onMenuAction = React.useCallback(
    ({ nativeEvent: { event } }: { nativeEvent: { event: string } }) => {
      const actionId = event as DetailMenuActionId;
      if (actionId === 'toggleComplete') onToggleComplete();
      if (actionId === 'delete') onDelete();
    },
    [onDelete, onToggleComplete]
  );

  const clearDue = React.useCallback(() => {
    if (!task) return;
    updateTask({ dueAt: 0, dueHasTime: false });
  }, [task, updateTask]);

  const clearProject = React.useCallback(() => {
    updateTask({ projectId: '' });
  }, [updateTask]);





  const clearRoutine = React.useCallback(() => {
    updateTask({
      isRoutine: undefined,
      routineType: undefined,
      routineInterval: undefined,
      routineWeekday: undefined,
      routineNthWeek: undefined,
      routineMonthDay: undefined,
      routineMonth: undefined,
    });
  }, [updateTask]);

  // Subtasks
  const [newSubtaskTitle, setNewSubtaskTitle] = React.useState('');

  const toggleSubtask = React.useCallback(
    (subtaskId: string) => {
      if (!task) return;
      const current = task.subtasks ?? [];
      const next = current.map((s) => (s.id === subtaskId ? { ...s, done: !s.done } : s));
      updateTask({ subtasks: next });
    },
    [task, updateTask]
  );

  const deleteSubtask = React.useCallback(
    (subtaskId: string) => {
      if (!task) return;
      const current = task.subtasks ?? [];
      const next = current.filter((s) => s.id !== subtaskId);
      updateTask({ subtasks: next.length ? next : undefined });
    },
    [task, updateTask]
  );

  const addSubtask = React.useCallback(() => {
    if (!task) return;
    const title = newSubtaskTitle.trim();
    if (!title) return;
    const current = task.subtasks ?? [];
    const next: Subtask[] = [...current, { id: newId('st'), title, done: false }];
    updateTask({ subtasks: next });
    setNewSubtaskTitle('');
  }, [newSubtaskTitle, task, updateTask]);

  const updateSubtaskTitle = React.useCallback(
    (subtaskId: string, title: string) => {
      if (!task) return;
      const current = task.subtasks ?? [];
      const next = current.map((s) => (s.id === subtaskId ? { ...s, title } : s));
      updateTask({ subtasks: next });
    },
    [task, updateTask]
  );

  if (!task) {
    return (
      <View style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.notFoundTitle}>{t('taskDetail.notFound')}</Text>
        <Pressable
          android_ripple={ripple()} onPress={onClose} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{t('taskDetail.back')}</Text>
        </Pressable>
      </View>
    );
  }

  const dueHasTime = task.dueHasTime ?? true;
  const hasDueDate = Number.isFinite(task.dueAt) && task.dueAt > 0;

  const scrollView = (
    <ScrollView
      ref={scrollRef}
      onLayout={(event) => setPaneWidth(event.nativeEvent.layout.width)}
      testID="task-detail"
      style={styles.scroll}
      contentContainerStyle={[
        styles.content,
        // iOS gets this from `contentInsetAdjustmentBehavior`; Android has no
        // equivalent, so the transparent header would overlap the hero emoji.
        Platform.OS === 'android' ? { paddingTop: headerHeight + 18 } : null,
        // Keep the last card clear of the pinned footer. iOS already insets the
        // content by the home indicator area, which the footer height includes.
        {
          paddingBottom:
            Math.max(0, footerHeight - (Platform.OS === 'ios' ? insets.bottom : 0)) + SECTION_GAP,
        },
      ]}
      showsVerticalScrollIndicator={false}
      automaticallyAdjustContentInsets
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      {/* Hero Section */}
      <View style={styles.heroSection}>
        <Pressable
          android_ripple={ripple()} accessibilityRole="button" accessibilityLabel={t('a11y.task.changeEmoji')} onPress={() => router.push(`/task/emoji-picker?taskId=${task.id}`)} style={styles.heroEmojiWrap}>
          <View
            style={[
              styles.heroEmojiBg,
              {
                backgroundColor: withAlpha(accent, isDark ? 0.22 : 0.16),
              },
            ]}
          >
            <Text style={styles.heroEmojiText}>{task.emoji}</Text>
          </View>
        </Pressable>

        <TextInput

          {...m3InputProps()}
          {...titleDraft}
          placeholder={t('taskDetail.placeholder.title')}
          placeholderTextColor={placeholder}
          multiline
          scrollEnabled={false}
          textAlign="center"
          onContentSizeChange={(e) => setTitleHeight(e.nativeEvent.contentSize.height)}
          style={[
            styles.heroTitle,
            { color: Colors[theme].text },
            titleHeight > 0 ? { height: Math.max(32, Math.ceil(titleHeight)) } : null,
          ]}
        />
        <TextInput
          {...m3InputProps()}
          {...subtitleDraft}
          placeholder={t('taskDetail.placeholder.subtitle')}
          placeholderTextColor={placeholder}
          multiline
          scrollEnabled={false}
          textAlign="center"
          onContentSizeChange={(e) => setSubtitleHeight(e.nativeEvent.contentSize.height)}
          style={[
            styles.heroSubtitle,
            { color: withAlpha(Colors[theme].text, contrastAlpha(0.7)) },
            subtitleHeight > 0 ? { height: Math.max(20, Math.ceil(subtitleHeight)) } : null,
          ]}
        />
      </View>

      {/* Property Grid - 2x2 QuickTile Style */}
      <View style={styles.propertyGrid}>
        {/* Datum Tile */}
        <Pressable
          android_ripple={ripple()} onPress={() => router.push(`/task/date-picker?taskId=${task.id}`)} style={[styles.propertyTilePressable, paneWidth > 0 && paneWidth < 420 ? { width: "100%" } : null]}>
          <GlassSurface
            style={[styles.propertyTile, { borderColor: hairline }]}
            glassEffectStyle="regular"
            tintColor={glassTint}
            fallbackBackgroundColor={glassFallback}
            isInteractive
          >
            <View style={styles.propertyTileInner}>
              <View style={styles.propertyTileIconRow}>
                <View style={[styles.propertyTileIconBadge, { backgroundColor: withAlpha(hasDueDate ? '#0A84FF' : Colors[theme].text, isDark ? 0.15 : 0.1) }]}>
                  <MaterialIcons name="event" size={16} color={hasDueDate ? '#0A84FF' : withAlpha(Colors[theme].text, contrastAlpha(0.6))} />
                </View>
                {hasDueDate && (
                  <Pressable
                    android_ripple={ripple()} onPress={clearDue} hitSlop={8}>
                    <MaterialIcons name="close" size={16} color={withAlpha(Colors[theme].text, contrastAlpha(0.5))} />
                  </Pressable>
                )}
              </View>
              <Text style={styles.propertyTileLabel}>{t('taskDetail.property.date')}</Text>
              <Text style={[styles.propertyTileValue, { color: hasDueDate ? Colors[theme].text : withAlpha(Colors[theme].text, contrastAlpha(0.5)) }]} numberOfLines={1}>
                {formatDueLabel(task.dueAt, dueHasTime)}
              </Text>
            </View>
          </GlassSurface>
        </Pressable>

        {/* Routine Tile */}
        <Pressable
          android_ripple={ripple()} onPress={() => router.push(`/task/routine-picker?taskId=${task.id}`)} style={[styles.propertyTilePressable, paneWidth > 0 && paneWidth < 420 ? { width: "100%" } : null]}>
          <GlassSurface
            style={[styles.propertyTile, { borderColor: hairline }]}
            glassEffectStyle="regular"
            tintColor={glassTint}
            fallbackBackgroundColor={glassFallback}
            isInteractive
          >
            <View style={styles.propertyTileInner}>
              <View style={styles.propertyTileIconRow}>
                <View style={[styles.propertyTileIconBadge, { backgroundColor: withAlpha(task.isRoutine ? '#8B5CF6' : Colors[theme].text, isDark ? 0.15 : 0.1) }]}>
                  <MaterialIcons name="loop" size={16} color={task.isRoutine ? '#8B5CF6' : withAlpha(Colors[theme].text, contrastAlpha(0.6))} />
                </View>
                {task.isRoutine && (
                  <Pressable
                    android_ripple={ripple()} onPress={clearRoutine} hitSlop={8}>
                    <MaterialIcons name="close" size={16} color={withAlpha(Colors[theme].text, contrastAlpha(0.5))} />
                  </Pressable>
                )}
              </View>
              <Text style={styles.propertyTileLabel}>{t('taskDetail.property.routine')}</Text>
              <Text style={[styles.propertyTileValue, { color: task.isRoutine ? Colors[theme].text : withAlpha(Colors[theme].text, contrastAlpha(0.5)) }]} numberOfLines={1}>
                {task.isRoutine ? getRoutineLabel(task) : t('taskDetail.property.none')}
              </Text>
            </View>
          </GlassSurface>
        </Pressable>

        {/* Location Tile */}
        <Pressable
          android_ripple={ripple()} onPress={() => { /* Focus location input or show picker */ }} style={[styles.propertyTilePressable, paneWidth > 0 && paneWidth < 420 ? { width: "100%" } : null]}>
          <GlassSurface
            style={[styles.propertyTile, { borderColor: hairline }]}
            glassEffectStyle="regular"
            tintColor={glassTint}
            fallbackBackgroundColor={glassFallback}
            isInteractive
          >
            <View style={styles.propertyTileInner}>
              <View style={styles.propertyTileIconRow}>
                <View style={[styles.propertyTileIconBadge, { backgroundColor: withAlpha(task.location ? '#10B981' : Colors[theme].text, isDark ? 0.15 : 0.1) }]}>
                  <MaterialIcons name="place" size={16} color={task.location ? '#10B981' : withAlpha(Colors[theme].text, contrastAlpha(0.6))} />
                </View>
                {task.location ? (
                  <Pressable
                    android_ripple={ripple()} onPress={() => updateTask({ location: undefined })} hitSlop={8}>
                    <MaterialIcons name="close" size={16} color={withAlpha(Colors[theme].text, contrastAlpha(0.5))} />
                  </Pressable>
                ) : (
                  <Pressable
                    android_ripple={ripple()} onPress={onUseCurrentLocation} disabled={isLocating} hitSlop={8}>
                    {isLocating ? <ActivityIndicator size="small" /> : <MaterialIcons name="my-location" size={14} color={withAlpha(Colors[theme].text, contrastAlpha(0.5))} />}
                  </Pressable>
                )}
              </View>
              <Text style={styles.propertyTileLabel}>{t('taskDetail.property.location')}</Text>
              <TextInput
                {...m3InputProps()}
                {...locationDraft}
                placeholder={t('taskDetail.placeholder.location')}
                placeholderTextColor={withAlpha(Colors[theme].text, contrastAlpha(0.4))}
                style={[styles.propertyTileInput, { color: locationDraft.value.trim().length ? Colors[theme].text : withAlpha(Colors[theme].text, contrastAlpha(0.5)) }]}
                numberOfLines={1}
              />
            </View>
          </GlassSurface>
        </Pressable>

        {/* Projekt Tile */}
        <Pressable
          android_ripple={ripple()} onPress={() => router.push(`/task/project-picker?taskId=${task.id}`)} style={[styles.propertyTilePressable, paneWidth > 0 && paneWidth < 420 ? { width: "100%" } : null]}>
          <GlassSurface
            style={[styles.propertyTile, { borderColor: hairline }]}
            glassEffectStyle="regular"
            tintColor={glassTint}
            fallbackBackgroundColor={glassFallback}
            isInteractive
          >

            <View style={styles.propertyTileInner}>
              <View style={styles.propertyTileIconRow}>
                <View style={[styles.propertyTileIconBadge, { backgroundColor: withAlpha(project?.color ?? Colors[theme].text, isDark ? 0.15 : 0.1) }]}>
                  {project ? (
                    project.emoji ? (
                      <Text style={styles.projectEmoji}>{project.emoji}</Text>
                    ) : (
                      <SFSymbol name={project.icon} size={14} color={project.color} />
                    )
                  ) : (
                    <MaterialIcons name="folder" size={16} color={withAlpha(Colors[theme].text, contrastAlpha(0.6))} />
                  )}
                </View>
                {project && (
                  <Pressable
                    android_ripple={ripple()} onPress={clearProject} hitSlop={8}>
                    <MaterialIcons name="close" size={16} color={withAlpha(Colors[theme].text, contrastAlpha(0.5))} />
                  </Pressable>
                )}
              </View>
              <Text style={styles.propertyTileLabel}>{t('taskDetail.property.project')}</Text>
              <Text style={[styles.propertyTileValue, { color: project ? Colors[theme].text : withAlpha(Colors[theme].text, contrastAlpha(0.5)) }]} numberOfLines={1}>
                {project?.name ?? t('taskDetail.property.noneProject')}
              </Text>
            </View>
          </GlassSurface>
        </Pressable>
      </View>

      {/* Subtasks Section */}
      <GlassSurface style={[styles.panel, { borderColor: hairline }]} glassEffectStyle="regular" tintColor={glassTint} fallbackBackgroundColor={glassFallback}>
        <Text style={styles.panelTitle}>{t('taskDetail.panel.tasks')}</Text>

        {(task.subtasks ?? []).map((s, idx) => (
          <View key={s.id}>
            {idx > 0 ? <View style={[styles.divider, { backgroundColor: hairline }]} /> : null}
            <View style={styles.subtaskRow}>
              <Pressable
                android_ripple={ripple()} onPress={() => toggleSubtask(s.id)} hitSlop={10} style={styles.subtaskCheck}>
                <MaterialIcons name={s.done ? 'check-box' : 'check-box-outline-blank'} size={22} color={withAlpha(Colors[theme].text, contrastAlpha(s.done ? 0.9 : 0.55))} />
              </Pressable>
              <TextInput
                {...m3InputProps()}
                value={s.title}
                onChangeText={(v) => updateSubtaskTitle(s.id, v)}
                placeholder={t('taskDetail.placeholder.subtask')}
                placeholderTextColor={placeholder}
                multiline
                scrollEnabled={false}
                style={[
                  styles.subtaskInput,
                  {
                    color: withAlpha(Colors[theme].text, contrastAlpha(s.done ? 0.55 : 0.9)),
                    textDecorationLine: s.done ? 'line-through' : 'none',
                  },
                ]}
              />
              <Pressable
                android_ripple={ripple()} onPress={() => deleteSubtask(s.id)} hitSlop={10} style={styles.subtaskDelete}>
                <MaterialIcons name="close" size={18} color={withAlpha(Colors[theme].text, contrastAlpha(0.5))} />
              </Pressable>
            </View>
          </View>
        ))}

        <View style={[styles.divider, { backgroundColor: hairline }]} />
        <View style={styles.addSubtaskRow}>
          <TextInput
            {...m3InputProps()}
            value={newSubtaskTitle}
            onChangeText={setNewSubtaskTitle}
            placeholder={t('taskDetail.placeholder.newSubtask')}
            placeholderTextColor={placeholder}
            style={[styles.fieldInput, { color: Colors[theme].text, flex: 1 }]}
            onSubmitEditing={addSubtask}
            returnKeyType="done"
          />
          <Pressable
            android_ripple={ripple()} onPress={addSubtask} hitSlop={10} style={styles.addBtn}>
            <MaterialIcons name="add" size={20} color={withAlpha(Colors[theme].text, contrastAlpha(0.85))} />
          </Pressable>
        </View>
      </GlassSurface>

      <GlassSurface style={[styles.panel, { borderColor: hairline }]} glassEffectStyle="regular" tintColor={glassTint} fallbackBackgroundColor={glassFallback}>
        <Text style={styles.panelTitle}>{t('taskDetail.panel.notes')}</Text>
        <TextInput
          {...m3InputProps()}
          {...notesDraft}
          placeholder={t('taskDetail.placeholder.notes')}
          placeholderTextColor={placeholder}
          multiline
          onFocus={scrollToBottom}
          style={[styles.notesInput, { color: Colors[theme].text }]}
        />
      </GlassSurface>

      <TaskKeyboardSpacer />
    </ScrollView>
  );

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          headerRight: hasVerticalBar
            ? undefined
            : () => (
                <DropdownMenu
                  themeVariant={Platform.OS === 'ios' ? theme : undefined}
                  isAnchoredToRight
                  actions={menuActions}
                  onPressAction={onMenuAction}
                  shouldOpenOnLongPress={false}
                  style={styles.headerMenuButton}
                >
                  {Platform.OS === 'ios' ? (
                    <SymbolView
                      name="ellipsis"
                      accessibilityLabel={t('a11y.task.moreActions')}
                      tintColor={Colors[theme].text}
                      style={{ width: 22, height: 22 }}
                    />
                  ) : (
                    <MaterialIcons name="more-vert" size={24} color={Colors[theme].text} />
                  )}
                </DropdownMenu>
              ),
          // Custom header views never move into the Duo's vertical bar.
          unstable_headerRightItems: hasVerticalBar
            ? () => [
                {
                  type: 'menu',
                  label: t('a11y.task.moreActions'),
                  icon: { type: 'sfSymbol', name: 'ellipsis' },
                  tintColor: Colors[theme].text,
                  menu: {
                    items: [
                      {
                        type: 'action',
                        label: toggleCompleteLabel,
                        icon: {
                          type: 'sfSymbol',
                          name: isCompleted ? 'arrow.uturn.backward.circle' : 'checkmark.circle',
                        },
                        onPress: onToggleComplete,
                      },
                      {
                        type: 'action',
                        label: t('taskDetail.alert.delete'),
                        icon: { type: 'sfSymbol', name: 'trash' },
                        destructive: true,
                        onPress: onDelete,
                      },
                    ],
                  },
                },
              ]
            : undefined,
        }}
      />
      {scrollView}

      {/* Pinned footer: the primary action stays reachable on long tasks. */}
      {!keyboardVisible ? (
        <View
          pointerEvents="box-none"
          onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
          style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}
        >
          <LinearGradient
            pointerEvents="none"
            colors={[withAlpha(Colors[theme].background, 0), Colors[theme].background]}
            locations={[0, 0.45]}
            style={StyleSheet.absoluteFill}
          />
          <Pressable
            android_ripple={ripple()}
            onPress={onToggleComplete}
            accessibilityRole="button"
            accessibilityLabel={toggleCompleteLabel}
            testID="task-detail-complete"
          >
            <View>
              {/* Active State (Green) */}
              <Animated.View style={[StyleSheet.absoluteFill, activeStyle]}>
                <GlassSurface
                  style={styles.primaryActionButton}
                  glassEffectStyle="regular"
                  tintColor={withAlpha(completeBg, isDark ? 0.55 : 0.45)}
                  fallbackBackgroundColor={withAlpha(completeBg, isDark ? 0.6 : 0.5)}
                >
                  <MaterialIcons name="check" size={18} color={withAlpha(Colors[theme].text, contrastAlpha(0.95))} />
                  <Text style={[styles.primaryActionText, { color: withAlpha(Colors[theme].text, contrastAlpha(0.95)) }]}>
                    {t('taskDetail.action.complete')}
                  </Text>
                </GlassSurface>
              </Animated.View>

              {/* Completed State (Grey) */}
              <Animated.View style={doneStyle}>
                <GlassSurface
                  style={styles.primaryActionButton}
                  glassEffectStyle="regular"
                  tintColor={withAlpha(repeatBg, isDark ? 0.45 : 0.35)}
                  fallbackBackgroundColor={withAlpha(repeatBg, isDark ? 0.5 : 0.4)}
                >
                  <MaterialIcons name="undo" size={18} color={withAlpha(Colors[theme].text, contrastAlpha(0.95))} />
                  <Text style={[styles.primaryActionText, { color: withAlpha(Colors[theme].text, contrastAlpha(0.95)) }]}>
                    {t('taskDetail.action.repeat')}
                  </Text>
                </GlassSurface>
              </Animated.View>
            </View>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function TaskKeyboardSpacer() {
  const keyboard = useAnimatedKeyboard();
  const style = useAnimatedStyle(() => ({ height: Math.max(0, keyboard.height.value - 40) }));
  return <Animated.View style={style} />;
}

const createStyles = (theme: keyof typeof Colors) => {
  const isDark = theme === 'dark';
  const text = Colors[theme].text;
  const background = Colors[theme].background;
  const cardBg = isDark ? '#1C1C1E' : '#F2F2F7';

  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: background,
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 18,
      paddingTop: 18,
      gap: SECTION_GAP,
    },
    headerMenuButton: {
      width: Platform.OS === 'android' ? 32 : 36,
      height: Platform.OS === 'android' ? 32 : 36,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },

    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 14,
    },
    headerMeta: {
      flex: 1,
      gap: 10,
    },

    // Hero Section
    heroSection: {
      alignItems: 'center',
      gap: 8,
      paddingVertical: 8,
    },
    heroEmojiWrap: {
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroEmojiBg: {
      width: 72,
      height: 72,
      borderRadius: 99,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroEmojiText: {
      fontSize: 36,
    },
    heroTitle: {
      fontSize: 24,
      fontWeight: '800',
      letterSpacing: -0.3,
      paddingVertical: 0,
      textAlign: 'center',
      minHeight: 32,
    },
    heroSubtitle: {
      fontSize: 15,
      fontWeight: '500',
      lineHeight: 20,
      paddingVertical: 0,
      textAlign: 'center',
      minHeight: 20,
    },

    // Property Grid
    propertyGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SECTION_GAP,
    },
    propertyTilePressable: {
      // Two per row on wide panes (narrow panes override to 100%); the grow
      // absorbs the gap so tiles end flush with the panels below.
      width: '45%',
      flexGrow: 1,
    },
    propertyTile: {
      borderRadius: CARD_RADIUS,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
      backgroundColor: cardBg,
    },
    propertyTileInner: {
      paddingHorizontal: CARD_PADDING_H,
      paddingVertical: CARD_PADDING_V,
      gap: 4,
    },
    propertyTileIconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 2,
    },
    propertyTileIconBadge: {
      width: 28,
      height: 28,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    projectEmoji: {
      fontSize: 15,
      lineHeight: 18,
    },
    propertyTileLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: withAlpha(text, contrastAlpha(0.55)),
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    propertyTileValue: {
      fontSize: 13,
      fontWeight: '700',
    },
    propertyTileInput: {
      fontSize: 13,
      fontWeight: '700',
      paddingVertical: 0,
      margin: 0,
    },

    emojiTile: {
      width: 64,
      height: 64,
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
    },
    emojiTileInner: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emojiText: {
      fontSize: 30,
    },

    titleInput: {
      fontSize: 30,
      fontWeight: '900',
      letterSpacing: -0.2,
      paddingVertical: 0,
      minHeight: 36,
    },
    subtitleInput: {
      fontSize: 15,
      fontWeight: '600',
      lineHeight: 20,
      paddingVertical: 0,
      minHeight: 20,
    },

    tagsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 10,
      paddingTop: 2,
    },
    sectionTag: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
    },
    sectionTagText: {
      fontSize: 12,
      fontWeight: '700',
    },
    projectInline: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
      minWidth: 0,
    },
    projectInlineIconBg: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    projectInlineIcon: {
      fontSize: 16,
    },

    panel: {
      borderRadius: CARD_RADIUS,
      paddingHorizontal: CARD_PADDING_H,
      paddingVertical: CARD_PADDING_V,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      opacity: isDark ? 0.9 : 0.8,
    },
    panelTitle: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: withAlpha(text, contrastAlpha(0.6)),
      marginBottom: 8,
    },

    rowButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingVertical: 2,
    },
    valueText: {
      fontSize: 15,
      fontWeight: '600',
      lineHeight: 20,
    },

    fieldInput: {
      fontSize: 15,
      fontWeight: '600',
      lineHeight: 20,
      paddingVertical: 0,
      flex: 1,
    },

    notesInput: {
      fontSize: 15,
      lineHeight: 22,
      fontWeight: '500',
      minHeight: 120,
      paddingVertical: 0,
    },

    locationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    inlineIconBtn: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    },

    helperText: {
      fontSize: 14,
      fontWeight: '600',
      paddingVertical: 6,
    },

    subtaskRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
    },
    subtaskCheck: {
      width: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    subtaskText: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      lineHeight: 20,
    },
    subtaskInput: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      lineHeight: 20,
      paddingVertical: 0,
      minHeight: 20,
    },
    subtaskDelete: {
      width: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },

    addSubtaskRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingTop: 12,
    },
    addBtn: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    },

    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 18,
      paddingTop: 20,
    },
    primaryActionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 16,
      borderRadius: 24,
      overflow: 'hidden',
    },
    primaryActionText: {
      fontSize: 14,
      fontWeight: '900',
    },

    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: '800',
    },
    modalDone: {
      fontSize: 14,
      fontWeight: '800',
    },
    modalLabel: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    modalLabelInline: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    modalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
    },
    pickerBlock: {
      marginBottom: 10,
      borderRadius: 14,
      overflow: 'hidden',
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
    },

    projectRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      marginBottom: 10,
    },
    projectRowIcon: {
      fontSize: 20,
    },
    projectRowBody: {
      flex: 1,
      gap: 4,
    },
    projectRowName: {
      fontSize: 15,
      fontWeight: '800',
    },
    projectRowMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    colorDot: {
      width: 10,
      height: 10,
      borderRadius: 99,
    },
    projectRowColor: {
      fontSize: 12,
      fontWeight: '700',
    },

    createRow: {
      gap: 8,
      paddingVertical: 10,
    },
    createInput: {
      fontSize: 16,
      fontWeight: '700',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    },

    swatchGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    colorSwatch: {
      width: 28,
      height: 28,
      borderRadius: 9,
      borderWidth: 2,
    },
    emojiSwatch: {
      width: 34,
      height: 34,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emojiSwatchText: {
      fontSize: 18,
    },

    notFoundTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: text,
    },
    primaryButton: {
      marginTop: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 14,
      backgroundColor: isDark ? '#2C2C2E' : '#111827',
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '800',
    },
  });
};
