import { setAlternateAppIconAsync } from "@/modules/app-icon";
import {
  MATERIAL_YOU_ACCENT_ID,
  type AccentColorId,
} from "@/context/settings-store";

/**
 * Alternate icon for an accent; `null` is the primary (blue) icon. The names
 * must match what plugins/accent-app-icons.js generates.
 */
export function getAppIconNameForAccent(accent: AccentColorId): string | null {
  if (accent === "blue" || accent === MATERIAL_YOU_ACCENT_ID) return null;
  return `AppIcon-${accent[0].toUpperCase()}${accent.slice(1)}`;
}

let latestRequest = 0;
let pending: Promise<void> = Promise.resolve();

/**
 * Switches the home screen icon to match `accent`. Requests are serialized and
 * only the newest one runs, so tapping through colors quickly does not stack
 * up system alerts. Must be called from a user action: iOS rejects icon
 * changes while the app is not in the foreground.
 */
export function syncAppIconToAccent(accent: AccentColorId | null): Promise<void> {
  const request = ++latestRequest;
  const name = accent ? getAppIconNameForAccent(accent) : null;
  const run = pending.then(async () => {
    if (request !== latestRequest) return;
    await setAlternateAppIconAsync(name);
  });
  pending = run.catch(() => undefined);
  return run;
}
