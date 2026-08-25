import { useEffect } from "react";
import { Text, View } from "react-native";
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

// Must match expo-splash-screen's `imageWidth` in app.config.js: the animation starts with the
// logo at exactly the size and position the native splash left it at, so there is no jump on the
// handoff — the shuttle simply starts moving.
const SIZE = 144;

// A shuttlecock rotates about its cork, not its bounding box: the weight is all in the base and
// the feathers are drag. Offset from the image centre to the cork in the artwork, so the flip
// pivots where the mass actually is.
const PIVOT_X = -18;
const PIVOT_Y = 29;

export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  // One continuous 0 -> 1 turnover: feathers over the top, cork swinging down to lead.
  const turn = useSharedValue(0);
  const lift = useSharedValue(0);
  const wobble = useSharedValue(0);
  const bloom = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);
  const tagline = useSharedValue(0);

  useEffect(() => {
    // Hold on the native splash pose first, so the handoff reads as one image, then one
    // continuous turnover: feathers go over the top, cork whips back under, and drag makes
    // the last few degrees crawl. A single curve — no mid-flip seam to snap on.
    turn.value = withDelay(
      100,
      withTiming(1, { duration: 640, easing: Easing.bezier(0.3, 0.04, 0.16, 1) })
    );

    // Small rise and fall through the flip: enough to read as airborne, not as a jump.
    lift.value = withDelay(
      100,
      withSequence(
        withTiming(1, { duration: 260, easing: Easing.bezier(0.3, 0.04, 0.4, 1) }),
        withTiming(0, { duration: 380, easing: Easing.bezier(0.3, 0, 0.16, 1) })
      )
    );

    // Landing: rocks off the last of the spin.
    wobble.value = withDelay(
      740,
      withSequence(
        withTiming(1, { duration: 1 }, (finished) => {
          if (finished) runOnJS(haptics.tap)();
        }),
        withSpring(0, { damping: 7, stiffness: 170, mass: 0.6 })
      )
    );

    bloom.value = withDelay(
      740,
      withSequence(
        withTiming(1, { duration: 150, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 380, easing: Easing.in(Easing.quad) })
      )
    );

    tagline.value = withDelay(200, withTiming(1, { duration: 300 }));

    overlayOpacity.value = withDelay(
      1000,
      withTiming(0, { duration: 280 }, (finished) => {
        if (finished) runOnJS(onFinish)();
      })
    );
  }, []);

  const logoStyle = useAnimatedStyle(() => {
    const t = turn.value;
    const l = lift.value;
    const w = wobble.value;
    return {
      transform: [
        { translateY: -34 * l },
        // Pivot about the cork: shift the pivot to the origin, rotate, shift back.
        { translateX: PIVOT_X },
        { translateY: PIVOT_Y },
        { rotate: `${t * 360 + w * 11}deg` },
        { translateX: -PIVOT_X },
        { translateY: -PIVOT_Y },
        { scale: 1 - 0.1 * l + w * 0.06 },
      ],
    };
  });

  const bloomStyle = useAnimatedStyle(() => ({
    opacity: bloom.value,
    transform: [{ scale: 0.7 + bloom.value * 0.55 }],
  }));

  const taglineStyle = useAnimatedStyle(() => ({ opacity: tagline.value }));

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.base,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        },
        overlayStyle,
      ]}
    >
      {/* Impact bloom: stacked lime discs stand in for a radial gradient, which neither
          expo-linear-gradient nor a plain View can draw. */}
      <Animated.View style={[{ position: "absolute", pointerEvents: "none" }, bloomStyle]}>
        <View style={{ position: "absolute", left: -170, top: -170, width: 340, height: 340, borderRadius: 170, backgroundColor: "rgba(214,255,63,0.05)" }} />
        <View style={{ position: "absolute", left: -115, top: -115, width: 230, height: 230, borderRadius: 115, backgroundColor: "rgba(214,255,63,0.07)" }} />
        <View style={{ position: "absolute", left: -66, top: -66, width: 132, height: 132, borderRadius: 66, backgroundColor: "rgba(214,255,63,0.09)" }} />
      </Animated.View>

      <Animated.Image
        source={LOGO}
        resizeMode="contain"
        style={[{ position: "absolute", width: SIZE, height: SIZE }, logoStyle]}
      />

      <Animated.View
        style={[
          { position: "absolute", bottom: 64, alignItems: "center" },
          taglineStyle,
        ]}
      >
        <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "500" }}>
          Made with ❤️ in Australia
        </Text>
      </Animated.View>
    </Animated.View>
  );
}
