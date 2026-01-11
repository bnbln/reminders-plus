import { MaterialIcons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, Swipeable } from 'react-native-gesture-handler';
import Animated, { FadeInDown, runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface, withAlpha } from '@/components/ui/glass-surface';
import { Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type BucketId = 'today' | 'upcoming' | 'completed';

type Reminder = {
  id: string;
  title: string;
  notes?: string;
  dueAt?: number;
  location?: string;
  project?: string;
  tags?: string[];
  icon: keyof typeof MaterialIcons.glyphMap;
  tint: string;
  bucket: BucketId;
  orderRank: number;
};

type LayoutRect = { x: number; y: number; width: number; height: number };

type LayoutCache = {
  buckets: Record<BucketId, LayoutRect>;
  items: Record<BucketId, { id: string; rect: LayoutRect }[]>;
};

const BUCKET_ORDER: BucketId[] = ['today', 'upcoming', 'completed'];

const BUCKET_LABELS: Record<BucketId, { title: string; hint: string }> = {
  today: { title: 'Heute', hint: 'Fokus und faellig' },
  upcoming: { title: 'Demnaechst', hint: 'Naechste Tage' },
  completed: { title: 'Erledigt', hint: 'Abgeschlossen' },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

const measureView = (view: View | null) =>
  new Promise<LayoutRect | null>((resolve) => {
    if (!view) {
      resolve(null);
      return;
    }
    view.measureInWindow((x, y, width, height) => {
      resolve({ x, y, width, height });
    });
  });

const isSameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const formatTime = (timestamp?: number) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${hours}:${minutes}`;
};

const formatDate = (timestamp?: number) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  if (isSameDay(date, now)) {
    return 'Heute';
  }
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
};

const resolveBucketFromDue = (timestamp?: number): BucketId => {
  if (!timestamp) return 'today';
  const dueDate = new Date(timestamp);
  const now = new Date();
  if (isSameDay(dueDate, now) || dueDate < now) {
    return 'today';
  }
  return 'upcoming';
};

const reseedRanks = (items: Reminder[]) =>
  items.map((item, index) => ({
    ...item,
    orderRank: (index + 1) * 1000,
  }));

const moveReminder = (
  reminders: Reminder[],
  id: string,
  targetBucket: BucketId,
  targetIndex: number
) => {
  const dragging = reminders.find((item) => item.id === id);
  if (!dragging) return reminders;

  const byBucket: Record<BucketId, Reminder[]> = {
    today: [],
    upcoming: [],
    completed: [],
  };

  for (const item of reminders) {
    if (item.id === id) continue;
    byBucket[item.bucket].push(item);
  }

  for (const bucketId of BUCKET_ORDER) {
    byBucket[bucketId] = [...byBucket[bucketId]].sort((a, b) => a.orderRank - b.orderRank);
  }

  const insertInto = [...byBucket[targetBucket]];
  const nextIndex = Math.max(0, Math.min(insertInto.length, targetIndex));
  insertInto.splice(nextIndex, 0, { ...dragging, bucket: targetBucket });
  byBucket[targetBucket] = insertInto;

  return [
    ...reseedRanks(byBucket.today),
    ...reseedRanks(byBucket.upcoming),
    ...reseedRanks(byBucket.completed),
  ];
};

const createSeedReminders = () => {
  const now = new Date();
  const todayMorning = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    9,
    30
  ).getTime();
  const todayAfternoon = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    15,
    0
  ).getTime();
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    11,
    0
  ).getTime();
  const inThreeDays = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 3,
    14,
    15
  ).getTime();
  const yesterday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1,
    18,
    0
  ).getTime();

  return [
    {
      id: 'r-1',
      title: 'Design sync',
      notes: 'Gradient, motion, microcopy pruefen',
      dueAt: todayMorning,
      location: 'Studio 3B',
      project: 'Reminds',
      tags: ['Design', 'UI'],
      icon: 'palette',
      tint: '#F6B96B',
      bucket: 'today',
      orderRank: 1000,
    },
    {
      id: 'r-2',
      title: 'Kunden-Call',
      notes: 'Scope fuer Q2 finalisieren',
      dueAt: todayAfternoon,
      location: 'Video',
      project: 'Nordwind',
      tags: ['Call', 'Roadmap'],
      icon: 'call',
      tint: '#6AC8C0',
      bucket: 'today',
      orderRank: 2000,
    },
    {
      id: 'r-3',
      title: 'Moodboard export',
      notes: 'Konzeptvarianten markieren',
      dueAt: tomorrow,
      location: 'Desk',
      project: 'Atelier',
      tags: ['Konzept', 'Review'],
      icon: 'auto-fix-high',
      tint: '#7BB3E8',
      bucket: 'upcoming',
      orderRank: 1000,
    },
    {
      id: 'r-4',
      title: 'Spaziergang',
      notes: 'Headspace fuer neue Idee',
      dueAt: inThreeDays,
      location: 'Park',
      project: 'Personal',
      tags: ['Wellbeing'],
      icon: 'nature-people',
      tint: '#9AD08B',
      bucket: 'upcoming',
      orderRank: 2000,
    },
    {
      id: 'r-5',
      title: 'Briefing sortiert',
      notes: 'Stakeholder-Feedback eingearbeitet',
      dueAt: yesterday,
      location: 'Board',
      project: 'Reminds',
      tags: ['Done'],
      icon: 'check-circle',
      tint: '#93A0AA',
      bucket: 'completed',
      orderRank: 1000,
    },
  ] satisfies Reminder[];
};

const MetaChip = ({
  icon,
  label,
  palette,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  palette: ReturnType<typeof createPalette>;
}) => (
  <View style={[styles.metaChip, { backgroundColor: palette.chipBackground }]}> 
    <MaterialIcons name={icon} size={14} color={palette.chipText} />
    <Text style={[styles.metaChipText, { color: palette.chipText }]}>{label}</Text>
  </View>
);

const TagChip = ({ label, palette }: { label: string; palette: ReturnType<typeof createPalette> }) => (
  <View style={[styles.tagChip, { borderColor: palette.tagBorder }]}> 
    <Text style={[styles.tagChipText, { color: palette.tagText }]}>{label}</Text>
  </View>
);

const createPalette = (scheme: 'light' | 'dark') => {
  if (scheme === 'dark') {
    return {
      background: '#0C0F14',
      surface: '#141922',
      surfaceElevated: '#1A202B',
      textPrimary: '#F4F6F8',
      textSecondary: '#C2CBD4',
      textMuted: '#8C97A2',
      accent: '#F2B469',
      accentCool: '#5AB5B0',
      accentWarm: '#E4765F',
      outline: '#263041',
      chipBackground: '#1C2431',
      chipText: '#C7D0DA',
      tagBorder: '#2F394A',
      tagText: '#D0D6DD',
      bucketGlow: 'rgba(242, 180, 105, 0.16)',
      shadow: '#000000',
      success: '#70C1A9',
      danger: '#E36B5B',
    };
  }
  return {
    background: '#F6F1EA',
    surface: '#FFFFFF',
    surfaceElevated: '#FFF7EE',
    textPrimary: '#1F252A',
    textSecondary: '#4C5963',
    textMuted: '#6D7881',
    accent: '#2E6D8D',
    accentCool: '#3EA39F',
    accentWarm: '#D9824E',
    outline: '#E6DED2',
    chipBackground: '#F1E7DA',
    chipText: '#3E4A52',
    tagBorder: '#D9CCBE',
    tagText: '#4D5963',
    bucketGlow: 'rgba(46, 109, 141, 0.12)',
    shadow: '#c0b5a7',
    success: '#2F8C79',
    danger: '#C54B3C',
  };
};

const ReminderCard = React.memo(
  React.forwardRef<View, {
    reminder: Reminder;
    palette: ReturnType<typeof createPalette>;
    colorScheme: 'light' | 'dark';
    isHidden: boolean;
    onToggleComplete: (id: string) => void;
    onDelete: (id: string) => void;
    dragGesture: ReturnType<typeof Gesture.Pan>;
  }>((props, ref) => {
    const { reminder, palette, colorScheme, isHidden, onToggleComplete, onDelete, dragGesture } = props;
    const swipeRef = useRef<Swipeable | null>(null);
    const isCompleted = reminder.bucket === 'completed';
    const cardTint = withAlpha(palette.surface, colorScheme === 'dark' ? 0.22 : 0.42);

    const handleSwipe = (direction: 'left' | 'right') => {
      if (direction === 'left') {
        onToggleComplete(reminder.id);
      }
      if (direction === 'right') {
        onDelete(reminder.id);
      }
      swipeRef.current?.close();
    };

    const cardBody = (
      <>
        <View style={styles.cardHeader}>
          <View style={[styles.iconPill, { backgroundColor: reminder.tint }]}> 
            <MaterialIcons name={reminder.icon} size={18} color={palette.textPrimary} />
          </View>
          <View style={styles.cardTitleBlock}>
            <Text
              style={[
                styles.cardTitle,
                { color: palette.textPrimary },
                isCompleted ? styles.cardTitleCompleted : null,
              ]}>
              {reminder.title}
            </Text>
            {reminder.notes ? (
              <Text style={[styles.cardNotes, { color: palette.textSecondary }]}> 
                {reminder.notes}
              </Text>
            ) : null}
          </View>
          <View style={styles.cardRight}>
            <Text style={[styles.cardTime, { color: palette.textPrimary }]}> 
              {formatTime(reminder.dueAt)}
            </Text>
            <Text style={[styles.cardDate, { color: palette.textMuted }]}> 
              {formatDate(reminder.dueAt)}
            </Text>
            <GestureDetector gesture={dragGesture}>
              <View style={[styles.dragHandle, { borderColor: palette.outline }]}> 
                <MaterialIcons name="drag-indicator" size={18} color={palette.textMuted} />
              </View>
            </GestureDetector>
          </View>
        </View>
        <View style={styles.metaRow}>
          <MetaChip icon="event" label={formatDate(reminder.dueAt)} palette={palette} />
          <MetaChip icon="schedule" label={formatTime(reminder.dueAt)} palette={palette} />
          {reminder.location ? <MetaChip icon="place" label={reminder.location} palette={palette} /> : null}
          {reminder.project ? <MetaChip icon="work" label={reminder.project} palette={palette} /> : null}
        </View>
        {reminder.tags?.length ? (
          <View style={styles.tagRow}>
            {reminder.tags.map((tag) => (
              <TagChip key={`${reminder.id}-${tag}`} label={tag} palette={palette} />
            ))}
          </View>
        ) : null}
      </>
    );

    return (
      <Animated.View entering={FadeInDown.duration(300).springify()}>
        <Swipeable
          ref={swipeRef}
          leftThreshold={60}
          rightThreshold={40}
          onSwipeableOpen={handleSwipe}
          renderLeftActions={() => (
            <View style={[styles.swipeAction, { backgroundColor: palette.success }]}>
              <MaterialIcons
                name={isCompleted ? 'undo' : 'check'}
                size={20}
                color={palette.textPrimary}
              />
              <Text style={[styles.swipeText, { color: palette.textPrimary }]}
                >{isCompleted ? 'Reaktivieren' : 'Erledigen'}</Text>
            </View>
          )}
          renderRightActions={() => (
            <View style={[styles.swipeAction, { backgroundColor: palette.danger }]}>
              <MaterialIcons name="delete" size={20} color={palette.textPrimary} />
              <Text style={[styles.swipeText, { color: palette.textPrimary }]}>Loeschen</Text>
            </View>
          )}>
          {isHidden ? (
            <View
              ref={ref}
              style={[
                styles.card,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.outline,
                },
                styles.cardHidden,
              ]}>
              {cardBody}
            </View>
          ) : (
            <GlassSurface
              ref={ref}
              style={[styles.card, { borderColor: palette.outline }]}
              glassEffectStyle="regular"
              tintColor={cardTint}
              fallbackBackgroundColor={palette.surface}>
              <View style={isCompleted ? { opacity: 0.65 } : undefined}>{cardBody}</View>
            </GlassSurface>
          )}
        </Swipeable>
      </Animated.View>
    );
  })
);

ReminderCard.displayName = 'ReminderCard';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const router = useRouter();
  const { action } = useLocalSearchParams<{ action?: string }>();
  const palette = useMemo(() => createPalette(colorScheme), [colorScheme]);
  const seedReminders = useMemo(() => createSeedReminders(), []);
  const [reminders, setReminders] = useState<Reminder[]>(seedReminders);
  const [hasNotificationPermission, setHasNotificationPermission] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragLayout, setDragLayout] = useState<LayoutRect | null>(null);
  const [dragHover, setDragHover] = useState<{ bucketId: BucketId | null; index: number | null } | null>(
    null
  );

  const dragLayoutRef = useRef<LayoutRect | null>(null);
  const layoutCacheRef = useRef<LayoutCache | null>(null);
  const bucketRefs = useRef<Record<BucketId, View | null>>({
    today: null,
    upcoming: null,
    completed: null,
  });
  const itemRefs = useRef<Record<string, View | null>>({});

  const dragTranslateX = useSharedValue(0);
  const dragTranslateY = useSharedValue(0);

  const remindersById = useMemo(() => new Map(reminders.map((item) => [item.id, item])), [reminders]);

  const remindersByBucket = useMemo(() => {
    const buckets: Record<BucketId, Reminder[]> = {
      today: [],
      upcoming: [],
      completed: [],
    };
    for (const reminder of reminders) {
      buckets[reminder.bucket].push(reminder);
    }
    for (const bucket of BUCKET_ORDER) {
      buckets[bucket] = [...buckets[bucket]].sort((a, b) => a.orderRank - b.orderRank);
    }
    return buckets;
  }, [reminders]);

  const dueCount = useMemo(() => {
    const now = Date.now();
    return reminders.filter(
      (reminder) => reminder.bucket !== 'completed' && reminder.dueAt && reminder.dueAt <= now
    ).length;
  }, [reminders]);

  const startDrag = useCallback(
    async (id: string) => {
      const dragNode = itemRefs.current[id];
      const dragRect = await measureView(dragNode);
      if (!dragRect) return;

      const bucketLayouts: Record<BucketId, LayoutRect> = {
        today: { x: 0, y: 0, width: 0, height: 0 },
        upcoming: { x: 0, y: 0, width: 0, height: 0 },
        completed: { x: 0, y: 0, width: 0, height: 0 },
      };

      for (const bucketId of BUCKET_ORDER) {
        const bucketRect = await measureView(bucketRefs.current[bucketId]);
        if (bucketRect) {
          bucketLayouts[bucketId] = bucketRect;
        }
      }

      const itemLayouts: Record<BucketId, { id: string; rect: LayoutRect }[]> = {
        today: [],
        upcoming: [],
        completed: [],
      };

      await Promise.all(
        Object.entries(itemRefs.current).map(async ([itemId, node]) => {
          const itemRect = await measureView(node);
          const reminder = remindersById.get(itemId);
          if (!itemRect || !reminder) return;
          itemLayouts[reminder.bucket].push({ id: itemId, rect: itemRect });
        })
      );

      for (const bucketId of BUCKET_ORDER) {
        itemLayouts[bucketId] = [...itemLayouts[bucketId]].sort((a, b) => a.rect.y - b.rect.y);
      }

      layoutCacheRef.current = { buckets: bucketLayouts, items: itemLayouts };
      dragLayoutRef.current = dragRect;
      setDragLayout(dragRect);
      setDraggingId(id);
      setDragHover({ bucketId: remindersById.get(id)?.bucket ?? null, index: null });
    },
    [remindersById]
  );

  const updateHoverFromGesture = useCallback((translationX: number, translationY: number) => {
    const layout = dragLayoutRef.current;
    const cache = layoutCacheRef.current;
    if (!layout || !cache || !draggingId) return;

    const centerX = layout.x + layout.width / 2 + translationX;
    const centerY = layout.y + layout.height / 2 + translationY;

    let targetBucket: BucketId | null = null;
    for (const bucketId of BUCKET_ORDER) {
      const bucketRect = cache.buckets[bucketId];
      if (
        centerX >= bucketRect.x &&
        centerX <= bucketRect.x + bucketRect.width &&
        centerY >= bucketRect.y &&
        centerY <= bucketRect.y + bucketRect.height
      ) {
        targetBucket = bucketId;
        break;
      }
    }

    if (!targetBucket) {
      setDragHover({ bucketId: null, index: null });
      return;
    }

    const items = cache.items[targetBucket].filter((item) => item.id !== draggingId);
    const targetIndex =
      items.findIndex((item) => centerY < item.rect.y + item.rect.height / 2) ?? -1;
    const resolvedIndex = targetIndex === -1 ? items.length : targetIndex;

    setDragHover({ bucketId: targetBucket, index: resolvedIndex });
  }, [draggingId]);

  const finishDrag = useCallback(() => {
    if (!draggingId || !dragHover?.bucketId || dragHover.index == null) {
      setDraggingId(null);
      setDragLayout(null);
      setDragHover(null);
      dragLayoutRef.current = null;
      layoutCacheRef.current = null;
      return;
    }

    setReminders((prev) => moveReminder(prev, draggingId, dragHover.bucketId!, dragHover.index!));

    setDraggingId(null);
    setDragLayout(null);
    setDragHover(null);
    dragLayoutRef.current = null;
    layoutCacheRef.current = null;
  }, [dragHover, draggingId]);

  const createDragGesture = useCallback(
    (id: string) =>
      Gesture.Pan()
        .activateAfterLongPress(220)
        .onStart(() => {
          dragTranslateX.value = 0;
          dragTranslateY.value = 0;
          runOnJS(startDrag)(id);
        })
        .onUpdate((event) => {
          dragTranslateX.value = event.translationX;
          dragTranslateY.value = event.translationY;
          runOnJS(updateHoverFromGesture)(event.translationX, event.translationY);
        })
        .onEnd(() => {
          dragTranslateX.value = 0;
          dragTranslateY.value = 0;
          runOnJS(finishDrag)();
        }),
    [finishDrag, startDrag, updateHoverFromGesture, dragTranslateX, dragTranslateY]
  );

  const addReminder = useCallback(() => {
    setReminders((prev) => {
      const bucketItems = prev.filter((reminder) => reminder.bucket === 'today');
      const nextRank = bucketItems.length ? bucketItems[bucketItems.length - 1].orderRank + 1000 : 1000;
      const now = new Date();
      const dueAt = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours() + 1,
        0
      ).getTime();

      return [
        ...prev,
        {
          id: `r-${Date.now()}`,
          title: 'Neuer Reminder',
          notes: 'Details anfuegen',
          dueAt,
          location: 'Studio',
          project: 'Inbox',
          tags: ['Neu'],
          icon: 'notifications',
          tint: palette.accentCool,
          bucket: 'today',
          orderRank: nextRank,
        },
      ];
    });
  }, [palette.accentCool]);

  React.useEffect(() => {
    if (action !== 'add') return;
    addReminder();
    router.setParams({ action: undefined });
  }, [action, addReminder, router]);

  const toggleComplete = useCallback((id: string) => {
    setReminders((prev) => {
      const reminder = prev.find((item) => item.id === id);
      if (!reminder) return prev;
      const targetBucket =
        reminder.bucket === 'completed' ? resolveBucketFromDue(reminder.dueAt) : 'completed';
      const targetIndex = prev.filter((item) => item.bucket === targetBucket).length;
      return moveReminder(prev, id, targetBucket, targetIndex);
    });
  }, []);

  const deleteReminder = useCallback((id: string) => {
    setReminders((prev) => prev.filter((item) => item.id !== id));
  }, []);

  React.useEffect(() => {
    if (Platform.OS === 'web') return;

    let isActive = true;
    const ensurePermission = async () => {
      const settings = await Notifications.getPermissionsAsync();
      let finalStatus = settings.status;
      if (settings.status !== 'granted') {
        const request = await Notifications.requestPermissionsAsync();
        finalStatus = request.status;
      }
      if (isActive) {
        setHasNotificationPermission(finalStatus === 'granted');
      }
    };

    ensurePermission();

    return () => {
      isActive = false;
    };
  }, []);

  React.useEffect(() => {
    if (Platform.OS === 'web') return;
    const updateBadge = async () => {
      try {
        await Notifications.setBadgeCountAsync(dueCount);
      } catch {
        // Ignore badge updates on unsupported platforms.
      }
    };

    updateBadge();
  }, [dueCount]);

  React.useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!hasNotificationPermission) return;

    const syncNotifications = async () => {
      await Notifications.cancelAllScheduledNotificationsAsync();
      const now = Date.now();
      const upcoming = reminders.filter(
        (reminder) => reminder.bucket !== 'completed' && reminder.dueAt && reminder.dueAt > now
      );

      for (const reminder of upcoming) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: reminder.title,
            body: reminder.notes ?? 'Reminder ist faellig.',
            sound: true,
          },
          trigger: { type: null, date: new Date(reminder.dueAt!) } as any,
        });
      }
    };

    syncNotifications();
  }, [reminders, hasNotificationPermission]);

  const dragGestureStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragTranslateX.value },
      { translateY: dragTranslateY.value },
      { scale: 1.03 },
    ],
  }));

  const dragOverlayStyle = dragLayout
    ? [
        styles.dragOverlay,
        {
          top: dragLayout.y,
          left: dragLayout.x,
          width: dragLayout.width,
        },
      ]
    : null;

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <View pointerEvents="none" style={styles.backgroundLayer}>
        <View style={[styles.orb, styles.orbTop, { backgroundColor: palette.accentCool }]} />
        <View style={[styles.orb, styles.orbBottom, { backgroundColor: palette.accent }]} />
      </View>

      <ScrollView
        scrollEnabled={!draggingId}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.brand, { color: palette.textPrimary }]}>reminds</Text>
            <Text style={[styles.subtitle, { color: palette.textSecondary }]}>Dein Fokus fuer heute.</Text>
          </View>
          <GlassSurface
            style={[styles.badge, { borderColor: palette.outline }]}
            glassEffectStyle="regular"
            tintColor={withAlpha(palette.surface, colorScheme === 'dark' ? 0.22 : 0.42)}
            fallbackBackgroundColor={palette.surface}>
            <Text style={[styles.badgeCount, { color: palette.textPrimary }]}>{dueCount}</Text>
            <Text style={[styles.badgeLabel, { color: palette.textMuted }]}>faellig</Text>
          </GlassSurface>
        </View>

        <GlassSurface
          style={[styles.quickRow, { borderColor: palette.outline }]}
          glassEffectStyle="regular"
          tintColor={withAlpha(palette.surfaceElevated, colorScheme === 'dark' ? 0.2 : 0.32)}
          fallbackBackgroundColor={palette.surfaceElevated}>
          <View>
            <Text style={[styles.quickTitle, { color: palette.textPrimary }]}>Neue Erinnerung</Text>
            <Text style={[styles.quickHint, { color: palette.textMuted }]}>Tippe fuers Erstellen</Text>
          </View>
          <Pressable
            onPress={addReminder}
            style={({ pressed }) => [
              styles.addButton,
              {
                backgroundColor: palette.accent,
                opacity: pressed ? 0.8 : 1,
              },
            ]}>
            <MaterialIcons name="add" size={20} color={palette.surface} />
            <Text style={[styles.addButtonText, { color: palette.surface }]}>Neu</Text>
          </Pressable>
        </GlassSurface>

        <Text style={[styles.dragHint, { color: palette.textMuted }]}>Long-press am Griff, dann ziehen.</Text>

        {BUCKET_ORDER.map((bucketId) => {
          const bucketItems = remindersByBucket[bucketId];
          const bucketAccent =
            bucketId === 'today'
              ? palette.accent
              : bucketId === 'upcoming'
                ? palette.accentCool
                : palette.textMuted;

          const dropIndex =
            dragHover?.bucketId === bucketId && dragHover.index != null ? dragHover.index : null;

          const itemsWithDrop = bucketItems.flatMap((item, index) => {
            const entry: React.ReactNode[] = [];
            if (dropIndex === index) {
              entry.push(
                <View
                  key={`drop-${bucketId}-${index}`}
                  style={[styles.dropMarker, { backgroundColor: bucketAccent }]}
                />
              );
            }
            entry.push(
              <ReminderCard
                key={item.id}
                ref={(node) => {
                  itemRefs.current[item.id] = node;
                }}
                reminder={item}
                palette={palette}
                colorScheme={colorScheme}
                isHidden={draggingId === item.id}
                onToggleComplete={toggleComplete}
                onDelete={deleteReminder}
                dragGesture={createDragGesture(item.id)}
              />
            );
            return entry;
          });

          if (dropIndex === bucketItems.length) {
            itemsWithDrop.push(
              <View
                key={`drop-${bucketId}-end`}
                style={[styles.dropMarker, { backgroundColor: bucketAccent }]}
              />
            );
          }

          return (
            <GlassSurface
              key={bucketId}
              ref={(node) => {
                bucketRefs.current[bucketId] = node;
              }}
              style={[
                styles.bucket,
                {
                  borderColor: palette.outline,
                  shadowColor: palette.shadow,
                },
                dragHover?.bucketId === bucketId
                  ? { shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } }
                  : null,
              ]}
              glassEffectStyle="regular"
              tintColor={withAlpha(palette.surfaceElevated, colorScheme === 'dark' ? 0.2 : 0.32)}
              fallbackBackgroundColor={palette.surfaceElevated}>
              <View style={styles.bucketHeader}>
                <View style={styles.bucketTitleRow}>
                  <View style={[styles.bucketDot, { backgroundColor: bucketAccent }]} />
                  <Text style={[styles.bucketTitle, { color: palette.textPrimary }]}>
                    {BUCKET_LABELS[bucketId].title}
                  </Text>
                </View>
                <Text style={[styles.bucketCount, { color: palette.textMuted }]}>
                  {bucketItems.length}
                </Text>
              </View>
              <Text style={[styles.bucketHint, { color: palette.textMuted }]}>
                {BUCKET_LABELS[bucketId].hint}
              </Text>

              <View style={styles.bucketBody}>{itemsWithDrop}</View>
            </GlassSurface>
          );
        })}
      </ScrollView>

      {draggingId && dragLayout ? (
        <Animated.View style={dragOverlayStyle} pointerEvents="none">
          <Animated.View style={dragGestureStyle}>
            {(() => {
              const reminder = remindersById.get(draggingId);
              if (!reminder) return null;
              return (
                <GlassSurface
                  style={[
                    styles.card,
                    styles.dragCard,
                    {
                      borderColor: palette.outline,
                      shadowColor: palette.shadow,
                    },
                  ]}
                  glassEffectStyle="regular"
                  tintColor={withAlpha(palette.surface, colorScheme === 'dark' ? 0.22 : 0.42)}
                  fallbackBackgroundColor={palette.surface}>
                  <View style={styles.cardHeader}>
                    <View style={[styles.iconPill, { backgroundColor: reminder.tint }]}>
                      <MaterialIcons name={reminder.icon} size={18} color={palette.textPrimary} />
                    </View>
                    <View style={styles.cardTitleBlock}>
                      <Text style={[styles.cardTitle, { color: palette.textPrimary }]}>
                        {reminder.title}
                      </Text>
                      {reminder.notes ? (
                        <Text style={[styles.cardNotes, { color: palette.textSecondary }]}> 
                          {reminder.notes}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.cardRight}>
                      <Text style={[styles.cardTime, { color: palette.textPrimary }]}> 
                        {formatTime(reminder.dueAt)}
                      </Text>
                      <Text style={[styles.cardDate, { color: palette.textMuted }]}> 
                        {formatDate(reminder.dueAt)}
                      </Text>
                    </View>
                  </View>
                </GlassSurface>
              );
            })()}
          </Animated.View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.4,
  },
  orb: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    opacity: 0.25,
  },
  orbTop: {
    top: -120,
    right: -80,
  },
  orbBottom: {
    bottom: -140,
    left: -80,
  },
  content: {
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  brand: {
    fontSize: 36,
    fontFamily: Fonts.rounded,
    letterSpacing: 0.8,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 6,
    fontFamily: Fonts.serif,
  },
  badge: {
    minWidth: 72,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    gap: 2,
  },
  badgeCount: {
    fontSize: 22,
    fontFamily: Fonts.rounded,
  },
  badgeLabel: {
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  quickRow: {
    marginTop: 24,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quickTitle: {
    fontSize: 16,
    fontFamily: Fonts.rounded,
  },
  quickHint: {
    marginTop: 4,
    fontSize: 13,
    fontFamily: Fonts.serif,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addButtonText: {
    fontSize: 14,
    fontFamily: Fonts.rounded,
  },
  dragHint: {
    marginTop: 16,
    fontSize: 12,
    fontFamily: Fonts.serif,
    letterSpacing: 0.4,
  },
  bucket: {
    marginTop: 20,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  bucketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bucketTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bucketDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  bucketTitle: {
    fontSize: 18,
    fontFamily: Fonts.rounded,
  },
  bucketCount: {
    fontSize: 14,
    fontFamily: Fonts.rounded,
  },
  bucketHint: {
    marginTop: 4,
    fontSize: 12,
    fontFamily: Fonts.serif,
  },
  bucketBody: {
    marginTop: 12,
    gap: 12,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },
  cardHidden: {
    opacity: 0,
  },
  dragCard: {
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconPill: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleBlock: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: Fonts.rounded,
  },
  cardTitleCompleted: {
    textDecorationLine: 'line-through',
  },
  cardNotes: {
    marginTop: 4,
    fontSize: 13,
    fontFamily: Fonts.serif,
  },
  cardRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  cardTime: {
    fontSize: 14,
    fontFamily: Fonts.rounded,
  },
  cardDate: {
    fontSize: 12,
    fontFamily: Fonts.serif,
  },
  dragHandle: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  metaRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  metaChipText: {
    fontSize: 11,
    fontFamily: Fonts.serif,
  },
  tagRow: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagChipText: {
    fontSize: 11,
    fontFamily: Fonts.serif,
  },
  swipeAction: {
    width: 120,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    borderRadius: 18,
    marginVertical: 4,
  },
  swipeText: {
    fontSize: 12,
    fontFamily: Fonts.rounded,
    letterSpacing: 0.4,
  },
  dropMarker: {
    height: 6,
    borderRadius: 999,
  },
  dragOverlay: {
    position: 'absolute',
    zIndex: 999,
  },
});
