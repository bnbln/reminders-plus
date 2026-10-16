import {
  AccessoryWidgetBackground,
  Capsule,
  Gauge,
  HStack,
  Image,
  Label,
  Spacer,
  Text,
  VStack,
  ZStack,
} from '@expo/ui/swift-ui';
import {
  containerBackground,
  fixedSize,
  font,
  foregroundStyle,
  frame,
  gaugeStyle,
  lineLimit,
  minimumScaleFactor,
  opacity,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { StreakWidgetProps } from './types';

/**
 * Home Screen and Lock Screen widget for the completion streak.
 *
 * The body runs inside the WidgetKit extension's own JavaScript runtime: it has
 * to be pure, synchronous and completely self-contained — no hooks, no imports,
 * no references to anything declared outside of this function.
 */
const StreakWidget = (props: StreakWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const family = environment.widgetFamily ?? 'systemSmall';
  const renderingMode = environment.widgetRenderingMode ?? 'fullColor';
  // Tinted Home Screen widgets and the Lock Screen render monochrome: hand the
  // system plain hierarchical styles there instead of the app's accent color.
  const isTinted = renderingMode !== 'fullColor';
  const isDark = environment.colorScheme === 'dark';
  const accent = isTinted ? '#FFFFFF' : props.accent;
  const secondary = { type: 'hierarchical', style: 'secondary' } as const;
  const track = { type: 'hierarchical', style: 'quaternary' } as const;
  const days = props.days ?? [];
  const maxCount = Math.max(1, props.maxCount ?? 1);
  const hasStreak = props.streak > 0;
  const captionLabel = hasStreak ? props.streakLabel : props.startLabel;

  const surface = isTinted
    ? [widgetURL(props.url)]
    : [
        containerBackground(
          {
            type: 'linearGradient',
            colors: isDark ? props.backgroundDark : props.backgroundLight,
            startPoint: { x: 0.5, y: 0 },
            endPoint: { x: 0.5, y: 1 },
          },
          'widget'
        ),
        widgetURL(props.url),
      ];

  // A bar never collapses to nothing: an empty day stays readable as a dot.
  const barHeight = (count: number, maxHeight: number) => {
    const minHeight = 8;
    if (count <= 0) return minHeight;
    return minHeight + Math.round((count / maxCount) * (maxHeight - minHeight));
  };

  const weekStrip = (barMax: number, showLabels: boolean) => (
    <HStack spacing={6} alignment="bottom">
      {days.map((day) => (
        <VStack key={day.key} spacing={5}>
          <ZStack alignment="bottom" modifiers={[frame({ width: 10, height: barMax })]}>
            <Capsule modifiers={[foregroundStyle(track), frame({ width: 10, height: barMax })]} />
            <Capsule
              modifiers={[
                foregroundStyle(accent),
                opacity(day.count > 0 ? (day.isToday ? 1 : 0.65) : 0.18),
                frame({ width: 10, height: barHeight(day.count, barMax) }),
              ]}
            />
          </ZStack>
          {showLabels && (
            <Text
              modifiers={[
                font({ size: 10, weight: day.isToday ? 'bold' : 'medium', design: 'rounded' }),
                foregroundStyle(day.isToday ? accent : secondary),
              ]}>
              {day.label}
            </Text>
          )}
        </VStack>
      ))}
    </HStack>
  );

  // A flat strip of seven pills — the small widget's version of the chart.
  const weekDots = (
    <HStack spacing={4}>
      {days.map((day) => (
        <Capsule
          key={day.key}
          modifiers={[
            foregroundStyle(day.count > 0 ? accent : track),
            opacity(day.count > 0 ? (day.isToday ? 1 : 0.6) : 1),
            frame({ maxWidth: Infinity }),
            frame({ height: 6 }),
          ]}
        />
      ))}
    </HStack>
  );

  if (family === 'accessoryInline') {
    return <Label title={props.inlineLabel} systemImage="flame.fill" />;
  }

  if (family === 'accessoryCircular') {
    return (
      <ZStack modifiers={[widgetURL(props.url)]}>
        <AccessoryWidgetBackground />
        <Gauge
          value={Math.min(props.todayCount, props.goal)}
          min={0}
          max={props.goal}
          modifiers={[gaugeStyle('circularCapacity')]}
          currentValueLabel={
            <Text modifiers={[font({ size: 16, weight: 'bold', design: 'rounded' })]}>
              {props.streak}
            </Text>
          }>
          <Image systemName="flame.fill" size={10} />
        </Gauge>
      </ZStack>
    );
  }

  if (family === 'accessoryRectangular') {
    return (
      <VStack alignment="leading" spacing={3} modifiers={[widgetURL(props.url)]}>
        <HStack spacing={4}>
          <Image systemName="flame.fill" size={12} />
          <Text modifiers={[font({ size: 15, weight: 'bold', design: 'rounded' })]}>
            {props.streak}
          </Text>
          <Text modifiers={[font({ size: 13, weight: 'medium' }), lineLimit(1)]}>
            {captionLabel}
          </Text>
        </HStack>
        <Text
          modifiers={[font({ size: 12 }), foregroundStyle(secondary), lineLimit(1)]}>
          {props.todayLabel + ': ' + props.todayValueLabel}
        </Text>
        {weekStrip(14, false)}
      </VStack>
    );
  }

  const streakBlock = (numberSize: number) => (
    <VStack alignment="leading" spacing={0}>
      <HStack spacing={6} alignment="firstTextBaseline">
        <Image systemName="flame.fill" size={Math.round(numberSize * 0.52)} color={accent} />
        <Text
          modifiers={[
            font({ size: numberSize, weight: 'heavy', design: 'rounded' }),
            minimumScaleFactor(0.6),
            lineLimit(1),
          ]}>
          {props.streak}
        </Text>
      </HStack>
      <Text
        modifiers={[
          font({ size: 13, weight: 'semibold' }),
          foregroundStyle(secondary),
          lineLimit(1),
          minimumScaleFactor(0.8),
        ]}>
        {captionLabel}
      </Text>
    </VStack>
  );

  if (family === 'systemSmall') {
    return (
      <VStack alignment="leading" spacing={0} modifiers={surface}>
        {streakBlock(46)}
        <Spacer />
        <HStack spacing={4}>
          <Image systemName="checkmark.circle.fill" size={11} color={accent} />
          <Text
            modifiers={[
              font({ size: 12, weight: 'semibold' }),
              foregroundStyle(secondary),
              lineLimit(1),
              minimumScaleFactor(0.7),
            ]}>
            {props.todayValueLabel}
          </Text>
        </HStack>
        <Spacer modifiers={[frame({ maxHeight: 10 })]} />
        {weekDots}
      </VStack>
    );
  }

  // systemMedium, systemLarge and systemExtraLarge.
  return (
    <HStack spacing={16} modifiers={surface}>
      <VStack alignment="leading" spacing={0} modifiers={[frame({ maxHeight: Infinity })]}>
        {streakBlock(52)}
        <Spacer />
        <VStack alignment="leading" spacing={2}>
          <Text
            modifiers={[
              font({ size: 11, weight: 'semibold' }),
              foregroundStyle(secondary),
              lineLimit(1),
            ]}>
            {props.bestLabel}
          </Text>
          <Text modifiers={[font({ size: 15, weight: 'bold', design: 'rounded' }), lineLimit(1)]}>
            {props.bestValueLabel}
          </Text>
        </VStack>
      </VStack>
      <Spacer />
      <VStack alignment="trailing" spacing={8} modifiers={[frame({ maxHeight: Infinity })]}>
        <HStack spacing={4}>
          <Image systemName="checkmark.circle.fill" size={11} color={accent} />
          <Text
            modifiers={[
              font({ size: 12, weight: 'semibold' }),
              foregroundStyle(secondary),
              lineLimit(1),
              // The column is only as wide as the bar chart; let the label use its full width.
              fixedSize(),
            ]}>
            {props.todayLabel + ' · ' + props.todayValueLabel}
          </Text>
        </HStack>
        <Spacer />
        {weekStrip(56, true)}
      </VStack>
    </HStack>
  );
};

export default createWidget<StreakWidgetProps>('StreakWidget', StreakWidget, {
  streak: 0,
  best: 0,
  todayCount: 0,
  goal: 5,
  days: [],
  maxCount: 1,
  accent: '#FF9500',
  backgroundLight: ['#FFF3E4', '#FFFFFF'],
  backgroundDark: ['#2A1E10', '#151718'],
  streakLabel: 'day streak',
  todayLabel: 'Today',
  bestLabel: 'Longest streak',
  todayValueLabel: '0 tasks',
  bestValueLabel: '0 days',
  startLabel: 'Start today',
  inlineLabel: '0 days',
  url: 'reminds:///home/streaks',
});
