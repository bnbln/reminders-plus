import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { MenuView, type MenuAction, type MenuComponentRef } from '@react-native-menu/menu';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Platform, PlatformColor, Pressable } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { FILTERS } from './filters';

type SectionId = 'today' | 'upcoming' | 'completed';
const SECTION_ORDER: SectionId[] = ['today', 'upcoming', 'completed'];

function parseSectionsParam(value: unknown): Set<SectionId> {
  if (typeof value !== 'string' || value.trim().length === 0) return new Set(SECTION_ORDER);
  const parts = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const enabled = new Set<SectionId>();
  for (const p of parts) {
    if (p === 'today' || p === 'upcoming' || p === 'completed') enabled.add(p);
  }
  return enabled.size ? enabled : new Set(SECTION_ORDER);
}

function serializeSectionsParam(enabled: Set<SectionId>): string | undefined {
  const allEnabled = SECTION_ORDER.every((s) => enabled.has(s));
  if (allEnabled) return undefined;
  return SECTION_ORDER.filter((s) => enabled.has(s)).join(',');
}

function FilterIcon({ theme }: { theme: keyof typeof Colors }) {
  const color = Colors[theme].text;
  if (Platform.OS === 'ios') {
    return <SymbolView name="line.3.horizontal.decrease.circle" tintColor={color} style={{ width: 22, height: 22 }} />;
  }
  return <MaterialIcons name="filter-list" size={22} color={color} />;
}

function FilterMenuButton({ theme }: { theme: keyof typeof Colors }) {
  const router = useRouter();
  const menuRef = React.useRef<MenuComponentRef>(null);

  const params = useLocalSearchParams<{ sections?: string; withNotes?: string }>();
  const enabledSections = React.useMemo(() => parseSectionsParam(params.sections), [params.sections]);
  const withNotesEnabled = params.withNotes === '1';

  const actions: MenuAction[] = React.useMemo(() => {
    const keepsMenuPresented = Platform.OS === 'ios' ? { keepsMenuPresented: true } : undefined;

    const sectionActions: MenuAction[] = SECTION_ORDER.map((section) => {
      const f = FILTERS.find((x) => x.id === section);
      const on = enabledSections.has(section);
      return {
        id: section,
        title: f?.title ?? section,
        subtitle: `${f?.subtitle ?? ''}${f?.subtitle ? ' · ' : ''}${on ? 'An' : 'Aus'}`,
        image: Platform.OS === 'ios' ? f?.icon?.ios : undefined,
        attributes: keepsMenuPresented,
      };
    });

    const notesFilter = FILTERS.find((x) => x.id === 'withNotes');
    const notesAction: MenuAction = {
      id: 'withNotes',
      title: notesFilter?.title ?? 'Mit Notiz',
      subtitle: `${notesFilter?.subtitle ?? ''}${notesFilter?.subtitle ? ' · ' : ''}${withNotesEnabled ? 'An' : 'Aus'}`,
      image: Platform.OS === 'ios' ? notesFilter?.icon?.ios : undefined,
      attributes: keepsMenuPresented,
    };

    const allFilter = FILTERS.find((x) => x.id === 'all');
    const resetAction: MenuAction = {
      id: 'all',
      title: allFilter?.title ?? 'Alle',
      subtitle: 'Alles anzeigen',
      image: Platform.OS === 'ios' ? allFilter?.icon?.ios : undefined,
    };

    return [resetAction, ...sectionActions, notesAction];
  }, [enabledSections, withNotesEnabled]);

  return (
    <MenuView
      ref={menuRef}
      themeVariant={Platform.OS === 'ios' ? theme : undefined}
      isAnchoredToRight={Platform.OS === 'android' ? true : undefined}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Platform.OS === 'ios' ? PlatformColor('tertiarySystemFill') : 'transparent',
      }}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      actions={actions}
      onPressAction={({ nativeEvent }) => {
        const id = nativeEvent.event;

        if (id === 'all') {
          router.setParams({ sections: undefined, withNotes: undefined });
          return;
        }

        if (id === 'withNotes') {
          router.setParams({ withNotes: withNotesEnabled ? undefined : '1' });
          return;
        }

        if (id === 'today' || id === 'upcoming' || id === 'completed') {
          const next = new Set(enabledSections);
          if (next.has(id)) {
            if (next.size === 1) {
              // don't allow turning off the last section
              return;
            }
            next.delete(id);
          } else {
            next.add(id);
          }
          router.setParams({ sections: serializeSectionsParam(next) });
          return;
        }

        // ignore unknown ids
        return;
      }}
      shouldOpenOnLongPress={false}>
      {Platform.OS === 'android' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Filter"
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          onPress={() => menuRef.current?.show()}>
          <FilterIcon theme={theme} />
        </Pressable>
      ) : (
        <FilterIcon theme={theme} />
      )}
    </MenuView>
  );
}

export default function HomeLayout() {
  const theme = useColorScheme() ?? 'light';

  return (
    <Stack
      screenOptions={{
        headerLargeTitle: Platform.OS === 'ios',
        headerShadowVisible: false,
        headerTintColor: Colors[theme].text,
        headerStyle: {
         // backgroundColor: Colors[theme].background,
        },
        headerTitleStyle: {
          color: Colors[theme].text,
        },
        headerLargeTitleStyle: {
          color: Colors[theme].text,
        },
      }}>
      <Stack.Screen
        name="index"
        options={{
          title: 'Tasks',
          headerRight: () => <FilterMenuButton theme={theme} />,
        }}
      />
    </Stack>
  );
}
