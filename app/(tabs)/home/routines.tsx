import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function RoutinesScreen() {
  const theme = useColorScheme() ?? 'light';
  const routinesCount = 4;

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: Colors[theme].background }]}>
      <View style={styles.headerRow}>
        <MaterialIcons name="loop" size={20} color={Colors[theme].text} />
        <Text style={[styles.title, { color: Colors[theme].text }]}>Routinen</Text>
      </View>

      <Text style={[styles.subtitle, { color: Colors[theme].text }]}>{routinesCount} wiederkehrende Aufgaben</Text>

      <View style={styles.card}>
        <Text style={[styles.cardTitle, { color: Colors[theme].text }]}>Hinweis</Text>
        <Text style={[styles.cardText, { color: Colors[theme].text }]}>Logik für Wiederholungen (daily/weekly, Ausnahmen, Snooze) baue ich als nächstes – hier vorerst nur Platzhalter.</Text>
      </View>

      <View style={styles.list}>
        {['Workout', 'Meditation', 'Inbox Zero', 'Spaziergang'].map((label) => (
          <View key={label} style={styles.row}>
            <MaterialIcons name="repeat" size={18} color={Colors[theme].text} style={{ opacity: 0.8 }} />
            <Text style={[styles.rowText, { color: Colors[theme].text }]}>{label}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 32,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '700',
    opacity: 0.7,
  },
  card: {
    marginTop: 8,
    borderRadius: 16,
    padding: 14,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 6,
  },
  cardText: {
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.8,
    lineHeight: 18,
  },
  list: {
    marginTop: 6,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  rowText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
