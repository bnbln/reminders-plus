import {
  AccessoryWidgetBackground,
  Button,
  Gauge,
  HStack,
  Image,
  Label,
  Link,
  ProgressView,
  Spacer,
  Text,
  VStack,
  ZStack,
} from '@expo/ui/swift-ui';
import {
  buttonStyle,
  containerBackground,
  font,
  fixedSize,
  foregroundStyle,
  frame,
  gaugeStyle,
  lineLimit,
  minimumScaleFactor,
  opacity,
  progressViewStyle,
  strikethrough,
  tint,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { TasksWidgetProps } from './types';

/**
 * Home Screen and Lock Screen widget for today's task list.
 *
 * Rows are interactive on iOS 17+: the circle is an App Intent button that
 * records the task in `doneIds` right inside the widget. The app drains that
 * list into the store the next time it runs, so ticking something off works
 * even while the app is not running.
 *
 * The body runs inside the WidgetKit extension's own JavaScript runtime: it has
 * to be pure, synchronous and completely self-contained — no hooks, no imports,
 * no references to anything declared outside of this function.
 */
const TasksWidget = (props: TasksWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const family = environment.widgetFamily ?? 'systemSmall';
  const renderingMode = environment.widgetRenderingMode ?? 'fullColor';
  const isTinted = renderingMode !== 'fullColor';
  const isDark = environment.colorScheme === 'dark';
  const accent = isTinted ? '#FFFFFF' : props.accent;
  const secondary = { type: 'hierarchical', style: 'secondary' } as const;
  const doneIds = props.doneIds ?? [];
  const allTasks = props.tasks ?? [];
  const visibleCount =
    family === 'systemLarge' || family === 'systemExtraLarge'
      ? 7
      : family === 'systemMedium'
        ? 3
        : 2;
  const tasks = allTasks.slice(0, visibleCount);
  // `openCount` counts every open task, while `tasks` is capped by the app.
  const overflow = Math.max(0, (props.openCount ?? allTasks.length) - tasks.length);

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

  const isDone = (id: string) => doneIds.indexOf(id) >= 0;

  // Toggling keeps the press reversible: the app only completes what is still
  // in `doneIds` when it next reads the timeline.
  const toggle = (id: string) => ({
    doneIds: doneIds.indexOf(id) >= 0 ? doneIds.filter((entry) => entry !== id) : doneIds.concat([id]),
  });

  const rowContent = (task: TasksWidgetProps['tasks'][number]) => (
    <HStack spacing={7} modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}>
      {task.emoji.length > 0 && (
        <Text modifiers={[font({ size: 13 })]}>{task.emoji}</Text>
      )}
      <Text
        modifiers={[
          font({ size: 14, weight: 'medium' }),
          lineLimit(1),
          minimumScaleFactor(0.8),
          strikethrough({ isActive: isDone(task.id), pattern: 'solid' }),
          opacity(isDone(task.id) ? 0.45 : 1),
        ]}>
        {task.title}
      </Text>
      <Spacer />
      {task.time.length > 0 && (
        <Text
          modifiers={[
            font({ size: 12, weight: task.overdue ? 'semibold' : 'regular', design: 'rounded' }),
            foregroundStyle(task.overdue && !isTinted ? '#FF3B30' : secondary),
            lineLimit(1),
            fixedSize(),
          ]}>
          {task.time}
        </Text>
      )}
    </HStack>
  );

  // The small widget is too narrow for title and time side by side: stack them
  // so the title gets the full row width and the time never gets squeezed.
  // Titles wrap onto a second line instead of truncating after a few letters,
  // and the emoji is left out so it does not eat into that width.
  const compactRowContent = (task: TasksWidgetProps['tasks'][number]) => (
    <VStack
      alignment="leading"
      spacing={1}
      modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}>
      <Text
        modifiers={[
          font({ size: 13, weight: 'semibold' }),
          lineLimit(2),
          strikethrough({ isActive: isDone(task.id), pattern: 'solid' }),
          opacity(isDone(task.id) ? 0.45 : 1),
        ]}>
        {task.title}
      </Text>
      {task.time.length > 0 && (
        <Text
          modifiers={[
            font({ size: 11, weight: task.overdue ? 'semibold' : 'medium', design: 'rounded' }),
            foregroundStyle(task.overdue && !isTinted ? '#FF3B30' : secondary),
            lineLimit(1),
          ]}>
          {task.time}
        </Text>
      )}
    </VStack>
  );

  const row = (task: TasksWidgetProps['tasks'][number], compact: boolean) => (
    <HStack key={task.id} spacing={8} alignment={compact ? 'top' : 'center'}>
      <Button
        target={task.id}
        onPress={() => toggle(task.id)}
        modifiers={[buttonStyle('plain')]}>
        <Image
          systemName={isDone(task.id) ? 'checkmark.circle.fill' : 'circle'}
          size={compact ? 16 : 17}
          color={isDone(task.id) ? accent : isTinted ? '#FFFFFF' : task.color}
        />
      </Button>
      {compact ? (
        compactRowContent(task)
      ) : (
        <Link destination={task.url}>{rowContent(task)}</Link>
      )}
    </HStack>
  );

  const header = (
    <HStack spacing={6}>
      <Image systemName="checklist" size={12} color={accent} />
      <Text modifiers={[font({ size: 13, weight: 'bold' }), lineLimit(1)]}>{props.title}</Text>
      <Spacer />
      <Text
        modifiers={[
          font({ size: 12, weight: 'medium', design: 'rounded' }),
          foregroundStyle(secondary),
          lineLimit(1),
        ]}>
        {props.dateLabel}
      </Text>
    </HStack>
  );

  const progressBar = (
    <ProgressView
      value={Math.max(0, Math.min(1, props.progress))}
      modifiers={[progressViewStyle('linear'), tint(accent), frame({ maxWidth: Infinity })]}
    />
  );

  const emptyState = (
    <VStack spacing={6} modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity })]}>
      <Spacer />
      <Image systemName="checkmark.seal.fill" size={26} color={accent} />
      <Text modifiers={[font({ size: 15, weight: 'semibold' }), lineLimit(1)]}>
        {props.emptyLabel}
      </Text>
      <Text
        modifiers={[
          font({ size: 12 }),
          foregroundStyle(secondary),
          lineLimit(2),
          minimumScaleFactor(0.8),
        ]}>
        {props.emptySubtitle}
      </Text>
      <Spacer />
    </VStack>
  );

  if (family === 'accessoryInline') {
    return <Label title={props.openCount > 0 ? props.openLabel : props.emptyLabel} systemImage="checklist" />;
  }

  if (family === 'accessoryCircular') {
    return (
      <ZStack modifiers={[widgetURL(props.url)]}>
        <AccessoryWidgetBackground />
        <Gauge
          value={Math.max(0, Math.min(1, props.progress))}
          min={0}
          max={1}
          modifiers={[gaugeStyle('circularCapacity')]}
          currentValueLabel={
            <Text modifiers={[font({ size: 16, weight: 'bold', design: 'rounded' })]}>
              {props.openCount}
            </Text>
          }>
          <Image systemName="checklist" size={10} />
        </Gauge>
      </ZStack>
    );
  }

  if (family === 'accessoryRectangular') {
    return (
      <VStack alignment="leading" spacing={2} modifiers={[widgetURL(props.url)]}>
        <Text modifiers={[font({ size: 13, weight: 'bold' }), lineLimit(1)]}>
          {props.openCount > 0 ? props.title + ' · ' + props.openLabel : props.emptyLabel}
        </Text>
        {allTasks.slice(0, 2).map((task) => (
          <Text
            key={task.id}
            modifiers={[font({ size: 12 }), lineLimit(1), minimumScaleFactor(0.8)]}>
            {(task.time.length > 0 ? task.time + '  ' : '') + task.title}
          </Text>
        ))}
      </VStack>
    );
  }

  if (allTasks.length === 0) {
    return <VStack modifiers={surface}>{emptyState}</VStack>;
  }

  // Two wrapped rows fill the small widget, so there is no footer: the open
  // count in the header already says how many tasks there are in total.
  if (family === 'systemSmall') {
    return (
      <VStack alignment="leading" spacing={7} modifiers={surface}>
        <HStack spacing={6}>
          <Image systemName="checklist" size={12} color={accent} />
          <Text modifiers={[font({ size: 13, weight: 'bold' }), lineLimit(1)]}>{props.title}</Text>
          <Spacer />
          <Text
            modifiers={[
              font({ size: 13, weight: 'bold', design: 'rounded' }),
              foregroundStyle(accent),
            ]}>
            {props.openCount}
          </Text>
        </HStack>
        {tasks.map((task) => row(task, true))}
        <Spacer />
      </VStack>
    );
  }

  // systemMedium, systemLarge and systemExtraLarge.
  return (
    <VStack alignment="leading" spacing={8} modifiers={surface}>
      {header}
      <VStack alignment="leading" spacing={family === 'systemMedium' ? 7 : 9}>
        {tasks.map((task) => row(task, false))}
      </VStack>
      <Spacer />
      {family !== 'systemMedium' && progressBar}
      <HStack spacing={6}>
        <Text
          modifiers={[font({ size: 11, weight: 'medium' }), foregroundStyle(secondary), lineLimit(1)]}>
          {props.progressLabel}
        </Text>
        <Spacer />
        {overflow > 0 && (
          <Text
            modifiers={[
              font({ size: 11, weight: 'semibold' }),
              foregroundStyle(accent),
              lineLimit(1),
            ]}>
            {props.moreTemplate.replace('{count}', String(overflow))}
          </Text>
        )}
      </HStack>
    </VStack>
  );
};

export default createWidget<TasksWidgetProps>('TasksWidget', TasksWidget, {
  title: 'Today',
  dateLabel: '',
  progressLabel: '',
  progress: 0,
  openCount: 0,
  openLabel: '0 tasks',
  tasks: [],
  doneIds: [],
  emptyLabel: 'All done',
  emptySubtitle: 'No tasks left for today.',
  moreTemplate: '+{count} more',
  accent: '#FF9500',
  backgroundLight: ['#FFF3E4', '#FFFFFF'],
  backgroundDark: ['#2A1E10', '#151718'],
  url: 'reminds:///home/today',
});
