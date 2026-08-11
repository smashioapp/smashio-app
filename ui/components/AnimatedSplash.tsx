import { useEffect } from "react";
import { Image, Text } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { colors } from "../lib/theme";
import { haptics } from "../lib/haptics";

const LOGO = require("../assets/splash-icon.png");

// Bridges the native splash (same logo + bg, configured in app.config.js) into the
// app: a smash-in reveal instead of an instant cut, so the launch reads as one
// continuous motion rather than native-splash-then-blank-flash-then-content.
export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const scale = useSharedValue(1.5);
  const rotate = useSharedValue(-10);
  const translateY = useSharedValue(-30);
  const logoOpacity = useSharedValue(0);
  const wordmarkOpacity = useSharedValue(0);
  const wordmarkY = useSharedValue(8);
  const overlayOpacity = useSharedValue(1);

  useEffect(() => {
    logoOpacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) });
    scale.value = withSequence(
      withTiming(0.92, { duration: 380, easing: Easing.out(Easing.cubic) }),
      withSpring(1, { damping: 9, stiffness: 140 }, (finished) => {
        if (finished) runOnJS(haptics.tap)();
      })
    );
    rotate.value = withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) });
    translateY.value = withSequence(
      withTiming(0, { duration: 380, easing: Easing.out(Easing.cubic) }),
      withTiming(-4, { duration: 140 }),
      withTiming(0, { duration: 140 })
    );

    wordmarkOpacity.value = withDelay(420, withTiming(1, { duration: 260 }));
    wordmarkY.value = withDelay(420, withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) }));

    overlayOpacity.value = withDelay(
      1000,
      withTiming(0, { duration: 320 }, (finished) => {
        if (finished) runOnJS(onFinish)();
      })
    );
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }, { translateY: translateY.value }],
  }));

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmarkOpacity.value,
    transform: [{ translateY: wordmarkY.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));

  return (
    <Animated.View
      style={[
        { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.base, alignItems: "center", justifyContent: "center" },
        overlayStyle,
      ]}
    >
      <Animated.Image source={LOGO} resizeMode="contain" style={[{ width: 132, height: 132 }, logoStyle]} />
      <Animated.View style={[{ marginTop: 14 }, wordmarkStyle]}>
        <Text className="font-display text-[22px] tracking-[4px]" style={{ color: colors.text }}>
          SMASHIO
        </Text>
      </Animated.View>
    </Animated.View>
  );
}
