import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../lib/theme";
import { ACHIEVEMENTS, type AchievementContext } from "../lib/achievements";

// Medallions, not flat 50%-opacity chips (design/23bc2cae "trophy case"): earned achievements
// get a lime ring and fill, locked ones a dashed outline — and whichever's closest to unlocking
// leads as a "next up" banner so the case stays alive even near-complete.
export function TrophyCase({ ctx }: { ctx: AchievementContext }) {
  const withStatus = ACHIEVEMENTS.map((a) => ({ ...a, unlocked: a.check(ctx) }));
  const earnedCount = withStatus.filter((a) => a.unlocked).length;
  const nextUp = withStatus.find((a) => !a.unlocked);

  return (
    <View className="gap-4">
      {nextUp && (
        <View className="rounded-2xl border px-3.5 py-3 flex-row items-center justify-between" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
          <View className="flex-1 pr-3">
            <Text className="font-body-bold text-[12.5px]" style={{ color: colors.text }}>
              Next up: {nextUp.label}
            </Text>
            <Text className="text-[11px] mt-0.5" style={{ color: colors.textSecondary }}>
              {earnedCount} of {ACHIEVEMENTS.length} earned
            </Text>
          </View>
          <Text className="font-display-bold text-[15px]" style={{ color: colors.accent }}>
            {earnedCount}/{ACHIEVEMENTS.length}
          </Text>
        </View>
      )}

      <View className="flex-row flex-wrap" style={{ gap: 14 }}>
        {withStatus.map((a) => (
          <View key={a.id} style={{ width: "22%" }} className="items-center">
            <View
              className="rounded-full items-center justify-center"
              style={{
                width: 56,
                height: 56,
                backgroundColor: a.unlocked ? "rgba(214,255,63,0.1)" : colors.surface,
                borderWidth: a.unlocked ? 2 : 1.5,
                borderColor: a.unlocked ? colors.accent : colors.cardBorder,
                borderStyle: a.unlocked ? "solid" : "dashed",
              }}
            >
              <Ionicons name={a.icon} size={20} color={a.unlocked ? colors.accent : colors.textMuted} />
            </View>
            <Text
              className="text-[10px] font-body-semibold text-center mt-1.5"
              numberOfLines={2}
              style={{ color: a.unlocked ? colors.textSecondary : colors.textMuted }}
            >
              {a.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
