/**
 * Entry point for the iOS widgets.
 *
 * Importing this module constructs the native widget objects, so it must only
 * be loaded on iOS — see `components/widgets/widget-sync.tsx`.
 */
import {
  buildStreakWidgetProps,
  buildTasksWidgetProps,
  buildTimelineDates,
  type WidgetSource,
} from './build-props';
import StreakWidget from './streak-widget';
import TasksWidget from './tasks-widget';

export { StreakWidget, TasksWidget };
export type { WidgetSource };

/**
 * Pushes a fresh timeline to every widget.
 *
 * Each entry carries the props for the moment it becomes current, so the
 * widgets stay correct (overdue markers, the date header, the day rollover)
 * without the app running.
 */
export function syncWidgets(source: WidgetSource, nowMs: number = Date.now()): void {
  const timestamps = buildTimelineDates(source.tasks, nowMs);

  StreakWidget.updateTimeline(
    timestamps.map((timestamp) => ({
      date: new Date(timestamp),
      props: buildStreakWidgetProps(source, timestamp),
    })),
  );

  TasksWidget.updateTimeline(
    timestamps.map((timestamp) => ({
      date: new Date(timestamp),
      props: buildTasksWidgetProps(source, timestamp),
    })),
  );
}

/**
 * Reads back the tasks that were ticked off inside the widget while the app was
 * not running. The ids are cleared by the next `syncWidgets` call.
 */
export async function readWidgetCompletions(): Promise<string[]> {
  const timeline = await TasksWidget.getTimeline();
  const ids = new Set<string>();
  for (const entry of timeline) {
    for (const id of entry.props?.doneIds ?? []) {
      if (typeof id === 'string' && id.length > 0) ids.add(id);
    }
  }
  return Array.from(ids);
}
