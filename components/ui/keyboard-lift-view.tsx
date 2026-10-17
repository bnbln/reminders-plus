import React from "react";
import { Platform, View, type StyleProp, type ViewStyle } from "react-native";
import Reanimated, {
  interpolate,
  useAnimatedKeyboard,
  useAnimatedStyle,
} from "react-native-reanimated";

type KeyboardLiftViewProps = React.PropsWithChildren<{
  style: StyleProp<ViewStyle>;
}>;

// Follows the keyboard frame by frame on the UI thread, so a bottom composer
// rides on the keyboard edge instead of catching up in a second animation
// (KeyboardAvoidingView only reacted after layout and an async height lookup).
// Also tracks interactive dismissal and the hardware keyboard bar.
function IosKeyboardLiftView({ style, children }: KeyboardLiftViewProps) {
  const keyboard = useAnimatedKeyboard();
  const liftStyle = useAnimatedStyle(() => {
    const height = keyboard.height.value;
    // Keeps the former 10pt gap above an open keyboard, blended in over the
    // first points of travel so a closed keyboard leaves no offset.
    const gap = interpolate(height, [0, 40], [0, 10], "clamp");
    return { transform: [{ translateY: -(height + gap) }] };
  });
  return (
    // box-none: the full-height lift view must not swallow taps meant for the
    // dimmed backdrop behind it; only the composer itself takes touches.
    <Reanimated.View style={[style, liftStyle]} pointerEvents="box-none">
      {children}
    </Reanimated.View>
  );
}

function PlainKeyboardLiftView({ style, children }: KeyboardLiftViewProps) {
  return (
    <View style={style} pointerEvents="box-none">
      {children}
    </View>
  );
}

// Android keeps its previous behaviour: the window handles the keyboard.
export const KeyboardLiftView =
  Platform.OS === "ios" ? IosKeyboardLiftView : PlainKeyboardLiftView;
