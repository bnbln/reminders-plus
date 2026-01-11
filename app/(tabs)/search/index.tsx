import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

export default function SearchIndex() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.text}>Suche kommt spaeter. Nutze + rechts zum Hinzufuegen.</Text>
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
