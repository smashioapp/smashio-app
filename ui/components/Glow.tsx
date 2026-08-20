import { useId } from "react";
import { View, type ViewStyle } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { colors } from "../lib/theme";

// RN has no radial-gradient, so a "glow" written as `backgroundColor + low opacity` on a
// rounded-full View is a flat disc with a hard edge — that's the halo that reads as a solid
// olive circle behind empty-state art instead of a bloom. Real falloff needs SVG.
//
// Same lesson as CourtBackdrop.tsx: react-native-svg elements are NOT registered with
// cssInterop, so className is silently dropped here. Style objects only.

// Rough gaussian falloff — a plain 1→0 two-stop ramp still shows a visible edge because the
// eye tracks the constant-rate change; the extra stops keep it dying off gradually.
const FALLOFF = [
  { offset: "0", o: 1 },
  { offset: "0.25", o: 0.72 },
  { offset: "0.45", o: 0.42 },
  { offset: "0.65", o: 0.18 },
  { offset: "0.82", o: 0.05 },
  { offset: "1", o: 0 },
] as const;

/**
 * Soft radial bloom. Renders a `size`×`size` box (or `size`×`height`) whose gradient peaks at
 * `intensity` in the centre and reaches fully transparent at the edge, so it can be dropped
 * behind artwork without a visible boundary.
 *
 * Defaults to absolutely positioned + non-interactive, which is how every caller uses it —
 * pass `absolute={false}` for an in-flow bloom.
 */
export function Glow({
  size,
  color = colors.accent,
  intensity = 0.3,
  absolute = true,
  style,
}: {
  size: number;
  color?: string;
  intensity?: number;
  absolute?: boolean;
  style?: ViewStyle;
}) {
  // Gradient ids share one namespace across the mounted tree, so two Glows with different
  // colours would otherwise resolve to whichever mounted first. useId keeps them distinct;
  // strip its `:` delimiters since they're not safe inside url(#...).
  const gradientId = `glow-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <View
      pointerEvents="none"
      style={[absolute && { position: "absolute" }, { width: size, height: size }, style]}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={gradientId} cx="50%" cy="50%" r="50%">
            {FALLOFF.map((s) => (
              <Stop key={s.offset} offset={s.offset} stopColor={color} stopOpacity={s.o * intensity} />
            ))}
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={size} height={size} fill={`url(#${gradientId})`} />
      </Svg>
    </View>
  );
}
