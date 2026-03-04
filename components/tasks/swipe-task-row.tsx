import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import SwipeableItem, {
  OpenDirection,
  type SwipeableItemImperativeRef,
} from "react-native-swipeable-item";

import { GlassSurface, withAlpha } from "@/components/ui/glass-surface";
import {
  getTagTitle,
  TAG_ORDER,
  type TagId,
} from "@/context/home-filters-store";
import type { Project, Task } from "@/context/tasks-store";
import { getIntlLocale, t } from "@/i18n";
import { triggerNotificationHaptic } from "@/utils/haptics";

const SWIPE_STOP = 76;
const SWIPE_TRIGGER_SNAP = 152;
const SWIPE_ACTIVATION_THRESHOLD = 10;
const SWIPE_DAMPING = 7;
const SWIPE_OVER_SWIPE = 12;
const COMPACT_SUBTASK_ICON_SIZE = 18;
const COMPACT_SUBTASK_TEXT_SIZE = 14;
const DRAG_LONG_PRESS_DELAY_MS = 260;
const DRAG_COMPACT_PREVIEW_SIZE = 65;

/** Convert a hex color to an rgba pastel tint. */
function hexToPastel(
  hex: string | undefined,
  isDark: boolean,
): string | undefined {
  if (!hex || hex.length < 4) return undefined;
  const cleaned = hex.replace("#", "");
  const r = parseInt(
    cleaned.length === 3 ? cleaned[0] + cleaned[0] : cleaned.substring(0, 2),
    16,
  );
  const g = parseInt(
    cleaned.length === 3 ? cleaned[1] + cleaned[1] : cleaned.substring(2, 4),
    16,
  );
  const b = parseInt(
    cleaned.length === 3 ? cleaned[2] + cleaned[2] : cleaned.substring(4, 6),
    16,
  );
  if (isNaN(r) || isNaN(g) || isNaN(b)) return undefined;
  const alpha = isDark ? 0.22 : 0.15;
  return `rgba(${r},${g},${b},${alpha})`;
}

type TagChipModel = {
  key: string;
  tagId: TagId;
  label: string;
  tone?: "neutral" | "danger";
};

const extractHashtags = (value: string | undefined): string[] => {
  if (!value) return [];
  const matches = value.match(/#[\p{L}0-9_]+/gu) ?? [];
  const unique: string[] = [];
  for (const m of matches) {
    const norm = m.toLowerCase();
    if (!unique.some((x) => x.toLowerCase() === norm)) unique.push(m);
  }
  return unique;
};

const formatDueLabel = (dueAt: number, dueHasTime?: boolean) => {
  if (!Number.isFinite(dueAt) || dueAt <= 0) return t("taskDetail.due.none");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const due = new Date(dueAt);
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());

  const dayLabel =
    dueDay.getTime() === today.getTime()
      ? t("taskDetail.relative.today")
      : dueDay.getTime() === tomorrow.getTime()
        ? t("taskDetail.relative.tomorrow")
        : new Intl.DateTimeFormat(getIntlLocale(), {
            weekday: "short",
            day: "2-digit",
            month: "2-digit",
          }).format(due);

  if (!dueHasTime) return dayLabel;

  const timeLabel = new Intl.DateTimeFormat(getIntlLocale(), {
    hour: "2-digit",
    minute: "2-digit",
  }).format(due);
  return `${dayLabel} ${timeLabel}`;
};

const formatRowTimeLabel = (dueAt: number, dueHasTime?: boolean) => {
  if (!Number.isFinite(dueAt) || dueAt <= 0 || !dueHasTime) return null;
  return new Intl.DateTimeFormat(getIntlLocale(), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(dueAt));
};

const getRoutineChipLabel = (
  routineType: Task["routineType"] | Task["routineInterval"],
): string | null => {
  if (!routineType) return null;

  switch (routineType) {
    case "hourly":
      return t("taskDetail.routine.hourly");
    case "daily":
      return t("taskDetail.routine.daily");
    case "weekdays":
      return t("taskDetail.routine.weekdays");
    case "weekends":
      return t("taskDetail.routine.weekends");
    case "weekly":
      return t("taskDetail.routine.weekly");
    case "biweekly":
      return t("taskDetail.routine.biweekly");
    case "monthly":
      return t("taskDetail.routine.monthly");
    case "quarterly":
      return t("taskDetail.routine.quarterly");
    case "biannually":
      return t("taskDetail.routine.biannually");
    case "yearly":
      return t("taskDetail.routine.yearly");
    case "custom":
      return t("taskDetail.routine.custom");
    default:
      return t("taskDetail.property.routine");
  }
};

export type SwipeTaskRowStyles = {
  itemSpacer: any;
  swipeClip: any;
  underlay: any;
  actionSlot: any;
  actionSlotLeft: any;
  actionSlotRight: any;
  actionSlotInner: any;
  row: any;
  dragRow: any;
  rowInner: any;
  emojiTile: any;
  emojiText: any;
  textStack: any;
  titleRow: any;
  rowTitle: any;
  rowMeta: any;
  rowSubtitle: any;
  tagRow: any;
  tagChip: any;
  tagChipDanger: any;
  tagChipText: any;
};

export type SwipeTaskRowProps = {
  task: Task;
  project?: Project;
  drag: () => void;
  isActive: boolean;
  styles: SwipeTaskRowStyles;
  isDark: boolean;
  isLast?: boolean;
  itemSpacing?: number;
  emojiTint: string;
  emojiFallback: string;
  swipeCompleteBg: string;
  swipeDeleteBg: string;
  leftAction?: {
    icon?: React.ComponentProps<typeof MaterialIcons>["name"];
    backgroundColor?: string;
    onTrigger: (taskId: string) => void;
    haptic?: Haptics.NotificationFeedbackType;
  };
  rightAction?: {
    icon?: React.ComponentProps<typeof MaterialIcons>["name"];
    backgroundColor?: string;
    onTrigger: (taskId: string) => void;
    haptic?: Haptics.NotificationFeedbackType;
  };
  enabledTags: Set<TagId>;
  showTaskIcons: boolean;
  showCompactSubtasks?: boolean;
  beginSwipe: (taskId: string) => void;
  endSwipe: (taskId: string) => void;
  registerClose: (taskId: string, close: () => void) => void;
  unregisterClose: (taskId: string) => void;
  closeAnyOpen: () => void;
  onPressTask: (taskId: string) => void;
  toggleComplete: (taskId: string) => void;
  toggleSubtask?: (taskId: string, subtaskId: string) => void;
  deleteTask: (taskId: string) => void;
  onSwipeGestureActiveChange?: (taskId: string, active: boolean) => void;
  onTouchInteractionChange?: (taskId: string, active: boolean) => void;
  shouldPopIn?: boolean;
  onPopInAnimationEnd?: (taskId: string) => void;
  /** When set, datetime tags matching this day are suppressed (avoids redundant "Heute" chips). */
  selectedDateStart?: number;
  itemSpacerStyle?: StyleProp<ViewStyle>;
  swipeClipStyle?: StyleProp<ViewStyle>;
  rowStyle?: StyleProp<ViewStyle>;
  dragCompactPreview?: boolean;
  activeDragTranslateX?: number;
  followHorizontalDrag?: boolean;
};

export const SwipeTaskRow = React.memo(function SwipeTaskRow({
  task,
  project,
  drag,
  isActive,
  styles,
  isDark,
  isLast = false,
  itemSpacing = 0,
  emojiTint,
  emojiFallback,
  swipeCompleteBg,
  swipeDeleteBg,
  leftAction,
  rightAction,
  enabledTags,
  showTaskIcons,
  showCompactSubtasks = false,
  beginSwipe,
  endSwipe,
  registerClose,
  unregisterClose,
  onPressTask,
  toggleComplete,
  toggleSubtask,
  deleteTask,
  onSwipeGestureActiveChange,
  onTouchInteractionChange,
  shouldPopIn = false,
  onPopInAnimationEnd,
  selectedDateStart,
  itemSpacerStyle,
  swipeClipStyle,
  rowStyle,
  dragCompactPreview = false,
  activeDragTranslateX = 0,
  followHorizontalDrag = false,
}: SwipeTaskRowProps) {
  const swipeRef = React.useRef<SwipeableItemImperativeRef | null>(null);
  const longPressTriggeredRef = React.useRef(false);
  const [dragPressInLocalX, setDragPressInLocalX] = React.useState<
    number | null
  >(null);
  const [measuredRowHeight, setMeasuredRowHeight] = React.useState(0);
  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const autoSwipeTriggerDirectionRef = React.useRef<OpenDirection | null>(null);
  const canUseCompactDragPreview =
    showTaskIcons && !!task.emoji && task.emoji.trim().length > 0;
  const shouldUseCompactDragPreview =
    isActive && dragCompactPreview && canUseCompactDragPreview;

  const taskBgColor = React.useMemo(
    () => hexToPastel(task.color, isDark),
    [isDark, task.color],
  );
  const taskEmojiBorderColor = React.useMemo<string | undefined>(
    () =>
      task.color ? withAlpha(task.color, isDark ? 0.42 : 0.28) : undefined,
    [isDark, task.color],
  );
  const projectBgColor = React.useMemo(
    () => hexToPastel(project?.color, isDark),
    [project?.color, isDark],
  );
  const projectEmojiBorderColor = React.useMemo<string | undefined>(
    () =>
      project?.color
        ? withAlpha(project.color, isDark ? 0.42 : 0.28)
        : undefined,
    [isDark, project?.color],
  );

  React.useEffect(() => {
    if (!isActive) {
      longPressTriggeredRef.current = false;
    }
  }, [isActive]);

  React.useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };
  }, []);
  React.useEffect(() => {
    if (shouldPopIn) {
      onPopInAnimationEnd?.(task.id);
    }
  }, [onPopInAnimationEnd, shouldPopIn, task.id]);

  const handleRowLayout = React.useCallback((event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    if (!Number.isFinite(nextHeight) || nextHeight <= 0) return;
    setMeasuredRowHeight((current) =>
      Math.abs(current - nextHeight) < 0.5 ? current : nextHeight,
    );
  }, []);

  const closeSelf = React.useCallback(() => {
    void swipeRef.current?.close({ animated: true }).catch(() => undefined);
    onSwipeGestureActiveChange?.(task.id, false);
    endSwipe(task.id);
  }, [endSwipe, onSwipeGestureActiveChange, task.id]);

  React.useEffect(() => {
    registerClose(task.id, closeSelf);
    return () => {
      unregisterClose(task.id);
    };
  }, [closeSelf, registerClose, task.id, unregisterClose]);

  const commitLeft = React.useCallback(() => {
    if (leftAction) {
      leftAction.onTrigger(task.id);
      triggerNotificationHaptic(
        leftAction.haptic ?? Haptics.NotificationFeedbackType.Success,
      );
      return;
    }
    toggleComplete(task.id);
    triggerNotificationHaptic(Haptics.NotificationFeedbackType.Success);
  }, [leftAction, task.id, toggleComplete]);

  const commitRight = React.useCallback(() => {
    if (rightAction) {
      rightAction.onTrigger(task.id);
      triggerNotificationHaptic(
        rightAction.haptic ?? Haptics.NotificationFeedbackType.Warning,
      );
      return;
    }
    deleteTask(task.id);
    triggerNotificationHaptic(Haptics.NotificationFeedbackType.Warning);
  }, [deleteTask, rightAction, task.id]);

  const onPressComplete = React.useCallback(() => {
    beginSwipe(task.id);
    void swipeRef.current?.close({ animated: true }).catch(() => undefined);
    commitLeft();
  }, [beginSwipe, commitLeft, task.id]);

  const onPressDelete = React.useCallback(() => {
    beginSwipe(task.id);
    void swipeRef.current?.close({ animated: true }).catch(() => undefined);
    commitRight();
  }, [beginSwipe, commitRight, task.id]);

  const handleLongPressDrag = React.useCallback(() => {
    if (isActive || longPressTriggeredRef.current) return;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressTriggeredRef.current = true;
    onTouchInteractionChange?.(task.id, false);
    drag();
  }, [drag, isActive, onTouchInteractionChange, task.id]);

  const armLongPressDrag = React.useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      handleLongPressDrag();
    }, DRAG_LONG_PRESS_DELAY_MS);
  }, [handleLongPressDrag]);

  const clearLongPressDrag = React.useCallback(() => {
    if (!longPressTimerRef.current) return;
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }, []);

  const handleSwipeChange = React.useCallback(
    ({
      openDirection,
      snapPoint,
    }: {
      openDirection: OpenDirection;
      snapPoint: number;
    }) => {
      if (openDirection === OpenDirection.NONE || snapPoint <= 0) {
        autoSwipeTriggerDirectionRef.current = null;
      } else if (
        snapPoint >= SWIPE_TRIGGER_SNAP &&
        autoSwipeTriggerDirectionRef.current !== openDirection
      ) {
        autoSwipeTriggerDirectionRef.current = openDirection;
        if (openDirection === OpenDirection.LEFT) {
          onPressDelete();
          return;
        }
        if (openDirection === OpenDirection.RIGHT) {
          onPressComplete();
          return;
        }
      }

      const isOpen = openDirection !== OpenDirection.NONE && snapPoint > 0;
      if (isOpen) {
        beginSwipe(task.id);
      } else {
        endSwipe(task.id);
      }
      onSwipeGestureActiveChange?.(task.id, isOpen);
    },
    [
      beginSwipe,
      endSwipe,
      onPressComplete,
      onPressDelete,
      onSwipeGestureActiveChange,
      task.id,
    ],
  );

  const clipStyle = React.useMemo(
    () => [
      styles.swipeClip,
      swipeClipStyle,
      measuredRowHeight > 0 ? { minHeight: measuredRowHeight } : null,
      isActive ? { overflow: "visible" as const } : null,
    ],
    [isActive, measuredRowHeight, styles.swipeClip, swipeClipStyle],
  );

  const spacerStyle = React.useMemo(
    () => [
      styles.itemSpacer,
      itemSpacerStyle,
      measuredRowHeight > 0 ? { minHeight: measuredRowHeight } : null,
      {
        marginBottom: isLast ? 0 : itemSpacing,
        overflow: "visible" as const,
      },
    ],
    [isLast, itemSpacing, itemSpacerStyle, measuredRowHeight, styles.itemSpacer],
  );

  const rowContentStyle = React.useMemo(
    () => [
      styles.row,
      rowStyle,
      isActive ? styles.dragRow : undefined,
      shouldUseCompactDragPreview
        ? {
            width: DRAG_COMPACT_PREVIEW_SIZE,
            minHeight: DRAG_COMPACT_PREVIEW_SIZE,
            maxWidth: DRAG_COMPACT_PREVIEW_SIZE,
            borderRadius: 14,
            paddingHorizontal: 4,
            paddingVertical: 4,
            alignSelf: "flex-start" as const,
          }
        : undefined,
    ],
    [
      isActive,
      rowStyle,
      shouldUseCompactDragPreview,
      styles.dragRow,
      styles.row,
    ],
  );
  const rowSurfaceColor = React.useMemo(() => {
    // Keep row tint independent from per-item styles (for example task colors).
    const flattenedBase = StyleSheet.flatten([
      styles.row,
      isActive ? styles.dragRow : undefined,
    ]);
    const resolved = flattenedBase?.backgroundColor;
    if (typeof resolved === "string" && resolved.length > 0) return resolved;
    return isDark ? "#2C2C2E" : "#FFFFFF";
  }, [isActive, isDark, styles.dragRow, styles.row]);
  const rowTintColor = React.useMemo(
    () => {
      if (rowSurfaceColor.startsWith("#")) {
        return withAlpha(rowSurfaceColor, isDark ? 0.88 : 0.9);
      }
      if (
        rowSurfaceColor.startsWith("rgb(") ||
        rowSurfaceColor.startsWith("rgba(")
      ) {
        return rowSurfaceColor;
      }
      return isDark ? "rgba(44,44,46,0.92)" : "rgba(255,255,255,0.9)";
    },
    [isDark, rowSurfaceColor],
  );
  const activeDragPreviewOffsetStyle = React.useMemo(
    () => {
      if (!isActive || !followHorizontalDrag) {
        return null;
      }
      if (!Number.isFinite(activeDragTranslateX)) return null;
      const anchorX =
        shouldUseCompactDragPreview &&
        typeof dragPressInLocalX === "number" &&
        Number.isFinite(dragPressInLocalX)
          ? dragPressInLocalX - DRAG_COMPACT_PREVIEW_SIZE / 2
          : 0;
      return {
        transform: [{ translateX: activeDragTranslateX + anchorX }],
      };
    },
    [
      activeDragTranslateX,
      dragPressInLocalX,
      followHorizontalDrag,
      isActive,
      shouldUseCompactDragPreview,
    ],
  );

  const tagChips = React.useMemo<TagChipModel[]>(() => {
    if (enabledTags.size === 0) return [];

    const chips: TagChipModel[] = [];
    const now = Date.now();

    const isOverdue = (() => {
      if (task.section === "completed") return false;
      if (!Number.isFinite(task.dueAt) || task.dueAt <= 0) return false;

      if (task.dueHasTime === false) {
        const due = new Date(task.dueAt);
        const startOfNextDay = new Date(
          due.getFullYear(),
          due.getMonth(),
          due.getDate() + 1,
          0,
          0,
          0,
          0,
        ).getTime();
        return now >= startOfNextDay;
      }

      return task.dueAt < now;
    })();

    const hashtags = extractHashtags(
      [task.title, task.subtitle, task.notes].filter(Boolean).join(" "),
    );

    for (const tagId of TAG_ORDER) {
      if (!enabledTags.has(tagId)) continue;

      if (tagId === "overdue") {
        if (!isOverdue) continue;
        chips.push({
          key: "overdue",
          tagId,
          label: getTagTitle("overdue"),
          tone: "danger",
        });
        continue;
      }

      if (tagId === "datetime") {
        if (!Number.isFinite(task.dueAt) || task.dueAt <= 0) continue;
        if (selectedDateStart != null && selectedDateStart > 0) {
          const dueDay = new Date(task.dueAt);
          const selDay = new Date(selectedDateStart);
          if (
            dueDay.getFullYear() === selDay.getFullYear() &&
            dueDay.getMonth() === selDay.getMonth() &&
            dueDay.getDate() === selDay.getDate()
          ) {
            continue;
          }
        }
        chips.push({
          key: `dt-${task.dueAt}`,
          tagId,
          label: formatDueLabel(task.dueAt, task.dueHasTime),
        });
        continue;
      }

      if (tagId === "location") {
        if (!task.location) continue;
        chips.push({
          key: `loc-${task.location}`,
          tagId,
          label: task.location,
        });
        continue;
      }

      if (tagId === "project") {
        if (!project) continue;
        chips.push({ key: `proj-${project.id}`, tagId, label: project.name });
        continue;
      }

      if (tagId === "routine") {
        const routineType = task.routineType ?? task.routineInterval;
        const routineLabel = getRoutineChipLabel(routineType);
        if (!routineLabel) continue;
        chips.push({
          key: `routine-${task.id}-${routineType ?? "default"}`,
          tagId,
          label: routineLabel,
        });
        continue;
      }

      if (tagId === "keywords") {
        if (hashtags.length === 0) continue;
        for (const h of hashtags.slice(0, 3)) {
          chips.push({ key: `kw-${h}`, tagId, label: h });
        }
      }
    }

    return chips;
  }, [
    enabledTags,
    project,
    selectedDateStart,
    task.dueAt,
    task.dueHasTime,
    task.id,
    task.location,
    task.notes,
    task.routineInterval,
    task.routineType,
    task.section,
    task.subtitle,
    task.title,
  ]);

  const tagsView = tagChips.length ? (
    <View style={styles.tagRow}>
      {tagChips.map((chip) => (
        <View
          key={chip.key}
          style={[
            styles.tagChip,
            chip.tone === "danger" ? styles.tagChipDanger : undefined,
          ]}
        >
          <Text style={styles.tagChipText} numberOfLines={1}>
            {chip.label}
          </Text>
        </View>
      ))}
    </View>
  ) : null;

  const compactSubtasks = React.useMemo(() => {
    if (!showCompactSubtasks) return [];

    const source = task.subtasks ?? [];
    return source
      .map((subtask) => ({ ...subtask, title: subtask.title.trim() }))
      .filter((subtask) => subtask.title.length > 0);
  }, [showCompactSubtasks, task.subtasks]);

  const compactSubtasksView = compactSubtasks.length ? (
    <View style={{ marginTop: 2, gap: 4 }}>
      {compactSubtasks.map((subtask) => (
        <Pressable
          key={subtask.id}
          disabled={!toggleSubtask}
          onPress={(event) => {
            event.stopPropagation();
            if (!toggleSubtask) return;
            toggleSubtask(task.id, subtask.id);
          }}
          hitSlop={6}
          style={({ pressed }) => [
            {
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              opacity: pressed && toggleSubtask ? 0.75 : 1,
            },
          ]}
        >
          <MaterialIcons
            name={subtask.done ? "check-box" : "check-box-outline-blank"}
            size={COMPACT_SUBTASK_ICON_SIZE}
            color={
              subtask.done ? "rgba(52,199,89,0.92)" : "rgba(127,127,127,0.72)"
            }
          />
          <Text
            numberOfLines={1}
            style={[
              styles.rowSubtitle,
              {
                flex: 1,
                fontSize: COMPACT_SUBTASK_TEXT_SIZE,
                lineHeight: 18,
                fontWeight: "600",
                textDecorationLine: subtask.done ? "line-through" : "none",
                opacity: subtask.done ? 0.5 : 0.74,
              },
            ]}
          >
            {subtask.title}
          </Text>
        </Pressable>
      ))}
    </View>
  ) : null;

  const timeLabel = React.useMemo(
    () => formatRowTimeLabel(task.dueAt, task.dueHasTime),
    [task.dueAt, task.dueHasTime],
  );

  const hasSubtitle = React.useMemo(
    () => !!task.subtitle?.trim(),
    [task.subtitle],
  );

  const hasExtraInfo =
    hasSubtitle || tagChips.length > 0 || compactSubtasks.length > 0;

  const emojiTileView = showTaskIcons ? (
    <View
      style={[
        styles.emojiTile,
        shouldUseCompactDragPreview
          ? { width: 36, height: 36, borderRadius: 10 }
          : null,
        {
          backgroundColor: taskBgColor ?? projectBgColor ?? emojiTint,
          borderColor:
            taskEmojiBorderColor ?? projectEmojiBorderColor ?? emojiFallback,
          borderWidth: StyleSheet.hairlineWidth,
        },
      ]}
    >
      <Text
        style={[
          styles.emojiText,
          { opacity: taskBgColor || projectBgColor ? 1 : 0.92 },
        ]}
      >
        {task.emoji}
      </Text>
    </View>
  ) : null;

  const renderUnderlayLeft = React.useCallback(
    () => (
      <View
        style={[
          styles.underlay,
          { backgroundColor: rightAction?.backgroundColor ?? swipeDeleteBg },
        ]}
      >
        <Pressable
          style={[
            styles.actionSlot,
            styles.actionSlotRight,
            { width: SWIPE_STOP },
          ]}
          onPress={onPressDelete}
          hitSlop={10}
        >
          <View style={styles.actionSlotInner}>
            <MaterialIcons
              name={rightAction?.icon ?? "delete"}
              size={26}
              color="#FFFFFF"
            />
          </View>
        </Pressable>
      </View>
    ),
    [
      onPressDelete,
      rightAction?.backgroundColor,
      rightAction?.icon,
      styles.actionSlot,
      styles.actionSlotInner,
      styles.actionSlotRight,
      styles.underlay,
      swipeDeleteBg,
    ],
  );

  const renderUnderlayRight = React.useCallback(
    () => (
      <View
        style={[
          styles.underlay,
          { backgroundColor: leftAction?.backgroundColor ?? swipeCompleteBg },
        ]}
      >
        <Pressable
          style={[
            styles.actionSlot,
            styles.actionSlotLeft,
            { width: SWIPE_STOP },
          ]}
          onPress={onPressComplete}
          hitSlop={10}
        >
          <View style={styles.actionSlotInner}>
            <MaterialIcons
              name={
                leftAction?.icon ??
                (task.section === "completed" ? "undo" : "check")
              }
              size={26}
              color="#FFFFFF"
            />
          </View>
        </Pressable>
      </View>
    ),
    [
      leftAction?.backgroundColor,
      leftAction?.icon,
      onPressComplete,
      styles.actionSlot,
      styles.actionSlotInner,
      styles.actionSlotLeft,
      styles.underlay,
      swipeCompleteBg,
      task.section,
    ],
  );

  return (
    <View style={spacerStyle}>
      <View style={clipStyle}>
        <SwipeableItem
          ref={swipeRef}
          item={task}
          swipeEnabled={!isActive}
          activationThreshold={SWIPE_ACTIVATION_THRESHOLD}
          swipeDamping={SWIPE_DAMPING}
          overSwipe={SWIPE_OVER_SWIPE}
          snapPointsLeft={[SWIPE_STOP, SWIPE_TRIGGER_SNAP]}
          snapPointsRight={[SWIPE_STOP, SWIPE_TRIGGER_SNAP]}
          onChange={handleSwipeChange}
          renderUnderlayLeft={renderUnderlayLeft}
          renderUnderlayRight={renderUnderlayRight}
        >
          <View style={activeDragPreviewOffsetStyle}>
            <TouchableOpacity
              onLongPress={handleLongPressDrag}
              delayLongPress={DRAG_LONG_PRESS_DELAY_MS}
              activeOpacity={0.9}
              onLayout={handleRowLayout}
              style={
                shouldUseCompactDragPreview
                  ? {
                      width: DRAG_COMPACT_PREVIEW_SIZE,
                      alignSelf: "flex-start",
                    }
                  : { width: "100%", alignSelf: "stretch" }
              }
              onPressIn={(event) => {
                const localX = event.nativeEvent.locationX;
                setDragPressInLocalX(
                  Number.isFinite(localX) ? localX : null,
                );
                onTouchInteractionChange?.(task.id, true);
                armLongPressDrag();
              }}
              onPressOut={() => {
                clearLongPressDrag();
                onTouchInteractionChange?.(task.id, false);
              }}
              onPress={() => {
                if (longPressTriggeredRef.current) {
                  longPressTriggeredRef.current = false;
                  return;
                }
                onPressTask(task.id);
              }}
            >
              <GlassSurface
                style={rowContentStyle}
                glassEffectStyle="regular"
                tintColor={rowTintColor}
                fallbackBackgroundColor={rowSurfaceColor}
                isInteractive
              >
                <View
                  style={[
                    styles.rowInner,
                    shouldUseCompactDragPreview
                      ? {
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 0,
                        }
                      : !hasExtraInfo
                        ? { alignItems: "center" }
                        : null,
                  ]}
                >
                  {emojiTileView}
                  {shouldUseCompactDragPreview ? null : (
                    <View
                      style={[
                        styles.textStack,
                        !hasExtraInfo ? { justifyContent: "center" } : null,
                      ]}
                    >
                      <View style={styles.titleRow}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {task.title}
                        </Text>
                        {timeLabel ? (
                          <Text style={styles.rowMeta} numberOfLines={1}>
                            {timeLabel}
                          </Text>
                        ) : null}
                      </View>
                      {task.subtitle ? (
                        <Text style={styles.rowSubtitle}>{task.subtitle}</Text>
                      ) : null}
                      {tagsView}
                      {compactSubtasksView}
                    </View>
                  )}
                </View>
              </GlassSurface>
            </TouchableOpacity>
          </View>
        </SwipeableItem>
      </View>
    </View>
  );
});
