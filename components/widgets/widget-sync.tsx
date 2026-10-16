import React from 'react';
import { AppState, Platform } from 'react-native';

import {
  createRoutineCompletionTransition,
  useTasksStore,
  type Task,
} from '@/context/tasks-store';
import { getAccentColorValue, useAppSettings } from '@/context/settings-store';
import type { WidgetSource } from '@/widgets/build-props';

type WidgetsModule = typeof import('@/widgets');

const IS_SUPPORTED = Platform.OS === 'ios';
/** Give the store a moment to hydrate and settle before pushing a timeline. */
const PUSH_DEBOUNCE_MS = 800;

let widgetsModule: WidgetsModule | null = null;

/**
 * Loaded lazily: importing the widget entry point constructs native widget
 * objects, which only exist on iOS.
 */
function getWidgets(): WidgetsModule | null {
  if (!IS_SUPPORTED) return null;
  if (!widgetsModule) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    widgetsModule = require('@/widgets') as WidgetsModule;
  }
  return widgetsModule;
}

/**
 * Keeps the iOS widgets in sync with the task store, and adopts the
 * completions that happened inside a widget.
 *
 * Renders nothing — mount it once inside `TasksProvider`.
 */
export function WidgetSync() {
  const { tasks, projects, completionHistory, setTasks } = useTasksStore();
  const { accentColor } = useAppSettings();
  const accent = getAccentColorValue(accentColor);

  const sourceRef = React.useRef<WidgetSource>({ tasks, projects, completionHistory, accent });
  const [pushRequest, setPushRequest] = React.useState(0);

  // Keep the snapshot the effects below read from in sync with the store.
  React.useEffect(() => {
    sourceRef.current = { tasks, projects, completionHistory, accent };
  }, [accent, completionHistory, projects, tasks]);

  const push = React.useCallback(() => {
    const widgets = getWidgets();
    if (!widgets) return;
    try {
      widgets.syncWidgets(sourceRef.current);
    } catch (error) {
      if (__DEV__) console.warn('[widgets] Timeline update failed', error);
    }
  }, []);

  /** Marks tasks completed the same way the in-app lists do. */
  const completeTasks = React.useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const completedAt = Date.now();
      setTasks((previous) => {
        const existingIds = new Set(previous.map((task) => task.id));
        let next = previous;
        let changed = false;

        for (const id of ids) {
          const task = next.find((candidate) => candidate.id === id);
          if (!task || task.section === 'completed' || task.completedAt) continue;

          const routineTransition = createRoutineCompletionTransition(
            task,
            completedAt,
            existingIds,
          );
          if (routineTransition) {
            existingIds.add(routineTransition.completedTask.id);
            next = [
              ...next.map((candidate) =>
                candidate.id === id ? routineTransition.nextTask : candidate,
              ),
              routineTransition.completedTask,
            ];
          } else {
            next = next.map((candidate) =>
              candidate.id === id
                ? ({ ...candidate, section: 'completed', completedAt } satisfies Task)
                : candidate,
            );
          }
          changed = true;
        }

        return changed ? next : previous;
      });
    },
    [setTasks],
  );

  /** Adopts taps that happened while the app was not running. */
  const drainWidgetCompletions = React.useCallback(async () => {
    const widgets = getWidgets();
    if (!widgets) return;
    try {
      const ids = await widgets.readWidgetCompletions();
      if (ids.length > 0) completeTasks(ids);
    } catch (error) {
      if (__DEV__) console.warn('[widgets] Reading widget completions failed', error);
    } finally {
      // Re-push through the debounced effect below: that clears `doneIds` and
      // picks up the completions that were just applied to the store.
      setPushRequest((request) => request + 1);
    }
  }, [completeTasks]);

  // Push a new timeline whenever the data behind the widgets changes.
  React.useEffect(() => {
    if (!IS_SUPPORTED) return;
    const handle = setTimeout(push, PUSH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [accent, completionHistory, projects, push, pushRequest, tasks]);

  // A tap in the widget while the app is alive: complete it right away.
  React.useEffect(() => {
    const widgets = getWidgets();
    if (!widgets) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { addUserInteractionListener } = require('expo-widgets') as typeof import('expo-widgets');
    const subscription = addUserInteractionListener((event) => {
      if (event.source !== 'TasksWidget' || !event.target) return;
      completeTasks([event.target]);
    });
    return () => subscription.remove();
  }, [completeTasks]);

  // …and taps that happened while it was not.
  React.useEffect(() => {
    if (!IS_SUPPORTED) return;
    void drainWidgetCompletions();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void drainWidgetCompletions();
    });
    return () => subscription.remove();
  }, [drainWidgetCompletions]);

  return null;
}
