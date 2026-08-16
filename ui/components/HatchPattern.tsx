import Svg, { Defs, Pattern, Line, Rect } from "react-native-svg";
import { colors } from "../lib/theme";

// Shared "restricted access" texture (club/members-only venues) — design's single non-color
// signal for "can't book this", reused identically on cards, badges, and map pins so the
// meaning never depends on reading copy (venues-plan.md confidence system).
export function HatchPattern({ id = "hatch", opacity = 0.09 }: { id?: string; opacity?: number }) {
  return (
    <Svg width="100%" height="100%" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      <Defs>
        <Pattern id={id} width={12} height={12} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <Rect width={12} height={12} fill="transparent" />
          <Line x1={0} y1={0} x2={0} y2={12} stroke={colors.text} strokeOpacity={opacity} strokeWidth={6} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}
