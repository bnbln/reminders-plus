import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { MenuView, type MenuAction, type MenuComponentRef } from '@react-native-menu/menu';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Platform, Pressable } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type ProfileMenuActionId = 'profile' | 'status' | 'streaks' | 'settings';

function ProfileMenuIcon({ theme }: { theme: keyof typeof Colors }) {
  const color = Colors[theme].text;

  if (Platform.OS === 'ios') {
    return (
      <SymbolView
        name="person"
        tintColor={color}
        style={{ width: 20, height: 20 }}
      />
    );
  }

  return <MaterialIcons name="person-outline" size={20} color={color} />;
}

export function ProfileHeaderMenuButton() {
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const menuRef = React.useRef<MenuComponentRef>(null);

  const actions = React.useMemo<MenuAction[]>(() => {
    const imageColor = Colors[theme].text;

    const profile: MenuAction = {
      id: 'profile',
      title: 'Profil',
      image: Platform.OS === 'ios' ? 'person' : undefined,
      imageColor: Platform.OS === 'ios' ? imageColor : undefined,
    };

    const mainGroup: MenuAction = {
      title: '',
      displayInline: true,
      subactions: [
        {
          id: 'status',
          title: 'Status',
          image: Platform.OS === 'ios' ? 'waveform.path.ecg' : undefined,
          imageColor: Platform.OS === 'ios' ? imageColor : undefined,
        },
        {
          id: 'streaks',
          title: 'Streaks',
          image: Platform.OS === 'ios' ? 'flame.fill' : undefined,
          imageColor: Platform.OS === 'ios' ? imageColor : undefined,
        },
      ],
    };

    const settingsGroup: MenuAction = {
      title: '',
      displayInline: true,
      subactions: [
        {
          id: 'settings',
          title: 'Einstellungen',
          image: Platform.OS === 'ios' ? 'gearshape' : undefined,
          imageColor: Platform.OS === 'ios' ? imageColor : undefined,
        },
      ],
    };

    return [profile, mainGroup, settingsGroup];
  }, [theme]);

  const onPressAction = React.useCallback(
    ({ nativeEvent: { event } }: any) => {
      const actionId = event as ProfileMenuActionId;

      if (actionId === 'profile') {
        router.push('/profile');
        return;
      }

      if (actionId === 'status') {
        router.push('/status');
        return;
      }

      if (actionId === 'streaks') {
        router.push('/(tabs)/home/streaks');
        return;
      }

      if (actionId === 'settings') {
        router.push('/settings');
      }
    },
    [router],
  );

  return (
    <MenuView
      ref={menuRef}
      themeVariant={Platform.OS === 'ios' ? theme : undefined}
      isAnchoredToRight={Platform.OS === 'android' ? false : undefined}
      actions={actions}
      onPressAction={onPressAction}
      shouldOpenOnLongPress={false}
      style={{
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
      }}
    >
      {Platform.OS === 'android' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Profil-Menü"
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          onPress={() => menuRef.current?.show?.()}
        >
          <ProfileMenuIcon theme={theme} />
        </Pressable>
      ) : (
        <ProfileMenuIcon theme={theme} />
      )}
    </MenuView>
  );
}
