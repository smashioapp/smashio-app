import { useCallback, useEffect, useRef, useState } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { colors } from "../lib/theme";
import { haptics } from "../lib/haptics";
import { useReduceMotion } from "../lib/motion";
import { useAppReady } from "../lib/appReady";
import { NAV, tabBarBottom } from "../lib/nav";

const LOGO = require("../assets/splash-icon.png");
const SHUTTLE = require("../assets/props/shuttlecock.png");

// Must match expo-splash-screen's `imageWidth` in app.config.js: the animation starts with the
// logo at exactly the size and position the native splash left it at, so there is no jump on the
// handoff — the mark simply starts the rally.
const SIZE = 144;
const SHUTTLE_SIZE = 46;

// The fixed brand beat. Nothing here waits on data — it is the deliberate cost of having a
// launch moment at all, and it runs while fonts, auth and the profile fetch are still in flight
// underneath. Everything after it is governed by readiness, not by a clock.
const HOLD = 120; // dead hold, so the native -> JS handoff reads as one continuous image
const RALLY = 440; // shuttle travels in
const CONTACT = HOLD + RALLY; // 560ms — impact, haptic, spin starts
const SPIN = 480; // one full turn, lands on the pose it started on
const BEAT = CONTACT + SPIN; // 1040ms

// Past the beat the mark idles until useAppReady() says yes. Two safety valves: a thin progress
// arc once the wait stops looking like animation, and a hard ceiling so a dead network can never
// hold the app hostage — past it we drop the user into the app and let the screens show skeletons.
const SLOW_AT = 2200; // total elapsed before the progress arc fades in
const GATE_CEILING = 1800; // max additional wait after the beat

const EXIT_MORPH = 380; // mark flies into the Discover tab icon
const EXIT_FADE = 280; // plain dissolve, when there is no tab bar to fly to

/**
 * Where the Discover glyph will be once the tab bar mounts, so the mark can land on it instead
 * of just fading out. Mirrors TabBar's row: 24px horizontal padding, `space-around` over five
 * slots (four tabs + the host FAB's reserved gap), Discover first.
 */
function discoverTabCenter(width: number, height: number, insetBottom: number) {
  const inner = width - 48;
  const used = NAV.ITEM_WIDTH * 4 + NAV.FAB_SIZE;
  const free = Math.max(0, inner - used);
  // space-around gives each of the 5 slots free/5, half of it as a leading margin.
  const x = 24 + free / 10 + NAV.ITEM_WIDTH / 2;
  const bottomPad = tabBarBottom(insetBottom);
  const y = height - NAV.BAR_HEIGHT + (NAV.BAR_HEIGHT - bottomPad) / 2;
  return { x, y };
}

export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const { ready, target } = useAppReady();
  const reduceMotion = useReduceMotion();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const turn = useSharedValue(0); // the one full 360 the contact knocks out of the mark
  const idle = useSharedValue(0); // slow continuous rotation while gated
  const crouch = useSharedValue(0); // anticipation dip just before contact
  const wobble = useSharedValue(0);
  const bloom = useSharedValue(0);
  const rally = useSharedValue(0); // shuttle flying in
  const deflect = useSharedValue(0); // shuttle leaving after the hit
  const arc = useSharedValue(0);
  const exit = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);
  const tagline = useSharedValue(0);

  const [beatDone, setBeatDone] = useState(false);
  const [gateExpired, setGateExpired] = useState(false);
  const exiting = useRef(false);

  // The native splash stays up until our overlay has actually painted a frame in the identical
  // pose. Hiding it off a font-loaded effect instead (as this used to) meant the two were serial:
  // native splash, *then* the animation, stacking their durations on a cold start.
  const onOverlayLayout = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (reduceMotion === null) return; // still asking the OS; hold the static pose
    if (reduceMotion) {
      // No rally, no spin, no morph. The mark just sits in the handoff pose until ready.
      setBeatDone(true);
      const ceiling = setTimeout(() => setGateExpired(true), GATE_CEILING);
      return () => clearTimeout(ceiling);
    }

    rally.value = withDelay(HOLD, withTiming(1, { duration: RALLY, easing: Easing.bezier(0.4, 0, 0.7, 1) }));
    crouch.value = withDelay(
      CONTACT - 120,
      withSequence(
        withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 90, easing: Easing.out(Easing.quad) })
      )
    );

    // Contact. The spin is recoil off the hit, not decoration — it starts here, not on mount.
    turn.value = withDelay(CONTACT, withTiming(1, { duration: SPIN, easing: Easing.bezier(0.16, 0.8, 0.24, 1) }));
    deflect.value = withDelay(CONTACT, withTiming(1, { duration: 240, easing: Easing.out(Easing.quad) }));
    bloom.value = withDelay(
      CONTACT,
      withSequence(
        withTiming(1, { duration: 150, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 380, easing: Easing.in(Easing.quad) })
      )
    );
    wobble.value = withDelay(
      CONTACT,
      withSequence(
        withTiming(1, { duration: 1 }, (finished) => {
          if (finished) runOnJS(haptics.tap)();
        }),
        withSpring(0, { damping: 7, stiffness: 170, mass: 0.6 })
      )
    );
    tagline.value = withDelay(200, withTiming(1, { duration: 300 }));

    const beat = setTimeout(() => setBeatDone(true), BEAT);
    const ceiling = setTimeout(() => setGateExpired(true), BEAT + GATE_CEILING);
    const slow = setTimeout(() => {
      arc.value = withTiming(1, { duration: 260 });
    }, SLOW_AT);

    return () => {
      clearTimeout(beat);
      clearTimeout(ceiling);
      clearTimeout(slow);
    };
  }, [reduceMotion]);

  // The gate. Idle only exists so a slow cold start reads as working rather than frozen; on a
  // warm-ish launch `ready` is already true when the beat lands and this never spins up.
  useEffect(() => {
    if (!beatDone || ready || reduceMotion) return;
    idle.value = withRepeat(withTiming(1, { duration: 8000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(idle);
  }, [beatDone, ready, reduceMotion]);

  useEffect(() => {
    if (!beatDone || exiting.current) return;
    if (!ready && !gateExpired) return;
    exiting.current = true;
    cancelAnimation(idle);

    const done = (finished?: boolean) => {
      "worklet";
      if (finished) runOnJS(onFinish)();
    };

    // Morph only makes sense when there is a tab bar underneath to land on. Onboarding has none,
    // and reduce-motion asked for no travel at all, so both take a plain dissolve.
    if (!reduceMotion && target === "tabs") {
      exit.value = withTiming(1, { duration: EXIT_MORPH, easing: Easing.bezier(0.5, 0, 0.2, 1) });
      arc.value = withTiming(0, { duration: 140 });
      // Overlay clears slightly ahead of the mark's arrival so Discover is already visible
      // behind it for the last stretch of the flight.
      overlayOpacity.value = withTiming(0, { duration: EXIT_MORPH - 60 });
      // The real Discover glyph cross-fades in underneath over the final 60ms.
      setTimeout(() => onFinish(), EXIT_MORPH);
      return;
    }

    overlayOpacity.value = withTiming(0, { duration: EXIT_FADE }, done);
  }, [beatDone, ready, gateExpired, target, reduceMotion]);

  const tabTarget = discoverTabCenter(width, height, insets.bottom);
  const dx = tabTarget.x - width / 2;
  const dy = tabTarget.y - height / 2;

  const logoStyle = useAnimatedStyle(() => {
    const e = exit.value;
    // NAV.ICON (24) is the Discover glyph's box; the mark has a little internal padding, so 26
    // reads as the same optical size once it lands.
    const endScale = 26 / SIZE;
    return {
      opacity: 1 - e * e * 0.15,
      transform: [
        { translateX: dx * e },
        { translateY: dy * e },
        // The mark is a radial rosette with no cork and no leading edge, so it spins about its
        // own centre. Twelve-fold symmetry also means the full turn has no seam: it lands on the
        // pose it started on, which is what lets the idle loop pick up without a visible join.
        { rotate: `${turn.value * 360 + idle.value * 360 + wobble.value * 11}deg` },
        { scale: (1 - 0.03 * crouch.value + wobble.value * 0.06) * (1 - (1 - endScale) * e) },
      ],
    };
  });

  const shuttleStyle = useAnimatedStyle(() => {
    const r = rally.value;
    const d = deflect.value;
    // Off-screen top-right, down onto the mark, then knocked out through bottom-left.
    const x = interpolate(r, [0, 1], [width * 0.62, 0]) + interpolate(d, [0, 1], [0, -width * 0.55]);
    const y = interpolate(r, [0, 1], [-height * 0.42, 0]) + interpolate(d, [0, 1], [0, height * 0.5]);
    return {
      opacity: (r > 0 ? 1 : 0) * (1 - d),
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${interpolate(r, [0, 1], [-35, 12]) + d * 55}deg` },
        { scale: 0.8 + r * 0.2 },
      ],
    };
  });

  const bloomStyle = useAnimatedStyle(() => ({
    opacity: bloom.value * (1 - exit.value),
    transform: [{ scale: 0.7 + bloom.value * 0.55 }],
  }));

  const arcStyle = useAnimatedStyle(() => ({
    opacity: arc.value,
    transform: [{ rotate: `${idle.value * 720}deg` }],
  }));

  const taglineStyle = useAnimatedStyle(() => ({ opacity: tagline.value * (1 - exit.value) }));

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));

  return (
    <Animated.View
      onLayout={onOverlayLayout}
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

      {/* Only drawn once the wait has stopped reading as animation. A dotted ring is as much
          progress as we can honestly show — none of the pending work reports a percentage. */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            width: SIZE + 44,
            height: SIZE + 44,
            borderRadius: (SIZE + 44) / 2,
            borderWidth: 1.5,
            borderColor: "rgba(214,255,63,0.28)",
            borderTopColor: colors.accent,
          },
          arcStyle,
        ]}
      />

      <Animated.Image
        source={SHUTTLE}
        resizeMode="contain"
        style={[{ position: "absolute", width: SHUTTLE_SIZE, height: SHUTTLE_SIZE }, shuttleStyle]}
      />

      <Animated.Image
        source={LOGO}
        resizeMode="contain"
        style={[{ position: "absolute", width: SIZE, height: SIZE }, logoStyle]}
      />

      <Animated.View style={[{ position: "absolute", bottom: 64, alignItems: "center" }, taglineStyle]}>
        <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "500" }}>
          Made with ❤️ in Australia
        </Text>
      </Animated.View>
    </Animated.View>
  );
}
