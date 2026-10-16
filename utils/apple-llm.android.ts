// `@react-native-ai/apple` is iOS-only: its TurboModules are registered through
// `TurboModuleRegistry.getEnforcing`, which throws at import time on Android and
// takes down the whole route tree with it.
//
// Every call site already gates on `Platform.OS === "ios"`, so these stubs only
// need to keep the module graph loadable. `isAvailable()` returning false makes
// the assist screen render its unsupported state.

export const apple = {
  isAvailable: () => false,
};

export function createAppleProvider(_options?: unknown): never {
  throw new Error(
    "Apple Foundation Models are not available on Android.",
  );
}
