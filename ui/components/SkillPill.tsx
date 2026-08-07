import { View, Text, ViewStyle } from "react-native";
import { tierColor } from "../lib/theme";

export function SkillPill({ skill, style }: { skill: string; style?: ViewStyle }) {
  const color = tierColor(skill);
  return (
    <View className="rounded-pill px-2.5 py-1" style={[{ backgroundColor: color + "22" }, style]}>
      <Text className="font-body-extrabold text-[10px] uppercase tracking-wide" style={{ color }}>
        {skill}
      </Text>
    </View>
  );
}
