import { View, Text, ViewStyle } from "react-native";
import { tierColor } from "../lib/theme";
import type { LevelFit } from "../lib/mockData";

const FIT_LABEL: Record<LevelFit, string> = {
  match: "Your level",
  "one-above": "One above you",
  above: "Above your level",
  below: "Below your level",
};

// Bare skill label when `fit` is null/omitted (no verdict to make — viewer has no tier set, or
// this is a context like my-games where judging fit against yourself is meaningless).
export function SkillPill({ skill, fit, style }: { skill: string; fit?: LevelFit | null; style?: ViewStyle }) {
  const color = tierColor(skill);
  return (
    <View className="rounded-pill px-2.5 py-1" style={[{ backgroundColor: color + "22" }, style]}>
      <Text className="font-body-extrabold text-[12px] uppercase tracking-wide" style={{ color }}>
        {fit ? FIT_LABEL[fit] : skill}
      </Text>
    </View>
  );
}
