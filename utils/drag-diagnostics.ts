import { File, Paths } from "expo-file-system";
// Opt-in, local development diagnostics. No task text, IDs or network traffic.
type DragTraceEvent = {
  time: number;
  list: string;
  event: string;
  details: Record<string, number | boolean | string>;
};
type DragTraceGlobal = typeof globalThis & {
  __remindsDragDiagnosticsEnabled?: boolean;
  __remindsDragTrace?: DragTraceEvent[];
};

export function traceDrag(
  list: string,
  event: string,
  details: Record<string, number | boolean | string> = {},
) {
  if (!__DEV__) return;
  const target = globalThis as DragTraceGlobal;
  if (target.__remindsDragDiagnosticsEnabled === false) return;
  const trace = target.__remindsDragTrace ?? (target.__remindsDragTrace = []);
  const entry = { time: Date.now(), list, event, details };
  trace.push(entry);
  new File(Paths.cache, "drag-trace.json").write(JSON.stringify(trace));
  if (trace.length > 400) trace.splice(0, trace.length - 400);
}
