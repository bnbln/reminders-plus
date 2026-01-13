import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { type SectionId, useTasksStore } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';

const createTaskId = () => `t-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function CreateTaskModal() {
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const isDark = theme === 'dark';
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const { setTasks } = useTasksStore();

  const [title, setTitle] = React.useState('');
  const trimmed = title.trim();
  const canSubmit = trimmed.length > 0;

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

    router.back();
  }, [canSubmit, router, setTasks, trimmed]);

  const handleCancel = React.useCallback(() => {
    router.back();
  }, [router]);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Neue Aufgabe',
          headerLeft: () => (
            <Pressable onPress={handleCancel} hitSlop={10} style={styles.iconButton}>
              <MaterialIcons name="close" size={24} color={Colors[theme].text} />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={onCreate} hitSlop={10} style={styles.iconButton} disabled={!canSubmit}>
              <MaterialIcons name="check" size={24} color={canSubmit ? Colors[theme].text : Colors[theme].icon} />
            </Pressable>
          ),
          headerShown: true,
          headerStyle: {
            backgroundColor: isDark ? '#000000' : '#F2F2F7',
          },
          headerShadowVisible: false,
        } as any}
      />

      <View style={styles.content}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Titel"
          placeholderTextColor={Colors[theme].icon}
          autoFocus={true}
          style={styles.input}
          onSubmitEditing={onCreate}
        />
      </View>
    </View>
  );
}

const createStyles = (theme: keyof typeof Colors) => {
  const isDark = theme === 'dark';
  const text = Colors[theme].text;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#000000' : '#F2F2F7',
    },
    content: {
      flex: 1,
      padding: 16,
    },
    input: {
      fontSize: 17,
      color: text,
      backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
      padding: 16,
      borderRadius: 12,
    },
    iconButton: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
};
