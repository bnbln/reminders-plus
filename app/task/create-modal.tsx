import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as ExpoGlassEffect from 'expo-glass-effect';
import {
  GlassView,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface, withAlpha } from '@/components/ui/glass-surface';
import { Colors } from '@/constants/theme';
import { useTaskCreateContext } from '@/context/task-create-context';
import { useTasksStore, type SectionId } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { t } from '@/i18n';

const createTaskId = () => `t-${Date.now()}-${Math.random().toString(16).slice(2)}`;

type ComposerActionId = 'date' | 'style' | 'location' | 'routine' | 'project';
type MaterialIconName = React.ComponentProps<typeof MaterialIcons>['name'];
type ComposerAction = {
  id: ComposerActionId;
  title: string;
  icon: MaterialIconName;
  accentColor: string;
};

export default function CreateTaskModal() {
  const router = useRouter();
  const { projectId: projectIdParam } = useLocalSearchParams<{ projectId?: string | string[] }>();
  const theme = useColorScheme() ?? 'light';
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { projectId: focusedProjectId } = useTaskCreateContext();

  const { projects, setTasks } = useTasksStore();
  const initialProjectId = React.useMemo(() => {
    const routeProjectId = Array.isArray(projectIdParam) ? projectIdParam[0] : projectIdParam;
    const rawProjectId = routeProjectId ?? focusedProjectId;
    if (typeof rawProjectId !== 'string') return '';

    const normalizedProjectId = rawProjectId.trim();
    if (!normalizedProjectId) return '';

    const projectExists = projects.some((project) => project.id === normalizedProjectId && !project.deletedAt);
    return projectExists ? normalizedProjectId : '';
  }, [focusedProjectId, projectIdParam, projects]);

  const [title, setTitle] = React.useState('');
  const [isMenuExpanded, setMenuExpanded] = React.useState(false);
  const trimmed = title.trim();
  const canSubmit = trimmed.length > 0;
  const menuProgress = React.useRef(new Animated.Value(0)).current;

  const inputRef = React.useRef<TextInput | null>(null);

  // Draft management
  const draftIdRef = React.useRef<string | null>(null);
  const isCreatedRef = React.useRef(false);

  // Focus input on mount
  React.useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, []);

  // Cleanup draft on unmount if not created
  React.useEffect(() => {
    return () => {
      if (!isCreatedRef.current && draftIdRef.current) {
        const idToDelete = draftIdRef.current;
        // Use functional update to avoid stale closure if we depended on 'tasks' directly,
        // though setStates are stable.
        setTasks((prev) => prev.filter((t) => t.id !== idToDelete));
      }
    };
  }, [setTasks]);

  const ensureDraftTask = React.useCallback(() => {
    if (draftIdRef.current) return draftIdRef.current;

    const nextId = createTaskId();
    draftIdRef.current = nextId;

    // Create a hidden draft task (deletedAt set)
    setTasks((prev) => [
      {
        id: nextId,
        title: title || '',
        emoji: '📝',
        projectId: initialProjectId,
        dueAt: 0,
        dueHasTime: false,
        section: 'upcoming',
        orderRank: 0, // will be fixed on create
        deletedAt: Date.now(), // Hidden
      },
      ...prev,
    ]);

    return nextId;
  }, [initialProjectId, setTasks, title]);

  // Keep draft title in sync so if we navigate away and back, we don't lose it
  // (Optional, but good if we want "Draft" persistence while modal is open to sub-screens)
  const isUpdatingRef = React.useRef(false);
  React.useEffect(() => {
    if (draftIdRef.current && !isUpdatingRef.current) {
      setTasks(prev => prev.map(t => t.id === draftIdRef.current ? { ...t, title: title } : t));
    }
  }, [title, setTasks]);

  React.useEffect(() => {
    Animated.spring(menuProgress, {
      toValue: isMenuExpanded ? 1 : 0,
      tension: 220,
      friction: 26,
      overshootClamping: true,
      useNativeDriver: true,
    }).start();
  }, [isMenuExpanded, menuProgress]);

  // When returning from pickers, we might need to refresh local state if we want to show badges etc.
  // But this modal is simple: just input. The menu items are actions.

  const onUseCurrentLocation = React.useCallback(async () => {
    const id = ensureDraftTask();

    // We need to access the store to update this task. 
    // Since we are in a callback, we can assume 'setTasks' is enough.

    try {
      // Dynamic import to avoid hard dependency if not used
      let Location: typeof import('expo-location');
      try {
        Location = await import('expo-location');
      } catch {
        Alert.alert(t('taskCreate.locationUnavailableTitle'), t('taskCreate.locationUnavailableBody'));
        return;
      }

      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert(t('taskCreate.locationDeniedTitle'), t('taskCreate.locationDeniedBody'));
        return;
      }

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [rev] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });

      const parts = [rev.name, rev.street, rev.district, rev.city].filter(
        (v): v is string => typeof v === 'string' && v.trim().length > 0
      );
      const label = parts.slice(0, 2).join(' · ') || `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;

      setTasks(prev => prev.map(t => t.id === id ? { ...t, location: label } : t));
    } catch {
      Alert.alert(t('taskCreate.locationErrorTitle'), t('taskCreate.locationErrorBody'));
    }
  }, [ensureDraftTask, setTasks]);


  const actions = React.useMemo<ComposerAction[]>(() => {
    return [
      {
        id: 'date',
        title: t('taskCreate.menu.date'),
        icon: 'event',
        accentColor: '#4D7CFF',
      },
      {
        id: 'style',
        title: t('taskCreate.menu.style'),
        icon: 'palette',
        accentColor: '#B56CFF',
      },
      {
        id: 'location',
        title: t('taskCreate.menu.location'),
        icon: 'location-on',
        accentColor: '#34C759',
      },
      {
        id: 'routine',
        title: t('taskCreate.menu.routine'),
        icon: 'autorenew',
        accentColor: '#FF9F0A',
      },
      {
        id: 'project',
        title: t('taskCreate.menu.project'),
        icon: 'folder',
        accentColor: '#5AC8FA',
      },
    ];
  }, []);

  const runAction = React.useCallback((actionId: ComposerActionId) => {
    const id = ensureDraftTask();

    switch (actionId) {
      case 'date':
        router.push({ pathname: '/task/date-picker', params: { taskId: id } });
        break;
      case 'style':
        router.push({ pathname: '/task/emoji-picker', params: { taskId: id } });
        break;
      case 'location':
        onUseCurrentLocation();
        break;
      case 'routine':
        router.push({ pathname: '/task/routine-picker', params: { taskId: id } });
        break;
      case 'project':
        router.push({ pathname: '/task/project-picker', params: { taskId: id } });
        break;
    }
  }, [ensureDraftTask, onUseCurrentLocation, router]);

  const onActionPress = React.useCallback((actionId: ComposerActionId) => {
    setMenuExpanded(false);
    runAction(actionId);
  }, [runAction]);


  const onCreate = React.useCallback(() => {
    setMenuExpanded(false);
    if (!canSubmit) {
      Alert.alert(t('taskCreate.titleMissingTitle'), t('taskCreate.titleMissingBody'));
      return;
    }

    // Finalize
    isCreatedRef.current = true;

    const id = draftIdRef.current;

    if (id) {
      // Update existing draft
      setTasks((prev) => {
        const task = prev.find(t => t.id === id);
        if (!task) return prev; // Should not happen

        // Recalc section based on set due date?
        // The user might have set a due date via picker.
        // If so, we should respect it.

        // Logic:
        // If dueAt is set -> calculate section (today vs upcoming).
        // If not set -> upcoming.

        const dueAt = task.dueAt;
        let section: SectionId = 'upcoming';

        if (dueAt && dueAt > 0) {
          const now = new Date();
          const due = new Date(dueAt);
          const isToday = now.getFullYear() === due.getFullYear() && now.getMonth() === due.getMonth() && now.getDate() === due.getDate();
          section = isToday ? 'today' : 'upcoming';
        }

        // Find min rank in target section
        const minRank = prev
          .filter((t) => !t.deletedAt && t.section === section && t.id !== id)
          .reduce<number | null>((acc, t) => (acc === null ? t.orderRank : Math.min(acc, t.orderRank)), null);
        const orderRank = (minRank ?? 1000) - 1000;

        return prev.map(t => t.id === id ? {
          ...t,
          title: trimmed,
          section,
          orderRank,
          deletedAt: undefined // Un-delete
        } : t);
      });
    } else {
      // No draft exists, create fresh
      const nextId = createTaskId();
      const section: SectionId = 'upcoming';

      setTasks((prev) => {
        const minRank = prev
          .filter((t) => !t.deletedAt && t.section === section)
          .reduce<number | null>((acc, t) => (acc === null ? t.orderRank : Math.min(acc, t.orderRank)), null);
        const orderRank = (minRank ?? 1000) - 1000;

        return [
          {
            id: nextId,
            title: trimmed,
            subtitle: undefined,
            emoji: '📝',
            projectId: initialProjectId,
            dueAt: 0,
            dueHasTime: false,
            section,
            orderRank,
            location: undefined,
            notes: undefined,
            subtasks: undefined,
            completedAt: undefined,
            deletedAt: undefined,
          },
          ...prev,
        ];
      });
    }

    router.back();
  }, [canSubmit, initialProjectId, router, setTasks, trimmed]);

  const close = React.useCallback(() => {
    setMenuExpanded(false);
    router.back();
  }, [router]);

  const onBackdropPress = React.useCallback(() => {
    if (isMenuExpanded) {
      setMenuExpanded(false);
      return;
    }

    close();
  }, [close, isMenuExpanded]);

  const menuAnimatedStyle = React.useMemo(
    () => ({
      transform: [
        {
          translateY: menuProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [20, 0],
          }),
        },
        {
          scale: menuProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [0.96, 1],
          }),
        },
      ],
    }),
    [menuProgress]
  );

  const isDark = theme === 'dark';
  const glassApiAvailableFn = (ExpoGlassEffect as any).isGlassEffectAPIAvailable as
    | undefined
    | (() => boolean);
  const canUseNativeGlass =
    Platform.OS === 'ios' &&
    isLiquidGlassAvailable() &&
    (glassApiAvailableFn ? glassApiAvailableFn() : true);
  const plusTint = withAlpha(Colors[theme].background, isDark ? 0.20 : 0.26);
  const inputTint = withAlpha(Colors[theme].background, isDark ? 0.22 : 0.33);
  const menuTint = withAlpha(Colors[theme].background, isDark ? 0.24 : 0.38);
  const neutralFallback = withAlpha(Colors[theme].background, isDark ? 0.86 : 0.90);
  const expandedMenuFallback = withAlpha(Colors[theme].background, isDark ? 0.84 : 0.88);
  const sendTint = withAlpha('#007AFF', isDark ? 0.88 : 0.78);
  const sendFallback = '#007AFF';
  const sendIconColor = 'white';
  const composerBottom = Math.max(14, insets.bottom - 16);
  const menuBottom = 66;

  return (
    <View style={styles.root}>
      <Pressable
        style={styles.backdrop}
        accessibilityRole="button"
        accessibilityLabel={t('taskCreate.close')}
        onPress={onBackdropPress}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? -10 : 0}
        style={styles.keyboard}
      >
        <View style={[styles.composerWrap, { paddingBottom: composerBottom }]} pointerEvents="box-none">
          {isMenuExpanded ? (
            <Animated.View
              pointerEvents="auto"
              style={[styles.expandedMenuWrap, { bottom: menuBottom }, menuAnimatedStyle]}
            >
              {canUseNativeGlass ? (
                <GlassView
                  key="actions-menu-native-glass"
                  style={styles.expandedMenuSurface}
                  glassEffectStyle="regular"
                  tintColor={menuTint}
                  isInteractive
                >
                  {actions.map((action) => (
                    <Pressable
                      key={action.id}
                      accessibilityRole="button"
                      accessibilityLabel={action.title}
                      onPress={() => onActionPress(action.id)}
                      style={({ pressed }) => [styles.expandedMenuItem, pressed && styles.expandedMenuItemPressed]}
                    >
                    {canUseNativeGlass ? (
                      <GlassView
                        style={styles.expandedMenuIconBubble}
                        glassEffectStyle="regular"
                        tintColor={isDark ? withAlpha('#0B1118', 0.86) : withAlpha('#FFFFFF', 0.88)}
                        isInteractive
                      >
                        <MaterialIcons
                          name={action.icon}
                          size={20}
                          color={isDark ? withAlpha(action.accentColor, 0.82) : action.accentColor}
                        />
                      </GlassView>
                    ) : (
                      <View
                        style={[
                          styles.expandedMenuIconBubble,
                          {
                            backgroundColor: isDark
                              ? withAlpha('#0B1118', 0.92)
                              : withAlpha('#FFFFFF', 0.88),
                          },
                        ]}
                      >
                        <MaterialIcons
                          name={action.icon}
                          size={20}
                          color={isDark ? withAlpha(action.accentColor, 0.82) : action.accentColor}
                        />
                      </View>
                    )}
                      <Text style={styles.expandedMenuLabel}>{action.title}</Text>
                    </Pressable>
                  ))}
                </GlassView>
              ) : (
                <View style={[styles.expandedMenuSurface, { backgroundColor: expandedMenuFallback }]}>
                  {actions.map((action) => (
                    <Pressable
                      key={action.id}
                      accessibilityRole="button"
                      accessibilityLabel={action.title}
                      onPress={() => onActionPress(action.id)}
                      style={({ pressed }) => [styles.expandedMenuItem, pressed && styles.expandedMenuItemPressed]}
                    >
                    <View
                      style={[
                        styles.expandedMenuIconBubble,
                        {
                          backgroundColor: isDark
                            ? withAlpha('#0B1118', 0.92)
                            : withAlpha('#FFFFFF', 0.88),
                        },
                      ]}
                    >
                      <MaterialIcons
                        name={action.icon}
                        size={20}
                        color={isDark ? withAlpha(action.accentColor, 0.82) : action.accentColor}
                      />
                    </View>
                      <Text style={styles.expandedMenuLabel}>{action.title}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </Animated.View>
          ) : null}

          <View style={styles.composerStack}>
            <View pointerEvents="none" style={styles.composerShadowLayer} />
            <View style={styles.composer}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={isMenuExpanded ? t('taskCreate.close') : t('taskCreate.more')}
                  hitSlop={10}
                  onPress={() => {
                    setMenuExpanded((prev) => {
                      const next = !prev;
                      if (next) setTimeout(() => inputRef.current?.focus(), 0);
                      return next;
                    });
                  }}
                  style={({ pressed }) => [styles.controlPressable, pressed && styles.controlPressed]}
                >
                  {canUseNativeGlass ? (
                    <GlassView
                      key="plus-native-glass"
                      style={[styles.plusButton, isMenuExpanded && styles.plusButtonExpanded]}
                      glassEffectStyle="clear"
                      tintColor={plusTint}
                      isInteractive
                    >
                      <MaterialIcons
                        name={isMenuExpanded ? 'close' : 'add'}
                        size={22}
                        color={styles.plusIcon.color as string}
                      />
                    </GlassView>
                  ) : (
                    <GlassSurface
                      style={[styles.plusButton, isMenuExpanded && styles.plusButtonExpanded]}
                      glassEffectStyle="clear"
                      tintColor={plusTint}
                      fallbackBackgroundColor={neutralFallback}
                      isInteractive
                    >
                      <MaterialIcons
                        name={isMenuExpanded ? 'close' : 'add'}
                        size={22}
                        color={styles.plusIcon.color as string}
                      />
                    </GlassSurface>
                  )}
                </Pressable>

                {canUseNativeGlass ? (
                  <GlassView
                    key="input-native-glass"
                    style={styles.inputShell}
                    glassEffectStyle="regular"
                    tintColor={inputTint}
                    isInteractive
                  >
                    <TextInput
                      ref={(r) => {
                        inputRef.current = r;
                      }}
                      value={title}
                      onChangeText={(next) => {
                        if (isMenuExpanded) setMenuExpanded(false);
                        setTitle(next);
                      }}
                      placeholder={t('taskCreate.placeholder.title')}
                      placeholderTextColor={styles.placeholder.color as string}
                      returnKeyType="done"
                      autoCapitalize="sentences"
                      autoCorrect
                      onKeyPress={() => {
                        if (isMenuExpanded) setMenuExpanded(false);
                      }}
                      onFocus={() => setMenuExpanded(false)}
                      onSubmitEditing={onCreate}
                      style={styles.input}
                    />
                  </GlassView>
                ) : (
                  <GlassSurface
                    style={styles.inputShell}
                    glassEffectStyle="regular"
                    tintColor={inputTint}
                    fallbackBackgroundColor={neutralFallback}
                    isInteractive
                  >
                    <TextInput
                      ref={(r) => {
                        inputRef.current = r;
                      }}
                      value={title}
                      onChangeText={(next) => {
                        if (isMenuExpanded) setMenuExpanded(false);
                        setTitle(next);
                      }}
                      placeholder={t('taskCreate.placeholder.title')}
                      placeholderTextColor={styles.placeholder.color as string}
                      returnKeyType="done"
                      autoCapitalize="sentences"
                      autoCorrect
                      onKeyPress={() => {
                        if (isMenuExpanded) setMenuExpanded(false);
                      }}
                      onFocus={() => setMenuExpanded(false)}
                      onSubmitEditing={onCreate}
                      style={styles.input}
                    />
                  </GlassSurface>
                )}

                <Pressable
                  onPress={onCreate}
                  disabled={!canSubmit}
                  accessibilityRole="button"
                  accessibilityLabel={canSubmit ? t('taskCreate.accessibility.create') : t('taskCreate.accessibility.enterTitle')}
                  hitSlop={10}
                  style={({ pressed }) => [styles.controlPressable, pressed && canSubmit && styles.controlPressed]}
                >
                  {canUseNativeGlass ? (
                    <GlassView
                      key={`send-native-glass-${canSubmit ? 'active' : 'disabled'}`}
                      style={styles.sendButton}
                      glassEffectStyle="regular"
                      tintColor={sendTint}
                      isInteractive
                    >
                      <MaterialIcons name="arrow-upward" size={18} color={sendIconColor} />
                    </GlassView>
                  ) : (
                    <GlassSurface
                      style={styles.sendButton}
                      glassEffectStyle="regular"
                      tintColor={sendTint}
                      fallbackBackgroundColor={sendFallback}
                      isInteractive
                    >
                      <MaterialIcons name="arrow-upward" size={18} color={sendIconColor} />
                    </GlassSurface>
                  )}
                </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const createStyles = (theme: keyof typeof Colors) => {
  const isDark = theme === 'dark';
  const text = Colors[theme].text;
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: isDark ? 'rgba(0,0,0,0.58)' : 'rgba(0,0,0,0.14)',
    },
    keyboard: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    composerWrap: {
      paddingHorizontal: 12,
      paddingTop: 12,
    },
    expandedMenuWrap: {
      position: 'absolute',
      left: 4,
      width: '63%',
      maxWidth: 300,
      zIndex: 8,
    },
    expandedMenuSurface: {
      borderRadius: 28,
      paddingHorizontal: 10,
      paddingVertical: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.30)',
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.48 : 0.26,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 16 },
    },
    expandedMenuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      minHeight: 56,
      borderRadius: 18,
      paddingHorizontal: 10,
    },
    expandedMenuItemPressed: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.62)',
    },
    expandedMenuIconBubble: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 0,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.26 : 0.12,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
    },
    expandedMenuLabel: {
      fontSize: 20,
      lineHeight: 26,
      fontWeight: '500',
      color: text,
    },
    composerStack: {
      width: '100%',
      position: 'relative',
    },
    composerShadowLayer: {
      position: 'absolute',
      left: 6,
      right: 6,
      top: 12,
      bottom: -8,
      borderRadius: 30,
      backgroundColor: isDark ? 'rgba(0,0,0,0.42)' : 'rgba(0,0,0,0.18)',
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.62 : 0.36,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: 16 },
    },
    composer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    controlPressable: {
      borderRadius: 22,
    },
    controlPressed: {
      transform: [{ scale: 0.98 }],
    },
    plusButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 0,
      borderColor: 'transparent',
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.42 : 0.24,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
    },
    plusButtonExpanded: {
      transform: [{ scale: 1.02 }],
    },
    plusIcon: {
      color: text,
    },
    inputShell: {
      flex: 1,
      minHeight: 44,
      borderRadius: 22,
      borderWidth: 0,
      borderColor: 'transparent',
      overflow: 'hidden',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.4 : 0.2,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
    },
    input: {
      minHeight: 44,
      maxHeight: 120,
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: 17,
      color: text,
    },
    placeholder: {
      color: isDark ? 'rgba(235,235,245,0.45)' : 'rgba(60,60,67,0.45)',
    },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 0,
      borderColor: 'transparent',
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.52 : 0.32,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
    },
    sendIcon: {
      color: 'white',
    },
  });
};
