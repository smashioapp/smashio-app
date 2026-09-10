import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, useWindowDimensions } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import Svg, { Circle } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  type SharedValue,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { colors } from "../lib/theme";
import { haptics } from "../lib/haptics";
import { useReduceMotion } from "../lib/motion";
import { useAppReady } from "../lib/appReady";
import { ANIMALS } from "../lib/avatars";
import { NAV, tabBarBottom } from "../lib/nav";

const LOGO = require("../assets/splash-icon.png");

// Must match expo-splash-screen's `imageWidth` in app.config.js. The overlay opens with the mark
// at exactly the size and position the native splash left it at — same 144px, same dead centre —
// so the handoff is one continuous image and the mark never resizes or jumps.
const SIZE = 144;

const RING_COUNT = 10;
const DISC = 52;

// The fixed brand beat: the lobby fills. Nothing here waits on data — it runs while fonts, auth
// and the profile fetch are still in flight underneath. Everything after it is governed by
// readiness, not by a clock.
const HOLD = 90; // dead hold, so the native -> JS handoff reads as one continuous image
const HALO_IN = 360;
const DISC_FIRST = 170; // first avatar lands
const DISC_STAGGER = 32;
const DISC_IN = 340;
const RING_DONE = DISC_FIRST + DISC_STAGGER * (RING_COUNT - 1) + DISC_IN; // 798ms
const WORD_AT = 470;
const WORD_IN = 320;
const TAG_AT = 630;
const TAG_IN = 240;
const BEAT = 900;

// Past the beat the ring idles until useAppReady() says yes. The idle is a slow ripple around
// the ring rather than a spinner: a wait that still reads as "finding players". The hard ceiling
// means a dead network can never hold the app hostage — past it we drop the user into the app
// and let the screens show skeletons.
const RIPPLE_PERIOD = 1800;
const GATE_CEILING = 1200; // max additional wait after the beat

const EXIT_MORPH = 380; // mark flies into the Discover tab icon
const EXIT_FADE = 280; // plain dissolve, when there is no tab bar to fly to
const EXIT_CLEAR = 160; // ring, wordmark and tagline get out of the mark's way first

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

/**
 * Ring radius. Wide enough to clear the 144px mark, narrow enough that no avatar clips the
 * screen edge on a 320pt phone — which is why this is derived rather than a constant.
 */
function ringRadius(width: number): number {
  const maxFit = width / 2 - DISC / 2 - 16;
  return Math.max(SIZE / 2 + DISC / 2 + 26, Math.min(132, maxFit));
}

export function AnimatedSplash({
  onFinish,
  fontsLoaded,
}: {
  onFinish: () => void;
  fontsLoaded: boolean;
}) {
  const { ready, target } = useAppReady();
  const reduceMotion = useReduceMotion();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const halo = useSharedValue(0);
  const ring = useSharedValue(0); // 0 -> 1 drives the whole cascade; each disc reads its own slice
  const ripple = useSharedValue(-1); // -1 = off; loops 0 -> 1 only while gated
  const word = useSharedValue(0);
  const tag = useSharedValue(0);
  const exit = useSharedValue(0);
  const clear = useSharedValue(0); // ring + text get out of the way before the mark flies
  const overlayOpacity = useSharedValue(1);

  const [beatDone, setBeatDone] = useState(false);
  const [gateExpired, setGateExpired] = useState(false);
  const exiting = useRef(false);

  // Ten of the 28, reshuffled every launch. The roster is the point — a different ten each cold
  // start is the whole reason this reads as players rather than decoration.
  const cast = useMemo(() => {
    const pool = [...ANIMALS];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, RING_COUNT);
  }, []);

  const R = ringRadius(width);

  // The native splash stays up until our overlay has actually painted a frame in the identical
  // pose. Hiding it off a font-loaded effect instead (as this used to) meant the two were serial:
  // native splash, *then* the animation, stacking their durations on a cold start.
  const onOverlayLayout = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (reduceMotion === null) return; // still asking the OS; hold the static pose
    if (reduceMotion) {
      // No cascade, no ripple. The full lobby is simply already there, and it waits.
      halo.value = 1;
      ring.value = 1;
      tag.value = 1;
      setBeatDone(true);
      const ceiling = setTimeout(() => setGateExpired(true), GATE_CEILING);
      return () => clearTimeout(ceiling);
    }

    halo.value = withDelay(HOLD, withTiming(1, { duration: HALO_IN, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }));
    // One driver for all ten avatars: `ring` runs 0 -> 1 across the cascade's full span and each
    // disc maps its own window out of it. Ten separate timers would drift against each other.
    ring.value = withDelay(DISC_FIRST, withTiming(1, { duration: RING_DONE - DISC_FIRST, easing: Easing.linear }));
    tag.value = withDelay(TAG_AT, withTiming(1, { duration: TAG_IN, easing: Easing.out(Easing.quad) }));

    // One tap as the ring closes. The lobby is full — that is the only moment worth feeling.
    const tap = setTimeout(() => haptics.tap(), RING_DONE);
    const beat = setTimeout(() => setBeatDone(true), BEAT);
    const ceiling = setTimeout(() => setGateExpired(true), BEAT + GATE_CEILING);

    return () => {
      clearTimeout(tap);
      clearTimeout(beat);
      clearTimeout(ceiling);
    };
  }, [reduceMotion]);

  // The wordmark waits on Space Grotesk rather than on the clock. Rendering it in the system
  // fallback and swapping mid-animation is worse than showing it a beat late.
  useEffect(() => {
    if (!fontsLoaded) return;
    if (reduceMotion) {
      word.value = 1;
      return;
    }
    word.value = withDelay(WORD_AT, withTiming(1, { duration: WORD_IN, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }));
  }, [fontsLoaded, reduceMotion]);

  // The gate. The ripple only exists so a slow cold start reads as working rather than frozen;
  // on a warm-ish launch `ready` is already true when the beat lands and this never spins up.
  useEffect(() => {
    if (!beatDone || ready || reduceMotion) return;
    ripple.value = 0;
    ripple.value = withRepeat(withTiming(1, { duration: RIPPLE_PERIOD, easing: Easing.linear }), -1, false);
    return () => {
      cancelAnimation(ripple);
      ripple.value = -1;
    };
  }, [beatDone, ready, reduceMotion]);

  useEffect(() => {
    if (!beatDone || exiting.current) return;
    if (!ready && !gateExpired) return;
    exiting.current = true;
    cancelAnimation(ripple);
    ripple.value = -1;

    const done = (finished?: boolean) => {
      "worklet";
      if (finished) runOnJS(onFinish)();
    };

    // Morph only makes sense when there is a tab bar underneath to land on. Onboarding has none,
    // and reduce-motion asked for no travel at all, so both take a plain dissolve.
    if (!reduceMotion && target === "tabs") {
      // Ring and text clear first so the mark flies across an empty screen, not through a crowd.
      clear.value = withTiming(1, { duration: EXIT_CLEAR, easing: Easing.in(Easing.quad) });
      exit.value = withDelay(
        EXIT_CLEAR - 60,
        withTiming(1, { duration: EXIT_MORPH, easing: Easing.bezier(0.5, 0, 0.2, 1) })
      );
      // Overlay clears slightly ahead of the mark's arrival so Discover is already visible
      // behind it for the last stretch of the flight.
      overlayOpacity.value = withDelay(EXIT_CLEAR - 60, withTiming(0, { duration: EXIT_MORPH - 60 }));
      // The real Discover glyph cross-fades in underneath over the final 60ms.
      setTimeout(() => onFinish(), EXIT_CLEAR - 60 + EXIT_MORPH);
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
        { scale: 1 - (1 - endScale) * e },
      ],
    };
  });

  const haloStyle = useAnimatedStyle(() => ({
    opacity: halo.value * 0.9 * (1 - clear.value),
    transform: [{ scale: 0.82 + halo.value * 0.18 }],
  }));

  const wordStyle = useAnimatedStyle(() => ({
    opacity: word.value * (1 - clear.value),
    transform: [{ translateY: (1 - word.value) * 10 }, { scale: 0.96 + word.value * 0.04 }],
  }));

  const tagStyle = useAnimatedStyle(() => ({
    opacity: tag.value * 0.9 * (1 - clear.value),
  }));

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));

  const wordTop = height / 2 + R + DISC / 2 + 34;

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
      {/* The court ring the lobby gathers on. Dashed rather than solid so it reads as a marking
          on a surface, not as a progress track — the old splash's dotted arc was the thing that
          made a slow launch look like a spinner. */}
      <Animated.View style={[{ position: "absolute" }, haloStyle]} pointerEvents="none">
        <Svg width={R * 2 + 4} height={R * 2 + 4}>
          <Circle
            cx={R + 2}
            cy={R + 2}
            r={R}
            stroke={colors.accent}
            strokeOpacity={0.22}
            strokeWidth={1}
            strokeDasharray="3 8"
            fill="none"
          />
        </Svg>
      </Animated.View>

      {cast.map((animal, i) => (
        <RingDisc
          key={animal.key}
          src={animal.src}
          index={i}
          radius={R}
          ring={ring}
          ripple={ripple}
          clear={clear}
        />
      ))}

      <Animated.Image
        source={LOGO}
        resizeMode="contain"
        style={[{ position: "absolute", width: SIZE, height: SIZE }, logoStyle]}
      />

      <Animated.View style={[{ position: "absolute", top: wordTop, alignItems: "center" }, wordStyle]}>
        <Text
          style={{
            fontFamily: "SpaceGrotesk_700Bold",
            color: colors.text,
            fontSize: 27,
            letterSpacing: 5,
          }}
        >
          SMASHIO
        </Text>
      </Animated.View>

      <Animated.View style={[{ position: "absolute", top: wordTop + 42, alignItems: "center" }, tagStyle]}>
        <Text style={{ fontFamily: "Manrope_500Medium", color: colors.textSecondary, fontSize: 13 }}>
          Find your game
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * One avatar on the ring. Its own component because `useAnimatedStyle` cannot be called inside
 * a map callback, and because each disc needs its own slice of the shared cascade and ripple
 * drivers rather than its own timers.
 */
function RingDisc({
  src,
  index,
  radius,
  ring,
  ripple,
  clear,
}: {
  src: number;
  index: number;
  radius: number;
  ring: SharedValue<number>;
  ripple: SharedValue<number>;
  clear: SharedValue<number>;
}) {
  // Exact even spacing, first avatar at twelve o'clock. An earlier pass jittered these by a few
  // degrees to look hand-placed and it just read as sloppy.
  const angle = (-90 + index * (360 / RING_COUNT)) * (Math.PI / 180);
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius;

  // This disc's window inside the cascade, as a 0..1 slice of `ring`.
  const span = RING_DONE - DISC_FIRST;
  const start = (index * DISC_STAGGER) / span;
  const end = start + DISC_IN / span;

  const style = useAnimatedStyle(() => {
    const t = Math.max(0, Math.min(1, (ring.value - start) / (end - start)));
    // Overshoot on the way in: back-out, so each avatar arrives with a small pop.
    const c = 1.7;
    const p = t - 1;
    const eased = t >= 1 ? 1 : 1 + (c + 1) * p * p * p + c * p * p;

    // Idle ripple: a bump travelling around the ring, one lap per period. Off (-1) unless the
    // gate is actually holding us.
    let bump = 0;
    if (ripple.value >= 0) {
      let phase = ripple.value - index / RING_COUNT;
      phase = phase - Math.floor(phase);
      // A short raised-cosine over the first fifth of the lap, flat for the rest.
      if (phase < 0.2) bump = (1 - Math.cos((phase / 0.2) * 2 * Math.PI)) / 2;
    }

    return {
      opacity: t * (1 - clear.value),
      transform: [
        { translateX: x },
        { translateY: y },
        { scale: (0.4 + eased * 0.6 + bump * 0.07) * (1 - clear.value * 0.2) },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: DISC,
          height: DISC,
          borderRadius: DISC / 2,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: colors.cardBorder,
          backgroundColor: colors.surface,
        },
        style,
      ]}
    >
      <Animated.Image source={src} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
    </Animated.View>
  );
}
