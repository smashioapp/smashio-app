import { useEffect } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import Svg, { Defs, Ellipse, G, Line, LinearGradient, RadialGradient, Stop } from "react-native-svg";
import { colors } from "../lib/theme";

// NOTE: nativewind only interops components registered via cssInterop (see app/_layout.tsx).
// Animated.View and every react-native-svg element are NOT registered — className on them is
// silently dropped (that's what turned the old splash "glow" into a flat square). Style objects only.

const HORIZON = 0.60; // fraction of screen height where the court converges
const ROWS = 7;
const LANES = 5;

/**
 * Ambient backdrop: two soft radial blooms breathing behind a badminton court
 * drawn in one-point perspective, its lines fading out toward the horizon.
 *
 * `size` confines it to a fixed box (Game Detail's 300px hero, docs/v2-design-plan.md §4.3)
 * instead of the full window — onboarding's full-bleed use is the default.
 */
export function CourtBackdrop({ reduceMotion = false, size }: { reduceMotion?: boolean; size?: { width: number; height: number } }) {
  const windowSize = useWindowDimensions();
  const w = size?.width ?? windowSize.width;
  const h = size?.height ?? windowSize.height;

  const breathe = useSharedValue(reduceMotion ? 1 : 0);
  const courtIn = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      breathe.value = 1;
      courtIn.value = 1;
      return;
    }
    courtIn.value = withDelay(260, withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }));
    breathe.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 3800, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 3800, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [reduceMotion]);

  const bloomStyle = useAnimatedStyle(() => ({
    opacity: 0.72 + breathe.value * 0.28,
    transform: [{ scale: 1 + breathe.value * 0.06 }],
  }));

  const courtStyle = useAnimatedStyle(() => ({ opacity: courtIn.value }));

  const horizonY = h * HORIZON;
  const vpX = w / 2;

  // Lanes converge on the vanishing point; near-edge spread is wider than the screen
  // so the court reads as running underneath the viewer.
  const lanes = Array.from({ length: LANES }, (_, i) => {
    const t = i / (LANES - 1) - 0.5; // -0.5 .. 0.5
    return { x1: vpX + t * w * 0.30, x2: vpX + t * w * 2.6 };
  });

  // Rows bunch up near the horizon and stretch out toward the viewer.
  const rows = Array.from({ length: ROWS }, (_, i) => {
    const t = (i + 1) / ROWS;
    const y = horizonY + (h - horizonY) * Math.pow(t, 2.1);
    return { y, opacity: 0.06 + t * 0.16 };
  });

  // Guards the NaN <line> attrs a 0×0 measurement produces for one frame before layout settles.
  if (w === 0 || h === 0) return null;

  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, bloomStyle]} pointerEvents="none">
        <Svg width={w} height={h}>
          <Defs>
            <RadialGradient id="bloomVolt" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={colors.accent} stopOpacity="0.30" />
              <Stop offset="0.45" stopColor={colors.accent} stopOpacity="0.09" />
              <Stop offset="1" stopColor={colors.accent} stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="bloomCool" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={colors.intermediate} stopOpacity="0.16" />
              <Stop offset="0.5" stopColor={colors.intermediate} stopOpacity="0.05" />
              <Stop offset="1" stopColor={colors.intermediate} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Ellipse cx={w * 0.88} cy={h * 0.06} rx={w * 0.85} ry={h * 0.30} fill="url(#bloomVolt)" />
          <Ellipse cx={w * 0.02} cy={h * 0.70} rx={w * 0.80} ry={h * 0.32} fill="url(#bloomCool)" />
        </Svg>
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, courtStyle]} pointerEvents="none">
        <Svg width={w} height={h}>
          <Defs>
            {/* Lane strokes fade to nothing as they approach the vanishing point. */}
            <LinearGradient id="laneFade" x1="0" y1={horizonY} x2="0" y2={h} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={colors.accent} stopOpacity="0" />
              <Stop offset="0.35" stopColor={colors.accent} stopOpacity="0.10" />
              <Stop offset="1" stopColor={colors.accent} stopOpacity="0.22" />
            </LinearGradient>
          </Defs>

          <G>
            {lanes.map((l, i) => (
              <Line key={`lane-${i}`} x1={l.x1} y1={horizonY} x2={l.x2} y2={h} stroke="url(#laneFade)" strokeWidth={1} />
            ))}
            {rows.map((r, i) => {
              // Row width tracks the lane spread at that depth so the grid stays square in perspective.
              const k = (r.y - horizonY) / (h - horizonY);
              const half = (w * 0.15 + (w * 1.3 - w * 0.15) * k);
              return (
                <Line
                  key={`row-${i}`}
                  x1={vpX - half}
                  y1={r.y}
                  x2={vpX + half}
                  y2={r.y}
                  stroke={colors.accent}
                  strokeOpacity={r.opacity}
                  strokeWidth={1}
                />
              );
            })}
            {/* Net: the one bright horizontal, sitting just above the horizon. */}
            <Line
              x1={vpX - w * 0.19}
              y1={horizonY + 2}
              x2={vpX + w * 0.19}
              y2={horizonY + 2}
              stroke={colors.accent}
              strokeOpacity={0.30}
              strokeWidth={1.5}
            />
          </G>
        </Svg>
      </Animated.View>
    </>
  );
}
