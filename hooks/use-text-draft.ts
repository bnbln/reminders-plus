import React from "react";

const DEFAULT_COMMIT_DELAY_MS = 400;

/**
 * Keeps a text field's value as a local draft and writes it to the store only
 * after typing pauses, on blur, or when the field unmounts. Writing the store
 * on every keystroke persists the tasks, syncs widgets and re-renders every
 * list each time.
 *
 * Store changes from elsewhere (sync, another screen) replace the draft as
 * long as no typed change is still waiting to be written.
 */
export function useTextDraft(
  storedValue: string,
  commit: (value: string) => void,
  delayMs: number = DEFAULT_COMMIT_DELAY_MS,
) {
  const [draft, setDraft] = React.useState(storedValue);
  const pendingRef = React.useRef<string | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitRef = React.useRef(commit);
  React.useLayoutEffect(() => {
    commitRef.current = commit;
  });

  const flush = React.useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (pending === null) return;
    pendingRef.current = null;
    commitRef.current(pending);
  }, []);

  React.useEffect(() => {
    if (pendingRef.current === null) setDraft(storedValue);
  }, [storedValue]);

  // Write whatever is still pending when the screen closes.
  React.useEffect(() => flush, [flush]);

  const onChangeText = React.useCallback(
    (next: string) => {
      setDraft(next);
      pendingRef.current = next;
      if (timerRef.current != null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, delayMs);
    },
    [delayMs, flush],
  );

  return { value: draft, onChangeText, onBlur: flush };
}
