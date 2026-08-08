import { View } from "react-native";
import { colors } from "../lib/theme";

export function StepProgress({ step, count }: { step: number; count: number }) {
  return (
    <View className="flex-row gap-1.5 px-6 py-4">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} className="flex-1 h-1 rounded-full" style={{ backgroundColor: i <= step ? colors.accent : "rgba(255,255,255,0.1)" }} />
      ))}
    </View>
  );
}
