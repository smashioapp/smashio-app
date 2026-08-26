import { useEffect } from "react";
import { Image } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useReduceMotion } from "../lib/motion";
import type { AnimalKey } from "../lib/avatars";

type RigLayers = { body: number; head: number; armL: number; armR: number; eyesShut: number };

// Only quokka has been through the T2 hand-split (docs/smashimals-plan.md §5.4) so far.
const RIGS: Partial<Record<AnimalKey, RigLayers>> = {
  quokka: {
    body: require("../assets/smashimals/quokka/body.png"),
    head: require("../assets/smashimals/quokka/head.png"),
    armL: require("../assets/smashimals/quokka/arm-l.png"),
    armR: require("../assets/smashimals/quokka/arm-r.png"),
    eyesShut: require("../assets/smashimals/quokka/eyes-shut.png"),
  },
};

export function hasRig(key: AnimalKey | null | undefined): key is AnimalKey {
  return !!key && key in RIGS;
}

// Every rig layer shares this canvas (ui/scripts/smashimals/rig-split-quokka.mjs).
const LAYER_ASPECT = 586 / 1014;

// Idle sway + blink only — wave/celebrate were prototyped and dropped (broken cut-seam on
// arm rotation, see memory). Timings mirror the web prototype's CSS keyframes 1:1.
export function SmashimalRig({ animal, height }: { animal: AnimalKey; height: number }) {
  const layers = RIGS[animal];
  const reduceMotion = useReduceMotion();
  const sway = useSharedValue(0);
  const blink = useSharedValue(0);

  useEffect(() => {
    if (!layers || reduceMotion) return;
    sway.value = withRepeat(
      withSequence(
        withTiming(1.5, { duration: 1600, easing: Easing.inOut(Easing.cubic) }),
        withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.cubic) })
      ),
      -1
    );
    return () => cancelAnimation(sway);
  }, [layers, reduceMotion, sway]);

  useEffect(() => {
    if (!layers || reduceMotion) return;
    let alive = true;
    let timeout: ReturnType<typeof setTimeout>;
    const scheduleBlink = () => {
      const delay = 4000 + Math.random() * 3000;
      timeout = setTimeout(() => {
        if (!alive) return;
        blink.value = withSequence(withTiming(1, { duration: 90 }), withTiming(0, { duration: 90 }));
        scheduleBlink();
      }, delay);
    };
    scheduleBlink();
    return () => {
      alive = false;
      clearTimeout(timeout);
    };
  }, [layers, reduceMotion, blink]);

  const swayStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${sway.value}deg` }] }));
  const eyesStyle = useAnimatedStyle(() => ({ opacity: blink.value }));

  if (!layers) return null;
  const width = height * LAYER_ASPECT;
  const layerStyle = { position: "absolute" as const, width, height };

  return (
    <Animated.View style={[{ width, height }, swayStyle]}>
      <Image source={layers.armL} style={layerStyle} />
      <Image source={layers.body} style={layerStyle} />
      <Image source={layers.head} style={layerStyle} />
      <Image source={layers.armR} style={layerStyle} />
      <Animated.Image source={layers.eyesShut} style={[layerStyle, eyesStyle]} />
    </Animated.View>
  );
}
