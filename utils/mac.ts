import { NativeEventEmitter, NativeModules, Platform } from "react-native";

type MacSupportNativeModule = {
  isiOSAppOnMac?: boolean;
  setMenuContent?: (content: MacMenuContent) => void;
  setSidebarContent?: (content: MacSidebarContent) => void;
  addListener?: (eventName: string) => void;
  removeListeners?: (count: number) => void;
};

export type MacMenuEntry = {
  id: string;
  title: string;
  symbol?: string;
  color?: string;
  checked?: boolean;
};

export type MacMenuContent = {
  titles: Record<string, string>;
  filters: MacMenuEntry[];
};

export type MacSidebarContent = {
  projectsGroupTitle: string;
  newProjectTitle: string;
  profileTitle: string;
  projects: MacMenuEntry[];
  profileSections: MacMenuEntry[][];
};

export type MacCommandEvent = { command: string; value: string };

const macSupport =
  Platform.OS === "ios"
    ? (NativeModules.MacSupportBridge as MacSupportNativeModule | undefined)
    : undefined;

/**
 * True when the iPad build runs on a Mac ("Designed for iPad"). The sidebar,
 * the header add button and the Mac notification rules key off this, not off
 * window size. See docs/macos.md.
 */
export const IS_MAC = macSupport?.isiOSAppOnMac === true;

/** The menu bar (Mac, and iPadOS 26 with a keyboard) exists wherever the bridge does. */
export const HAS_MAC_MENU_BRIDGE = macSupport != null;

export function setMacMenuContent(content: MacMenuContent) {
  macSupport?.setMenuContent?.(content);
}

export function setMacSidebarContent(content: MacSidebarContent) {
  if (!IS_MAC) return;
  macSupport?.setSidebarContent?.(content);
}

const emitter = macSupport ? new NativeEventEmitter(macSupport as never) : null;

type CommandHandler = (value: string) => boolean | void;
// Screens register handlers for commands that act on what they show (the open
// task). The newest registration wins; returning true marks the command handled.
const screenHandlers = new Map<string, CommandHandler[]>();

export function registerMacCommandHandler(command: string, handler: CommandHandler) {
  const list = screenHandlers.get(command) ?? [];
  list.push(handler);
  screenHandlers.set(command, list);
  return () => {
    const current = screenHandlers.get(command) ?? [];
    screenHandlers.set(
      command,
      current.filter((candidate) => candidate !== handler),
    );
  };
}

function dispatchToScreens(event: MacCommandEvent): boolean {
  const list = screenHandlers.get(event.command);
  if (!list?.length) return false;
  return list[list.length - 1](event.value) === true;
}

/**
 * Subscribes the app-wide handler. Screen handlers run first; the global
 * handler gets the command when no screen took it.
 */
export function subscribeMacCommands(handler: (event: MacCommandEvent) => void) {
  if (!emitter) return () => undefined;
  const subscription = emitter.addListener("macCommand", (body) => {
    const event = body as MacCommandEvent;
    if (dispatchToScreens(event)) return;
    handler(event);
  });
  return () => subscription.remove();
}
