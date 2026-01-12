import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from 'react-native';
import Animated, {
    useAnimatedKeyboard,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';

import { GlassSurface, withAlpha } from '@/components/ui/glass-surface';
import { Colors } from '@/constants/theme';
import { getDueAtForSection, Project, Subtask, Task, useTasksStore } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';

const COLOR_SWATCHES = [
  '#34C759',
  '#0A84FF',
  '#FF9500',
  '#FF3B30',
  '#AF52DE',
  '#5E5CE6',
  '#32D74B',
  '#FFD60A',
  '#64D2FF',
  '#FF2D55',
  '#8E8E93',
  '#1C1C1E',
] as const;

const EMOJI_SWATCHES = [
  '✅',
  '🧠',
  '🧹',
  '🎧',
  '📞',
  '🧾',
  '🗂️',
  '🧭',
  '🧪',
  '🧩',
  '📝',
  '📅',
  '📌',
  '📦',
  '📍',
  '🛒',
  '🏃‍♂️',
  '🚶‍♂️',
  '🧘‍♂️',
  '🍽️',
  '☕️',
  '💡',
  '✨',
  '🎯',
  '🎨',
  '🖼️',
  '📚',
  '🛠️',
  '🧑‍💻',
  '🤝',
  '🧷',
  '🔒',
] as const;

const PROJECT_ICON_SWATCHES = ['🎨', '🤝', '✨', '🧭', '🧑‍💻', '📦', '📚', '🧠', '🧪', '🛠️', '🧘‍♂️', '🖼️'] as const;

const COMPLETE_GREEN = '#34C759';

const pad2 = (n: number) => String(n).padStart(2, '0');

const formatDueLabel = (ms: number, hasTime: boolean) => {
  const d = new Date(ms);
  const date = d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
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
  if (section === 'today') return 'Today';
  if (section === 'upcoming') return 'Upcoming';
  return 'Completed';
};

const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

function SheetModal({
  visible,
  onClose,
  theme,
  hairline,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  theme: keyof typeof Colors;
  hairline: string;
  children: React.ReactNode;
}) {
  const isIOS = Platform.OS === 'ios';
  return (
    <Modal
      visible={visible}
      animationType={isIOS ? 'slide' : 'slide'}
      presentationStyle={isIOS ? 'pageSheet' : undefined}
      transparent={!isIOS}
      onRequestClose={onClose}
    >
      {isIOS ? (
        <View style={[stylesModal.sheetRoot, { backgroundColor: Colors[theme].background }]}>{children}</View>
      ) : (
        <View style={stylesModal.overlay}>
          <Pressable style={stylesModal.backdrop} onPress={onClose} />
          <View style={[stylesModal.card, { borderColor: hairline, backgroundColor: Colors[theme].background }]}>{children}</View>
        </View>
      )}
    </Modal>
  );
}

const stylesModal = StyleSheet.create({
  sheetRoot: {
    flex: 1,
    padding: 16,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  card: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
});

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
  const accent = projectColor ?? (isDark ? '#30D158' : '#34C759');
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
          'Standort nicht verfügbar',
          'ExpoLocation ist in deinem aktuellen Build nicht enthalten. Falls du einen Dev Client / expo run:* nutzt, bitte einmal neu bauen (z.B. `npx expo run:ios`).'
        );
        return;
      }

      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Kein Zugriff', 'Bitte Standortzugriff erlauben, um den aktuellen Ort zu verwenden.');
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
      Alert.alert('Fehler', 'Konnte den Standort nicht abrufen.');
    } finally {
      setIsLocating(false);
    }
  }, [task, updateTask]);

  const onToggleComplete = React.useCallback(() => {
    if (!task) return;
    if (task.section === 'completed') {
      updateTask({ section: 'today', dueAt: getDueAtForSection('today') });
      return;
    }
    updateTask({ section: 'completed', dueAt: getDueAtForSection('completed') });
  }, [task, updateTask]);

  const onDelete = React.useCallback(() => {
    if (!task) return;
    Alert.alert('Task löschen?', 'Dieser Task wird in den Papierkorb verschoben.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: () => {
          setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, deletedAt: Date.now() } : t)));
          router.back();
        },
      },
    ]);
  }, [router, setTasks, task]);

  // Due picker modal
  const [duePickerOpen, setDuePickerOpen] = React.useState(false);
  const [dueDraft, setDueDraft] = React.useState<Date>(new Date());
  const [dueHasTimeDraft, setDueHasTimeDraft] = React.useState(true);

  React.useEffect(() => {
    if (!task) return;
    if (!duePickerOpen) return;
    setDueDraft(new Date(task.dueAt));
    setDueHasTimeDraft(task.dueHasTime ?? true);
  }, [duePickerOpen, task]);

  const commitDue = React.useCallback(() => {
    if (!task) return;
    const next = new Date(dueDraft);
    if (!dueHasTimeDraft) {
      next.setHours(12, 0, 0, 0);
    }
    updateTask({ dueAt: next.getTime(), dueHasTime: dueHasTimeDraft });
    setDuePickerOpen(false);
  }, [dueDraft, dueHasTimeDraft, task, updateTask]);

  // Project picker + create
  const [projectPickerOpen, setProjectPickerOpen] = React.useState(false);
  const [createProjectOpen, setCreateProjectOpen] = React.useState(false);
  const [newProjectName, setNewProjectName] = React.useState('');
  const [newProjectColor, setNewProjectColor] = React.useState<string>(COLOR_SWATCHES[0]);
  const [newProjectIcon, setNewProjectIcon] = React.useState<string>(PROJECT_ICON_SWATCHES[0]);

  const selectProject = React.useCallback(
    (projectId: string) => {
      updateTask({ projectId });
      setProjectPickerOpen(false);
    },
    [updateTask]
  );

  const clearProject = React.useCallback(() => {
    updateTask({ projectId: '' });
    setProjectPickerOpen(false);
  }, [updateTask]);

  const createProject = React.useCallback(() => {
    const name = newProjectName.trim();
    if (!name) return;
    const p: Project = { id: newId('p'), name, color: newProjectColor, icon: newProjectIcon };
    setProjects((prev) => [p, ...prev]);
    updateTask({ projectId: p.id });
    setCreateProjectOpen(false);
    setProjectPickerOpen(false);
    setNewProjectName('');
  }, [newProjectColor, newProjectIcon, newProjectName, setProjects, updateTask]);

  // Emoji + color picker (task emoji + project color)
  const [emojiPickerOpen, setEmojiPickerOpen] = React.useState(false);

  const onPickEmoji = React.useCallback((emoji: string) => updateTask({ emoji }), [updateTask]);

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
        <Text style={styles.notFoundTitle}>Task nicht gefunden</Text>
        <Pressable onPress={() => router.back()} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Zurück</Text>
        </Pressable>
      </View>
    );
  }

  const dueHasTime = task.dueHasTime ?? true;

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

      <View style={styles.header}>
        <Pressable onPress={() => setEmojiPickerOpen(true)} style={[styles.emojiTile, { borderColor: hairline }]}>
          <GlassSurface
            style={styles.emojiTileInner}
            glassEffectStyle="regular"
            tintColor={withAlpha(Colors[theme].text, isDark ? 0.12 : 0.06)}
            fallbackBackgroundColor={withAlpha(Colors[theme].text, isDark ? 0.18 : 0.1)}
          >
            <Text style={styles.emojiText}>{task.emoji}</Text>
          </GlassSurface>
        </Pressable>

        <View style={styles.headerMeta}>
          <TextInput
            value={task.title}
            onChangeText={(v) => updateTask({ title: v })}
            placeholder="Titel"
            placeholderTextColor={placeholder}
            multiline
            scrollEnabled={false}
            onContentSizeChange={(e) => setTitleHeight(e.nativeEvent.contentSize.height)}
            style={[
              styles.titleInput,
              { color: Colors[theme].text },
              titleHeight > 0 ? { height: Math.max(styles.titleInput.minHeight ?? 0, Math.ceil(titleHeight)) } : null,
            ]}
          />
          <TextInput
            value={task.subtitle ?? ''}
            onChangeText={(v) => updateTask({ subtitle: v.trim().length ? v : undefined })}
            placeholder="Subtitle"
            placeholderTextColor={placeholder}
            multiline
            scrollEnabled={false}
            onContentSizeChange={(e) => setSubtitleHeight(e.nativeEvent.contentSize.height)}
            style={[
              styles.subtitleInput,
              { color: withAlpha(Colors[theme].text, 0.78) },
              subtitleHeight > 0 ? { height: Math.max(styles.subtitleInput.minHeight ?? 0, Math.ceil(subtitleHeight)) } : null,
            ]}
          />

          <View style={styles.tagsRow}>
            <View style={[styles.sectionTag, { borderColor: hairline, backgroundColor: withAlpha(Colors[theme].text, isDark ? 0.06 : 0.04) }]}>
              <Text style={[styles.sectionTagText, { color: withAlpha(Colors[theme].text, 0.72) }]}>{sectionLabel(task.section)}</Text>
            </View>
          </View>
        </View>
      </View>

      <GlassSurface style={[styles.panel, { borderColor: hairline }]} glassEffectStyle="regular" tintColor={glassTint} fallbackBackgroundColor={glassFallback}>
        <Text style={styles.panelTitle}>Details</Text>

        <FormField label="Projekt" icon="folder" accent={neutralAccent} theme={theme}>
          <Pressable onPress={() => setProjectPickerOpen(true)} style={styles.rowButton}>
            <View style={styles.projectInline}>
              <View
                style={[
                  styles.projectInlineIconBg,
                  {
                    backgroundColor: projectColor
                      ? withAlpha(projectColor, isDark ? 0.22 : 0.16)
                      : withAlpha(Colors[theme].text, isDark ? 0.08 : 0.06),
                  },
                ]}
              >
                <Text style={styles.projectInlineIcon}>{project?.icon ?? '—'}</Text>
              </View>
              <Text style={[styles.valueText, { color: withAlpha(Colors[theme].text, 0.92) }]} numberOfLines={1}>
                {project?.name ?? 'Kein Projekt'}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={18} color={withAlpha(Colors[theme].text, 0.5)} />
          </Pressable>
        </FormField>

        <View style={[styles.divider, { backgroundColor: hairline }]} />

        <FormField label="Due" icon="event" accent={neutralAccent} theme={theme}>
          <Pressable onPress={() => setDuePickerOpen(true)} style={styles.rowButton}>
            <Text style={[styles.valueText, { color: withAlpha(Colors[theme].text, 0.92) }]}>{formatDueLabel(task.dueAt, dueHasTime)}</Text>
            <MaterialIcons name="chevron-right" size={18} color={withAlpha(Colors[theme].text, 0.5)} />
          </Pressable>
        </FormField>

        <View style={[styles.divider, { backgroundColor: hairline }]} />

        <FormField label="Location" icon="place" accent={neutralAccent} theme={theme}>
          <View style={styles.locationRow}>
            <TextInput
              value={task.location ?? ''}
              onChangeText={(v) => updateTask({ location: v.trim().length ? v : undefined })}
              placeholder="Ort"
              placeholderTextColor={placeholder}
              style={[styles.fieldInput, { color: Colors[theme].text }]}
            />
            <Pressable onPress={onUseCurrentLocation} hitSlop={10} style={styles.inlineIconBtn}>
              {isLocating ? <ActivityIndicator size="small" /> : <MaterialIcons name="my-location" size={18} color={withAlpha(Colors[theme].text, 0.75)} />}
            </Pressable>
          </View>
        </FormField>
      </GlassSurface>

      <GlassSurface style={[styles.panel, { borderColor: hairline }]} glassEffectStyle="regular" tintColor={glassTint} fallbackBackgroundColor={glassFallback}>
        <Text style={styles.panelTitle}>Tasks</Text>

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
                placeholder="Aufgabe"
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
            placeholder="Neue Aufgabe…"
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
        <Text style={styles.panelTitle}>Notes</Text>
        <TextInput
          value={task.notes ?? ''}
          onChangeText={(v) => updateTask({ notes: v.length ? v : undefined })}
          placeholder="Notizen…"
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
                  Task erledigt
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
                  Task wiederholen
                </Text>
              </GlassSurface>
            </Animated.View>
          </View>
        </Pressable>
      </View>

      {/* Due Picker */}
      < SheetModal visible={duePickerOpen} onClose={() => setDuePickerOpen(false)
      } theme={theme} hairline={hairline} >
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: Colors[theme].text }]}>Due</Text>
          <Pressable onPress={commitDue} hitSlop={10}>
            <Text style={[styles.modalDone, { color: withAlpha(Colors[theme].text, 0.9) }]}>Fertig</Text>
          </Pressable>
        </View>

        <View style={styles.pickerBlock}>
          <DateTimePicker
            value={dueDraft}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={(_, date) => {
              if (!date) return;
              setDueDraft((prev) => normalizeDateWithTimeFlag(date, dueHasTimeDraft, prev));
            }}
          />
        </View>

        <View style={styles.modalRow}>
          <Text style={[styles.modalLabelInline, { color: withAlpha(Colors[theme].text, 0.7) }]}>Zeit</Text>
          <Switch value={dueHasTimeDraft} onValueChange={setDueHasTimeDraft} />
        </View>

        {
          dueHasTimeDraft ? (
            <View style={styles.pickerBlock}>
              <DateTimePicker
                value={dueDraft}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_, date) => {
                  if (!date) return;
                  setDueDraft((prev) => {
                    const next = new Date(prev);
                    next.setHours(date.getHours(), date.getMinutes(), 0, 0);
                    return next;
                  });
                }}
              />
            </View>
          ) : null
        }
      </SheetModal >

      {/* Project Picker */}
      < SheetModal visible={projectPickerOpen} onClose={() => setProjectPickerOpen(false)} theme={theme} hairline={hairline} >
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: Colors[theme].text }]}>Projekt</Text>
          <Pressable onPress={() => setCreateProjectOpen(true)} hitSlop={10}>
            <Text style={[styles.modalDone, { color: withAlpha(Colors[theme].text, 0.9) }]}>Neu</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={clearProject}
          style={[
            styles.projectRow,
            {
              borderColor: hairline,
              backgroundColor: withAlpha(Colors[theme].text, isDark ? 0.04 : 0.03),
            },
          ]}
        >
          <Text style={styles.projectRowIcon}>—</Text>
          <View style={styles.projectRowBody}>
            <Text style={[styles.projectRowName, { color: Colors[theme].text }]}>Kein Projekt</Text>
          </View>
        </Pressable>

        <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
          {projects.map((p) => {
            const active = p.id === task.projectId;
            return (
              <Pressable
                key={p.id}
                onPress={() => selectProject(p.id)}
                style={[
                  styles.projectRow,
                  {
                    borderColor: active ? withAlpha(p.color, 0.45) : hairline,
                    backgroundColor: active
                      ? withAlpha(p.color, isDark ? 0.18 : 0.12)
                      : withAlpha(Colors[theme].text, isDark ? 0.04 : 0.03),
                  },
                ]}
              >
                <Text style={styles.projectRowIcon}>{p.icon}</Text>
                <View style={styles.projectRowBody}>
                  <Text style={[styles.projectRowName, { color: Colors[theme].text }]}>{p.name}</Text>
                  <View style={styles.projectRowMeta}>
                    <View style={[styles.colorDot, { backgroundColor: p.color }]} />
                    <Text style={[styles.projectRowColor, { color: withAlpha(Colors[theme].text, 0.6) }]}>{p.color}</Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </SheetModal >

      {/* Create Project */}
      < SheetModal visible={createProjectOpen} onClose={() => setCreateProjectOpen(false)} theme={theme} hairline={hairline} >
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: Colors[theme].text }]}>Neues Projekt</Text>
          <Pressable onPress={createProject} hitSlop={10} disabled={!newProjectName.trim().length}>
            <Text style={[styles.modalDone, { color: withAlpha(Colors[theme].text, newProjectName.trim().length ? 0.9 : 0.35) }]}>Erstellen</Text>
          </Pressable>
        </View>

        <View style={styles.createRow}>
          <Text style={[styles.modalLabel, { color: withAlpha(Colors[theme].text, 0.7) }]}>Name</Text>
          <TextInput
            value={newProjectName}
            onChangeText={setNewProjectName}
            placeholder="Projektname"
            placeholderTextColor={placeholder}
            style={[styles.createInput, { color: Colors[theme].text }]}
          />
        </View>

        <Text style={[styles.modalLabel, { color: withAlpha(Colors[theme].text, 0.7), marginTop: 12 }]}>Icon</Text>
        <View style={styles.swatchGrid}>
          {PROJECT_ICON_SWATCHES.map((e) => (
            <Pressable
              key={e}
              onPress={() => setNewProjectIcon(e)}
              style={[
                styles.emojiSwatch,
                {
                  borderColor: e === newProjectIcon ? withAlpha(accent, 0.7) : hairline,
                  backgroundColor: withAlpha(Colors[theme].text, isDark ? 0.05 : 0.04),
                },
              ]}
            >
              <Text style={styles.emojiSwatchText}>{e}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.modalLabel, { color: withAlpha(Colors[theme].text, 0.7), marginTop: 12 }]}>Farbe</Text>
        <View style={styles.swatchGrid}>
          {COLOR_SWATCHES.map((c) => (
            <Pressable
              key={c}
              onPress={() => setNewProjectColor(c)}
              style={[
                styles.colorSwatch,
                {
                  backgroundColor: c,
                  borderColor: newProjectColor === c ? withAlpha(Colors[theme].text, 0.6) : 'transparent',
                },
              ]}
            />
          ))}
        </View>
      </SheetModal >

      {/* Emoji + Color Picker */}
      < SheetModal visible={emojiPickerOpen} onClose={() => setEmojiPickerOpen(false)} theme={theme} hairline={hairline} >
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: Colors[theme].text }]}>Emoji & Farbe</Text>
          <Pressable onPress={() => setEmojiPickerOpen(false)} hitSlop={10}>
            <Text style={[styles.modalDone, { color: withAlpha(Colors[theme].text, 0.9) }]}>Fertig</Text>
          </Pressable>
        </View>

        <Text style={[styles.modalLabel, { color: withAlpha(Colors[theme].text, 0.7) }]}>Emoji</Text>
        <View style={styles.swatchGrid}>
          {EMOJI_SWATCHES.map((e) => (
            <Pressable
              key={e}
              onPress={() => onPickEmoji(e)}
              style={[
                styles.emojiSwatch,
                {
                  borderColor: e === task.emoji ? withAlpha(accent, 0.7) : hairline,
                  backgroundColor: withAlpha(Colors[theme].text, isDark ? 0.05 : 0.04),
                },
              ]}
            >
              <Text style={styles.emojiSwatchText}>{e}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.modalLabel, { color: withAlpha(Colors[theme].text, 0.7), marginTop: 12 }]}>Projektfarbe</Text>
        {
          project ? (
            <View style={styles.swatchGrid}>
              {COLOR_SWATCHES.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => onPickProjectColor(c)}
                  style={[
                    styles.colorSwatch,
                    {
                      backgroundColor: c,
                      borderColor: (project?.color ?? '') === c ? withAlpha(Colors[theme].text, 0.6) : 'transparent',
                    },
                  ]}
                />
              ))}
            </View>
          ) : (
            <Text style={[styles.helperText, { color: withAlpha(Colors[theme].text, 0.6) }]}>Wähle zuerst ein Projekt.</Text>
          )
        }
      </SheetModal >

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