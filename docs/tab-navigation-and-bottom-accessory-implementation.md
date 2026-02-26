# Tab Navigation + iOS Bottom Accessory: Implementation Guide

This document explains how tab navigation and the iOS bottom accessory are implemented in this project, and what you need to reproduce the same behavior in another React Native app.

## 1. Target Behavior

The current app implements:

1. Native-feeling tabs on iOS and Android via `expo-router/unstable-native-tabs`.
2. Native tab bar minimization on scroll (`onScrollDown`) on iOS 26+.
3. A native iOS 26+ tab bottom accessory button that changes action and label by route context.
4. A fallback floating add button on older iOS versions.
5. Route-aware action context (`task`, `routine`, `project`, `inProject`) shared between JS and native.

## 2. Source Map (Where Everything Lives)

Core files in this repo:

1. JS tab layout and native context updates:
   - `app/(tabs)/_layout.tsx`
2. Global providers including task-create context:
   - `app/_layout.tsx`
   - `context/task-create-context.tsx`
3. iOS version gate helper:
   - `utils/ios-version.ts`
4. iOS native bridge shim:
   - `ios/reminds/TaskAccessoryContextBridge.m`
5. iOS native implementation (bridge + accessory coordinator + custom accessory button):
   - `ios/reminds/AppDelegate.swift`
6. iOS Xcode wiring (bridge header + source inclusion):
   - `ios/reminds.xcodeproj/project.pbxproj`
7. Fallback floating button (for iOS < 26):
   - `components/ui/floating-add-button.tsx`
8. Screens that render fallback floating button:
   - `app/(tabs)/home/index.tsx`
   - `app/(tabs)/explore/index.tsx`
   - `app/(tabs)/home/routines.tsx`
9. Scroll/minimize compatibility workaround for draggable list:
   - `components/tasks/task-swipe-draggable-list.tsx`
10. URL scheme used by native button deep links:
   - `app.json` (`expo.scheme`)

## 3. Tab Navigation Architecture

### 3.1 Tab container

`app/(tabs)/_layout.tsx` uses:

1. `NativeTabs` (iOS + Android) for the main path.
2. `Tabs` (React Navigation fallback) for non-mobile platforms.

Key tab triggers:

1. `home`
2. `search`
3. `explore`
4. Optional hidden `routines` trigger (`showRoutinesTab = false` in current code)

On iOS 26+, search uses `role="search"` for native semantics.

### 3.2 Minimize behavior

Tab minimization is configured in two places:

1. JS: `NativeTabs minimizeBehavior="onScrollDown"`
2. Native: `UITabBarController.tabBarMinimizeBehavior = .onScrollDown`

Both are intentionally set to keep behavior consistent.

### 3.3 Route-context state machine

Route segments (`useSegments`) determine action context:

1. `task`: default context.
2. `project`: when on explore root.
3. `inProject`: when on in-tab project detail route (`/(tabs)/explore/[id]`).
4. `routine`: when in routines route path.

This context is written to:

1. JS store (`TaskCreateContext`) for modal defaults.
2. Native bridge (`TaskAccessoryContextBridge.setContext`) on iOS 26+.

## 4. Bottom Accessory (iOS 26+) Architecture

### 4.1 Startup and coordinator lifecycle

In `AppDelegate.swift`:

1. After React Native startup, app creates `TabBarAccessoryCoordinator` only for iOS 26+.
2. Coordinator listens to app/window lifecycle notifications.
3. Coordinator runs an install loop with retries (every 0.5s) until it can resolve the active tab bar controller.

The retry loop is important because the tab controller may not exist immediately when React tree first mounts.

### 4.2 Installing accessory and minimize integration

Coordinator `installIfNeeded()`:

1. Resolves visible `UITabBarController` across scenes/windows.
2. Applies container background colors for visual consistency.
3. Sets `tabBarMinimizeBehavior = .onScrollDown`.
4. Binds a best-matching scroll view via `setContentScrollView(..., for: [.top, .bottom])`.
5. Installs `UITabAccessory(contentView: addButton)` if not already attached.

### 4.3 Accessory context bridge (JS -> Native)

Bridge parts:

1. `TaskAccessoryContextBridge` Swift class in `AppDelegate.swift`.
2. Objective-C extern shim in `TaskAccessoryContextBridge.m`.
3. JS calls in `app/(tabs)/_layout.tsx` and `app/(tabs)/home/routines.tsx`.

Flow:

1. JS calls `NativeModules.TaskAccessoryContextBridge.setContext(mode, projectId, projectLabel)`.
2. Swift bridge posts `Notification.Name("TaskAccessoryContextDidChange")`.
3. Coordinator receives notification and updates `accessoryMode`, `accessoryProjectId`, `accessoryProjectLabel`.
4. Custom accessory button updates title/appearance.

### 4.4 Accessory actions by mode

Native button tap resolves URL by mode:

1. `task` -> `reminds:///task/create-modal`
2. `routine` -> `reminds:///task/create-modal?preset=routine`
3. `project` -> `reminds:///project/edit-modal`
4. `inProject` -> `reminds:///task/create-modal?projectId=<id>`

Important: replace `reminds:///...` with your target app scheme and route structure.

### 4.5 Custom accessory UI behavior

`AddReminderAccessoryButton` (Swift `UIControl`) handles:

1. Dynamic inline vs expanded accessory layout (`UITraitTabAccessoryEnvironment`).
2. Auto collapse/expand of title based on available width.
3. Dark/light mode styling.
4. Press highlight behavior.
5. Accessibility label updates with mode/title.
6. Localized labels for many languages.

For exact parity, copy this class as-is and only change branding text/colors if needed.

## 5. Scroll Binding Logic for Minimize + Accessory

To enable native minimize-on-scroll reliably, coordinator finds best scrollable view:

1. Traverses view tree to collect candidate `UIScrollView` instances.
2. Scores each candidate by:
   - vertical overflow
   - visible height
   - likely RN/table/collection type
3. Binds chosen scroll view to owner controller(s) and tab controller.

This is crucial when screens have nested containers, custom lists, or navigation stacks.

## 6. Fallback for iOS < 26

For older iOS:

1. Accessory is unavailable.
2. UI falls back to JS `FloatingAddButton` overlay.
3. Screens gate with `Platform.OS === 'ios' && !isIOS26OrNewer()`.

Current fallback placement exists in:

1. Home screen (`app/(tabs)/home/index.tsx`)
2. Explore screen (`app/(tabs)/explore/index.tsx`)
3. Routines screen (`app/(tabs)/home/routines.tsx`)

## 7. Critical Porting Steps (Another App)

Use this order to replicate behavior with lowest risk.

### Step 1: Baseline dependencies and project mode

Match or validate these requirements:

1. Expo Router setup (file-based routes).
2. `expo-router` with `unstable-native-tabs` support.
3. Native iOS project generated (`ios/` exists; use prebuild if needed).
4. iOS SDK/Xcode that supports iOS 26 APIs (`UITabAccessory`, `tabBarMinimizeBehavior`, `UITraitTabAccessoryEnvironment`).

### Step 2: Add route-context store

Port `TaskCreateContext` pattern:

1. `mode` (`task` | `routine` | `project` | `inProject`)
2. `projectId`
3. setters and clearers

Mount provider at app root (`app/_layout.tsx`) above tab layout and modal routes.

### Step 3: Port tab layout behavior

In your tabs layout:

1. Use `NativeTabs`.
2. Enable `minimizeBehavior="onScrollDown"`.
3. Derive context from route segments.
4. Write context to JS store and native bridge.

Also keep a non-mobile fallback with regular `Tabs` if web support is required.

### Step 4: Add iOS version gate

Port `isIOS26OrNewer()` helper and gate:

1. Native bridge calls only on iOS 26+.
2. Fallback floating button only below iOS 26.

### Step 5: Port native bridge

Add files/classes:

1. `TaskAccessoryContextBridge.m` extern module.
2. Swift class `@objc(TaskAccessoryContextBridge)` with `setContext` method.
3. Notification plumbing to accessory coordinator.

Ensure Xcode target includes:

1. `.m` file in Compile Sources.
2. bridging header path configured.

### Step 6: Port coordinator and accessory button

Copy and adapt:

1. `TabBarAccessoryCoordinator`
2. `AddReminderAccessoryButton`
3. installation/retry logic
4. scroll binding logic
5. URL resolution for button tap

Update URL mapping to your app's routes and scheme.

### Step 7: Add URL scheme + routes

Your app must support deep links used by the accessory:

1. Add scheme in app config (`expo.scheme` or native URL types).
2. Ensure routes exist for every action URL.

### Step 8: Add fallback floating button where needed

On screens where accessory must appear on iOS 26+, place `FloatingAddButton` only for iOS < 26.

### Step 9: Keep routines and project detail context in sync

Replicate these edge behaviors:

1. Explore root => `project` mode.
2. Explore detail => `inProject` mode with `projectId` + label.
3. Routines screen focus => force `routine` mode; cleanup to `task` on blur.
4. Do not clear context when root modal overlays tabs (preserves in-project create flow).

### Step 10: Preserve scroll/minimize compatibility hacks

If you use draggable/nested lists, include equivalent mitigations:

1. ScrollView compatibility mode for iOS 26 where native tracking misses draggable list internals.
2. Optional invisible probe rows to guarantee enough scrollable area for minimize transitions.

## 8. Exact Values and Behaviors to Mirror

If you need near pixel/interaction parity, keep these constants:

1. Accessory button height: 36
2. Accessory icon size: 16
3. Expanded horizontal inset: 16
4. Inline horizontal inset: 10
5. Title collapse threshold: 0.22
6. Title expand threshold: 0.30
7. Minimize behavior: `onScrollDown`

## 9. Required Replacements in Target App

Before shipping, replace all app-specific values:

1. URL scheme `reminds`.
2. Route paths (`/task/create-modal`, `/project/edit-modal`, `/explore/[id]`, etc.).
3. Mode-to-action mapping if your IA differs.
4. Colors/text branding in accessory button.
5. Optional localization dictionary.

## 10. Verification Checklist

Run this matrix after porting:

1. iOS 26+ home: accessory visible, tab bar minimizes on scroll down, expands on scroll up.
2. iOS 26+ explore root: accessory label/action switches to project creation.
3. iOS 26+ in project detail: accessory opens task create with project preselected.
4. iOS 26+ routines: accessory opens routine preset flow.
5. iOS < 26: floating add button appears on relevant screens, no native bridge crashes.
6. Android: tabs still work, no iOS-only code path execution.
7. Web (if supported): fallback tab UI renders correctly.
8. Open create modal over tabs while in project detail: context remains correct.

## 11. Known Risks and Failure Modes

1. Running in Expo Go may not reflect full iOS 26 behavior; use a custom native build/dev client.
2. Missing bridge source registration in Xcode causes `NativeModules.TaskAccessoryContextBridge` to be undefined.
3. Wrong scheme or missing routes causes accessory taps to do nothing.
4. If no scroll view is found, minimization may not react as expected.
5. Complex nested gestures (draggable lists) can break native scroll detection without compatibility fallback.

## 12. Minimal Copy List (Fastest Path)

If you want a direct copy with minimal redesign, copy/adapt in this order:

1. `app/(tabs)/_layout.tsx`
2. `context/task-create-context.tsx`
3. `utils/ios-version.ts`
4. `components/ui/floating-add-button.tsx`
5. `ios/reminds/TaskAccessoryContextBridge.m`
6. `ios/reminds/AppDelegate.swift` (coordinator + accessory classes + bridge class)
7. Xcode project entries for bridge/header/sources
8. Screen-level fallback button placements and routines focus override

Then replace app-specific routes, scheme, and labels.

## 13. Code Reference Index (Line Anchors)

Use these as direct lookup points when porting:

1. Tab layout + route-context -> `/app/(tabs)/_layout.tsx:31`
2. Route-context effect (`task`/`routine`/`project`/`inProject`) -> `/app/(tabs)/_layout.tsx:57`
3. JS -> native bridge context updates -> `/app/(tabs)/_layout.tsx:94`
4. Native tabs + minimize config -> `/app/(tabs)/_layout.tsx:209`
5. iOS 26 search role trigger -> `/app/(tabs)/_layout.tsx:257`
6. Root provider mounting for task-create context -> `/app/_layout.tsx:56`
7. Task create context store definition -> `/context/task-create-context.tsx:1`
8. Create modal consuming context + route params -> `/app/task/create-modal.tsx:79`
9. iOS version gating helper -> `/utils/ios-version.ts:21`
10. Native bridge extern module -> `/ios/reminds/TaskAccessoryContextBridge.m:1`
11. Native bridge Swift class -> `/ios/reminds/AppDelegate.swift:111`
12. Coordinator creation in app launch -> `/ios/reminds/AppDelegate.swift:47`
13. Accessory install/minimize setup -> `/ios/reminds/AppDelegate.swift:210`
14. Scroll binding logic -> `/ios/reminds/AppDelegate.swift:281`
15. Mode -> deep-link URL resolver -> `/ios/reminds/AppDelegate.swift:386`
16. Accessory button UI class -> `/ios/reminds/AppDelegate.swift:530`
17. Xcode project bridge/source wiring -> `/ios/reminds.xcodeproj/project.pbxproj:15`
18. App scheme used by native deep links -> `/app.json:8`
19. Fallback floating button component -> `/components/ui/floating-add-button.tsx:25`
20. Home fallback button placement -> `/app/(tabs)/home/index.tsx:1087`
21. Explore fallback button placement -> `/app/(tabs)/explore/index.tsx:220`
22. Routines focus-mode override + fallback button -> `/app/(tabs)/home/routines.tsx:352`
23. Draggable list iOS 26 scroll-compatibility workaround -> `/components/tasks/task-swipe-draggable-list.tsx:304`

## 14. Ready-to-Copy Snippets (No Access to Old Project)

Use these snippets as a bootstrap when the original repository is unavailable.

### 14.1 App scheme (required for accessory deep links)

`app.json`

```json
{
  "expo": {
    "scheme": "yourapp"
  }
}
```

Replace `yourapp` in all deep-link URLs below.

### 14.2 iOS version gate helper

`utils/ios-version.ts`

```ts
import { Platform } from "react-native";

const parseMajorVersion = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const match = value.match(/\d+/);
    if (match) {
      const parsed = Number.parseInt(match[0], 10);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
};

export const getIOSMajorVersion = (): number | null => {
  if (Platform.OS !== "ios") return null;
  const constants = Platform.constants as { osVersion?: string; systemVersion?: string };
  const candidates: unknown[] = [Platform.Version, constants.osVersion, constants.systemVersion];
  for (const candidate of candidates) {
    const major = parseMajorVersion(candidate);
    if (major !== null) return major;
  }
  return null;
};

export const isIOS26OrNewer = (): boolean => {
  const major = getIOSMajorVersion();
  return major !== null && major >= 26;
};
```

### 14.3 Route context store

`context/task-create-context.tsx`

```tsx
import React from "react";

export type TaskCreateMode = "task" | "routine" | "project" | "inProject";

type TaskCreateContextValue = {
  projectId: string;
  setProjectId: (projectId: string) => void;
  clearProjectId: () => void;
  mode: TaskCreateMode;
  setMode: (mode: TaskCreateMode) => void;
};

const TaskCreateContext = React.createContext<TaskCreateContextValue | null>(null);

export function TaskCreateProvider({ children }: { children: React.ReactNode }) {
  const [projectId, setProjectIdState] = React.useState("");
  const [mode, setModeState] = React.useState<TaskCreateMode>("task");

  const setProjectId = React.useCallback((nextProjectId: string) => {
    setProjectIdState(nextProjectId.trim());
  }, []);

  const clearProjectId = React.useCallback(() => {
    setProjectIdState("");
  }, []);

  const setMode = React.useCallback((nextMode: TaskCreateMode) => {
    setModeState(nextMode);
  }, []);

  const value = React.useMemo(
    () => ({ projectId, setProjectId, clearProjectId, mode, setMode }),
    [projectId, setProjectId, clearProjectId, mode, setMode]
  );

  return <TaskCreateContext.Provider value={value}>{children}</TaskCreateContext.Provider>;
}

export function useTaskCreateContext() {
  const ctx = React.useContext(TaskCreateContext);
  if (!ctx) throw new Error("useTaskCreateContext must be used within TaskCreateProvider");
  return ctx;
}
```

Mount it in root layout:

```tsx
// app/_layout.tsx
import { TaskCreateProvider } from "@/context/task-create-context";

// ...
<TaskCreateProvider>
  {/* Stack / tabs */}
</TaskCreateProvider>;
```

### 14.4 Tabs layout with mode switching + native bridge updates

`app/(tabs)/_layout.tsx`

```tsx
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useGlobalSearchParams, useSegments } from "expo-router";
import { Icon, Label, NativeTabs, VectorIcon } from "expo-router/unstable-native-tabs";
import React from "react";
import { NativeModules, Platform } from "react-native";

import { useTaskCreateContext } from "@/context/task-create-context";
import { isIOS26OrNewer } from "@/utils/ios-version";

type TaskAccessoryContextBridge = {
  setContext?: (
    mode: "task" | "routine" | "project" | "inProject",
    projectId?: string | null,
    projectLabel?: string | null
  ) => void;
};

export default function TabLayout() {
  const isIOS26Plus = isIOS26OrNewer();
  const segments = useSegments();
  const { id: routeIdParam } = useGlobalSearchParams<{ id?: string | string[] }>();
  const { setProjectId, clearProjectId, setMode } = useTaskCreateContext();

  const accessoryBridge = NativeModules
    .TaskAccessoryContextBridge as TaskAccessoryContextBridge | undefined;

  const routeProjectId = React.useMemo(() => {
    const rawRouteId = Array.isArray(routeIdParam) ? routeIdParam[0] : routeIdParam;
    return typeof rawRouteId === "string" ? rawRouteId.trim() : "";
  }, [routeIdParam]);

  React.useEffect(() => {
    const [first, second, third] = segments;

    if (first === "(tabs)" && second === "explore" && third === "[id]" && routeProjectId) {
      setProjectId(routeProjectId);
      setMode("inProject");
      return;
    }

    if (first === "(tabs)" && second === "home" && (third === "routines" || segments.includes("routines"))) {
      clearProjectId();
      setMode("routine");
      return;
    }

    if (first === "(tabs)" && second === "explore") {
      clearProjectId();
      setMode("project");
      return;
    }

    if (first === "(tabs)") {
      clearProjectId();
      setMode("task");
    }
  }, [segments, routeProjectId, setProjectId, clearProjectId, setMode]);

  React.useEffect(() => {
    if (Platform.OS !== "ios" || !isIOS26Plus) return;
    const [first, second, third] = segments;

    if (first === "(tabs)" && second === "explore" && third === "[id]" && routeProjectId) {
      accessoryBridge?.setContext?.("inProject", routeProjectId, "Project");
      return;
    }

    if (first === "(tabs)" && second === "explore") {
      accessoryBridge?.setContext?.("project", null, null);
      return;
    }

    if (first === "(tabs)" && second === "home" && (third === "routines" || segments.includes("routines"))) {
      accessoryBridge?.setContext?.("routine", null, null);
      return;
    }

    accessoryBridge?.setContext?.("task", null, null);
  }, [segments, routeProjectId, accessoryBridge, isIOS26Plus]);

  return (
    <NativeTabs
      minimizeBehavior="onScrollDown"
      disableTransparentOnScrollEdge={!isIOS26Plus}
    >
      <NativeTabs.Trigger name="home">
        <Label>Tasks</Label>
        <Icon sf={{ default: "checkmark.circle", selected: "checkmark.circle.fill" }} />
      </NativeTabs.Trigger>

      {isIOS26Plus ? (
        <NativeTabs.Trigger name="search" role="search">
          <Label>Search</Label>
          <Icon sf={{ default: "magnifyingglass", selected: "magnifyingglass" }} />
        </NativeTabs.Trigger>
      ) : (
        <NativeTabs.Trigger name="search">
          <Label>Search</Label>
          <Icon src={<VectorIcon family={MaterialIcons} name="search" />} />
        </NativeTabs.Trigger>
      )}

      <NativeTabs.Trigger name="explore">
        <Label>Projects</Label>
        <Icon sf={{ default: "folder", selected: "folder.fill" }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
```

### 14.5 Create modal: consume context from route/store

`app/task/create-modal.tsx` (relevant part)

```tsx
import { useLocalSearchParams } from "expo-router";
import React from "react";
import { useTaskCreateContext } from "@/context/task-create-context";

export default function CreateTaskModal() {
  const { projectId: projectIdParam, preset: presetParam } = useLocalSearchParams<{
    projectId?: string | string[];
    preset?: string | string[];
  }>();
  const { projectId: focusedProjectId, mode } = useTaskCreateContext();

  const routeProjectId = React.useMemo(() => {
    const raw = Array.isArray(projectIdParam) ? projectIdParam[0] : projectIdParam;
    return typeof raw === "string" ? raw.trim() : "";
  }, [projectIdParam]);

  const routePreset = React.useMemo(() => {
    const raw = Array.isArray(presetParam) ? presetParam[0] : presetParam;
    return typeof raw === "string" ? raw.trim().toLowerCase() : "";
  }, [presetParam]);

  const shouldPresetRoutine =
    routePreset === "routine" || routePreset === "routines" || mode === "routine";

  const initialProjectId = routeProjectId || focusedProjectId || "";

  // Use shouldPresetRoutine + initialProjectId in your draft/create logic.
  return null;
}
```

### 14.6 Objective-C extern bridge

`ios/<YourApp>/TaskAccessoryContextBridge.m`

```objc
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(TaskAccessoryContextBridge, NSObject)

RCT_EXTERN_METHOD(setContext:(NSString *)mode
                  projectId:(NSString * _Nullable)projectId
                  projectLabel:(NSString * _Nullable)projectLabel)

@end
```

### 14.7 Swift bridge + iOS 26 accessory coordinator

Put this into `ios/<YourApp>/AppDelegate.swift` (or split into separate Swift files).

```swift
import Expo
import React
import ReactAppDependencyProvider

private extension Notification.Name {
  static let taskAccessoryContextDidChange = Notification.Name("TaskAccessoryContextDidChange")
}

@objc(TaskAccessoryContextBridge)
final class TaskAccessoryContextBridge: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { true }

  @objc(setContext:projectId:projectLabel:)
  func setContext(_ mode: String, projectId: String?, projectLabel: String?) {
    DispatchQueue.main.async {
      NotificationCenter.default.post(
        name: .taskAccessoryContextDidChange,
        object: nil,
        userInfo: [
          "mode": mode,
          "projectId": projectId ?? "",
          "projectLabel": projectLabel ?? ""
        ]
      )
    }
  }
}

@available(iOS 26.0, *)
private final class TabBarAccessoryCoordinator: NSObject {
  private let windowProvider: () -> UIWindow?
  private weak var attachedTabBarController: UITabBarController?
  private lazy var addButton = AddReminderAccessoryButton(target: self, action: #selector(handleTap))

  private var accessoryMode: AddReminderAccessoryButton.Mode = .task
  private var accessoryProjectId: String?
  private var accessoryProjectLabel: String?

  init(windowProvider: @escaping () -> UIWindow?) {
    self.windowProvider = windowProvider
    super.init()
  }

  func start() {
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleContextDidChange(_:)),
      name: .taskAccessoryContextDidChange,
      object: nil
    )
    installIfNeeded()
  }

  @discardableResult
  private func installIfNeeded() -> Bool {
    guard let tab = resolveTabBarController() else { return false }

    tab.tabBarMinimizeBehavior = .onScrollDown

    if attachedTabBarController !== tab || tab.bottomAccessory == nil {
      tab.setBottomAccessory(UITabAccessory(contentView: addButton), animated: true)
      attachedTabBarController = tab
    }

    if let selectedView = tab.selectedViewController?.viewIfLoaded,
       let scroll = Self.findFirstScrollView(in: selectedView) {
      let edges: NSDirectionalRectEdge = [.top, .bottom]
      tab.setContentScrollView(scroll, for: edges)
      tab.selectedViewController?.setContentScrollView(scroll, for: edges)
    }

    addButton.setContext(mode: accessoryMode, projectLabel: accessoryProjectLabel, animated: false)
    return true
  }

  @objc private func handleContextDidChange(_ notification: Notification) {
    guard let userInfo = notification.userInfo else { return }

    let rawMode = (userInfo["mode"] as? String) ?? ""
    accessoryMode = AddReminderAccessoryButton.Mode(rawValue: rawMode) ?? .task

    let rawProjectId = (userInfo["projectId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    let rawProjectLabel = (userInfo["projectLabel"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)

    accessoryProjectId = (rawProjectId?.isEmpty == false) ? rawProjectId : nil
    accessoryProjectLabel = (rawProjectLabel?.isEmpty == false) ? rawProjectLabel : nil
    addButton.setContext(mode: accessoryMode, projectLabel: accessoryProjectLabel, animated: true)
  }

  @objc private func handleTap() {
    guard let url = resolvedAddActionURL() else { return }
    UIApplication.shared.open(url, options: [:], completionHandler: nil)
  }

  private func resolvedAddActionURL() -> URL? {
    switch accessoryMode {
    case .routine:
      return URL(string: "yourapp:///task/create-modal?preset=routine")
    case .project:
      return URL(string: "yourapp:///project/edit-modal")
    case .inProject:
      guard let projectId = accessoryProjectId, !projectId.isEmpty else {
        return URL(string: "yourapp:///task/create-modal")
      }
      let encoded = projectId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? projectId
      return URL(string: "yourapp:///task/create-modal?projectId=\(encoded)")
    case .task:
      return URL(string: "yourapp:///task/create-modal")
    }
  }

  private func resolveTabBarController() -> UITabBarController? {
    guard let root = windowProvider()?.rootViewController else { return nil }
    return Self.findTabBarController(in: root)
  }

  private static func findTabBarController(in viewController: UIViewController) -> UITabBarController? {
    if let tab = viewController as? UITabBarController { return tab }
    for child in viewController.children {
      if let found = findTabBarController(in: child) { return found }
    }
    if let presented = viewController.presentedViewController {
      return findTabBarController(in: presented)
    }
    return nil
  }

  private static func findFirstScrollView(in view: UIView) -> UIScrollView? {
    if let scroll = view as? UIScrollView, scroll.isScrollEnabled { return scroll }
    for subview in view.subviews {
      if let found = findFirstScrollView(in: subview) { return found }
    }
    return nil
  }
}

@available(iOS 26.0, *)
private final class AddReminderAccessoryButton: UIControl {
  enum Mode: String {
    case task
    case routine
    case project
    case inProject
  }

  private var mode: Mode = .task
  private let icon = UIImageView(image: UIImage(systemName: "plus"))
  private let label = UILabel()
  private let stack = UIStackView()

  init(target: Any?, action: Selector) {
    super.init(frame: .zero)
    icon.translatesAutoresizingMaskIntoConstraints = false
    label.translatesAutoresizingMaskIntoConstraints = false
    stack.translatesAutoresizingMaskIntoConstraints = false
    stack.axis = .horizontal
    stack.spacing = 8
    stack.alignment = .center
    stack.addArrangedSubview(icon)
    stack.addArrangedSubview(label)
    addSubview(stack)

    NSLayoutConstraint.activate([
      stack.topAnchor.constraint(equalTo: topAnchor, constant: 6),
      stack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -6),
      stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
      stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
      heightAnchor.constraint(greaterThanOrEqualToConstant: 36),
      icon.widthAnchor.constraint(equalToConstant: 16),
      icon.heightAnchor.constraint(equalToConstant: 16),
    ])

    addTarget(target, action: action, for: .touchUpInside)
    setContext(mode: .task, projectLabel: nil, animated: false)
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

  func setContext(mode: Mode, projectLabel: String?, animated: Bool) {
    self.mode = mode
    switch mode {
    case .task: label.text = "Add task"
    case .routine: label.text = "Add task"
    case .project: label.text = "Add project"
    case .inProject:
      let resolved = (projectLabel?.isEmpty == false) ? (projectLabel ?? "Project") : "Project"
      label.text = "Add in \(resolved)"
    }
    accessibilityLabel = label.text
  }
}
```

In `AppDelegate.application(_:didFinishLaunchingWithOptions:)`, create and start the coordinator:

```swift
if #available(iOS 26.0, *) {
  let coordinator = TabBarAccessoryCoordinator(windowProvider: { [weak self] in self?.window })
  coordinator.start()
  self.tabBarAccessoryCoordinator = coordinator
}
```

### 14.8 iOS fallback floating button (for iOS < 26)

`components/ui/floating-add-button.tsx`

```tsx
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function FloatingAddButton({ onPress }: { onPress: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.button, { bottom: Math.max(0, insets.bottom + 49 + 12) }]}
    >
      <MaterialIcons name="add" size={28} color="white" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    right: 18,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0070E1",
    zIndex: 100,
  },
});
```

Use it only below iOS 26:

```tsx
const showFloatingAddButton = Platform.OS === "ios" && !isIOS26OrNewer();
return (
  <>
    {/* Screen content */}
    {showFloatingAddButton ? <FloatingAddButton onPress={handleAdd} /> : null}
  </>
);
```
