import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type StatHeroProps = {
  /** Symbol shown to the left of the value. */
  icon: React.ReactNode;
  /** The big value, e.g. "48%" or "12". */
  value: string;
  subtitle: string;
  compact: boolean;
  textColor: string;
  subtitleColor: string;
};

/**
 * Big centred value for the Status and Streaks screens.
 *
 * The icon and the value form one row that is centred as a unit, so it stays
 * centred whatever the value's width (0 % vs 100 %). The subtitle sits on its
 * own line below, centred under the whole row (it may reach under the icon),
 * and wraps instead of widening the block.
 */
export function StatHero({
  icon,
  value,
  subtitle,
  compact,
  textColor,
  subtitleColor,
}: StatHeroProps) {
  return (
    <View
      style={[styles.hero, compact && styles.heroCompact]}
      accessible
      accessibilityLabel={`${value}, ${subtitle}`}
    >
      <View style={[styles.valueRow, compact && styles.valueRowCompact]}>
        {icon}
        <Text
          style={[
            styles.value,
            compact && styles.valueCompact,
            { color: textColor },
          ]}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
      <Text
        style={[
          styles.subtitle,
          compact && styles.subtitleCompact,
          { color: subtitleColor },
        ]}
      >
        {subtitle}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    marginBottom: 8,
  },
  heroCompact: {
    gap: 4,
    paddingVertical: 10,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  valueRowCompact: {
    gap: 10,
  },
  value: {
    fontSize: 64,
    fontWeight: '900',
    letterSpacing: -0.8,
    lineHeight: 64,
    fontVariant: ['tabular-nums'],
  },
  valueCompact: {
    fontSize: 54,
    lineHeight: 54,
  },
  subtitle: {
    // Wraps long or translated text into a short, centred paragraph.
    maxWidth: 300,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
  },
  subtitleCompact: {
    fontSize: 15,
    lineHeight: 19,
  },
});
