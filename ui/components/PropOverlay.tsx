import { View, Text, Image } from "react-native";
import { colors } from "../lib/theme";

// Prop-overlay trick (docs/smashimals-plan.md §2): every bust is torso+paws at the bottom
// disc edge, so a bottom-anchored prop composited in front reads as "held" for all 28 animals
// from a single asset per prop. `require()` calls must be static literals for Metro.
export type PropKey = "banner" | "trophy" | "racquet" | "shuttlecock" | "medal" | "speech-bubble";

const PROP_SRC: Record<PropKey, number> = {
  banner: require("../assets/props/banner.png"),
  trophy: require("../assets/props/trophy.png"),
  racquet: require("../assets/props/racquet.png"),
  shuttlecock: require("../assets/props/shuttlecock.png"),
  medal: require("../assets/props/medal.png"),
  "speech-bubble": require("../assets/props/speech-bubble.png"),
};

// Natural pixel dims of the processed assets (ui/scripts/props/process.mjs output) — locks
// aspect ratio so each prop scales true regardless of bust size.
const PROP_ASPECT: Record<PropKey, number> = {
  banner: 444 / 333,
  trophy: 461 / 338,
  racquet: 189 / 441,
  shuttlecock: 298 / 353,
  medal: 211 / 370,
  "speech-bubble": 378 / 337,
};

// Prop width as a fraction of the bust size, and how far its bottom edge drops below the bust's
// bottom edge, tuned per prop so each reads as held rather than floating.
const PROP_LAYOUT: Record<PropKey, { widthFactor: number; bottomOffsetFactor: number }> = {
  banner: { widthFactor: 0.9, bottomOffsetFactor: 0.32 },
  trophy: { widthFactor: 0.55, bottomOffsetFactor: 0.22 },
  racquet: { widthFactor: 0.4, bottomOffsetFactor: 0.3 },
  shuttlecock: { widthFactor: 0.45, bottomOffsetFactor: 0.25 },
  medal: { widthFactor: 0.4, bottomOffsetFactor: 0.15 },
  "speech-bubble": { widthFactor: 0.75, bottomOffsetFactor: 0.35 },
};

// Only banner and speech-bubble ship with a blank face — the rest have no room for text.
const LABEL_SLOT: Partial<Record<PropKey, { top: `${number}%`; left: `${number}%`; right: `${number}%` }>> = {
  banner: { top: "38%", left: "12%", right: "12%" },
  "speech-bubble": { top: "26%", left: "14%", right: "14%" },
};

export function PropOverlay({
  animalSrc,
  prop,
  size = 140,
  label,
}: {
  animalSrc: number;
  prop: PropKey;
  size?: number;
  label?: string;
}) {
  const layout = PROP_LAYOUT[prop];
  const propWidth = size * layout.widthFactor;
  const propHeight = propWidth / PROP_ASPECT[prop];
  const labelSlot = LABEL_SLOT[prop];

  return (
    <View style={{ width: size, height: size + propHeight * layout.bottomOffsetFactor }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.surfaceAlt,
          overflow: "hidden",
        }}
      >
        <Image source={animalSrc} style={{ width: size, height: size }} />
      </View>
      <View
        style={{
          position: "absolute",
          width: propWidth,
          height: propHeight,
          left: (size - propWidth) / 2,
          top: size - propHeight * (1 - layout.bottomOffsetFactor),
        }}
      >
        <Image source={PROP_SRC[prop]} style={{ width: propWidth, height: propHeight }} resizeMode="contain" />
        {label && labelSlot ? (
          <View style={{ position: "absolute", top: labelSlot.top, left: labelSlot.left, right: labelSlot.right, alignItems: "center", justifyContent: "center" }}>
            <Text
              numberOfLines={2}
              style={{ color: colors.accent, fontSize: propWidth * 0.11, fontWeight: "800", textAlign: "center" }}
            >
              {label}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
