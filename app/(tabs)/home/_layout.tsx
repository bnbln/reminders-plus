import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { MenuView, type MenuAction, type MenuComponentRef } from '@react-native-menu/menu';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Platform, Pressable } from 'react-native';

import { Colors } from '@/constants/theme';
import {
    parseTagIconsParam,
    parseTagsParam,
    serializeTagsParam,
    getTagTitle,
    TAG_DEFS,
    TAG_ORDER,
    useHomeFilters,
    type TagId,
} from '@/context/home-filters-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { isRtlLocale, t } from '@/i18n';

function setsEqual<T>(a: Set<T>, b: Set<T>) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
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

  const params = useLocalSearchParams<{ tags?: string; tagIcons?: string }>();
  const { enabledTags, setEnabledTags, showTagIcons, setShowTagIcons } = useHomeFilters();

  // One-way sync from URL params -> store (deep links / restore).
  React.useEffect(() => {
    // Important: if the param is absent, do NOT override persisted/app state.
    if (params.tags !== undefined) {
      const nextEnabled = parseTagsParam(params.tags);
      setEnabledTags((prev) => (setsEqual(prev, nextEnabled) ? prev : nextEnabled));
    }

    if (params.tagIcons !== undefined) {
      const nextIcons = parseTagIconsParam(params.tagIcons);
      setShowTagIcons((prev) => (prev === nextIcons ? prev : nextIcons));
    }
  }, [params.tagIcons, params.tags, setEnabledTags, setShowTagIcons]);

  const pendingReopenRef = React.useRef(false);
  const scheduleReopen = React.useCallback(() => {
    if (Platform.OS !== 'ios') return;
    pendingReopenRef.current = true;
    setTimeout(() => {
      if (!pendingReopenRef.current) return;
      pendingReopenRef.current = false;
      menuRef.current?.show?.();
    }, 0);
  }, []);

  const actions = React.useMemo<MenuAction[]>(() => {
    const iconColor = Colors[theme].text;

    const showAll: MenuAction = {
      id: 'showAllTags',
      title: t('home.filter.showAllTags'),
      image: Platform.OS === 'ios' ? 'eye' : undefined,
      imageColor: Platform.OS === 'ios' ? iconColor : undefined,
    };

    const hideAll: MenuAction = {
      id: 'hideAllTags',
      title: t('home.filter.hideAllTags'),
      image: Platform.OS === 'ios' ? 'eye.slash' : undefined,
      imageColor: Platform.OS === 'ios' ? iconColor : undefined,
    };

    const toggles: MenuAction[] = [
      {
        id: 'toggleTagIcons',
        title: t('home.filter.icons'),
        image: Platform.OS === 'ios' ? 'app.dashed' : undefined,
        imageColor: Platform.OS === 'ios' ? iconColor : undefined,
        state: Platform.OS === 'ios' ? (showTagIcons ? 'on' : 'off') : undefined,
      },
      ...TAG_ORDER.map((tag) => {
        const on = enabledTags.has(tag);
        return {
          id: tag,
          title: getTagTitle(tag),
          image: Platform.OS === 'ios' ? TAG_DEFS[tag].iosSymbol : undefined,
          imageColor: Platform.OS === 'ios' ? iconColor : undefined,
          state: Platform.OS === 'ios' ? (on ? 'on' : 'off') : undefined,
        } satisfies MenuAction;
      }),
    ];

    // `displayInline` creates a visual separator before this group on iOS.
    const inlineGroup: MenuAction = {
      // Empty title avoids an extra blank row (large spacing) above the first toggle.
      title: '',
      displayInline: true,
      subactions: toggles,
    };

    return [showAll, hideAll, inlineGroup];
  }, [enabledTags, showTagIcons, theme]);

  const onPressAction = React.useCallback(
    ({ nativeEvent: { event } }: any) => {
      const id = event as string;

      if (id === 'showAllTags') {
        const next = new Set<TagId>(TAG_ORDER);
        setEnabledTags(next);
        router.setParams({ tags: 'all' });
        scheduleReopen();
        return;
      }

      if (id === 'hideAllTags') {
        const next = new Set<TagId>();
        setEnabledTags(next);
        router.setParams({ tags: undefined });
        scheduleReopen();
        return;
      }

      if (id === 'toggleTagIcons') {
        const next = !showTagIcons;
        setShowTagIcons(next);
        router.setParams({ tagIcons: next ? '1' : '0' });
        scheduleReopen();
        return;
      }

      if ((TAG_ORDER as readonly string[]).includes(id)) {
        const tag = id as TagId;
        setEnabledTags((prev) => {
          const next = new Set(prev);
          if (next.has(tag)) next.delete(tag);
          else next.add(tag);
          router.setParams({ tags: serializeTagsParam(next) });
          return next;
        });
        scheduleReopen();
      }
    },
    [router, scheduleReopen, setEnabledTags, setShowTagIcons, showTagIcons]
  );

  return (
    <MenuView
      ref={menuRef}
      themeVariant={Platform.OS === 'ios' ? theme : undefined}
      isAnchoredToRight={Platform.OS === 'android' ? true : undefined}
      actions={actions}
      onPressAction={onPressAction}
      shouldOpenOnLongPress={false}
      style={{
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
      }}>
      {Platform.OS === 'android' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.filter')}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          onPress={() => menuRef.current?.show?.()}>
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
  const headerTextAlign = isRtlLocale() ? 'right' : 'left';

  return (
    <Stack
      screenOptions={{
        headerLargeTitle: Platform.OS === 'ios',
        headerShadowVisible: false,
        contentStyle: { backgroundColor: Colors[theme].background },
        headerTintColor: Colors[theme].text,
        headerTitleAlign: headerTextAlign,
        headerTitleStyle: { color: Colors[theme].text, textAlign: headerTextAlign },
        headerLargeTitleStyle: { color: Colors[theme].text, textAlign: headerTextAlign },
      }}>
      <Stack.Screen
        name="index"
        options={{
          title: t('tabs.tasks'),
          headerRight: () => <FilterMenuButton theme={theme} />,
        }}
      />
      <Stack.Screen
        name="archive"
        options={{
          title: t('archive.title'),
          headerTransparent: Platform.OS === 'ios',
        }}
      />

      <Stack.Screen
        name="streaks"
        options={{
          title: t('home.quick.streaks'),
          headerLargeTitle: false,
          headerBackButtonDisplayMode: 'minimal',
          headerTransparent: Platform.OS === 'ios',
        }}
      />
      <Stack.Screen
        name="inbox"
        options={{
          title: t('common.inbox'),
          headerLargeTitle: false,
          headerBackButtonDisplayMode: 'minimal',
          headerTransparent: Platform.OS === 'ios',
          headerRight: () => <FilterMenuButton theme={theme} />,
        }}
      />
      <Stack.Screen
        name="routines"
        options={{
          title: t('home.quick.routines'),
          headerLargeTitle: false,
          headerBackButtonDisplayMode: 'minimal',
          headerTransparent: Platform.OS === 'ios',
        }}
      />
      <Stack.Screen
        name="today"
        options={{
          title: t('common.today'),
          headerLargeTitle: false,
          headerBackButtonDisplayMode: 'minimal',
          headerTransparent: Platform.OS === 'ios',
          headerRight: () => <FilterMenuButton theme={theme} />,
        }}
      />
    </Stack>
  );
}
