import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

export default function SearchIndex() {
  const router = useRouter();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const value = typeof q === 'string' ? q : '';
  const inputRef = React.useRef<TextInput | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Neuen Task erstellen</Text>
      <Text style={styles.text}>
        Gib einen Titel ein. Danach kannst du oben im Header auf „Task erstellen“ tippen.
      </Text>

      <View style={styles.fieldWrap}>
        <TextInput
          ref={(r) => {
            inputRef.current = r;
          }}
          value={value}
          onChangeText={(text) => router.setParams({ q: text })}
          placeholder="z.B. Arzttermin vereinbaren"
          returnKeyType="done"
          autoCapitalize="sentences"
          autoCorrect
          style={styles.input}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
  },
  fieldWrap: {
    marginTop: 6,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    fontSize: 16,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
});
