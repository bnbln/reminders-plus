import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View, Platform } from 'react-native';

import { HeaderCloseButton } from '@/components/ui/header-close-button';
import { HeaderIconButton } from '@/components/ui/header-icon-button';
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

  return (
    <ThemedView style={[styles.container, { backgroundColor: theme === 'dark' ? '#000000' : '#F2F2F7' }]}>
      <Stack.Screen
        options={{
          title: t('modal.newTask'),
          headerLeft: () => (
            <HeaderCloseButton onPress={handleCancel} color={Colors[theme].text} />
          ),
          headerRight: () => (
            <HeaderIconButton onPress={handleAdd} disabled={!canSubmit}>
              <MaterialIcons name="check" size={24} color={canSubmit ? Colors[theme].text : Colors[theme].icon} />
            </HeaderIconButton>
          ),
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
