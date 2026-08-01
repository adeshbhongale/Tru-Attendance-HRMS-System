import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Text, View } from 'react-native';

/**
 * MarqueeText — horizontally scrolling ticker text.
 *
 * Props:
 *   text        (string)  — the text to scroll
 *   className   (string)  — NativeWind className for the Text element
 *   speedPerPx  (number)  — ms of scroll duration per pixel of distance (default 20)
 */

// A deliberately oversized width so the measuring/visible Text node is
// NEVER bound by any inherited "at most" constraint from ancestors
// (including the device screen width itself). This is what actually lets
// long, multi-task strings render and measure at their true full length.
const MEASURE_WIDTH = Dimensions.get('window').width * 25;

const MarqueeText = ({ text, className, speedPerPx = 20 }) => {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const [containerWidth, setContainerWidth] = useState(250);
  const [textWidth, setTextWidth] = useState(0);

  useEffect(() => {
    if (!text || !textWidth) return;
    const startPos = containerWidth;
    const endPos = -textWidth;
    const distance = startPos - endPos;
    const duration = Math.max(8000, distance * speedPerPx);

    animatedValue.setValue(startPos);
    const animation = Animated.loop(
      Animated.timing(animatedValue, {
        toValue: endPos,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    animation.start();

    return () => animation.stop();
  }, [text, textWidth, containerWidth, animatedValue, speedPerPx]);

  return (
    <View
      style={{ overflow: 'hidden', flex: 1, height: 18, justifyContent: 'center' }}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      {/*
        position: 'absolute' takes this out of normal flex flow so the pill's
        flex:1/overflow:hidden parent can't shrink it. That alone wasn't
        enough though: without an explicit width, Yoga still applies an
        "at most" constraint inherited from further up the tree (ultimately
        the screen width), so long strings were still getting silently
        truncated with an ellipsis before we ever measured/animated their
        real width.

        Fix: give the Text an explicit oversized width (MEASURE_WIDTH) so it
        is never up against that inherited ceiling — an explicit width
        always wins over an inherited "at most" constraint. Then read the
        TRUE rendered width from onTextLayout (the actual glyph width of the
        line), not onLayout (which would just report our artificial
        MEASURE_WIDTH box).
      */}
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transform: [{ translateX: animatedValue }],
        }}
      >
        <Text
          className={className}
          numberOfLines={1}
          style={{ width: MEASURE_WIDTH }}
          onTextLayout={(e) => {
            const line = e.nativeEvent.lines && e.nativeEvent.lines[0];
            if (line && line.width) setTextWidth(line.width);
          }}
        >
          {text}
        </Text>
      </Animated.View>
    </View>
  );
};

export default MarqueeText;