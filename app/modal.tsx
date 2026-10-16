import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View, Platform } from 'react-native';

import { useSheetHeaderActions } from '@/components/navigation/sheet-header-actions';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { t } from '@/i18n';
import { TextField } from '@/components/ui/text-field';

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

  const sheetHeaderActions = useSheetHeaderActions({
    onClose: handleCancel,
    onDone: handleAdd,
    doneDisabled: !canSubmit,
  });

  return (
    <ThemedView style={[styles.container, { backgroundColor: theme === 'dark' ? '#000000' : '#F2F2F7' }]}>
      <Stack.Screen
        options={{
          title: t('modal.newTask'),
          ...sheetHeaderActions,
          headerLargeTitle: false,
          headerShown: true,
          headerStyle: {
            backgroundColor: theme === 'dark' ? '#000000' : '#F2F2F7',
          },
          headerShadowVisible: false,
        } as any}
      />

      <View style={styles.content}>
        <TextField
          value={title}
          onChangeText={setTitle}
          placeholder={t('modal.placeholder.title')}
          placeholderTextColor={theme === 'dark' ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)'}
          autoFocus={true}
          style={[
            styles.input,
            {
              color: Colors[theme].text,
              // Android draws the M3 filled container itself.
              backgroundColor:
                Platform.OS === 'android'
                  ? 'transparent'
                  : theme === 'dark'
                    ? 'rgba(255,255,255,0.1)'
                    : 'rgba(0,0,0,0.05)',
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
    backgroundColor: '#F2F2F7', // Will be overridden by ThemedView but good default
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
    color: '#000', // Default text color for input if not set, though it's overridden below
  },
});
