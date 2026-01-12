import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useTasksStore } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function SearchIndex() {
  const router = useRouter();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const theme = useColorScheme() ?? 'light';
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const { tasks } = useTasksStore();

  const query = typeof q === 'string' ? q.trim().toLowerCase() : '';
  const results = React.useMemo(() => {
    if (!query) return [];
    return tasks
      .filter((t) => !t.deletedAt)
      .filter((t) => {
        const hay = `${t.title} ${t.subtitle ?? ''} ${t.notes ?? ''}`.toLowerCase();
        return hay.includes(query);
      })
      .slice(0, 30);
  }, [query, tasks]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Search</Text>
      {!query ? (
        <Text style={styles.hint}>Tippe unten auf Search und gib deinen Suchbegriff ein.</Text>
      ) : results.length === 0 ? (
        <Text style={styles.hint}>Keine Treffer für „{q}“.</Text>
      ) : (
        <View style={styles.list}>
          {results.map((t) => (
            <Pressable
              key={t.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/task/[id]', params: { id: t.id } })}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.rowTitle} numberOfLines={1}>
                {t.emoji} {t.title}
              </Text>
              {t.subtitle ? (
                <Text style={styles.rowSub} numberOfLines={1}>
                  {t.subtitle}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const createStyles = (theme: keyof typeof Colors) =>
  StyleSheet.create({
    container: {
      padding: 20,
      gap: 12,
      backgroundColor: Colors[theme].background,
      minHeight: '100%',
    },
    title: {
      fontSize: 18,
      fontWeight: '800',
      color: Colors[theme].text,
    },
    hint: {
      fontSize: 15,
      lineHeight: 20,
      color: Colors[theme].text,
      opacity: 0.7,
    },
    list: {
      gap: 10,
    },
    row: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
    },
    rowTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: Colors[theme].text,
    },
    rowSub: {
      marginTop: 4,
      fontSize: 13,
      fontWeight: '600',
      color: Colors[theme].text,
      opacity: 0.7,
    },
  });
