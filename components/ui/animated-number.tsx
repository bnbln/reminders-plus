import React from "react";
import {
  Animated,
  Easing,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
} from "react-native";
import { motionTiming } from "@/utils/motion";

type AnimatedNumberProps = {
  animateFromZeroOnMount?: boolean;
  formattedNumber: string;
  replayKey?: number;
  shouldAnimate: boolean;
  textStyle: StyleProp<TextStyle>;
};

type AnimatedNumberToken =
  | {
      kind: "digit";
      key: string;
      digit: string;
    }
  | {
      kind: "static";
      key: string;
      value: string;
    };

const isDigit = (value: string) => value >= "0" && value <= "9";

const buildZeroFormattedNumber = (formattedNumber: string) => {
  let hasDigit = false;
  const characters = Array.from(formattedNumber).map((character) => {
    if (!isDigit(character)) return character;
    hasDigit = true;
    return "0";
  });
  return hasDigit ? characters.join("") : formattedNumber;
};

const buildAnimatedNumberTokens = (
  formattedNumber: string,
): AnimatedNumberToken[] => {
  const characters = Array.from(formattedNumber);
  const totalDigits = characters.reduce(
    (count, character) => count + (isDigit(character) ? 1 : 0),
    0,
  );
  let seenDigits = 0;

  return characters.map((character, index) => {
    if (!isDigit(character)) {
      return {
        kind: "static",
        key: `static-${index}-${character}`,
        value: character,
      };
    }

    const positionFromRight = totalDigits - seenDigits - 1;
    seenDigits += 1;

    return {
      kind: "digit",
      key: `digit-${positionFromRight}`,
      digit: character,
    };
  });
};

function AnimatedDigit({
  digit,
  height,
  shouldAnimate,
  textStyle,
}: {
  digit: string;
  height: number;
  shouldAnimate: boolean;
  textStyle: StyleProp<TextStyle>;
}) {
  const [progress] = React.useState(() => new Animated.Value(1));
  const animationRef = React.useRef<Animated.CompositeAnimation | null>(null);
  const latestDigitRef = React.useRef(digit);
  const [fromDigit, setFromDigit] = React.useState<string | null>(null);
  const [toDigit, setToDigit] = React.useState(digit);
  const [direction, setDirection] = React.useState<1 | -1>(1);

  React.useEffect(() => {
    return () => {
      animationRef.current?.stop();
    };
  }, []);

  React.useEffect(() => {
    const previousDigit = latestDigitRef.current;
    if (previousDigit === digit) {
      setToDigit(digit);
      setFromDigit(null);
      return;
    }

    const nextDirection: 1 | -1 =
      Number(digit) >= Number(previousDigit) ? 1 : -1;

    setFromDigit(previousDigit);
    setToDigit(digit);
    setDirection(nextDirection);
    latestDigitRef.current = digit;

    animationRef.current?.stop();
    progress.stopAnimation();
    if (!shouldAnimate) {
      progress.setValue(1);
      setFromDigit(null);
      return;
    }

    progress.setValue(0);
    const animation = motionTiming(progress, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animationRef.current = animation;
    animation.start(({ finished }) => {
      if (!finished) return;
      animationRef.current = null;
      setFromDigit(null);
      progress.setValue(1);
    });

    return () => {
      animation.stop();
    };
  }, [digit, progress, shouldAnimate]);

  if (fromDigit === null) {
    return (
      <View style={[styles.digitViewport, { height }]}>
        <Text
          style={[
            textStyle,
            styles.glyph,
            {
              lineHeight: height,
            },
          ]}
        >
          {toDigit}
        </Text>
      </View>
    );
  }

  const translateY =
    direction === 1
      ? progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -height],
        })
      : progress.interpolate({
          inputRange: [0, 1],
          outputRange: [-height, 0],
        });
  const renderedDigits = direction === 1 ? [fromDigit, toDigit] : [toDigit, fromDigit];

  return (
    <View style={[styles.digitViewport, { height }]}>
      <Animated.View style={{ transform: [{ translateY }] }}>
        {renderedDigits.map((value, index) => (
          <Text
            key={`${value}-${index}`}
            style={[
              textStyle,
              styles.glyph,
              {
                lineHeight: height,
              },
            ]}
          >
            {value}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

export function AnimatedNumber({
  animateFromZeroOnMount = false,
  formattedNumber,
  replayKey,
  shouldAnimate,
  textStyle,
}: AnimatedNumberProps): React.ReactElement {
  const latestFormattedNumberRef = React.useRef(formattedNumber);
  const animationFrameRef = React.useRef<number | null>(null);
  const hasMountedRef = React.useRef(false);
  const lastReplayKeyRef = React.useRef(replayKey);
  const [visibleFormattedNumber, setVisibleFormattedNumber] =
    React.useState(() =>
      shouldAnimate && animateFromZeroOnMount
        ? buildZeroFormattedNumber(formattedNumber)
        : formattedNumber,
    );

  const clearScheduledReplay = React.useCallback(() => {
    if (animationFrameRef.current === null) return;
    cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
  }, []);

  const replayFromZero = React.useCallback(() => {
    clearScheduledReplay();

    const zeroFormattedNumber = buildZeroFormattedNumber(
      latestFormattedNumberRef.current,
    );
    setVisibleFormattedNumber((previous) =>
      previous === zeroFormattedNumber ? previous : zeroFormattedNumber,
    );

    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = null;
      setVisibleFormattedNumber((previous) => {
        const next = latestFormattedNumberRef.current;
        return previous === next ? previous : next;
      });
    });
  }, [clearScheduledReplay]);

  React.useEffect(() => clearScheduledReplay, [clearScheduledReplay]);

  React.useEffect(() => {
    latestFormattedNumberRef.current = formattedNumber;

    if (!shouldAnimate) {
      hasMountedRef.current = true;
      clearScheduledReplay();
      setVisibleFormattedNumber(formattedNumber);
      lastReplayKeyRef.current = replayKey;
      return;
    }

    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      lastReplayKeyRef.current = replayKey;
      if (animateFromZeroOnMount) {
        replayFromZero();
        return;
      }
    }

    setVisibleFormattedNumber((previous) =>
      previous === formattedNumber ? previous : formattedNumber,
    );
  }, [
    animateFromZeroOnMount,
    clearScheduledReplay,
    formattedNumber,
    replayFromZero,
    replayKey,
    shouldAnimate,
  ]);

  React.useEffect(() => {
    if (!shouldAnimate) {
      lastReplayKeyRef.current = replayKey;
      return;
    }
    if (replayKey === undefined || lastReplayKeyRef.current === replayKey) {
      return;
    }

    lastReplayKeyRef.current = replayKey;
    replayFromZero();
  }, [replayFromZero, replayKey, shouldAnimate]);

  const resolvedTextStyle = React.useMemo(
    () => StyleSheet.flatten(textStyle),
    [textStyle],
  );
  const numberHeight =
    typeof resolvedTextStyle?.lineHeight === "number"
      ? resolvedTextStyle.lineHeight
      : typeof resolvedTextStyle?.fontSize === "number"
        ? Math.round(resolvedTextStyle.fontSize * 1.2)
        : 40;
  const tokens = React.useMemo(
    () => buildAnimatedNumberTokens(visibleFormattedNumber),
    [visibleFormattedNumber],
  );

  return (
    <Animated.View style={styles.row}>
      {tokens.map((token) =>
        token.kind === "digit" ? (
          <AnimatedDigit
            key={token.key}
            digit={token.digit}
            height={numberHeight}
            shouldAnimate={shouldAnimate}
            textStyle={textStyle}
          />
        ) : (
          <View
            key={token.key}
            style={[styles.staticGlyphWrap, { height: numberHeight }]}
          >
            <Text
              style={[
                textStyle,
                styles.glyph,
                styles.staticGlyph,
                {
                  lineHeight: numberHeight,
                },
              ]}
            >
              {token.value}
            </Text>
          </View>
        ),
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  digitViewport: {
    overflow: "hidden",
    alignSelf: "flex-start",
  },
  staticGlyphWrap: {
    alignSelf: "flex-start",
    justifyContent: "center",
  },
  glyph: {
    fontVariant: ["tabular-nums", "lining-nums"],
    includeFontPadding: false,
  },
  staticGlyph: {
    includeFontPadding: false,
  },
});
