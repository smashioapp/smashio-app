import { View, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, avatarColor, gamesPlayedTier, reliabilityLabel } from "../lib/theme";
import { Avatar } from "./Avatar";
import type { PlayerCard } from "../lib/queries/profile";

export type ShareCardFormat = "square" | "story";

// Designed export object, not a screenshot (design/23bc2cae "shareable card") — fixed
// composition that always fits the frame regardless of where the profile screen was scrolled.
export function ShareCard({
  card,
  photoUrl,
  weekStreak,
  achievementsEarned,
  achievementsTotal,
  format,
}: {
  card: PlayerCard;
  photoUrl: string | null;
  weekStreak: number;
  achievementsEarned: number;
  achievementsTotal: number;
  format: ShareCardFormat;
}) {
  const tier = gamesPlayedTier(card.gamesPlayed);
  const primaryTier = card.sports.find((s) => s.sportSlug === "badminton")?.tierLabel ?? card.sports[0]?.tierLabel ?? null;
  const subtitle = [primaryTier, `${reliabilityLabel(card.reliabilityScore)} reliability`].filter(Boolean).join(" · ");

  if (format === "story") {
    return (
      <View style={{ width: 320, height: 569, backgroundColor: colors.base, overflow: "hidden" }}>
        <LinearGradient colors={["#141610", colors.base]} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
        <Text
          className="font-body-extrabold text-[12px] uppercase"
          style={{ color: colors.textSecondary, letterSpacing: 2, textAlign: "center", marginTop: 30 }}
        >
          SMASHIO
        </Text>
        <View className="items-center" style={{ marginTop: 50 }}>
          <Avatar name={card.displayName} color={avatarColor(card.id)} size={80} photoUri={photoUrl} />
          <Text className="font-display-bold text-[22px] mt-3.5" style={{ color: colors.text }}>
            {card.displayName}
          </Text>
          <View className="rounded-pill px-3.5 py-1.5 mt-2" style={{ backgroundColor: tier.color }}>
            <Text className="font-body-extrabold text-[11px] uppercase" style={{ color: colors.base }}>
              {tier.id}
            </Text>
          </View>
        </View>
        <View className="items-center" style={{ marginTop: 60 }}>
          <Text className="font-display-bold" style={{ fontSize: 64, color: colors.accent, lineHeight: 64 }}>
            {card.gamesPlayed}
          </Text>
          <Text className="text-[13px] mt-1" style={{ color: colors.textSecondary }}>
            games played{weekStreak >= 2 ? ` · 🔥 ${weekStreak}-week streak` : ""}
          </Text>
        </View>
        <View className="flex-row justify-center" style={{ gap: 8, position: "absolute", bottom: 36, left: 0, right: 0 }}>
          <Chip label={`${achievementsEarned}/${achievementsTotal} badges`} />
          <Chip label={`${reliabilityLabel(card.reliabilityScore)} reliability`} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ width: 360, height: 360, backgroundColor: colors.base, overflow: "hidden" }}>
      <LinearGradient colors={["#151810", colors.base]} style={{ position: "absolute", inset: 0 } as never} />
      <View style={{ position: "absolute", top: 24, left: 24 }}>
        <Text className="font-body-extrabold text-[11px] uppercase" style={{ color: colors.textSecondary, letterSpacing: 1.5 }}>
          SMASHIO
        </Text>
      </View>
      <View className="rounded-pill" style={{ position: "absolute", top: 20, right: 24, backgroundColor: tier.color + "22", paddingHorizontal: 9, paddingVertical: 4 }}>
        <Text className="font-body-extrabold text-[10.5px] uppercase" style={{ color: tier.color }}>
          {tier.id}
        </Text>
      </View>
      <View className="flex-row items-center" style={{ position: "absolute", top: 70, left: 24, right: 24, gap: 14 }}>
        <Avatar name={card.displayName} color={avatarColor(card.id)} size={56} photoUri={photoUrl} />
        <View style={{ flex: 1 }}>
          <Text className="font-display-bold text-[19px]" style={{ color: colors.text }} numberOfLines={1}>
            {card.displayName}
          </Text>
          <Text className="text-[11.5px] mt-0.5" style={{ color: colors.textSecondary }} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </View>
      <View className="flex-row" style={{ position: "absolute", top: 170, left: 24, right: 24, gap: 20 }}>
        <View>
          <Text className="font-display-bold text-[34px]" style={{ color: colors.accent }}>
            {card.gamesPlayed}
          </Text>
          <Text className="text-[10.5px]" style={{ color: colors.textSecondary }}>
            games played
          </Text>
        </View>
        <View>
          <Text className="font-display-bold text-[34px]" style={{ color: colors.text }}>
            {achievementsEarned}/{achievementsTotal}
          </Text>
          <Text className="text-[10.5px]" style={{ color: colors.textSecondary }}>
            trophy case
          </Text>
        </View>
      </View>
      <View className="flex-row" style={{ position: "absolute", bottom: 24, left: 24, right: 24, gap: 6 }}>
        {weekStreak >= 2 && <Chip label={`🔥 ${weekStreak}-wk streak`} />}
        <Chip label={`${achievementsEarned}/${achievementsTotal} badges`} />
      </View>
    </View>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <View className="rounded-pill" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: 9, paddingVertical: 4 }}>
      <Text className="font-body-bold text-[10px]" style={{ color: colors.textDim }}>
        {label}
      </Text>
    </View>
  );
}
