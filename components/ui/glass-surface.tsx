import * as GlassEffect from 'expo-glass-effect';
import React from 'react';
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';

export type GlassEffectStyle = 'clear' | 'regular';

export type GlassSurfaceProps = ViewProps & {
  glassEffectStyle?: GlassEffectStyle;
  tintColor?: string;
  fallbackBackgroundColor?: string;
  isInteractive?: boolean;
  disabled?: boolean;
};

export function withAlpha(color: string, alpha: number): string {
  const clamped = Math.max(0, Math.min(1, alpha));

  if (clamped >= 1) return color;
  if (!color.startsWith('#')) return color;

  const hex = color.slice(1);

  const normalizeHex = (value: string) =>
    value.length === 3 ? value.split('').map((ch) => ch + ch).join('') : value;

  const normalized = normalizeHex(hex);
  if (normalized.length !== 6) return color;

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);

  if ([r, g, b].some((v) => Number.isNaN(v))) return color;

  return `rgba(${r}, ${g}, ${b}, ${clamped})`;
}

type NativeViewRef = React.ElementRef<typeof View>;

export const GlassSurface = React.forwardRef<NativeViewRef, GlassSurfaceProps>(
  (
    {
      style,
      children,
      glassEffectStyle = 'regular',
      tintColor,
      fallbackBackgroundColor = 'transparent',
      isInteractive = false,
      disabled = false,
      ...rest
    },
    ref
  ) => {
    const anyGlassEffect = GlassEffect as any;
    const isGlassEffectAPIAvailableFn: undefined | (() => boolean) =
      typeof anyGlassEffect.isGlassEffectAPIAvailable === 'function'
        ? anyGlassEffect.isGlassEffectAPIAvailable
        : undefined;
    const isLiquidGlassAvailableFn: undefined | (() => boolean) =
      typeof anyGlassEffect.isLiquidGlassAvailable === 'function'
        ? anyGlassEffect.isLiquidGlassAvailable
        : undefined;

    const glassApiOk = isGlassEffectAPIAvailableFn ? isGlassEffectAPIAvailableFn() : true;
    const liquidOk = isLiquidGlassAvailableFn ? isLiquidGlassAvailableFn() : true;
    const canUseGlass = Platform.OS === 'ios' && glassApiOk && liquidOk;

    if (!canUseGlass) {
      return (
        <View ref={ref} style={[{ backgroundColor: fallbackBackgroundColor }, style]} {...rest}>
          {children}
        </View>
      );
    }

    const flattened = StyleSheet.flatten(style) ?? {};
    const radiusStyles = {
      borderRadius: flattened.borderRadius,
      borderTopLeftRadius: flattened.borderTopLeftRadius,
      borderTopRightRadius: flattened.borderTopRightRadius,
      borderBottomLeftRadius: flattened.borderBottomLeftRadius,
      borderBottomRightRadius: flattened.borderBottomRightRadius,
    } as const;

    const GlassViewComponent: React.ComponentType<any> | undefined = anyGlassEffect.GlassView;

    if (!GlassViewComponent) {
      return (
        <View ref={ref} style={[{ backgroundColor: fallbackBackgroundColor }, style]} {...rest}>
          {children}
        </View>
      );
    }

    return (
      <View ref={ref} style={style} {...rest}>
        {!disabled && (
          <GlassViewComponent
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, radiusStyles]}
            glassEffectStyle={glassEffectStyle}
            tintColor={tintColor}
            isInteractive={isInteractive}
          />
        )}
        {children}
      </View>
    );
  }
);

GlassSurface.displayName = 'GlassSurface';
