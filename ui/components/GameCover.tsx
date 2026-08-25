import { View, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, LAYOUT } from "../lib/theme";
import { coverFor } from "../lib/covers";

const SIZES = {
  thumb: { width: 46, height: 46, radius: 10 },
  card: { width: "100%" as const, height: 120, radius: LAYOUT.RADIUS.card },
  hero: { width: "100%" as const, height: 300, radius: 0 },
  rail: { width: "100%" as const, height: 56, radius: LAYOUT.RADIUS.rail },
  // Fills whatever the parent measures out — caller supplies the box (Hero's card padding,
  // UpcomingGameCard's dynamic width), GameCover just paints edge-to-edge inside it.
  fill: { width: "100%" as const, height: "100%" as const, radius: 0 },
};

/**
 * Renders a game's cover pattern, or nothing (transparent box) when cover_key is 'auto'/unset —
 * callers fall back to their own placeholder (game/[id].tsx keeps CourtBackdrop for that case).
 */
export function GameCover({
  coverKey,
  size = "card",
  scrim = false,
}: {
  coverKey?: string | null;
  size?: keyof typeof SIZES;
  scrim?: boolean;
}) {
  const cover = coverFor(coverKey);
  const { width, height, radius } = SIZES[size];

  if (!cover) return null;

  return (
    <View style={{ width, height, borderRadius: radius, overflow: "hidden", backgroundColor: colors.surfaceAlt }}>
      <Image source={cover.src} resizeMode="cover" style={{ width: "100%", height: "100%" }} />
      {scrim && (
        <LinearGradient
          colors={["transparent", "rgba(10,10,11,0.95)"]}
          style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "75%" }}
          pointerEvents="none"
        />
      )}
    </View>
  );
}
