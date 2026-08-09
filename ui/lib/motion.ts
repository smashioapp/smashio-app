import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { WithSpringConfig, WithTimingConfig, Easing } from "react-native-reanimated";

// Shared spring vocabulary so the whole app moves like one system.
// pop: overshoot, for hero moments (logo lands, checkmark stamps, burst triggers).
// settle: damped, no overshoot, for things arriving into place (cards, sheets).
// press: tight and fast, for press-scale feedback (0.96 scale on press-in).
export const SPRING: Record<"pop" | "settle" | "press", WithSpringConfig> = {
  pop: { damping: 7, stiffness: 260, mass: 0.9 },
  settle: { damping: 16, stiffness: 180, mass: 1 },
  press: { damping: 14, stiffness: 400, mass: 0.6 },
};

export const DURATION = {
  instant: 120,
  fast: 220,
  base: 380,
  slow: 560,
} as const;

export const EASE = {
  out: Easing.out(Easing.cubic),
  inOut: Easing.inOut(Easing.cubic),
} as const;

export function timing(duration: number, easing = EASE.out): WithTimingConfig {
  return { duration, easing };
}

// Single source of truth for "is reduce motion on" — was previously inlined per-screen.
export function useReduceMotion(): boolean | null {
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduceMotion(v))
      .catch(() => alive && setReduceMotion(false));
    return () => {
      alive = false;
    };
  }, []);

  return reduceMotion;
}
