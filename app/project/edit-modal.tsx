import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { MenuView, type MenuAction } from '@react-native-menu/menu';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
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

import { GlassSurface, withAlpha } from '@/components/ui/glass-surface';
import { SFSymbol } from '@/components/ui/sfsymbol';
import { Colors } from '@/constants/theme';
import { useTasksStore } from '@/context/tasks-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { t } from '@/i18n';

type ThemeName = keyof typeof Colors;

type EmojiPreset = {
  emoji: string;
  icon: string;
  label: string;
};

const DEFAULT_PROJECT_ICON = 'folder.fill';
const DEFAULT_PROJECT_COLOR = '#2563EB';
const PICKER_ROW_GAP = 8;
const ACTION_BUTTON_SIZE = 44;

const EMOJI_PRESETS: EmojiPreset[] = [
  { emoji: '📁', icon: 'folder.fill', label: 'Folder' },
  { emoji: '📝', icon: 'doc.text.fill', label: 'Notes' },
  { emoji: '⭐', icon: 'star.fill', label: 'Star' },
  { emoji: '❤️', icon: 'heart.fill', label: 'Heart' },
  { emoji: '🚩', icon: 'flag.fill', label: 'Flag' },
  { emoji: '🏷️', icon: 'tag.fill', label: 'Tag' },
  { emoji: '🎨', icon: 'paintbrush.fill', label: 'Creative' },
  { emoji: '💼', icon: 'briefcase.fill', label: 'Work' },
  { emoji: '👥', icon: 'person.2.fill', label: 'Team' },
  { emoji: '🛒', icon: 'cart.fill', label: 'Shopping' },
  { emoji: '🎁', icon: 'gift.fill', label: 'Gift' },
  { emoji: '🎮', icon: 'gamecontroller.fill', label: 'Gaming' },
  { emoji: '🎧', icon: 'headphones', label: 'Audio' },
  { emoji: '✈️', icon: 'airplane', label: 'Travel' },
  { emoji: '🚋', icon: 'tram.fill', label: 'Mobility' },
  { emoji: '🍃', icon: 'leaf.fill', label: 'Nature' },
  { emoji: '🔥', icon: 'flame.fill', label: 'Focus' },
  { emoji: '⚡', icon: 'bolt.fill', label: 'Energy' },
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

const formatIconLabel = (value: string) =>
  value
    .replace('.fill', '')
    .split('.')
    .join(' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

export default function ProjectEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const isDark = theme === 'dark';
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { projects, setProjects, setTasks } = useTasksStore();

  const project = React.useMemo(
    () => (id ? projects.find((candidate) => candidate.id === id) : undefined),
    [id, projects]
  );
  const isCreate = !id || !project;

  const [name, setName] = React.useState(project?.name ?? '');
  const [description, setDescription] = React.useState(project?.description ?? '');
  const [icon, setIcon] = React.useState(project?.icon ?? DEFAULT_PROJECT_ICON);
  const [color, setColor] = React.useState(project?.color ?? DEFAULT_PROJECT_COLOR);
  const [selectedEmoji, setSelectedEmoji] = React.useState(project?.emoji ?? '');

  const titleInputRef = React.useRef<TextInput | null>(null);
  const descriptionInputRef = React.useRef<TextInput | null>(null);
  const activeInputRef = React.useRef<'title' | 'description'>('title');

  const canSubmit = name.trim().length > 0;

  React.useEffect(() => {
    if (isCreate) {
      router.replace('/project/create-modal');
    }
  }, [isCreate, router]);

  React.useEffect(() => {
    if (!project) return;
    setName(project.name);
    setDescription(project.description ?? '');
    setIcon(project.icon ?? DEFAULT_PROJECT_ICON);
    setColor(project.color ?? DEFAULT_PROJECT_COLOR);
    setSelectedEmoji(project.emoji ?? '');
  }, [project]);

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

  const onSave = React.useCallback(() => {
    const trimmedName = name.trim();
    if (!trimmedName || !id) return;

    const trimmedDescription = description.trim();
    const trimmedEmoji = selectedEmoji.trim();

    setProjects((prev) =>
      prev.map((candidate) =>
        candidate.id === id
          ? {
              ...candidate,
              name: trimmedName,
              icon,
              emoji: trimmedEmoji.length > 0 ? trimmedEmoji : undefined,
              color,
              description: trimmedDescription.length > 0 ? trimmedDescription : undefined,
            }
          : candidate
      )
    );

    router.back();
  }, [color, description, icon, id, name, router, selectedEmoji, setProjects]);

  const onDelete = React.useCallback(() => {
    if (!id) return;
    const now = Date.now();

    setProjects((prev) =>
      prev.map((candidate) => (candidate.id === id ? { ...candidate, deletedAt: now } : candidate))
    );
    setTasks((prev) =>
      prev.map((task) => (task.projectId === id && !task.deletedAt ? { ...task, deletedAt: now } : task))
    );

    router.dismissAll();
    requestAnimationFrame(() => {
      router.replace('/(tabs)/explore');
    });
  }, [id, router, setProjects, setTasks]);

  const onBackdropPress = React.useCallback(() => {
    router.back();
  }, [router]);

  const symbolActions = React.useMemo<MenuAction[]>(() => {
    const iconColor = Colors[theme].text;

    const emojiActions: MenuAction[] = EMOJI_PRESETS.map((preset) => ({
      id: `emoji:${preset.emoji}`,
      title: `${preset.emoji} ${preset.label}`,
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
        title: 'Emoji',
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
      const actionId = String(event || '');

      if (actionId.startsWith('emoji:')) {
        const selected = actionId.slice('emoji:'.length);
        const match = EMOJI_PRESETS.find((preset) => preset.emoji === selected);
        if (!match) return;
        setSelectedEmoji(match.emoji);
        setIcon(match.icon);
        keepKeyboardOpen();
        return;
      }

      if (actionId.startsWith('icon:')) {
        const selected = actionId.slice('icon:'.length);
        if (!ICON_PRESETS.includes(selected)) return;
        setSelectedEmoji('');
        setIcon(selected);
        keepKeyboardOpen();
      }
    },
    [keepKeyboardOpen]
  );

  const onPressColorAction = React.useCallback(
    ({ nativeEvent: { event } }: any) => {
      const actionId = String(event || '');
      if (!actionId.startsWith('color:')) return;
      const selected = actionId.slice('color:'.length).toUpperCase();
      if (!COLOR_PRESETS.includes(selected)) return;
      setColor(selected);
      keepKeyboardOpen();
    },
    [keepKeyboardOpen]
  );

  if (isCreate) {
    return null;
  }

  const fieldTint = withAlpha(Colors[theme].background, isDark ? 0.2 : 0.34);
  const fieldFallback = withAlpha(Colors[theme].background, isDark ? 0.82 : 0.92);
  const pickerFallback = withAlpha(Colors[theme].background, isDark ? 0.8 : 0.9);
  const actionTint = withAlpha('#007AFF', isDark ? 0.88 : 0.78);
  const disabledActionTint = withAlpha(Colors[theme].background, isDark ? 0.24 : 0.32);
  const deleteTint = withAlpha('#FF3B30', isDark ? 0.18 : 0.1);

  const previewEmoji = selectedEmoji.trim();
  const symbolChipTint = withAlpha(Colors[theme].background, isDark ? 0.2 : 0.3);
  const symbolChipFallback = withAlpha(Colors[theme].background, isDark ? 0.82 : 0.92);
  const colorChipTint = withAlpha(color, isDark ? 0.22 : 0.12);
  const colorChipFallback = withAlpha(color, isDark ? 0.28 : 0.18);

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: t('projectEdit.editProject'),
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
            <MenuView
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
                  <Text style={styles.pickerLabel} numberOfLines={1}>
                    {t('projectEdit.icon')}
                  </Text>
                  <MaterialIcons
                    name="expand-more"
                    size={14}
                    color={withAlpha(Colors[theme].text, 0.62)}
                  />
                </View>
              </GlassSurface>
            </MenuView>

            <MenuView
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
                  <Text style={styles.pickerLabel} numberOfLines={1}>
                    {t('projectEdit.color')}
                  </Text>
                  <MaterialIcons
                    name="expand-more"
                    size={14}
                    color={withAlpha(Colors[theme].text, 0.62)}
                  />
                </View>
              </GlassSurface>
            </MenuView>

            <Pressable
              onPress={onSave}
              disabled={!canSubmit}
              style={({ pressed }) => [styles.actionPressable, pressed && canSubmit && styles.buttonPressed]}
              accessibilityRole="button"
              accessibilityLabel={t('projectEdit.editProject')}
            >
              <GlassSurface
                style={[styles.actionSurface, !canSubmit && styles.actionSurfaceDisabled]}
                glassEffectStyle="regular"
                tintColor={canSubmit ? actionTint : disabledActionTint}
                fallbackBackgroundColor={canSubmit ? '#007AFF' : pickerFallback}
                isInteractive
              >
                <MaterialIcons
                  name="check"
                  size={18}
                  color={canSubmit ? 'white' : withAlpha(Colors[theme].text, 0.45)}
                />
              </GlassSurface>
            </Pressable>
          </View>

          <Pressable
            onPress={onDelete}
            style={({ pressed }) => [pressed && styles.buttonPressed]}
            accessibilityRole="button"
            accessibilityLabel={t('projectEdit.delete')}
          >
            <GlassSurface
              style={styles.deleteSurface}
              glassEffectStyle="regular"
              tintColor={deleteTint}
              fallbackBackgroundColor={fieldFallback}
              isInteractive
            >
              <View style={styles.deleteContent}>
                <MaterialIcons name="delete-outline" size={18} color="#FF3B30" />
                <Text style={styles.deleteLabel}>{t('projectEdit.delete')}</Text>
              </View>
            </GlassSurface>
          </Pressable>
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
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'transparent',
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
      borderRadius: ACTION_BUTTON_SIZE / 2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: cardBorder,
      height: ACTION_BUTTON_SIZE,
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
    actionPressable: {
      borderRadius: ACTION_BUTTON_SIZE / 2,
    },
    actionSurface: {
      width: ACTION_BUTTON_SIZE,
      height: ACTION_BUTTON_SIZE,
      borderRadius: ACTION_BUTTON_SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha('#007AFF', 0.45),
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.44 : 0.24,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 },
    },
    actionSurfaceDisabled: {
      borderColor: cardBorder,
      shadowOpacity: isDark ? 0.16 : 0.1,
    },
    deleteSurface: {
      height: 44,
      borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha('#FF3B30', isDark ? 0.45 : 0.28),
      paddingHorizontal: 14,
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.28 : 0.12,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
    },
    deleteContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    deleteLabel: {
      color: '#FF3B30',
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0.2,
      textTransform: 'uppercase',
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
