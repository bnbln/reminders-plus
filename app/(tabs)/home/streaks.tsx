import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function StreaksScreen() {
  const theme = useColorScheme() ?? 'light';
  const streakDays = 12;

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: Colors[theme].background }]}>
      <View style={styles.hero}>
        <View style={styles.iconRow}>
          <MaterialIcons name="local-fire-department" size={22} color={Colors[theme].text} />
          <Text style={[styles.title, { color: Colors[theme].text }]}>Streaks</Text>
        </View>
        <Text style={[styles.bigNumber, { color: Colors[theme].text }]}>{streakDays}</Text>
        <Text style={[styles.subtitle, { color: Colors[theme].text }]}>Tage am Stück</Text>
      </View>

      <View style={styles.card}>
        <Text style={[styles.cardTitle, { color: Colors[theme].text }]}>Duolingo-ähnliche Logik</Text>
        <Text style={[styles.cardText, { color: Colors[theme].text }]}>Coming soon: Kalender/Heatmap, Freeze, Recovery und automatische Berechnung.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 32,
  },
  hero: {
    paddingVertical: 14,
    alignItems: 'center',
    gap: 6,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  bigNumber: {
    fontSize: 56,
    fontWeight: '900',
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '700',
    opacity: 0.7,
  },
  card: {
    marginTop: 16,
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
});
