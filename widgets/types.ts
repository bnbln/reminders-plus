/**
 * Prop contracts shared between the app (which builds the props) and the
 * widget layouts (which render them).
 *
 * Everything here is type-only on purpose: widget layouts run in an isolated
 * JavaScriptCore context inside the WidgetKit extension and cannot reference
 * anything declared outside of their own function body. Types are erased at
 * compile time, so importing them from a widget file is safe — importing a
 * value would not be.
 */

/** One bar/dot of the "last 7 days" activity strip. */
export type StreakWidgetDay = {
  /** Stable key for the rendered list (local ISO date). */
  key: string;
  /** Localized short weekday, for example `Mo`. */
  label: string;
  /** Tasks completed on that day. */
  count: number;
  isToday: boolean;
};

export type StreakWidgetProps = {
  /** Current streak in days. */
  streak: number;
  /** Longest streak ever, in days. */
  best: number;
  /** Tasks completed today. */
  todayCount: number;
  /** Reference value for the ring/gauge, never `0`. */
  goal: number;
  /** Last seven days, oldest first. */
  days: StreakWidgetDay[];
  /** Highest `count` in `days`, never `0`. */
  maxCount: number;
  /** Accent color (hex) the user picked in the app. */
  accent: string;
  /** Background gradient stops for light mode, top first. */
  backgroundLight: string[];
  /** Background gradient stops for dark mode, top first. */
  backgroundDark: string[];
  /** `Tage Streak` / `day streak`. */
  streakLabel: string;
  /** `Heute` / `Today`. */
  todayLabel: string;
  /** `Längster Streak` / `Longest streak`. */
  bestLabel: string;
  /** `3 Aufgaben` / `3 tasks`. */
  todayValueLabel: string;
  /** `12 Tage` / `12 days`. */
  bestValueLabel: string;
  /** Shown instead of the streak label when the streak is `0`. */
  startLabel: string;
  /** One-line summary for the inline Lock Screen accessory. */
  inlineLabel: string;
  /** Deep link opened when the widget is tapped. */
  url: string;
};

export type TasksWidgetTask = {
  id: string;
  title: string;
  emoji: string;
  /** Localized time (`09:30`), or an empty string for all-day tasks. */
  time: string;
  /** Task or project color (hex). */
  color: string;
  /** Due date is in the past. */
  overdue: boolean;
  /** Deep link to the task detail screen. */
  url: string;
};

export type TasksWidgetProps = {
  /** `Heute` / `Today`. */
  title: string;
  /** Localized date, for example `Sa., 20. Sep.`. */
  dateLabel: string;
  /** `3 von 7 erledigt` / `3 of 7 done`. */
  progressLabel: string;
  /** Completion ratio between `0` and `1`. */
  progress: number;
  /** Open tasks for today, including overdue ones. */
  openCount: number;
  /** `4 Aufgaben` / `4 tasks`. */
  openLabel: string;
  /** Open tasks, earliest first. Widgets slice this per family. */
  tasks: TasksWidgetTask[];
  /**
   * Tasks ticked off in the widget itself. The widget renders them as done and
   * the app drains the list into the store the next time it runs.
   */
  doneIds: string[];
  /** Empty state title. */
  emptyLabel: string;
  /** Empty state subtitle. */
  emptySubtitle: string;
  /** `+{count} weitere` — `{count}` is replaced inside the widget. */
  moreTemplate: string;
  accent: string;
  backgroundLight: string[];
  backgroundDark: string[];
  /** Deep link opened when the widget background is tapped. */
  url: string;
};
