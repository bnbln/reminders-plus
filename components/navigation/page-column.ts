import React from "react";
import type { ViewStyle } from "react-native";

import {
  useIsRegularWidth,
  usePageDimensions,
} from "@/components/navigation/vertical-bar-safe-area";

/**
 * Page widths for large screens (inner iPhone Duo display, iPad, the iPad app
 * on a Mac). Content sits in a centered column like UIKit's
 * `readableContentGuide` instead of stretching across the whole window.
 * Backgrounds, scroll views and their indicators keep the full width.
 *
 * - `readable`: lists, forms, settings, detail pages, chat. UIKit's readable
 *   width is 672 pt at the default text size; rows need a little more room
 *   for their swipe and drag chrome.
 * - `wide`: grids that gain from more columns, such as the project tiles.
 */
export type PageColumnKind = "readable" | "wide";

export const READABLE_PAGE_WIDTH = 720;
export const WIDE_PAGE_WIDTH = 1100;
/** Floating composers and cards in overlays (create task, create project). */
export const OVERLAY_CARD_MAX_WIDTH = 640;

// UIKit's system layout margins: 16 pt in compact width, 20 pt in regular.
const COMPACT_PAGE_MARGIN = 16;
const REGULAR_PAGE_MARGIN = 20;
// The readable width grows with Dynamic Type, like UIKit's guide does.
const MAX_READABLE_FONT_SCALE = 1.35;

export type PageColumn = {
  /** Platform margin between the screen edge and content. */
  margin: number;
  /** Width of the content column, without margins. */
  contentWidth: number;
  /** Horizontal padding that centers the column: at least `margin`. */
  sideInset: number;
  /** True when the page is wider than the column plus its margins. */
  isConstrained: boolean;
};

export function usePageColumn(kind: PageColumnKind = "readable"): PageColumn {
  const { width, fontScale } = usePageDimensions();
  const isRegularWidth = useIsRegularWidth();
  return React.useMemo(() => {
    const margin = isRegularWidth ? REGULAR_PAGE_MARGIN : COMPACT_PAGE_MARGIN;
    const maxWidth =
      kind === "wide"
        ? WIDE_PAGE_WIDTH
        : Math.round(
            READABLE_PAGE_WIDTH *
              Math.min(MAX_READABLE_FONT_SCALE, Math.max(1, fontScale)),
          );
    const contentWidth = Math.max(0, Math.min(maxWidth, width - margin * 2));
    const sideInset = Math.max(margin, (width - contentWidth) / 2);
    return {
      margin,
      contentWidth,
      sideInset,
      isConstrained: sideInset > margin,
    };
  }, [fontScale, isRegularWidth, kind, width]);
}

/**
 * Horizontal padding for a full-width scroll content container, so its
 * children form the centered column. On regular width it replaces the
 * screen's own side padding; compact screens keep theirs (null).
 */
export function usePageColumnPadding(
  kind: PageColumnKind = "readable",
): Pick<ViewStyle, "paddingHorizontal"> | null {
  const isRegularWidth = useIsRegularWidth();
  const { sideInset } = usePageColumn(kind);
  return React.useMemo(
    () => (isRegularWidth ? { paddingHorizontal: sideInset } : null),
    [isRegularWidth, sideInset],
  );
}

/**
 * Style for a single element (a card, a composer) that should not grow past
 * `maxWidth` on large screens. Null where the page is narrower anyway.
 */
export function usePageMaxWidthStyle(maxWidth: number): ViewStyle | null {
  const isRegularWidth = useIsRegularWidth();
  return React.useMemo(
    () =>
      isRegularWidth
        ? { width: "100%", maxWidth, alignSelf: "center" }
        : null,
    [isRegularWidth, maxWidth],
  );
}
