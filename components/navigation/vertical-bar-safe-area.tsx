import React from "react";
import { NativeEventEmitter, NativeModules, Platform, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-screens/experimental";

import { Colors } from "@/constants/theme";
import { StreakAccentBackground } from "@/components/ui/streak-accent-background";
import { useColorScheme } from "@/hooks/use-color-scheme";

const verticalBarModule = Platform.OS === "ios" ? NativeModules.RemindsVerticalBar : undefined;
const VerticalBarContext = React.createContext(false);
const VerticalBarActiveContext = React.createContext(false);
type PageLayout = { width: number; leftInset: number; rightInset: number };
const PageLayoutContext = React.createContext<PageLayout | undefined>(undefined);

export function VerticalBarSafeAreaProvider({ children }: React.PropsWithChildren) {
  const [isVerticalBarActive, setIsVerticalBarActive] = React.useState(
    verticalBarModule?.hasVerticalBar === true,
  );
  const [hasSeenVerticalBar, setHasSeenVerticalBar] = React.useState(
    verticalBarModule?.hasVerticalBar === true,
  );

  React.useEffect(() => {
    if (!verticalBarModule) return;
    const subscription = new NativeEventEmitter(verticalBarModule).addListener(
      "verticalBarLayoutChanged",
      (state: { hasVerticalBar: boolean }) => {
        setIsVerticalBarActive(state.hasVerticalBar);
        // Keep the wrapper mounted across Duo pose changes. The native Screen
        // updates its insets to zero when bars return to the top/bottom,
        // without remounting forms or losing their local state.
        if (state.hasVerticalBar) setHasSeenVerticalBar(true);
      },
    );
    return () => subscription.remove();
  }, []);

  return (
    <VerticalBarContext.Provider value={hasSeenVerticalBar}>
      <VerticalBarActiveContext.Provider value={isVerticalBarActive}>
        {children}
      </VerticalBarActiveContext.Provider>
    </VerticalBarContext.Provider>
  );
}

function VerticalBarSafeArea({
  children,
  accentBackground,
  fillBackground = false,
  fillBackgroundColor,
}: React.PropsWithChildren<{
  accentBackground: boolean;
  fillBackground?: boolean;
  fillBackgroundColor?: Partial<Record<keyof typeof Colors, string>>;
}>) {
  const hasVerticalBar = React.useContext(VerticalBarContext);
  const theme = useColorScheme() ?? "light";
  const dimensions = useWindowDimensions();
  const [pageLayout, setPageLayout] = React.useState<PageLayout>();

  // Keep the original native view hierarchy on all layouts without a vertical bar.
  if (!hasVerticalBar) return <>{children}</>;

  return (
    <View
      style={[
        { flex: 1 },
        fillBackground
          ? {
              backgroundColor: fillBackgroundColor?.[theme] ?? Colors[theme].background,
            }
          : null,
      ]}
    >
      {/* Only decoration spans the full native Screen, including the bar area. */}
      {accentBackground ? <StreakAccentBackground isDark={theme === "dark"} /> : null}
      {/* Read the nearest Screen's insets, including its toolbar/tab bar.
          Top/bottom remain governed by the existing headers and scroll views. */}
      <SafeAreaView
        edges={{ left: true, right: true }}
        onLayout={(event) => {
          const { x, width } = event.nativeEvent.layout;
          setPageLayout({
            width,
            leftInset: Math.max(0, x),
            rightInset: Math.max(0, dimensions.width - x - width),
          });
        }}
      >
        <View style={{ flex: 1 }}>
          <PageLayoutContext.Provider value={pageLayout}>
            {children}
          </PageLayoutContext.Provider>
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
  return (
    <VerticalBarSafeArea
      accentBackground={route.name === "settings" || route.name === "cloud-sync"}
      fillBackground={route.name === "plus"}
      fillBackgroundColor={
        route.name === "plus"
          ? { light: "#F2F2F7", dark: Colors.dark.background }
          : undefined
      }
    >
      {children}
    </VerticalBarSafeArea>
  );
}

export function verticalBarTabScreenLayout({
  children,
  route,
}: {
  children: React.ReactNode;
  route: { name: string };
}) {
  const isProjectDetail = route.name === "[id]";
  return (
    <VerticalBarSafeArea
      accentBackground={!isProjectDetail}
      fillBackground={isProjectDetail}
    >
      {children}
    </VerticalBarSafeArea>
  );
}

export function usePageDimensions() {
  const dimensions = useWindowDimensions();
  const pageLayout = React.useContext(PageLayoutContext);
  return pageLayout === undefined
    ? dimensions
    : { ...dimensions, width: pageLayout.width };
}

export function usePageInsets() {
  const dimensions = useWindowDimensions();
  const pageLayout = React.useContext(PageLayoutContext);
  return pageLayout ?? {
    width: dimensions.width,
    leftInset: 0,
    rightInset: 0,
  };
}

export function useVerticalBarActive() {
  return React.useContext(VerticalBarActiveContext);
}
