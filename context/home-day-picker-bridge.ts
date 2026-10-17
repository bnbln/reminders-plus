/**
 * Hands the day picked in the `day-picker` sheet back to the Today screen.
 * The sheet is its own route, so it cannot call the screen's callbacks
 * directly; the screen registers a handler while it is mounted.
 */
type DayPickerHandler = (dateStart: number) => void;

let handler: DayPickerHandler | null = null;

export function setHomeDayPickerHandler(next: DayPickerHandler | null) {
  handler = next;
}

export function submitHomeDayPickerDate(dateStart: number) {
  handler?.(dateStart);
}
