import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type ThemeName = keyof typeof Colors;

const createStyles = (theme: ThemeName) => {
  const isDark = theme === 'dark';
  const text = Colors[theme].text;
  const cardBackground = isDark ? '#1C1C1E' : '#F2F2F7';
  const borderColor = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(17,24,28,0.09)';

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors[theme].background,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 32,
      gap: 12,
    },
    card: {
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor,
      backgroundColor: cardBackground,
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 10,
    },
    title: {
      fontSize: 15,
      fontWeight: '700',
      color: text,
    },
    subtitle: {
      fontSize: 14,
      lineHeight: 20,
      color: isDark ? 'rgba(236,237,238,0.74)' : 'rgba(17,24,28,0.72)',
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    rowLabel: {
      fontSize: 14,
      color: isDark ? 'rgba(236,237,238,0.68)' : 'rgba(17,24,28,0.66)',
    },
    rowValue: {
      fontSize: 14,
      fontWeight: '600',
      color: text,
    },
  });
};

export default function StatusScreen() {
  const theme = (useColorScheme() ?? 'light') as ThemeName;
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      alwaysBounceVertical
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Status</Text>
        <Text style={styles.subtitle}>
          Platzhalter-Screen ohne Logik. Hier können später Dienststatus, Sync-Zustand und
          Diagnoseinformationen eingeblendet werden.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Cloud</Text>
          <Text style={styles.rowValue}>Nicht verbunden</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Letzte Synchronisierung</Text>
          <Text style={styles.rowValue}>-</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>App-Version</Text>
          <Text style={styles.rowValue}>1.0.2</Text>
        </View>
      </View>
    </ScrollView>
  );
}
