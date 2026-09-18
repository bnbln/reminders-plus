import React from "react";
import { NativeEventEmitter, NativeModules, Platform, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-screens/experimental";

import { StreakAccentBackground } from "@/components/ui/streak-accent-background";
import { useColorScheme } from "@/hooks/use-color-scheme";

const verticalBarModule = Platform.OS === "ios" ? NativeModules.RemindsVerticalBar : undefined;
const VerticalBarContext = React.createContext(false);
const PageWidthContext = React.createContext<number | undefined>(undefined);

export function VerticalBarSafeAreaProvider({ children }: React.PropsWithChildren) {
  const [hasVerticalBar, setHasVerticalBar] = React.useState(
    verticalBarModule?.hasVerticalBar === true,
  );

  React.useEffect(() => {
    if (!verticalBarModule) return;
    const subscription = new NativeEventEmitter(verticalBarModule).addListener(
      "verticalBarLayoutChanged",
      // Once enabled, keep the wrapper across Duo pose changes. The native
      // Screen updates its insets to zero when bars return to the top/bottom,
      // without remounting forms or losing their local state.
      (state: { hasVerticalBar: boolean }) => setHasVerticalBar((previous) => previous || state.hasVerticalBar),
    );
    return () => subscription.remove();
  }, []);

  return <VerticalBarContext.Provider value={hasVerticalBar}>{children}</VerticalBarContext.Provider>;
}

function VerticalBarSafeArea({ children, accentBackground }: React.PropsWithChildren<{ accentBackground: boolean }>) {
  const hasVerticalBar = React.useContext(VerticalBarContext);
  const theme = useColorScheme() ?? "light";
  const [width, setWidth] = React.useState<number>();

  // Keep the original native view hierarchy on all layouts without a vertical bar.
  if (!hasVerticalBar) return <>{children}</>;

  return (
    <View style={{ flex: 1 }}>
      {/* Only decoration spans the full native Screen, including the bar area. */}
      {accentBackground ? <StreakAccentBackground isDark={theme === "dark"} /> : null}
      {/* Read the nearest Screen's insets, including its toolbar/tab bar.
          Top/bottom remain governed by the existing headers and scroll views. */}
      <SafeAreaView edges={{ left: true, right: true }}>
        <View style={{ flex: 1 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
          <PageWidthContext.Provider value={width}>{children}</PageWidthContext.Provider>
        </View>
      </SafeAreaView>
    </View>
  );
}

export function verticalBarScreenLayout({ children, route }: {
  children: React.ReactNode;
  route: { name: string };
}) {
  // The tabs contain their own stacks. Insetting the parent would also move the
  // native bars and then apply the inset a second time in the leaf screen.
  if (route.name === "(tabs)") return <>{children}</>;
  return <VerticalBarSafeArea accentBackground={route.name === "settings" || route.name === "cloud-sync"}>{children}</VerticalBarSafeArea>;
}

export function verticalBarTabScreenLayout({ children }: { children: React.ReactNode }) {
  return <VerticalBarSafeArea accentBackground>{children}</VerticalBarSafeArea>;
}

export function usePageDimensions() {
  const dimensions = useWindowDimensions();
  const width = React.useContext(PageWidthContext);
  return width === undefined ? dimensions : { ...dimensions, width };
}
