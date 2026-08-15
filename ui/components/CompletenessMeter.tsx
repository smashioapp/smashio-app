import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../lib/theme";

export type CompletenessInput = {
  hasPhoto: boolean;
  hasSuburb: boolean;
  hasTier: boolean;
  emailVerified: boolean;
  hasFirstGame: boolean;
};

const GAPS: { key: keyof CompletenessInput; label: string }[] = [
  { key: "hasPhoto", label: "Add a photo" },
  { key: "hasSuburb", label: "Add your suburb" },
  { key: "hasTier", label: "Set your skill level" },
  { key: "emailVerified", label: "Verify your email" },
  { key: "hasFirstGame", label: "Play your first game" },
];

// Airbnb's play (profile-plan.md P5): say which signal is missing and what it costs you,
// don't just render a bare percentage.
export function CompletenessMeter({ input }: { input: CompletenessInput }) {
  const done = GAPS.filter((g) => input[g.key]).length;
  const pct = Math.round((done / GAPS.length) * 100);
  if (pct === 100) return null;
  const missing = GAPS.filter((g) => !input[g.key]);

  return (
    <View className="rounded-2xl px-4 py-3.5 border gap-2.5" style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder }}>
      <View className="flex-row items-center justify-between">
        <Text className="font-body-extrabold text-[13px] uppercase tracking-wide" style={{ color: colors.textTertiary }}>
          Profile strength
        </Text>
        <Text className="font-display-bold text-[15px]" style={{ color: colors.accent }}>
          {pct}%
        </Text>
      </View>
      <View className="h-[6px] rounded-pill overflow-hidden" style={{ backgroundColor: colors.surfaceAlt }}>
        <View className="h-full rounded-pill" style={{ width: `${pct}%`, backgroundColor: colors.accent }} />
      </View>
      <View className="gap-1.5 mt-0.5">
        {missing.map((g) => (
          <View key={g.key} className="flex-row items-center gap-1.5">
            <Ionicons name="ellipse-outline" size={11} color={colors.textMuted} />
            <Text className="text-[12.5px] font-body-semibold" style={{ color: colors.textSecondary }}>
              {g.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
