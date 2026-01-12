import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { Button, StyleSheet, TextInput, View } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function ModalScreen() {
  const theme = useColorScheme() ?? 'light';
  const router = useRouter();
  const [title, setTitle] = React.useState('');
  const canSubmit = title.trim().length > 0;

  const handleCancel = () => {
    router.back();
  };

  const handleAdd = () => {
    if (!canSubmit) return;
    const text = title.trim();
    router.navigate({ pathname: '/home', params: { action: 'add', title: text } });
    router.back();
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Neue Aufgabe',
          headerLeft: () => (
            <Button
              onPress={handleCancel}
              title="Abbrechen"
              color={theme === 'dark' ? '#0A84FF' : '#007AFF'}
            />
          ),
          headerRight: () => (
            <Button
              onPress={handleAdd}
              title="Hinzufügen"
              disabled={!canSubmit}
            // Bold weight isn't directly settable on standard RN Button but it's the standard look. 
            // We could use a custom Text inside a Pressable if we want specifically "Done" style bolding, 
            // but Button is the most "native" behaving component for headers usually.
            />
          ),
          headerLargeTitle: false,
          presentation: 'modal',
        }}
      />

      <View style={styles.content}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Titel…"
          placeholderTextColor={theme === 'dark' ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)'}
          autoFocus={true}
          style={[
            styles.input,
            {
              color: Colors[theme].text,
              backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
            },
          ]}
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    // Add some top padding to separate from the header if using standard view
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    fontSize: 17, // Standard iOS body size
  },
});
