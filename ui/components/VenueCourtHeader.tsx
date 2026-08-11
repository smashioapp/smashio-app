import { View } from "react-native";
import Svg, { Defs, Line, LinearGradient, Rect, Stop } from "react-native-svg";
import { colors } from "../lib/theme";

const HUES = [colors.accent, colors.beginner, colors.intermediate, colors.advanced, colors.pro];

// Deterministic hash so the same venue always draws the same tint — cards are visually
// distinguishable at a glance without needing real venue photos.
function hueForVenue(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return HUES[Math.abs(hash) % HUES.length];
}

const HEIGHT = 46;

export function VenueCourtHeader({ venueKey, width }: { venueKey: string; width: number }) {
  const hue = hueForVenue(venueKey);
  const gradId = `vch-${Math.abs(venueKey.length)}`;
  const laneCount = 4;

  return (
    <View style={{ width, height: HEIGHT, borderRadius: 14, overflow: "hidden" }}>
      <Svg width={width} height={HEIGHT}>
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={hue} stopOpacity="0.22" />
            <Stop offset="1" stopColor={hue} stopOpacity="0.06" />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={HEIGHT} fill={`url(#${gradId})`} />
        {Array.from({ length: laneCount }, (_, i) => {
          const x = ((i + 1) / (laneCount + 1)) * width;
          return <Line key={i} x1={x} y1={4} x2={x} y2={HEIGHT - 4} stroke={hue} strokeOpacity={0.3} strokeWidth={1} />;
        })}
        <Line x1={0} y1={HEIGHT / 2} x2={width} y2={HEIGHT / 2} stroke={hue} strokeOpacity={0.4} strokeWidth={1.5} />
      </Svg>
    </View>
  );
}
