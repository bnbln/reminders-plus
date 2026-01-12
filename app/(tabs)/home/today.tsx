import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TodayScreen() {
  const theme = useColorScheme() ?? 'light';

  const label = React.useMemo(() => {
    const now = new Date();
    return new Intl.DateTimeFormat('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(now);
  }, []);

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: Colors[theme].background }]}>
      <View style={styles.headerRow}>
        <MaterialIcons name="today" size={20} color={Colors[theme].text} />
        <Text style={[styles.title, { color: Colors[theme].text }]}>Heute</Text>
      </View>

      <View style={styles.card}>
        <Text style={[styles.dateText, { color: Colors[theme].text }]}>{label}</Text>
        <Text style={[styles.hint, { color: Colors[theme].text }]}>Vorerst nur Anzeige – keine zusätzliche Logik dahinter.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
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
  card: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: 'rgba(0,0,0,0.06)',
    gap: 6,
  },
  dateText: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  hint: {
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.75,
    lineHeight: 18,
  },
});
