/**
 * Material 3 surface tokens for Android.
 *
 * iOS renders this app's surfaces with `expo-glass-effect` — translucent layers
 * that pick up the page gradient behind them. Android has no equivalent, and the
 * old fallback (a semi-transparent `View`) left every card looking washed out.
 *
 * Material 3 solves the same problem differently: surfaces are **opaque**, and
 * depth is expressed as *tonal elevation* — the higher a surface sits, the more
 * of the primary colour is blended into it. These helpers implement that.
 */

/** M3 tonal-elevation overlay opacity per level (0-5). */
const TONAL_OVERLAY_ALPHA = [0, 0.05, 0.08, 0.11, 0.12, 0.14] as const;

/** Android `elevation` (dp) per M3 level, for the accompanying shadow. */
export const M3_ELEVATION_DP = [0, 1, 3, 6, 8, 12] as const;

export type M3ElevationLevel = 0 | 1 | 2 | 3 | 4 | 5;

type Rgba = { r: number; g: number; b: number; a: number };

function parseColor(color: string): Rgba | null {
  const value = color.trim();

  if (value.startsWith("#")) {
    let hex = value.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((ch) => ch + ch)
        .join("");
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = Number.parseInt(hex.slice(0, 2), 16);
      const g = Number.parseInt(hex.slice(2, 4), 16);
      const b = Number.parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;
      if ([r, g, b].some(Number.isNaN)) return null;
      return { r, g, b, a };
    }
    return null;
  }

  const match = value.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i,
  );
  if (!match) return null;

  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);
  const a = match[4] === undefined ? 1 : Number(match[4]);
  if ([r, g, b, a].some(Number.isNaN)) return null;
  return { r, g, b, a };
}

function toRgbString({ r, g, b }: Rgba): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${clamp(r)}, ${clamp(g)}, ${clamp(b)})`;
}

/**
 * Alpha-composite `overlay` onto the opaque `base`, returning an opaque colour.
 * Unparseable input falls back to the overlay so callers never end up with a
 * surface that silently disappears.
 */
export function compositeOver(base: string, overlay: string): string {
  const b = parseColor(base);
  const o = parseColor(overlay);
  if (!b || !o) return overlay;
  if (o.a >= 1) return toRgbString(o);
  if (o.a <= 0) return toRgbString(b);

  return toRgbString({
    r: o.r * o.a + b.r * (1 - o.a),
    g: o.g * o.a + b.g * (1 - o.a),
    b: o.b * o.a + b.b * (1 - o.a),
    a: 1,
  });
}

/**
 * The Material 3 surface colour at a tonal-elevation level: the theme's base
 * surface with `accent` blended in proportionally to how high the surface sits.
 */
export function m3Surface(
  baseSurface: string,
  accent: string,
  level: M3ElevationLevel = 0,
): string {
  const alpha = TONAL_OVERLAY_ALPHA[level] ?? 0;
  if (alpha <= 0) return compositeOver(baseSurface, baseSurface);

  const tint = parseColor(accent);
  if (!tint) return baseSurface;

  return compositeOver(
    baseSurface,
    `rgba(${Math.round(tint.r)}, ${Math.round(tint.g)}, ${Math.round(tint.b)}, ${alpha})`,
  );
}
