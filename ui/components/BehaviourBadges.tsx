import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../lib/theme";
import { RATING_TAGS } from "../lib/queries/ratings";

// Renders only tags with at least one vote — an empty badge shelf says nothing yet, so it
// says nothing at all rather than a row of zeros (profile-plan.md P2).
export function BehaviourBadges({ counts }: { counts: Record<string, number> }) {
  const earned = RATING_TAGS.filter((t) => (counts[t.id] ?? 0) > 0);
  if (earned.length === 0) return null;
  return (
    <View className="flex-row flex-wrap gap-2">
      {earned.map((t) => (
        <View
          key={t.id}
          className="flex-row items-center gap-1.5 rounded-pill px-3 py-1.5 border"
          style={{ backgroundColor: colors.surfaceAlt, borderColor: colors.cardBorder }}
        >
          <Ionicons name={t.icon} size={13} color={colors.accent} />
          <Text className="font-body-bold text-[12.5px]" style={{ color: colors.textDim }}>
            {t.label}
            <Text style={{ color: colors.textMuted }}> · {counts[t.id]}</Text>
          </Text>
        </View>
      ))}
    </View>
  );
}
