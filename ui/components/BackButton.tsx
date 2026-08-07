import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../lib/theme";

export function BackButton({ onPress, dark = false }: { onPress: () => void; dark?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      className="w-9 h-9 rounded-full items-center justify-center"
      style={{ backgroundColor: dark ? "rgba(0,0,0,0.4)" : colors.surfaceAlt }}
    >
      <Ionicons name="chevron-back" size={18} color={dark ? "#fff" : colors.text} />
    </Pressable>
  );
}
