import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

export default function SearchIndex() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.text}>Hier stehen die Details für die Erinnerung. input für Ort, Zeit, Notizen, etc.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  text: {
    fontSize: 16,
  },
});
