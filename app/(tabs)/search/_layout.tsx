import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getDueAtForSection, type SectionId, useTasksStore } from '@/context/tasks-store';

const createTaskId = () => `t-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function CreateTaskButton() {
  const router = useRouter();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const text = typeof q === 'string' ? q.trim() : '';
  const canSubmit = text.length > 0;
  const { projects, setTasks, tasks } = useTasksStore();

  const defaultProjectId = React.useMemo(() => {
    const active = projects.find((p) => !p.deletedAt);
    if (active) return active.id;
    const fromExisting = tasks.find((t) => !t.deletedAt)?.projectId;
    return fromExisting ?? 'p-default';
  }, [projects, tasks]);

  const addTask = React.useCallback(() => {
    if (!canSubmit) return;

    const nextId = createTaskId();
    const section: SectionId = 'today';

    setTasks((prev) => {
      const minRank = prev
        .filter((t) => !t.deletedAt && t.section === section)
        .reduce<number | null>((acc, t) => (acc === null ? t.orderRank : Math.min(acc, t.orderRank)), null);

      const orderRank = (minRank ?? 1000) - 1000;

      return [
        {
          id: nextId,
          title: text,
          subtitle: undefined,
          emoji: '📝',
          projectId: defaultProjectId,
          dueAt: getDueAtForSection(section),
          dueHasTime: true,
          section,
          orderRank,
          location: undefined,
          notes: undefined,
          subtasks: undefined,
          deletedAt: undefined,
        },
        ...prev,
      ];
    });

    router.setParams({ q: '' });
    router.push({ pathname: '/task/[id]', params: { id: nextId } });
  }, [canSubmit, defaultProjectId, router, setTasks, text]);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={addTask}
        disabled={!canSubmit}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={canSubmit ? 'Task erstellen' : 'Titel eingeben'}
        style={({ pressed }) => [
          styles.button,
          (!canSubmit || pressed) && { opacity: !canSubmit ? 0.45 : 0.9 },
        ]}
      >
        <MaterialIcons name="add" size={18} />
        <Text style={styles.buttonText}>Task erstellen</Text>
      </Pressable>
    </View>
  );
}

export default function SearchLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Add Task',
          headerTitle: () => <CreateTaskButton />,
          headerTitleAlign: 'center',
        }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
