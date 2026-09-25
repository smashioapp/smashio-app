import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../lib/theme";

export type AlertState = "idle" | "saving" | "saved";

// The retention primitive (D5): turns a failed search into a scheduled return visit by watching
// the current level + radius and pushing when a matching game is posted. Deliberately its own
// row style (bell, no count) — it isn't a ladder rung since it has nothing to count yet. Shared
// by Discover's empty states and the venue page's "no games here yet" (short-a-player-ux §4.2).
export function AlertMeRow({ state, onPress, label = "Alert me when a game matches" }: { state: AlertState; onPress: () => void; label?: string }) {
  if (state === "saved") {
    return (
      <View
        className="flex-row items-center justify-center gap-2 rounded-xl px-4 py-3.5 border"
        style={{ borderColor: "rgba(53,214,166,0.3)", backgroundColor: "rgba(53,214,166,0.08)" }}
      >
        <Ionicons name="checkmark-circle" size={16} color={colors.intermediate} />
        <Text className="font-body-bold text-[14px]" style={{ color: colors.intermediate }}>
          Alert set, we'll ping you
        </Text>
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      disabled={state === "saving"}
      className="flex-row items-center justify-center gap-2 rounded-xl px-4 py-3.5 border"
      style={{ borderColor: colors.cardBorder, backgroundColor: colors.surfaceAlt, opacity: state === "saving" ? 0.6 : 1 }}
    >
      <Ionicons name="notifications-outline" size={16} color={colors.textSecondary} />
      <Text className="font-body-bold text-[14px]" style={{ color: colors.textSecondary }}>
        {state === "saving" ? "Saving…" : label}
      </Text>
    </Pressable>
  );
}
