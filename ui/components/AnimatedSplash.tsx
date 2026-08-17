import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  type SharedValue,
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
const SIZE = 180;

// One vertical loop, traversed once: (0,0) -> right -> over the top -> left -> back to (0,0).
// Peak is -1.8 * R * 0.9 up and +/- 1.15 * R across, which stays on screen on the narrowest phone.
const R = 112;
const TAU = Math.PI * 2;

// Motion echoes: the same pose function sampled at a lag, which reads as motion blur without
// needing a blur pass or an SVG trail. Later ghosts lag further and sit fainter.
const GHOSTS = [0.05, 0.1, 0.155, 0.215];

function clamp(v: number, lo: number, hi: number) {
  "worklet";
  return Math.min(Math.max(v, lo), hi);
}

// The flight path. p in [0,1] walks the whole loop; rotation closes at exactly -360deg so the
// shuttle lands upright with no correction, and scale dips at the apex to sell depth.
function pose(p: number) {
  "worklet";
  const th = clamp(p, 0, 1) * TAU;
  return {
    x: Math.sin(th) * R * 1.15,
    y: -(1 - Math.cos(th)) * R * 0.9,
    rot: -th * (180 / Math.PI),
    scale: 1 - 0.4 * Math.sin(th / 2),
  };
}

export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const progress = useSharedValue(0);
  const squash = useSharedValue(0);
  const wobble = useSharedValue(0);
  const bloom = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);

  useEffect(() => {
    // 1. Load — the shuttle compresses against an unseen racket face before it leaves.
    squash.value = withSequence(
      withTiming(1, { duration: 110, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 90, easing: Easing.in(Easing.quad) })
    );

    // 2. Flight — fast off the face, then the tail flattens hard. A shuttlecock has far more drag
    // than any other projectile, so the deceleration curve is the signature of the motion.
    progress.value = withDelay(140, withTiming(1, { duration: 640, easing: Easing.bezier(0.16, 0.85, 0.2, 1) }));

    // 3. Turnover — the shuttle self-rights and rocks off the last of its spin.
    wobble.value = withDelay(
      760,
      withSequence(
        withTiming(1, { duration: 1 }, (finished) => {
          if (finished) runOnJS(haptics.tap)();
        }),
        withSpring(0, { damping: 6, stiffness: 150, mass: 0.6 })
      )
    );

    bloom.value = withDelay(
      760,
      withSequence(
        withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 420, easing: Easing.in(Easing.quad) })
      )
    );

    overlayOpacity.value = withDelay(
      1120,
      withTiming(0, { duration: 300 }, (finished) => {
        if (finished) runOnJS(onFinish)();
      })
    );
  }, []);

  const logoStyle = useAnimatedStyle(() => {
    const p = pose(progress.value);
    const s = squash.value;
    const w = wobble.value;
    return {
      transform: [
        { translateX: p.x },
        { translateY: p.y },
        { rotate: `${p.rot + w * 14}deg` },
        { scaleX: p.scale * (1 + s * 0.12 + w * 0.08) },
        { scaleY: p.scale * (1 - s * 0.14 + w * 0.08) },
      ],
    };
  });

  const bloomStyle = useAnimatedStyle(() => ({
    opacity: bloom.value,
    transform: [{ scale: 0.7 + bloom.value * 0.55 }],
  }));

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

      {GHOSTS.map((lag, i) => (
        <Ghost key={lag} lag={lag} rank={i} progress={progress} />
      ))}

      <Animated.Image
        source={LOGO}
        resizeMode="contain"
        style={[{ position: "absolute", width: SIZE, height: SIZE }, logoStyle]}
      />
    </Animated.View>
  );
}

function Ghost({
  lag,
  rank,
  progress,
}: {
  lag: number;
  rank: number;
  progress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const t = progress.value;
    const p = pose(t - lag);
    // Ramp in so the echoes don't pile up on the logo at rest, and out so nothing survives
    // the landing — the shuttle has to arrive alone.
    const alpha = 0.24 * (1 - rank / (GHOSTS.length + 1)) * clamp(t * 5, 0, 1) * (1 - clamp(t, 0, 1));
    return {
      opacity: alpha,
      transform: [
        { translateX: p.x },
        { translateY: p.y },
        { rotate: `${p.rot}deg` },
        { scale: p.scale },
      ],
    };
  });

  return (
    <Animated.Image
      source={LOGO}
      resizeMode="contain"
      style={[{ position: "absolute", width: SIZE, height: SIZE }, style]}
    />
  );
}
