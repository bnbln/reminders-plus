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
  View
} from 'react-native';
import Animated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { GlassSurface, withAlpha } from '@/components/ui/glass-surface';
import { SFSymbol } from '@/components/ui/sfsymbol';
import { Colors } from '@/constants/theme';
import { getDueAtForSection, getNextRoutineDate, Project, Subtask, Task, useTasksStore } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getIntlLocale, t } from '@/i18n';




// ... imports

const PROJECT_ICON_SWATCHES = [
  'paintpalette.fill',
  'person.2.fill',
  'sparkles',
  'safari.fill',
  'laptopcomputer',
  'shippingbox.fill',
  'books.vertical.fill',
  'brain.head.profile',
  'flask.fill',
  'hammer.fill',
  'figure.mind.and.body',
  'photo.artframe',
] as const;



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


const COMPLETE_GREEN = '#34C759';

const pad2 = (n: number) => String(n).padStart(2, '0');

const formatDueLabel = (ms: number, hasTime: boolean) => {
  if (!Number.isFinite(ms) || ms <= 0) return t('taskDetail.due.none');
  const d = new Date(ms);
  const date = d.toLocaleDateString(getIntlLocale(), { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  if (!hasTime) return date;
  return `${date} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

const normalizeDateWithTimeFlag = (date: Date, hasTime: boolean, previous: Date) => {
  const d = new Date(date);
  if (!hasTime) {
    d.setHours(12, 0, 0, 0);
    return d;
  }
  d.setHours(previous.getHours(), previous.getMinutes(), 0, 0);
  return d;
};

const sectionLabel = (section: Task['section']) => {
  if (section === 'today') return t('common.today');
  if (section === 'upcoming') return t('common.upcoming');
  return t('common.completed');
};

const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;



export default function TaskViewScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tasks, setTasks, projects, setProjects } = useTasksStore();
  const theme = useColorScheme() ?? 'light';
  const isDark = theme === 'dark';
  const keyboard = useAnimatedKeyboard();

  const animatedSpacerStyle = useAnimatedStyle(() => ({
    height: Math.max(0, keyboard.height.value - 40),
  }));

  const styles = React.useMemo(() => createStyles(theme), [theme]);

  const task = React.useMemo(() => tasks.find((t) => t.id === id), [id, tasks]);

  const project = React.useMemo(() => {
    if (!task) return undefined;
    if (!task.projectId) return undefined;
    return projects.find((p) => p.id === task.projectId);
  }, [projects, task]);

  const projectColor = project?.color;
  const taskColor = task?.color;
  const accent = taskColor ?? projectColor ?? (isDark ? '#30D158' : '#34C759');
  const neutralAccent = isDark ? '#8E8E93' : '#6B7280';
  const glassTint = React.useMemo(() => withAlpha(Colors[theme].background, isDark ? 0.12 : 0.2), [isDark, theme]);
  const glassFallback = React.useMemo(() => withAlpha(Colors[theme].background, isDark ? 0.62 : 0.78), [isDark, theme]);
  const hairline = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const placeholder = withAlpha(Colors[theme].text, 0.35);

  const completeBg = isDark ? '#30D158' : '#34C759';
  const deleteBg = isDark ? '#FF453A' : '#FF3B30';
  const repeatBg = isDark ? '#8E8E93' : '#9ea4aa';

  // Animation for completion state
  const isCompleted = task?.section === 'completed';
  const completionProgress = useSharedValue(isCompleted ? 1 : 0);

  React.useEffect(() => {
    completionProgress.value = withTiming(isCompleted ? 1 : 0, { duration: 300 });
  }, [isCompleted]);

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

  const updateProject = React.useCallback(
    (projectId: string, patch: Partial<Project>) => {
      setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, ...patch } : p)));
    },
    [setProjects]
  );

  const [isLocating, setIsLocating] = React.useState(false);
  const [titleHeight, setTitleHeight] = React.useState<number>(0);
  const [subtitleHeight, setSubtitleHeight] = React.useState<number>(0);

  const scrollRef = React.useRef<ScrollView>(null);

  const scrollToBottom = React.useCallback(() => {
    // Wait slightly for keyboard to animate / spacer to appear
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 300);
  }, []);

  const onUseCurrentLocation = React.useCallback(async () => {
    if (!task) return;
    try {
      setIsLocating(true);
      let Location: typeof import('expo-location');
      try {
        Location = await import('expo-location');
      } catch {
        Alert.alert(
          t('taskDetail.alert.locationUnavailableTitle'),
          t('taskDetail.alert.locationUnavailableBody')
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

      const parts = [rev.name, rev.street, rev.district, rev.city, rev.region].filter(
        (v): v is string => typeof v === 'string' && v.trim().length > 0
      );
      const label = parts.slice(0, 2).join(' · ') || `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
      updateTask({ location: label });
    } catch {
      Alert.alert(t('taskDetail.alert.locationErrorTitle'), t('taskDetail.alert.locationErrorBody'));
    } finally {
      setIsLocating(false);
    }
  }, [task, updateTask]);

  const onToggleComplete = React.useCallback(() => {
    if (!task) return;
    if (task.section === 'completed') {
      const hasDueAt = typeof task.dueAt === 'number' && Number.isFinite(task.dueAt) && task.dueAt > 0;
      updateTask(
        hasDueAt
          ? { section: 'today', completedAt: undefined }
          : { section: 'today', completedAt: undefined, dueAt: getDueAtForSection('today'), dueHasTime: true }
      );
      return;
    }

    // For routine tasks: reschedule to next occurrence instead of completing
    const routineType = task.routineType || task.routineInterval;
    if (task.isRoutine && routineType) {
      const nextDue = getNextRoutineDate(
        task.dueAt,
        routineType,
        {
          weekday: task.routineWeekday,
          nthWeek: task.routineNthWeek,
          monthDay: task.routineMonthDay,
          month: task.routineMonth,
        }
      );
      const nextSection = nextDue > 0 ? (
        new Date(nextDue).toDateString() === new Date().toDateString() ? 'today' : 'upcoming'
      ) : 'upcoming';

      updateTask({
        dueAt: nextDue,
        section: nextSection as 'today' | 'upcoming',
        // Reset subtasks for next occurrence
        subtasks: task.subtasks?.map(s => ({ ...s, done: false })),
      });
      return;
    }

    updateTask({ section: 'completed', completedAt: Date.now() });
  }, [task, updateTask]);

  const onDelete = React.useCallback(() => {
    if (!task) return;
    Alert.alert(t('taskDetail.alert.deleteTitle'), t('taskDetail.alert.deleteBody'), [
      { text: t('taskDetail.alert.cancel'), style: 'cancel' },
      {
        text: t('taskDetail.alert.delete'),
        style: 'destructive',
        onPress: () => {
          setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, deletedAt: Date.now() } : t)));
          router.back();
        },
      },
    ]);
  }, [router, setTasks, task]);

  const clearDue = React.useCallback(() => {
    if (!task) return;
    updateTask({ dueAt: 0, dueHasTime: false });
  }, [task, updateTask]);

  const clearProject = React.useCallback(() => {
    updateTask({ projectId: '' });
  }, [updateTask]);



  const onPickEmoji = React.useCallback((emoji: string) => updateTask({ emoji }), [updateTask]);

  const onToggleRoutine = React.useCallback((enabled: boolean) => {
    if (enabled) {
      updateTask({ isRoutine: true, routineType: 'daily' });
    } else {
      updateTask({
        isRoutine: undefined,
        routineType: undefined,
        routineInterval: undefined,
        routineWeekday: undefined,
        routineNthWeek: undefined,
        routineMonthDay: undefined,
        routineMonth: undefined,
      });
    }
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

  const onPickProjectColor = React.useCallback(
    (color: string) => {
      if (!project) return;
      updateProject(project.id, { color });
    },
    [project, updateProject]
  );

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
        <Stack.Screen options={{ title: '', headerTitle: '', headerBackButtonDisplayMode: 'minimal' } as any} />
        <Text style={styles.notFoundTitle}>{t('taskDetail.notFound')}</Text>
        <Pressable onPress={() => router.back()} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{t('taskDetail.back')}</Text>
        </Pressable>
      </View>
    );
  }

  const dueHasTime = task.dueHasTime ?? true;
  const hasDueDate = Number.isFinite(task.dueAt) && task.dueAt > 0;

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Stack.Screen
        options={{
          title: '',
          headerTitle: '',
          headerTransparent: true,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: 'transparent' },
          headerBackButtonDisplayMode: 'minimal',
        } as any}
      />

      {/* Hero Section */}
      <View style={styles.heroSection}>
        <Pressable onPress={() => router.push(`/task/emoji-picker?taskId=${task.id}`)} style={styles.heroEmojiWrap}>
          <View style={[styles.heroGlow, { backgroundColor: accent }]} />
          <GlassSurface
            style={styles.heroEmojiBg}
            glassEffectStyle="regular"
            tintColor={withAlpha(accent, isDark ? 0.25 : 0.18)}
            fallbackBackgroundColor={withAlpha(accent, isDark ? 0.22 : 0.14)}
          >
            <Text style={styles.heroEmojiText}>{task.emoji}</Text>
          </GlassSurface>
        </Pressable>

        <TextInput
          value={task.title}
          onChangeText={(v) => updateTask({ title: v })}
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
          value={task.subtitle ?? ''}
          onChangeText={(v) => updateTask({ subtitle: v.trim().length ? v : undefined })}
          placeholder={t('taskDetail.placeholder.subtitle')}
          placeholderTextColor={placeholder}
          multiline
          scrollEnabled={false}
          textAlign="center"
          onContentSizeChange={(e) => setSubtitleHeight(e.nativeEvent.contentSize.height)}
          style={[
            styles.heroSubtitle,
            { color: withAlpha(Colors[theme].text, 0.7) },
            subtitleHeight > 0 ? { height: Math.max(20, Math.ceil(subtitleHeight)) } : null,
          ]}
        />
      </View>

      {/* Property Grid - 2x2 QuickTile Style */}
      <View style={styles.propertyGrid}>
        {/* Datum Tile */}
        <Pressable onPress={() => router.push(`/task/date-picker?taskId=${task.id}`)} style={styles.propertyTilePressable}>
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
                  <MaterialIcons name="event" size={16} color={hasDueDate ? '#0A84FF' : withAlpha(Colors[theme].text, 0.6)} />
                </View>
                {hasDueDate && (
                  <Pressable onPress={clearDue} hitSlop={8}>
                    <MaterialIcons name="close" size={16} color={withAlpha(Colors[theme].text, 0.5)} />
                  </Pressable>
                )}
              </View>
              <Text style={styles.propertyTileLabel}>{t('taskDetail.property.date')}</Text>
              <Text style={[styles.propertyTileValue, { color: hasDueDate ? Colors[theme].text : withAlpha(Colors[theme].text, 0.5) }]} numberOfLines={1}>
                {formatDueLabel(task.dueAt, dueHasTime)}
              </Text>
            </View>
          </GlassSurface>
        </Pressable>

        {/* Routine Tile */}
        <Pressable onPress={() => router.push(`/task/routine-picker?taskId=${task.id}`)} style={styles.propertyTilePressable}>
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
                  <MaterialIcons name="loop" size={16} color={task.isRoutine ? '#8B5CF6' : withAlpha(Colors[theme].text, 0.6)} />
                </View>
                {task.isRoutine && (
                  <Pressable onPress={clearRoutine} hitSlop={8}>
                    <MaterialIcons name="close" size={16} color={withAlpha(Colors[theme].text, 0.5)} />
                  </Pressable>
                )}
              </View>
              <Text style={styles.propertyTileLabel}>{t('taskDetail.property.routine')}</Text>
              <Text style={[styles.propertyTileValue, { color: task.isRoutine ? Colors[theme].text : withAlpha(Colors[theme].text, 0.5) }]} numberOfLines={1}>
                {task.isRoutine ? getRoutineLabel(task) : t('taskDetail.property.none')}
              </Text>
            </View>
          </GlassSurface>
        </Pressable>

        {/* Location Tile */}
        <Pressable onPress={() => { /* Focus location input or show picker */ }} style={styles.propertyTilePressable}>
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
                  <MaterialIcons name="place" size={16} color={task.location ? '#10B981' : withAlpha(Colors[theme].text, 0.6)} />
                </View>
                {task.location ? (
                  <Pressable onPress={() => updateTask({ location: undefined })} hitSlop={8}>
                    <MaterialIcons name="close" size={16} color={withAlpha(Colors[theme].text, 0.5)} />
                  </Pressable>
                ) : (
                  <Pressable onPress={onUseCurrentLocation} hitSlop={8}>
                    {isLocating ? <ActivityIndicator size="small" /> : <MaterialIcons name="my-location" size={14} color={withAlpha(Colors[theme].text, 0.5)} />}
                  </Pressable>
                )}
              </View>
              <Text style={styles.propertyTileLabel}>{t('taskDetail.property.location')}</Text>
              <TextInput
                value={task.location ?? ''}
                onChangeText={(v) => updateTask({ location: v.trim().length ? v : undefined })}
                placeholder={t('taskDetail.placeholder.location')}
                placeholderTextColor={withAlpha(Colors[theme].text, 0.4)}
                style={[styles.propertyTileInput, { color: task.location ? Colors[theme].text : withAlpha(Colors[theme].text, 0.5) }]}
                numberOfLines={1}
              />
            </View>
          </GlassSurface>
        </Pressable>

        {/* Projekt Tile */}
        <Pressable onPress={() => router.push(`/task/project-picker?taskId=${task.id}`)} style={styles.propertyTilePressable}>
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
                    <SFSymbol name={project.icon} size={14} color={project.color} />
                  ) : (
                    <MaterialIcons name="folder" size={16} color={withAlpha(Colors[theme].text, 0.6)} />
                  )}
                </View>
                {project && (
                  <Pressable onPress={clearProject} hitSlop={8}>
                    <MaterialIcons name="close" size={16} color={withAlpha(Colors[theme].text, 0.5)} />
                  </Pressable>
                )}
              </View>
              <Text style={styles.propertyTileLabel}>{t('taskDetail.property.project')}</Text>
              <Text style={[styles.propertyTileValue, { color: project ? Colors[theme].text : withAlpha(Colors[theme].text, 0.5) }]} numberOfLines={1}>
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
              <Pressable onPress={() => toggleSubtask(s.id)} hitSlop={10} style={styles.subtaskCheck}>
                <MaterialIcons name={s.done ? 'check-box' : 'check-box-outline-blank'} size={22} color={withAlpha(Colors[theme].text, s.done ? 0.9 : 0.55)} />
              </Pressable>
              <TextInput
                value={s.title}
                onChangeText={(v) => updateSubtaskTitle(s.id, v)}
                placeholder={t('taskDetail.placeholder.subtask')}
                placeholderTextColor={placeholder}
                multiline
                scrollEnabled={false}
                style={[
                  styles.subtaskInput,
                  {
                    color: withAlpha(Colors[theme].text, s.done ? 0.55 : 0.9),
                    textDecorationLine: s.done ? 'line-through' : 'none',
                  },
                ]}
              />
              <Pressable onPress={() => deleteSubtask(s.id)} hitSlop={10} style={styles.subtaskDelete}>
                <MaterialIcons name="close" size={18} color={withAlpha(Colors[theme].text, 0.5)} />
              </Pressable>
            </View>
          </View>
        ))}

        <View style={[styles.divider, { backgroundColor: hairline }]} />
        <View style={styles.addSubtaskRow}>
          <TextInput
            value={newSubtaskTitle}
            onChangeText={setNewSubtaskTitle}
            placeholder={t('taskDetail.placeholder.newSubtask')}
            placeholderTextColor={placeholder}
            style={[styles.fieldInput, { color: Colors[theme].text, flex: 1 }]}
            onSubmitEditing={addSubtask}
            returnKeyType="done"
          />
          <Pressable onPress={addSubtask} hitSlop={10} style={styles.addBtn}>
            <MaterialIcons name="add" size={20} color={withAlpha(Colors[theme].text, 0.85)} />
          </Pressable>
        </View>
      </GlassSurface>

      <GlassSurface style={[styles.panel, { borderColor: hairline }]} glassEffectStyle="regular" tintColor={glassTint} fallbackBackgroundColor={glassFallback}>
        <Text style={styles.panelTitle}>{t('taskDetail.panel.notes')}</Text>
        <TextInput
          value={task.notes ?? ''}
          onChangeText={(v) => updateTask({ notes: v.length ? v : undefined })}
          placeholder={t('taskDetail.placeholder.notes')}
          placeholderTextColor={placeholder}
          multiline
          onFocus={scrollToBottom}
          style={[styles.notesInput, { color: Colors[theme].text }]}
        />
      </GlassSurface>

      <View style={styles.actionsRow}>
        <Pressable onPress={onDelete} hitSlop={10} style={styles.iconDangerWrap}>
          <GlassSurface
            style={styles.iconDangerButton}
            glassEffectStyle="regular"
            tintColor={withAlpha(deleteBg, isDark ? 0.55 : 0.45)}
            fallbackBackgroundColor={withAlpha(deleteBg, isDark ? 0.6 : 0.5)}
          >
            <MaterialIcons name="delete" size={24} color={withAlpha(Colors[theme].text, 0.95)} />
          </GlassSurface>
        </Pressable>

        <Pressable onPress={onToggleComplete} style={styles.primaryActionWrap}>
          <View>
            {/* Active State (Green) */}
            <Animated.View style={[StyleSheet.absoluteFill, activeStyle]}>
              <GlassSurface
                style={styles.primaryActionButton}
                glassEffectStyle="regular"
                tintColor={withAlpha(completeBg, isDark ? 0.55 : 0.45)}
                fallbackBackgroundColor={withAlpha(completeBg, isDark ? 0.6 : 0.5)}
              >
                <MaterialIcons name="check" size={18} color={withAlpha(Colors[theme].text, 0.95)} />
                <Text style={[styles.primaryActionText, { color: withAlpha(Colors[theme].text, 0.95) }]}>
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
                <MaterialIcons name="undo" size={18} color={withAlpha(Colors[theme].text, 0.95)} />
                <Text style={[styles.primaryActionText, { color: withAlpha(Colors[theme].text, 0.95) }]}>
                  {t('taskDetail.action.repeat')}
                </Text>
              </GlassSurface>
            </Animated.View>
          </View>
        </Pressable>
      </View>





      <Animated.View style={animatedSpacerStyle} />
    </ScrollView >
  );
}

function FormField({
  label,
  icon,
  accent,
  theme,
  children,
}: {
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  accent: string;
  theme: keyof typeof Colors;
  children: React.ReactNode;
}) {
  const text = Colors[theme].text;
  return (
    <View style={stylesField.row}>
      <View style={[stylesField.icon, { backgroundColor: withAlpha(accent, 0.14) }]}>
        <MaterialIcons name={icon} size={18} color={withAlpha(accent, 0.95)} />
      </View>
      <View style={stylesField.body}>
        <Text style={[stylesField.label, { color: withAlpha(text, 0.62) }]}>{label}</Text>
        <View style={stylesField.control}>{children}</View>
      </View>
    </View>
  );
}

const stylesField = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  control: {
    minHeight: 22,
    justifyContent: 'center',
  },
});

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
    content: {
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 44,
      gap: 18,
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
    heroGlow: {
      position: 'absolute',
      width: 40,
      height: 40,
      borderRadius: 20,
      opacity: 0.35,
      transform: [{ scale: 2 }],
      zIndex: -1,
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
      gap: 10,
    },
    propertyTilePressable: {
      width: '48.5%',
    },
    propertyTile: {
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
      backgroundColor: cardBg,
    },
    propertyTileInner: {
      paddingHorizontal: 12,
      paddingVertical: 10,
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
    propertyTileLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: withAlpha(text, 0.55),
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
      borderRadius: 22,
      paddingHorizontal: 16,
      paddingVertical: 14,
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
      color: withAlpha(text, 0.6),
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

    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    primaryActionWrap: {
      flex: 1,
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
    iconDangerWrap: {
      width: 52,
      height: 52,
      borderRadius: 26,
      overflow: 'hidden',
    },
    iconDangerButton: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 26,
      overflow: 'hidden',
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
