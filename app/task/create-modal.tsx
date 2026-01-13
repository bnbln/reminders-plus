import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { MenuView, type MenuAction, type NativeActionEvent } from '@react-native-menu/menu';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useTasksStore, type SectionId } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';

const createTaskId = () => `t-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function CreateTaskModal() {
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const { setTasks, tasks } = useTasksStore();

  const [title, setTitle] = React.useState('');
  const trimmed = title.trim();
  const canSubmit = trimmed.length > 0;

  const inputRef = React.useRef<TextInput | null>(null);

  // Draft management
  const draftIdRef = React.useRef<string | null>(null);
  const isCreatedRef = React.useRef(false);

  // Focus input on mount
  React.useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, []);

  // Cleanup draft on unmount if not created
  React.useEffect(() => {
    return () => {
      if (!isCreatedRef.current && draftIdRef.current) {
        const idToDelete = draftIdRef.current;
        // Use functional update to avoid stale closure if we depended on 'tasks' directly,
        // though setStates are stable.
        setTasks((prev) => prev.filter((t) => t.id !== idToDelete));
      }
    };
  }, [setTasks]);

  const ensureDraftTask = React.useCallback(() => {
    if (draftIdRef.current) return draftIdRef.current;

    const nextId = createTaskId();
    draftIdRef.current = nextId;

    // Create a hidden draft task (deletedAt set)
    setTasks((prev) => [
      {
        id: nextId,
        title: title || '',
        emoji: '📝',
        projectId: '',
        dueAt: 0,
        dueHasTime: false,
        section: 'upcoming',
        orderRank: 0, // will be fixed on create
        deletedAt: Date.now(), // Hidden
      },
      ...prev,
    ]);

    return nextId;
  }, [setTasks, title]);

  // Keep draft title in sync so if we navigate away and back, we don't lose it
  // (Optional, but good if we want "Draft" persistence while modal is open to sub-screens)
  const isUpdatingRef = React.useRef(false);
  React.useEffect(() => {
    if (draftIdRef.current && !isUpdatingRef.current) {
      setTasks(prev => prev.map(t => t.id === draftIdRef.current ? { ...t, title: title } : t));
    }
  }, [title, setTasks]);

  // When returning from pickers, we might need to refresh local state if we want to show badges etc.
  // But this modal is simple: just input. The menu items are actions.

  const onUseCurrentLocation = React.useCallback(async () => {
    const id = ensureDraftTask();

    // We need to access the store to update this task. 
    // Since we are in a callback, we can assume 'setTasks' is enough.

    try {
      // Dynamic import to avoid hard dependency if not used
      let Location: typeof import('expo-location');
      try {
        Location = await import('expo-location');
      } catch {
        Alert.alert('Standort nicht verfügbar', 'ExpoLocation fehlt.');
        return;
      }

      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Kein Zugriff', 'Bitte Standortzugriff erlauben.');
        return;
      }

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [rev] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });

      const parts = [rev.name, rev.street, rev.district, rev.city].filter(
        (v): v is string => typeof v === 'string' && v.trim().length > 0
      );
      const label = parts.slice(0, 2).join(' · ') || `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;

      setTasks(prev => prev.map(t => t.id === id ? { ...t, location: label } : t));
    } catch {
      Alert.alert('Fehler', 'Standort konnte nicht abgerufen werden.');
    }
  }, [ensureDraftTask, setTasks]);


  const actions = React.useMemo<MenuAction[]>(() => {
    const iconColor = Colors[theme].text;

    return [
      {
        id: 'date',
        title: 'Fälligkeit',
        image: Platform.OS === 'ios' ? 'calendar' : 'event',
        imageColor: iconColor,
      },
      {
        id: 'style',
        title: 'Styling',
        image: Platform.OS === 'ios' ? 'paintbrush' : 'edit',
        imageColor: iconColor,
      },
      {
        id: 'location',
        title: 'Standort',
        image: Platform.OS === 'ios' ? 'location' : 'place',
        imageColor: iconColor,
      },
      {
        id: 'routine',
        title: 'Routine',
        image: Platform.OS === 'ios' ? 'arrow.triangle.2.circlepath' : 'loop',
        imageColor: iconColor,
      },
      {
        id: 'project',
        title: 'Projekt',
        image: Platform.OS === 'ios' ? 'folder' : 'folder',
        imageColor: iconColor,
      }
    ];
  }, [theme]);

  const onMenuAction = React.useCallback(
    ({ nativeEvent }: NativeActionEvent) => {
      const actionId = nativeEvent.event;
      const id = ensureDraftTask();

      switch (actionId) {
        case 'date':
          router.push({ pathname: '/task/date-picker', params: { taskId: id } });
          break;
        case 'style':
          router.push({ pathname: '/task/emoji-picker', params: { taskId: id } });
          break;
        case 'location':
          onUseCurrentLocation();
          break;
        case 'routine':
          router.push({ pathname: '/task/routine-picker', params: { taskId: id } });
          break;
        case 'project':
          router.push({ pathname: '/task/project-picker', params: { taskId: id } });
          break;
      }
    },
    [ensureDraftTask, onUseCurrentLocation, router]
  );


  const onCreate = React.useCallback(() => {
    if (!canSubmit) {
      Alert.alert('Titel fehlt', 'Bitte gib einen Task-Titel ein.');
      return;
    }

    // Finalize
    isCreatedRef.current = true;

    const id = draftIdRef.current;

    if (id) {
      // Update existing draft
      setTasks((prev) => {
        const task = prev.find(t => t.id === id);
        if (!task) return prev; // Should not happen

        // Recalc section based on set due date?
        // The user might have set a due date via picker.
        // If so, we should respect it.

        // Logic:
        // If dueAt is set -> calculate section (today vs upcoming).
        // If not set -> upcoming.

        const dueAt = task.dueAt;
        let section: SectionId = 'upcoming';

        if (dueAt && dueAt > 0) {
          const now = new Date();
          const due = new Date(dueAt);
          const isToday = now.getFullYear() === due.getFullYear() && now.getMonth() === due.getMonth() && now.getDate() === due.getDate();
          section = isToday ? 'today' : 'upcoming';
        }

        // Find min rank in target section
        const minRank = prev
          .filter((t) => !t.deletedAt && t.section === section && t.id !== id)
          .reduce<number | null>((acc, t) => (acc === null ? t.orderRank : Math.min(acc, t.orderRank)), null);
        const orderRank = (minRank ?? 1000) - 1000;

        return prev.map(t => t.id === id ? {
          ...t,
          title: trimmed,
          section,
          orderRank,
          deletedAt: undefined // Un-delete
        } : t);
      });
    } else {
      // No draft exists, create fresh
      const nextId = createTaskId();
      const section: SectionId = 'upcoming';

      setTasks((prev) => {
        const minRank = prev
          .filter((t) => !t.deletedAt && t.section === section)
          .reduce<number | null>((acc, t) => (acc === null ? t.orderRank : Math.min(acc, t.orderRank)), null);
        const orderRank = (minRank ?? 1000) - 1000;

        return [
          {
            id: nextId,
            title: trimmed,
            subtitle: undefined,
            emoji: '📝',
            projectId: '',
            dueAt: 0,
            dueHasTime: false,
            section,
            orderRank,
            location: undefined,
            notes: undefined,
            subtasks: undefined,
            completedAt: undefined,
            deletedAt: undefined,
          },
          ...prev,
        ];
      });
    }

    router.back();
  }, [canSubmit, router, setTasks, trimmed]);

  const close = React.useCallback(() => {
    router.back();
  }, [router]);

  return (
    <View style={styles.root}>
      {/* Backdrop: tap to dismiss */}
      <Pressable
        style={styles.backdrop}
        accessibilityRole="button"
        accessibilityLabel="Schließen"
        onPress={close}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
        style={styles.keyboard}
      >
        <View style={[styles.composerWrap, { paddingBottom: Math.max(10, insets.bottom) }]} pointerEvents="box-none">
          <View style={styles.composer}>

            {/* 
              Wrap the button directly.
              To prevent layout shifts, we ensure MenuView doesn't add extra margin/padding 
              and respects the flex alignment. 
            */}
            <MenuView
              onPressAction={onMenuAction}
              actions={actions}
              shouldOpenOnLongPress={false} // Tap opens
              themeVariant={theme}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Mehr"
                hitSlop={10}
                style={({ pressed }) => [styles.plusButton, pressed && { opacity: 0.85 }]}
                pointerEvents="none" // Let MenuView handle the touch
              >
                <MaterialIcons name="add" size={22} color={styles.plusIcon.color as any} />
              </Pressable>
            </MenuView>

            <TextInput
              ref={(r) => {
                inputRef.current = r;
              }}
              value={title}
              onChangeText={setTitle}
              placeholder="Neue Aufgabe"
              placeholderTextColor={styles.placeholder.color as any}
              returnKeyType="done"
              autoCapitalize="sentences"
              autoCorrect
              onSubmitEditing={() => {
                onCreate();
              }}
              style={styles.input}
            />

            <Pressable
              onPress={onCreate}
              disabled={!canSubmit}
              accessibilityRole="button"
              accessibilityLabel={canSubmit ? 'Task erstellen' : 'Titel eingeben'}
              hitSlop={10}
              style={({ pressed }) => [styles.sendButton, (!canSubmit || pressed) && { opacity: !canSubmit ? 0.35 : 0.85 }]}
            >
              <MaterialIcons name="arrow-upward" size={18} color={styles.sendIcon.color as any} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const createStyles = (theme: keyof typeof Colors) => {
  const isDark = theme === 'dark';
  const text = Colors[theme].text;
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.22)',
    },
    keyboard: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    composerWrap: {
      paddingHorizontal: 12,
      paddingTop: 10,
    },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 10,
      paddingHorizontal: 10,
      paddingVertical: 20,
      borderRadius: 30,
      backgroundColor: isDark ? 'rgba(28,28,30,0.95)' : 'rgba(242,242,247,0.92)',
      borderWidth: 0.5,
      borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)',
    },
    plusButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',
    },
    plusIcon: {
      color: text,
    },
    input: {
      flex: 1,
      minHeight: 36,
      maxHeight: 120,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 16,
      fontSize: 16,
      color: text,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.8)',
    },
    placeholder: {
      color: isDark ? 'rgba(235,235,245,0.45)' : 'rgba(60,60,67,0.45)',
    },
    sendButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors[theme].tint,
    },
    sendIcon: {
      color: isDark ? 'black' : 'white',
    },
  });
};
