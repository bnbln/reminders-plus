import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import {
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
import { SFSymbol } from '@/components/ui/sfsymbol';
import { Colors } from '@/constants/theme';
import { useTasksStore } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { t } from '@/i18n';

type ThemeName = keyof typeof Colors;
type MaterialIconName = React.ComponentProps<typeof MaterialIcons>['name'];
type PanelId = 'icon' | 'color' | 'description';
type ProjectAction = {
  id: PanelId;
  title: string;
  icon: MaterialIconName;
  accentColor: string;
};

type SelectionTag = {
  key: string;
  panelId: PanelId;
  label: string;
  icon: MaterialIconName;
  accentColor: string;
};

const DEFAULT_PROJECT_ICON = 'folder.fill';
const DEFAULT_PROJECT_COLOR = '#2563EB';

const ICON_PRESETS = [
  'folder.fill',
  'list.bullet',
  'star.fill',
  'heart.fill',
  'flag.fill',
  'tag.fill',
  'doc.text.fill',
  'paintbrush.fill',
  'briefcase.fill',
  'person.2.fill',
  'cart.fill',
  'creditcard.fill',
  'gift.fill',
  'gamecontroller.fill',
  'headphones',
  'airplane',
  'tram.fill',
  'leaf.fill',
  'flame.fill',
  'bolt.fill',
];

const COLOR_PRESETS = [
  '#7C3AED',
  '#2563EB',
  '#F97316',
  '#10B981',
  '#EF4444',
  '#F59E0B',
  '#EC4899',
  '#6366F1',
];

const createProjectId = () => `p-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const formatIconLabel = (value: string) =>
  value
    .replace('.fill', '')
    .split('.')
    .join(' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

export default function ProjectCreateModal() {
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const isDark = theme === 'dark';
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { setProjects } = useTasksStore();

  const [name, setName] = React.useState('');
  const [icon, setIcon] = React.useState(DEFAULT_PROJECT_ICON);
  const [color, setColor] = React.useState(DEFAULT_PROJECT_COLOR);
  const [description, setDescription] = React.useState('');
  const [isMenuExpanded, setMenuExpanded] = React.useState(false);
  const [activePanelId, setActivePanelId] = React.useState<PanelId>('icon');

  const menuProgress = React.useRef(new Animated.Value(0)).current;
  const titleInputRef = React.useRef<TextInput | null>(null);
  const descriptionInputRef = React.useRef<TextInput | null>(null);
  const canSubmit = name.trim().length > 0;

  React.useEffect(() => {
    const timer = setTimeout(() => titleInputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, []);

  React.useEffect(() => {
    Animated.spring(menuProgress, {
      toValue: isMenuExpanded ? 1 : 0,
      tension: 220,
      friction: 26,
      overshootClamping: true,
      useNativeDriver: true,
    }).start();
  }, [isMenuExpanded, menuProgress]);

  const actions = React.useMemo<ProjectAction[]>(
    () => [
      {
        id: 'icon',
        title: t('projectEdit.icon'),
        icon: 'folder',
        accentColor: '#5AC8FA',
      },
      {
        id: 'color',
        title: t('projectEdit.color'),
        icon: 'palette',
        accentColor: '#FF9F0A',
      },
      {
        id: 'description',
        title: t('projectEdit.placeholder.description'),
        icon: 'notes',
        accentColor: '#34C759',
      },
    ],
    []
  );

  const selectedTags = React.useMemo<SelectionTag[]>(() => {
    const tags: SelectionTag[] = [];

    if (icon !== DEFAULT_PROJECT_ICON) {
      tags.push({
        key: 'icon',
        panelId: 'icon',
        label: formatIconLabel(icon),
        icon: 'folder',
        accentColor: color,
      });
    }

    if (color !== DEFAULT_PROJECT_COLOR) {
      tags.push({
        key: 'color',
        panelId: 'color',
        label: color.toUpperCase(),
        icon: 'palette',
        accentColor: color,
      });
    }

    const trimmedDescription = description.trim();
    if (trimmedDescription.length > 0) {
      tags.push({
        key: 'description',
        panelId: 'description',
        label:
          trimmedDescription.length > 32
            ? `${trimmedDescription.slice(0, 32).trimEnd()}…`
            : trimmedDescription,
        icon: 'notes',
        accentColor: '#34C759',
      });
    }

    return tags;
  }, [color, description, icon]);

  const onCreate = React.useCallback(() => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const trimmedDescription = description.trim();
    setProjects((prev) => [
      {
        id: createProjectId(),
        name: trimmedName,
        icon,
        color,
        description: trimmedDescription.length > 0 ? trimmedDescription : undefined,
        completed: false,
        deletedAt: undefined,
      },
      ...prev,
    ]);
    router.back();
  }, [color, description, icon, name, router, setProjects]);

  const onBackdropPress = React.useCallback(() => {
    if (isMenuExpanded) {
      setMenuExpanded(false);
      return;
    }
    router.back();
  }, [isMenuExpanded, router]);

  const onPanelPress = React.useCallback((panelId: PanelId) => {
    setActivePanelId(panelId);
    if (!isMenuExpanded) setMenuExpanded(true);
    if (panelId === 'description') {
      setTimeout(() => descriptionInputRef.current?.focus(), 120);
    }
  }, [isMenuExpanded]);

  const onTagRemove = React.useCallback((panelId: PanelId) => {
    switch (panelId) {
      case 'icon':
        setIcon(DEFAULT_PROJECT_ICON);
        break;
      case 'color':
        setColor(DEFAULT_PROJECT_COLOR);
        break;
      case 'description':
        setDescription('');
        break;
    }
  }, []);

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
      opacity: menuProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
      }),
    }),
    [menuProgress]
  );

  const menuTint = withAlpha(Colors[theme].background, isDark ? 0.24 : 0.38);
  const menuFallback = withAlpha(Colors[theme].background, isDark ? 0.84 : 0.9);
  const plusTint = withAlpha(Colors[theme].background, isDark ? 0.22 : 0.26);
  const inputTint = withAlpha(Colors[theme].background, isDark ? 0.22 : 0.33);
  const neutralFallback = withAlpha(Colors[theme].background, isDark ? 0.86 : 0.9);
  const sendTint = canSubmit
    ? withAlpha('#007AFF', isDark ? 0.88 : 0.78)
    : withAlpha(Colors[theme].background, isDark ? 0.24 : 0.3);
  const sendFallback = canSubmit ? '#007AFF' : neutralFallback;
  const composerBottom = Math.max(14, insets.bottom - 16);

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: t('projectEdit.newProject'),
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
          presentation: 'transparentModal',
          animation: 'fade',
        }}
      />

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
            <Animated.View style={[styles.expandedWrap, menuAnimatedStyle]}>
              <GlassSurface
                style={styles.expandedSurface}
                glassEffectStyle="regular"
                tintColor={menuTint}
                fallbackBackgroundColor={menuFallback}
                isInteractive
              >
                <View style={styles.expandedMenuList}>
                  {actions.map((action) => {
                    const isActive = action.id === activePanelId;
                    return (
                      <Pressable
                        key={action.id}
                        accessibilityRole="button"
                        accessibilityLabel={action.title}
                        onPress={() => onPanelPress(action.id)}
                        style={({ pressed }) => [
                          styles.expandedMenuItem,
                          isActive && styles.expandedMenuItemActive,
                          pressed && styles.expandedMenuItemPressed,
                        ]}
                      >
                        <View
                          style={[
                            styles.expandedMenuIconBubble,
                            { backgroundColor: withAlpha(action.accentColor, isDark ? 0.24 : 0.14) },
                          ]}
                        >
                          <MaterialIcons name={action.icon} size={18} color={action.accentColor} />
                        </View>
                        <Text style={[styles.expandedMenuLabel, isActive && styles.expandedMenuLabelActive]}>
                          {action.title}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {activePanelId === 'icon' ? (
                  <View style={styles.presetGrid}>
                    {ICON_PRESETS.map((candidate) => (
                      <Pressable
                        key={candidate}
                        accessibilityRole="button"
                        accessibilityLabel={formatIconLabel(candidate)}
                        onPress={() => setIcon(candidate)}
                        style={styles.swatchPressable}
                      >
                        <View style={[styles.iconSwatch, icon === candidate && styles.selectedIconSwatch]}>
                          <SFSymbol
                            name={candidate}
                            size={20}
                            color={icon === candidate ? color : Colors[theme].text}
                          />
                        </View>
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                {activePanelId === 'color' ? (
                  <View style={styles.presetGrid}>
                    {COLOR_PRESETS.map((candidate) => (
                      <Pressable
                        key={candidate}
                        accessibilityRole="button"
                        accessibilityLabel={candidate}
                        onPress={() => setColor(candidate)}
                        style={styles.swatchPressable}
                      >
                        <View
                          style={[
                            styles.colorSwatch,
                            { backgroundColor: candidate },
                            color === candidate && styles.selectedColorSwatch,
                          ]}
                        />
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                {activePanelId === 'description' ? (
                  <View style={styles.descriptionInputWrap}>
                    <TextInput
                      ref={(ref) => {
                        descriptionInputRef.current = ref;
                      }}
                      value={description}
                      onChangeText={setDescription}
                      placeholder={t('projectEdit.placeholder.description')}
                      placeholderTextColor={styles.placeholder.color as string}
                      multiline
                      maxLength={180}
                      style={styles.descriptionInput}
                    />
                  </View>
                ) : null}
              </GlassSurface>
            </Animated.View>
          ) : null}

          {selectedTags.length > 0 ? (
            <View style={styles.selectedTagsWrap}>
              {selectedTags.map((tag) => (
                <Pressable
                  key={tag.key}
                  accessibilityRole="button"
                  accessibilityLabel={tag.label}
                  onPress={() => onPanelPress(tag.panelId)}
                  style={({ pressed }) => [styles.selectedTagPressable, pressed && styles.selectedTagPressed]}
                >
                  <GlassSurface
                    style={styles.selectedTagChip}
                    glassEffectStyle="regular"
                    tintColor={withAlpha(tag.accentColor, isDark ? 0.22 : 0.12)}
                    fallbackBackgroundColor={withAlpha(tag.accentColor, isDark ? 0.28 : 0.17)}
                    isInteractive
                  >
                    <MaterialIcons name={tag.icon} size={14} color={tag.accentColor} />
                    <Text style={styles.selectedTagText} numberOfLines={1}>
                      {tag.label}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${tag.label} entfernen`}
                      onPress={(event) => {
                        event.stopPropagation();
                        onTagRemove(tag.panelId);
                      }}
                      hitSlop={8}
                      style={({ pressed }) => [
                        styles.selectedTagRemoveButton,
                        pressed && styles.selectedTagPressed,
                      ]}
                    >
                      <MaterialIcons
                        name="close"
                        size={12}
                        color={isDark ? 'rgba(255,255,255,0.86)' : 'rgba(28,28,30,0.72)'}
                      />
                    </Pressable>
                  </GlassSurface>
                </Pressable>
              ))}
            </View>
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
                    if (next) {
                      setActivePanelId('icon');
                    } else {
                      setTimeout(() => titleInputRef.current?.focus(), 0);
                    }
                    return next;
                  });
                }}
                style={({ pressed }) => [styles.controlPressable, pressed && styles.controlPressed]}
              >
                <GlassSurface
                  style={[styles.plusButton, isMenuExpanded && styles.plusButtonExpanded]}
                  glassEffectStyle="clear"
                  tintColor={plusTint}
                  fallbackBackgroundColor={neutralFallback}
                  isInteractive
                >
                  <MaterialIcons name={isMenuExpanded ? 'close' : 'add'} size={22} color={Colors[theme].text} />
                </GlassSurface>
              </Pressable>

              <GlassSurface
                style={styles.inputShell}
                glassEffectStyle="regular"
                tintColor={inputTint}
                fallbackBackgroundColor={neutralFallback}
                isInteractive
              >
                <TextInput
                  ref={(ref) => {
                    titleInputRef.current = ref;
                  }}
                  value={name}
                  onChangeText={(next) => {
                    if (isMenuExpanded) setMenuExpanded(false);
                    setName(next);
                  }}
                  placeholder={t('projectEdit.placeholder.projectName')}
                  placeholderTextColor={styles.placeholder.color as string}
                  returnKeyType="done"
                  autoCapitalize="sentences"
                  autoCorrect
                  onFocus={() => setMenuExpanded(false)}
                  onSubmitEditing={onCreate}
                  style={styles.input}
                />
              </GlassSurface>

              <Pressable
                onPress={onCreate}
                disabled={!canSubmit}
                accessibilityRole="button"
                accessibilityLabel={t('projectEdit.newProject')}
                hitSlop={10}
                style={({ pressed }) => [
                  styles.controlPressable,
                  pressed && canSubmit && styles.controlPressed,
                ]}
              >
                <GlassSurface
                  style={[styles.sendButton, !canSubmit && styles.sendButtonDisabled]}
                  glassEffectStyle="regular"
                  tintColor={sendTint}
                  fallbackBackgroundColor={sendFallback}
                  isInteractive
                >
                  <MaterialIcons
                    name="arrow-upward"
                    size={18}
                    color={canSubmit ? 'white' : withAlpha(Colors[theme].text, 0.45)}
                  />
                </GlassSurface>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const createStyles = (theme: ThemeName) => {
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
    expandedWrap: {
      marginBottom: 10,
    },
    expandedSurface: {
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
    expandedMenuList: {
      flexDirection: 'row',
      gap: 8,
      flexWrap: 'wrap',
    },
    expandedMenuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 40,
      borderRadius: 14,
      gap: 8,
      paddingHorizontal: 10,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.48)',
    },
    expandedMenuItemActive: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.78)',
    },
    expandedMenuItemPressed: {
      opacity: 0.8,
    },
    expandedMenuIconBubble: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    expandedMenuLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: withAlpha(text, 0.72),
    },
    expandedMenuLabelActive: {
      color: text,
    },
    presetGrid: {
      marginTop: 12,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    swatchPressable: {
      borderRadius: 14,
    },
    iconSwatch: {
      width: 42,
      height: 42,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
    },
    selectedIconSwatch: {
      borderColor: '#FFFFFF',
      borderWidth: 2,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
    },
    colorSwatch: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    selectedColorSwatch: {
      borderColor: '#FFFFFF',
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
    },
    descriptionInputWrap: {
      marginTop: 12,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.74)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.09)',
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    descriptionInput: {
      minHeight: 72,
      maxHeight: 140,
      fontSize: 15,
      lineHeight: 20,
      color: text,
      textAlignVertical: 'top',
    },
    selectedTagsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingLeft: 56,
      paddingRight: 56,
      marginBottom: 8,
    },
    selectedTagChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: '100%',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
      overflow: 'hidden',
    },
    selectedTagPressable: {
      maxWidth: '100%',
      borderRadius: 14,
    },
    selectedTagPressed: {
      opacity: 0.85,
    },
    selectedTagText: {
      flexShrink: 1,
      fontSize: 13,
      fontWeight: '600',
      color: text,
    },
    selectedTagRemoveButton: {
      width: 18,
      height: 18,
      borderRadius: 9,
      marginLeft: 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.68)',
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
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.42 : 0.24,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
    },
    plusButtonExpanded: {
      transform: [{ scale: 1.02 }],
    },
    inputShell: {
      flex: 1,
      minHeight: 44,
      borderRadius: 22,
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
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.52 : 0.32,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
    },
    sendButtonDisabled: {
      shadowOpacity: isDark ? 0.18 : 0.1,
    },
  });
};
