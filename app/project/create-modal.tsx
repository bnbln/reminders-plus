import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { type MenuAction } from '@react-native-menu/menu';
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { GlassSurface, withAlpha } from '@/components/ui/glass-surface';
import { SFSymbol } from '@/components/ui/sfsymbol';
import { Colors } from '@/constants/theme';
import { getAccentColorValue, useAppSettings } from '@/context/settings-store';
import { usePremium } from '@/context/premium-store';
import { useTasksStore } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { t } from '@/i18n';
import { shouldRouteToProjectLimitGate } from '@/utils/project-creation-gate';
import { ripple } from "@/components/ui/ripple";
import { m3InputProps } from '@/components/ui/m3-input';

type ThemeName = keyof typeof Colors;

type EmojiPreset = {
  emoji: string;
  icon: string;
  labelKey: string;
};

const DEFAULT_PROJECT_ICON = 'folder.fill';
const DEFAULT_PROJECT_COLOR = '#2563EB';
const PICKER_ROW_GAP = 8;
const SEND_BUTTON_SIZE = 44;

const EMOJI_PRESETS: EmojiPreset[] = [
  { emoji: '📁', icon: 'folder.fill', labelKey: 'projectPreset.folder' },
  { emoji: '📝', icon: 'doc.text.fill', labelKey: 'projectPreset.notes' },
  { emoji: '⭐', icon: 'star.fill', labelKey: 'projectPreset.star' },
  { emoji: '❤️', icon: 'heart.fill', labelKey: 'projectPreset.heart' },
  { emoji: '🚩', icon: 'flag.fill', labelKey: 'projectPreset.flag' },
  { emoji: '🏷️', icon: 'tag.fill', labelKey: 'projectPreset.tag' },
  { emoji: '🎨', icon: 'paintbrush.fill', labelKey: 'projectPreset.creative' },
  { emoji: '💼', icon: 'briefcase.fill', labelKey: 'projectPreset.work' },
  { emoji: '👥', icon: 'person.2.fill', labelKey: 'projectPreset.team' },
  { emoji: '🛒', icon: 'cart.fill', labelKey: 'projectPreset.shopping' },
  { emoji: '🎁', icon: 'gift.fill', labelKey: 'projectPreset.gift' },
  { emoji: '🎮', icon: 'gamecontroller.fill', labelKey: 'projectPreset.gaming' },
  { emoji: '🎧', icon: 'headphones', labelKey: 'projectPreset.audio' },
  { emoji: '✈️', icon: 'airplane', labelKey: 'projectPreset.travel' },
  { emoji: '🚋', icon: 'tram.fill', labelKey: 'projectPreset.mobility' },
  { emoji: '🍃', icon: 'leaf.fill', labelKey: 'projectPreset.nature' },
  { emoji: '🔥', icon: 'flame.fill', labelKey: 'projectPreset.focus' },
  { emoji: '⚡', icon: 'bolt.fill', labelKey: 'projectPreset.energy' },
];

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
  '#0EA5E9',
  '#14B8A6',
];

const COLOR_LABEL_KEY_BY_HEX: Record<string, string> = {
  '#7C3AED': 'taskCreate.color.purple',
  '#2563EB': 'taskCreate.color.blue',
  '#F97316': 'taskCreate.color.orange',
  '#10B981': 'taskCreate.color.green',
  '#EF4444': 'taskCreate.color.red',
  '#F59E0B': 'taskCreate.color.yellow',
  '#EC4899': 'taskCreate.color.pink',
  '#6366F1': 'taskCreate.color.indigo',
  '#0EA5E9': 'taskCreate.color.cyan',
  '#14B8A6': 'taskCreate.color.mint',
};

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
  const { accentColor } = useAppSettings();
  const { projects, setProjects } = useTasksStore();
  const { hasPremiumAccess, isReady } = usePremium();

  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [icon, setIcon] = React.useState(DEFAULT_PROJECT_ICON);
  const [color, setColor] = React.useState(DEFAULT_PROJECT_COLOR);
  const [selectedEmoji, setSelectedEmoji] = React.useState('📁');

  const titleInputRef = React.useRef<TextInput | null>(null);
  const descriptionInputRef = React.useRef<TextInput | null>(null);
  const activeInputRef = React.useRef<'title' | 'description'>('title');

  const canSubmit = name.trim().length > 0;
  const activeProjectCount = React.useMemo(
    () => projects.filter((project) => !project.deletedAt).length,
    [projects]
  );

  React.useEffect(() => {
    const timer = setTimeout(() => titleInputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, []);

  const focusActiveInput = React.useCallback(() => {
    if (Platform.OS !== 'ios') return;
    const target =
      activeInputRef.current === 'description' ? descriptionInputRef.current : titleInputRef.current;
    (target ?? titleInputRef.current)?.focus();
  }, []);

  const keepKeyboardOpen = React.useCallback(() => {
    if (Platform.OS !== 'ios') return;
    focusActiveInput();
    requestAnimationFrame(() => focusActiveInput());
    setTimeout(() => focusActiveInput(), 40);
    setTimeout(() => focusActiveInput(), 120);
  }, [focusActiveInput]);

  const onFocusTitle = React.useCallback(() => {
    activeInputRef.current = 'title';
  }, []);

  const onFocusDescription = React.useCallback(() => {
    activeInputRef.current = 'description';
  }, []);

  const createProject = React.useCallback(() => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const trimmedDescription = description.trim();
    const trimmedEmoji = selectedEmoji.trim();

    setProjects((prev) => [
      {
        id: createProjectId(),
        name: trimmedName,
        icon,
        emoji: trimmedEmoji.length > 0 ? trimmedEmoji : undefined,
        color,
        description: trimmedDescription.length > 0 ? trimmedDescription : undefined,
        completed: false,
        deletedAt: undefined,
      },
      ...prev,
    ]);

    router.back();
  }, [color, description, icon, name, router, selectedEmoji, setProjects]);

  const onCreate = React.useCallback(() => {
    if (!name.trim()) return;

    if (
      shouldRouteToProjectLimitGate({
        activeProjectCount,
        hasPremiumAccess,
        isReady,
      })
    ) {
      router.replace('/project/limit-modal');
      return;
    }

    createProject();
  }, [activeProjectCount, createProject, hasPremiumAccess, isReady, name, router]);

  const onBackdropPress = React.useCallback(() => {
    router.back();
  }, [router]);

  const symbolActions = React.useMemo<MenuAction[]>(() => {
    const iconColor = Colors[theme].text;

    const emojiActions: MenuAction[] = EMOJI_PRESETS.map((preset) => ({
      id: `emoji:${preset.emoji}`,
      title: `${preset.emoji} ${t(preset.labelKey)}`,
      state: Platform.OS === 'ios' ? (selectedEmoji === preset.emoji ? 'on' : 'off') : undefined,
    }));

    const iconActions: MenuAction[] = ICON_PRESETS.map((candidate) => {
      const selectedByIcon = !selectedEmoji && icon === candidate;
      return {
        id: `icon:${candidate}`,
        title: formatIconLabel(candidate),
        image: Platform.OS === 'ios' ? candidate : undefined,
        imageColor: Platform.OS === 'ios' ? iconColor : undefined,
        state: Platform.OS === 'ios' ? (selectedByIcon ? 'on' : 'off') : undefined,
      };
    });

    return [
      {
        title: t('projectEdit.emoji'),
        displayInline: true,
        subactions: emojiActions,
      },
      {
        title: t('projectEdit.icon'),
        displayInline: true,
        subactions: iconActions,
      },
    ];
  }, [icon, selectedEmoji, theme]);

  const colorActions = React.useMemo<MenuAction[]>(() => {
    return COLOR_PRESETS.map((candidate) => ({
      id: `color:${candidate}`,
      title: t(COLOR_LABEL_KEY_BY_HEX[candidate.toUpperCase()] ?? 'taskCreate.color.custom'),
      image: Platform.OS === 'ios' ? 'circle.fill' : undefined,
      imageColor: Platform.OS === 'ios' ? candidate : undefined,
      state: Platform.OS === 'ios' ? (color === candidate ? 'on' : 'off') : undefined,
    }));
  }, [color]);

  const onPressSymbolAction = React.useCallback(
    ({ nativeEvent: { event } }: any) => {
      const id = String(event || '');

      if (id.startsWith('emoji:')) {
        const selected = id.slice('emoji:'.length);
        const match = EMOJI_PRESETS.find((preset) => preset.emoji === selected);
        if (!match) return;
        setSelectedEmoji(match.emoji);
        setIcon(match.icon);
        keepKeyboardOpen();
        return;
      }

      if (id.startsWith('icon:')) {
        const selected = id.slice('icon:'.length);
        if (!ICON_PRESETS.includes(selected)) return;
        setSelectedEmoji('');
        setIcon(selected);
        keepKeyboardOpen();
      }
    },
    [keepKeyboardOpen]
  );

  const onPressColorAction = React.useCallback(({ nativeEvent: { event } }: any) => {
    const id = String(event || '');
    if (!id.startsWith('color:')) return;
    const selected = id.slice('color:'.length).toUpperCase();
    if (!COLOR_PRESETS.includes(selected)) return;
    setColor(selected);
    keepKeyboardOpen();
  }, [keepKeyboardOpen]);

  const fieldTint = withAlpha(Colors[theme].background, isDark ? 0.2 : 0.34);
  const fieldFallback = withAlpha(Colors[theme].background, isDark ? 0.82 : 0.92);
  const pickerFallback = withAlpha(Colors[theme].background, isDark ? 0.8 : 0.9);
  const accentColorValue = getAccentColorValue(accentColor);
  const sendTint = withAlpha(accentColorValue, isDark ? 0.88 : 0.78);
  const disabledSendTint = withAlpha(Colors[theme].background, isDark ? 0.24 : 0.32);

  const previewEmoji = selectedEmoji.trim();
  const symbolChipTint = withAlpha(Colors[theme].background, isDark ? 0.2 : 0.3);
  const symbolChipFallback = withAlpha(Colors[theme].background, isDark ? 0.82 : 0.92);
  const colorChipTint = withAlpha(color, isDark ? 0.22 : 0.12);
  const colorChipFallback = withAlpha(color, isDark ? 0.28 : 0.18);

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
        <View
          style={[styles.floatingStack, { paddingBottom: Math.max(14, insets.bottom - 8) }]}
          pointerEvents="box-none"
        >
          <GlassSurface
            style={styles.nameSurface}
            glassEffectStyle="regular"
            tintColor={fieldTint}
            fallbackBackgroundColor={fieldFallback}
            isInteractive
          >
            <View style={styles.nameRow}>
              <TextInput
                {...m3InputProps()}
                ref={(ref) => {
                  titleInputRef.current = ref;
                }}
                value={name}
                onChangeText={setName}
                onFocus={onFocusTitle}
                placeholder={t('projectEdit.placeholder.projectName')}
                placeholderTextColor={styles.placeholder.color as string}
                returnKeyType="next"
                autoCapitalize="sentences"
                autoCorrect
                style={styles.nameInput}
              />
            </View>
          </GlassSurface>

          <GlassSurface
            style={styles.descriptionSurface}
            glassEffectStyle="regular"
            tintColor={fieldTint}
            fallbackBackgroundColor={fieldFallback}
            isInteractive
          >
            <TextInput
              {...m3InputProps()}
              ref={(ref) => {
                descriptionInputRef.current = ref;
              }}
              value={description}
              onChangeText={setDescription}
              onFocus={onFocusDescription}
              placeholder={t('projectEdit.placeholder.description')}
              placeholderTextColor={styles.placeholder.color as string}
              multiline
              numberOfLines={2}
              scrollEnabled
              maxLength={180}
              textAlignVertical="top"
              style={styles.descriptionInput}
            />
          </GlassSurface>

          <View style={styles.pickerRow}>
            <DropdownMenu
              actions={symbolActions}
              onPressAction={onPressSymbolAction}
              onOpenMenu={keepKeyboardOpen}
              onCloseMenu={keepKeyboardOpen}
              shouldOpenOnLongPress={false}
              themeVariant={Platform.OS === 'ios' ? theme : undefined}
              style={styles.menuAnchor}
            >
              <GlassSurface
                style={styles.pickerSurface}
                glassEffectStyle="regular"
                tintColor={symbolChipTint}
                fallbackBackgroundColor={symbolChipFallback}
                isInteractive
              >
                <View style={styles.pickerContentRow} onTouchStart={keepKeyboardOpen}>
                  {previewEmoji ? (
                    <Text style={styles.pickerEmoji}>{previewEmoji}</Text>
                  ) : (
                    <SFSymbol name={icon} size={14} color={color} />
                  )}
                  <Text style={styles.pickerLabel} numberOfLines={1}>{t('projectEdit.icon')}</Text>
                  <MaterialIcons name="expand-more" size={14} color={withAlpha(Colors[theme].text, 0.62)} />
                </View>
              </GlassSurface>
            </DropdownMenu>

            <DropdownMenu
              actions={colorActions}
              onPressAction={onPressColorAction}
              onOpenMenu={keepKeyboardOpen}
              onCloseMenu={keepKeyboardOpen}
              shouldOpenOnLongPress={false}
              themeVariant={Platform.OS === 'ios' ? theme : undefined}
              style={styles.menuAnchor}
            >
              <GlassSurface
                style={styles.pickerSurface}
                glassEffectStyle="regular"
                tintColor={colorChipTint}
                fallbackBackgroundColor={colorChipFallback}
                isInteractive
              >
                <View style={styles.pickerContentRow} onTouchStart={keepKeyboardOpen}>
                  <View style={[styles.colorDot, { backgroundColor: color }]} />
                  <Text style={styles.pickerLabel} numberOfLines={1}>{t('projectEdit.color')}</Text>
                  <MaterialIcons name="expand-more" size={14} color={withAlpha(Colors[theme].text, 0.62)} />
                </View>
              </GlassSurface>
            </DropdownMenu>

            <Pressable
              android_ripple={ripple()}
              onPress={onCreate}
              disabled={!canSubmit}
              style={({ pressed }) => [styles.sendPressable, pressed && canSubmit && styles.buttonPressed]}
              accessibilityRole="button"
              accessibilityLabel={t('projectEdit.newProject')}
            >
              <GlassSurface
                style={[styles.sendSurface, !canSubmit && styles.sendSurfaceDisabled]}
                glassEffectStyle="regular"
                tintColor={canSubmit ? sendTint : disabledSendTint}
                fallbackBackgroundColor={canSubmit ? accentColorValue : pickerFallback}
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
      </KeyboardAvoidingView>
    </View>
  );
}

const createStyles = (theme: ThemeName) => {
  const isDark = theme === 'dark';
  const text = Colors[theme].text;
  const cardBorder = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.34)';

  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: isDark ? 'rgba(0,0,0,0.58)' : 'rgba(0,0,0,0.14)',
    },
    keyboard: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    floatingStack: {
      paddingHorizontal: 12,
      paddingTop: 12,
      gap: 10,
    },
    nameSurface: {
      borderRadius: SEND_BUTTON_SIZE / 2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: cardBorder,
      height: SEND_BUTTON_SIZE,
      marginRight: SEND_BUTTON_SIZE + PICKER_ROW_GAP,
      paddingHorizontal: 14,
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.3 : 0.16,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    nameInput: {
      flex: 1,
      fontSize: 17,
      color: text,
      paddingVertical: 0,
      minHeight: 24,
    },
    descriptionSurface: {
      borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: cardBorder,
      height: 64,
      marginRight: 0,
      paddingHorizontal: 14,
      paddingVertical: 10,
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.34 : 0.18,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
    },
    descriptionInput: {
      minHeight: 40,
      maxHeight: 40,
      fontSize: 15,
      lineHeight: 20,
      color: text,
      paddingVertical: 0,
    },
    pickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: PICKER_ROW_GAP,
    },
    menuAnchor: {
      flex: 1,
      minWidth: 0,
    },
    pickerSurface: {
      height: 44,
      borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: cardBorder,
      paddingHorizontal: 12,
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.28 : 0.14,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
    },
    pickerContentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    pickerEmoji: {
      fontSize: 16,
      lineHeight: 19,
    },
    pickerLabel: {
      flex: 1,
      fontSize: 12,
      fontWeight: '600',
      color: text,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    colorDot: {
      width: 11,
      height: 11,
      borderRadius: 6,
    },
    sendPressable: {
      borderRadius: SEND_BUTTON_SIZE / 2,
    },
    sendSurface: {
      width: SEND_BUTTON_SIZE,
      height: SEND_BUTTON_SIZE,
      borderRadius: SEND_BUTTON_SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha('#007AFF', 0.45),
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.44 : 0.24,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 },
    },
    sendSurfaceDisabled: {
      borderColor: cardBorder,
      shadowOpacity: isDark ? 0.16 : 0.1,
    },
    placeholder: {
      color: isDark ? 'rgba(235,235,245,0.45)' : 'rgba(60,60,67,0.45)',
    },
    buttonPressed: {
      opacity: 0.86,
      transform: [{ scale: 0.98 }],
    },
  });
};
