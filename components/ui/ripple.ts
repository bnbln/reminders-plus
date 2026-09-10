import { Platform, type PressableAndroidRippleConfig } from "react-native";

/**
 * Material touch feedback for `Pressable`.
 *
 * The app was built iOS-first, so press feedback everywhere is opacity/scale —
 * correct on iOS, but Android expects a ripple. These helpers return `undefined`
 * on iOS so `android_ripple` stays inert there and the existing feedback is kept.
 *
 * `foreground: true` is the important part: most pressables in this app wrap an
 * opaque card or `GlassSurface`, and a background ripple would be painted behind
 * that child and never seen.
 *
 * The default colour is deliberately neutral grey rather than theme-derived, so
 * these stay plain functions instead of hooks and read correctly on both light
 * and dark surfaces. Pass `color` for tinted surfaces (e.g. an accent-filled
 * button, where white reads better).
 */

const NEUTRAL_RIPPLE = "rgba(127, 127, 127, 0.24)";

/**
 * Bounded ripple for rows, cards and other rectangular surfaces.
 *
 * The ripple is clipped to the pressable's own bounds, so give the `Pressable`
 * the same `borderRadius` as the card it wraps (plus `overflow: "hidden"`) when
 * the child is rounded — otherwise the ripple squares off the corners.
 */
export function ripple(color?: string): PressableAndroidRippleConfig | undefined {
  if (Platform.OS !== "android") return undefined;
  return { color: color ?? NEUTRAL_RIPPLE, borderless: false, foreground: true };
}

/**
 * Unbounded circular ripple for icon buttons, matching Material's touch target
 * overflow. `radius` is in dp and should be roughly half the touch target.
 */
export function rippleBorderless(
  radius = 20,
  color?: string,
): PressableAndroidRippleConfig | undefined {
  if (Platform.OS !== "android") return undefined;
  return {
    color: color ?? NEUTRAL_RIPPLE,
    borderless: true,
    radius,
    foreground: true,
  };
}
