/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

import { isHighContrastEnabled } from '@/context/high-contrast-store';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const LIGHT_ACCENT_SCREEN_BACKGROUND = '#E5E5EA';

// Dark task picker sheets (due date, style, location, routine, project) sit on
// black. Rows get a raised fill, without an outline, so selectable items stand
// apart from the sheet.
export const PICKER_SHEET_DARK_ROW = '#1C1C1E';

// Accent of each task sheet, taken from its icon in the new-task menu, so a
// sheet keeps the color of the action that opened it.
export const TASK_SHEET_ACCENTS = {
  date: '#4D7CFF',
  style: '#B56CFF',
  location: '#34C759',
  routine: '#FF9F0A',
  project: '#5AC8FA',
} as const;

const BaseColors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

// Used while the OS "Increase Contrast" setting is on. Every pair reaches at
// least 7:1 against its background.
const HighContrastColors: typeof BaseColors = {
  light: {
    text: '#000000',
    background: '#FFFFFF',
    tint: '#005C7A',
    icon: '#3D4247',
    tabIconDefault: '#3D4247',
    tabIconSelected: '#005C7A',
  },
  dark: {
    text: '#FFFFFF',
    background: '#000000',
    tint: '#FFFFFF',
    icon: '#D1D5D9',
    tabIconDefault: '#D1D5D9',
    tabIconSelected: '#FFFFFF',
  },
};

/**
 * Theme colors for `Colors[theme]`. The getters switch to the high-contrast
 * palette while "Increase Contrast" is on. The screens remount when that
 * setting flips (see app/_layout.tsx); memoized style factories should use
 * `useThemedStyles` so they also recompute without a remount.
 */
export const Colors = {
  get light() {
    return isHighContrastEnabled() ? HighContrastColors.light : BaseColors.light;
  },
  get dark() {
    return isHighContrastEnabled() ? HighContrastColors.dark : BaseColors.dark;
  },
};

/**
 * Raises the opacity of text and icon colors derived with `withAlpha` while
 * "Increase Contrast" is on: secondary and tertiary text move to at least 70 %,
 * faint fills and hairlines get noticeably stronger. Returns `alpha` unchanged
 * otherwise.
 */
export function contrastAlpha(alpha: number): number {
  if (!isHighContrastEnabled() || alpha >= 1) return alpha;
  if (alpha < 0.2) return Math.min(0.3, alpha * 1.6);
  return 0.7 + (alpha - 0.2) * 0.375;
}

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
