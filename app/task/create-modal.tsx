import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { type SectionId, useTasksStore } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';

const createTaskId = () => `t-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function CreateTaskModal() {
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const { setTasks } = useTasksStore();

  const [title, setTitle] = React.useState('');
  const trimmed = title.trim();
  const canSubmit = trimmed.length > 0;

  const inputRef = React.useRef<TextInput | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, []);

  const onCreate = React.useCallback(() => {
    if (!canSubmit) {
      Alert.alert('Titel fehlt', 'Bitte gib einen Task-Titel ein.');
      return;
    }

    const nextId = createTaskId();
    // Tasks without a due date should show up under "Demnächst" on Home.
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

    // Stay on the current screen: just close the modal.
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mehr"
              hitSlop={10}
              onPress={() => inputRef.current?.focus()}
              style={({ pressed }) => [styles.plusButton, pressed && { opacity: 0.85 }]}
            >
              <MaterialIcons name="add" size={22} color={styles.plusIcon.color as any} />
            </Pressable>

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
      backgroundColor: isDark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.22)',
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
      paddingVertical: 10,
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(28,28,30,0.78)' : 'rgba(242,242,247,0.92)',
      borderWidth: 1,
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
