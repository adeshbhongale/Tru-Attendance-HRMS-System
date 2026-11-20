import { Image, StyleSheet } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

const AnimatedImage = Animated.createAnimatedComponent(Image);

/**
 * Photo preview with pinch-to-zoom, pan while zoomed and double-tap zoom in / out.
 * Drop-in replacement for <Image> inside the claim photo preview modals.
 * Wrapped in its own GestureHandlerRootView because RN <Modal> renders outside the app root on Android.
 */
const ZoomableImage = ({ uri, style, resizeMode = "contain" }) => {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const width = useSharedValue(0);
  const height = useSharedValue(0);

  const clamp = (v, max) => {
    "worklet";
    return Math.min(Math.max(v, -max), max);
  };

  const reset = () => {
    "worklet";
    scale.value = withTiming(1);
    savedScale.value = 1;
    tx.value = withTiming(0);
    ty.value = withTiming(0);
    savedTx.value = 0;
    savedTy.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(savedScale.value * e.scale, MIN_SCALE * 0.8), MAX_SCALE);
    })
    .onEnd(() => {
      if (scale.value <= MIN_SCALE) {
        reset();
        return;
      }
      savedScale.value = scale.value;
      const maxX = (width.value * (scale.value - 1)) / 2;
      const maxY = (height.value * (scale.value - 1)) / 2;
      tx.value = withTiming(clamp(tx.value, maxX));
      ty.value = withTiming(clamp(ty.value, maxY));
      savedTx.value = clamp(tx.value, maxX);
      savedTy.value = clamp(ty.value, maxY);
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      if (scale.value <= 1) return;
      const maxX = (width.value * (scale.value - 1)) / 2;
      const maxY = (height.value * (scale.value - 1)) / 2;
      tx.value = clamp(savedTx.value + e.translationX, maxX);
      ty.value = clamp(savedTy.value + e.translationY, maxY);
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        reset();
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE);
        savedScale.value = DOUBLE_TAP_SCALE;
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureHandlerRootView
      style={styles.root}
      onLayout={(e) => {
        width.value = e.nativeEvent.layout.width;
        height.value = e.nativeEvent.layout.height;
      }}
    >
      <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, doubleTap)}>
        <AnimatedImage source={{ uri }} style={[style, animatedStyle]} resizeMode={resizeMode} />
      </GestureDetector>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  root: { width: "100%", height: "100%", overflow: "hidden", alignItems: "center", justifyContent: "center" },
});

export default ZoomableImage;
