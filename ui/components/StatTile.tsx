import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, LAYOUT } from "../lib/theme";
import { haptics } from "../lib/haptics";

// The Game Detail trio (docs/v2-design-plan.md §4.3): price / spots left / skill. Replaces three
// full-width blocks that each answered one question. `value` uses the display face so the number
// carries the weight (rule 6); `tone` colours it when the value itself is the signal.
export function StatTile({
  value,
  label,
  tone,
  small = false,
  onPress,
}: {
  value: string;
  label: string;
  tone?: string;
  /** Word-length values (a tier name) can't take the 22px number size. */
  small?: boolean;
  onPress?: () => void;
}) {
  const body = (
    <View
      className="flex-1 items-center"
      style={{
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        borderRadius: LAYOUT.RADIUS.tile,
        paddingVertical: 14,
        paddingHorizontal: 8,
      }}
    >
      <Text
        numberOfLines={1}
        className={small ? "font-body-extrabold text-[13px]" : "font-display-bold text-[22px]"}
        style={{ color: tone ?? colors.text }}
      >
        {value}
      </Text>
      <View className="flex-row items-center gap-1 mt-0.5">
        <Text className="text-[11px]" style={{ color: colors.textSecondary }}>
          {label}
        </Text>
        {onPress && <Ionicons name="chevron-forward" size={10} color={colors.textTertiary} />}
      </View>
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      className="flex-1"
      onPress={() => {
        haptics.tick();
        onPress();
      }}
    >
      {body}
    </Pressable>
  );
}

export function StatTileRow({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-row gap-2.5" style={{ paddingHorizontal: LAYOUT.SCREEN_PAD }}>
      {children}
    </View>
  );
}
