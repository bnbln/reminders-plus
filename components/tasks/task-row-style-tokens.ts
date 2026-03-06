import { StyleSheet } from "react-native";

export const SPACING = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
} as const;

export const TASK_ROW_MIN_HEIGHT = 58;

type DragShadowConfig = {
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  elevation: number;
};

type SharedTaskRowStyleOptions = {
  textColor: string;
  rowSurface: string;
  rowDividerColor: string;
  rowMetaColor: string;
  rowSubtitleColor: string;
  hairlineColor: string;
  tagBackground: string;
  tagTextColor: string;
  dangerBackground: string;
  dangerBorderColor: string;
  swipeClipRadius?: number;
  swipeClipMarginHorizontal?: number;
  dragRowRadius?: number;
  dragShadow?: DragShadowConfig;
  rowMinHeight?: number;
  rowPaddingHorizontal?: number;
  rowPaddingVertical?: number;
  rowGap?: number;
  rowInnerGap?: number;
  textStackGap?: number;
  titleRowGap?: number;
  actionSize?: number;
  actionRadius?: number;
  emojiSize?: number;
  emojiRadius?: number;
  emojiFontSize?: number;
  rowTitleFontSize?: number;
  rowTitleLineHeight?: number;
  rowMetaFontSize?: number;
  rowMetaLineHeight?: number;
  rowSubtitleFontSize?: number;
  rowSubtitleLineHeight?: number;
  tagRowGap?: number;
  tagRowMarginTop?: number;
  tagChipGap?: number;
  tagChipPaddingHorizontal?: number;
  tagChipPaddingVertical?: number;
  tagChipRadius?: number;
};

export function createSharedTaskRowStyles({
  textColor,
  rowSurface,
  rowDividerColor,
  rowMetaColor,
  rowSubtitleColor,
  hairlineColor,
  tagBackground,
  tagTextColor,
  dangerBackground,
  dangerBorderColor,
  swipeClipRadius = 20,
  swipeClipMarginHorizontal = 0,
  dragRowRadius = swipeClipRadius,
  dragShadow,
  rowMinHeight = TASK_ROW_MIN_HEIGHT,
  rowPaddingHorizontal = SPACING.sm,
  rowPaddingVertical = SPACING.xs,
  rowGap = SPACING.xxs,
  rowInnerGap = SPACING.sm,
  textStackGap = SPACING.xxs,
  titleRowGap = SPACING.xs,
  actionSize = 40,
  actionRadius = 999,
  emojiSize = 32,
  emojiRadius = 10,
  emojiFontSize = 18,
  rowTitleFontSize = 16,
  rowTitleLineHeight = 21,
  rowMetaFontSize = 11,
  rowMetaLineHeight = 14,
  rowSubtitleFontSize = 13,
  rowSubtitleLineHeight = 17,
  tagRowGap = SPACING.xxs,
  tagRowMarginTop = SPACING.xxs,
  tagChipGap = SPACING.xxs,
  tagChipPaddingHorizontal = SPACING.xs,
  tagChipPaddingVertical = SPACING.xxs,
  tagChipRadius = 999,
}: SharedTaskRowStyleOptions) {
  return {
    itemSpacer: {
      marginBottom: 0,
    },
    swipeClip: {
      borderRadius: swipeClipRadius,
      overflow: "hidden" as const,
      backgroundColor: rowSurface,
      marginHorizontal: swipeClipMarginHorizontal,
    },
    underlay: {
      ...StyleSheet.absoluteFillObject,
    },
    actionSlot: {
      position: "absolute" as const,
      top: 0,
      bottom: 0,
      justifyContent: "center" as const,
    },
    actionSlotLeft: {
      left: 0,
      alignItems: "center" as const,
    },
    actionSlotRight: {
      right: 0,
      alignItems: "center" as const,
    },
    actionSlotInner: {
      width: actionSize,
      height: actionSize,
      borderRadius: actionRadius,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    row: {
      minHeight: rowMinHeight,
      borderRadius: swipeClipRadius,
      backgroundColor: rowSurface,
      justifyContent: "center" as const,
      paddingHorizontal: rowPaddingHorizontal,
      paddingVertical: rowPaddingVertical,
      gap: rowGap,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: rowDividerColor,
    },
    dragRow: {
      borderRadius: dragRowRadius,
      backgroundColor: rowSurface,
      borderWidth: 0,
      opacity: 1,
      ...(dragShadow ?? {}),
    },
    rowInner: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      gap: rowInnerGap,
    },
    emojiTile: {
      width: emojiSize,
      height: emojiSize,
      borderRadius: emojiRadius,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      overflow: "hidden" as const,
      borderWidth: StyleSheet.hairlineWidth,
      marginTop: 1,
    },
    emojiText: {
      fontSize: emojiFontSize,
    },
    textStack: {
      flex: 1,
      gap: textStackGap,
    },
    titleRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: titleRowGap,
    },
    rowTitle: {
      flex: 1,
      fontSize: rowTitleFontSize,
      lineHeight: rowTitleLineHeight,
      fontWeight: "700" as const,
      color: textColor,
      letterSpacing: -0.2,
    },
    rowMeta: {
      fontSize: rowMetaFontSize,
      lineHeight: rowMetaLineHeight,
      fontWeight: "700" as const,
      color: rowMetaColor,
      letterSpacing: 0.1,
    },
    rowSubtitle: {
      fontSize: rowSubtitleFontSize,
      lineHeight: rowSubtitleLineHeight,
      fontWeight: "600" as const,
      color: rowSubtitleColor,
    },
    tagRow: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: tagRowGap,
      marginTop: tagRowMarginTop,
    },
    tagChip: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: tagChipGap,
      maxWidth: "100%" as const,
      paddingVertical: tagChipPaddingVertical,
      paddingHorizontal: tagChipPaddingHorizontal,
      borderRadius: tagChipRadius,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: hairlineColor,
      backgroundColor: tagBackground,
    },
    tagChipDanger: {
      backgroundColor: dangerBackground,
      borderColor: dangerBorderColor,
    },
    tagChipText: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: "700" as const,
      color: tagTextColor,
      maxWidth: 220,
    },
  };
}
