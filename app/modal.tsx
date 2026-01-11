import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { GlassSurface, withAlpha } from '@/components/ui/glass-surface';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function ModalScreen() {
  const theme = useColorScheme() ?? 'light';
  const router = useRouter();
  const [title, setTitle] = React.useState('');
  const canSubmit = title.trim().length > 0;

  return (
    <ThemedView style={styles.container}>
      <GlassSurface
        style={styles.card}
        glassEffectStyle="regular"
        tintColor={withAlpha('#0A84FF', theme === 'dark' ? 0.22 : 0.18)}
        fallbackBackgroundColor={Colors[theme].background}>
        <ThemedText type="title">Neue Aufgabe</ThemedText>

        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Titel…"
          placeholderTextColor={theme === 'dark' ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)'}
          autoFocus
          style={[
            styles.input,
            {
              color: theme === 'dark' ? 'white' : 'black',
              backgroundColor: theme === 'dark' ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.55)',
            },
          ]}
        />

        <View style={styles.actions}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Abbrechen"
            style={[styles.button, styles.secondary]}
          >
            <MaterialIcons name="close" size={20} color={theme === 'dark' ? 'white' : 'black'} />
            <ThemedText>Abbrechen</ThemedText>
          </Pressable>

          <Pressable
            onPress={() => {
              if (!canSubmit) return;
              const text = title.trim();
              // Dispatch creation to Home via params.
              router.navigate({ pathname: '/home', params: { action: 'add', title: text } });
              router.back();
            }}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel="Hinzufügen"
            style={[styles.button, styles.primary, { opacity: canSubmit ? 1 : 0.5 }]}
          >
            <MaterialIcons name="check" size={20} color="white" />
            <ThemedText style={{ color: 'white' }}>Hinzufügen</ThemedText>
          </Pressable>
        </View>
      </GlassSurface>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  input: {
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    fontSize: 16,
  },
  actions: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  secondary: {
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  primary: {
    borderColor: 'rgba(255,255,255,0.0)',
    backgroundColor: '#0A84FF',
  },
});
