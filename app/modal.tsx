import { Link } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { GlassSurface, withAlpha } from '@/components/ui/glass-surface';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function ModalScreen() {
  const theme = useColorScheme() ?? 'light';

  return (
    <ThemedView style={styles.container}>
      <GlassSurface
        style={styles.card}
        glassEffectStyle="regular"
        tintColor={withAlpha(Colors[theme].background, theme === 'dark' ? 0.22 : 0.4)}
        fallbackBackgroundColor={Colors[theme].background}>
        <ThemedText type="title">This is a modal</ThemedText>
        <Link href="/" dismissTo style={styles.link}>
          <ThemedText type="link">Go to home screen</ThemedText>
        </Link>
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
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
});
