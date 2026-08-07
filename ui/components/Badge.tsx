import { View, Text } from "react-native";
import { badgeTone } from "../lib/theme";

export function Badge({ state, label }: { state: "verified" | "pending" | "cancelled"; label: string }) {
  const tone = badgeTone(state);
  return (
    <View className="rounded-pill px-2.5 py-1.5" style={{ backgroundColor: tone.bg }}>
      <Text className="font-body-extrabold text-[9.5px] tracking-wide uppercase" style={{ color: tone.fg }}>
        {label}
      </Text>
    </View>
  );
}
