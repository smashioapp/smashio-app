import { Pressable, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradients } from "../lib/theme";
import { haptics } from "../lib/haptics";

export function Chip({
  label,
  active,
  onPress,
  size = "md",
}: {
  label: string;
  active: boolean;
  onPress?: () => void;
  size?: "sm" | "md";
}) {
  const pad = size === "sm" ? "px-3.5 py-2" : "px-4 py-2.5";
  const textSize = size === "sm" ? "text-[13px]" : "text-[14px]";
  const handlePress = onPress
    ? () => {
        haptics.tick();
        onPress();
      }
    : undefined;

  if (active) {
    return (
      <Pressable onPress={handlePress}>
        <LinearGradient
          colors={gradients.accent}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className={`rounded-pill ${pad}`}
        >
          <Text className={`font-body-bold ${textSize}`} style={{ color: colors.base }}>
            {label}
          </Text>
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      className={`rounded-pill ${pad} border`}
      style={{ backgroundColor: colors.surfaceAlt, borderColor: colors.cardBorder }}
    >
      <Text className={`font-body-semibold ${textSize}`} style={{ color: colors.textDim }}>
        {label}
      </Text>
    </Pressable>
  );
}
