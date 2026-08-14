import { View, Text, Pressable } from "react-native";
import { colors } from "../lib/theme";
import { Game, spotsLeft, levelFit } from "../lib/mockData";
import { SkillPill } from "./SkillPill";

// Compact card for the map's bottom sheet peek row — a lighter footprint than GameCard so
// the map itself stays the star (Airbnb pattern: results and map coexist).
export function MapCarouselCard({
  game,
  viewerTierOrdinal,
  cardWidth,
  onPress,
}: {
  game: Game;
  viewerTierOrdinal: number | null;
  cardWidth: number;
  onPress: () => void;
}) {
  const open = spotsLeft(game);
  const full = open === 0;
  return (
    <Pressable
      onPress={onPress}
      className="rounded-2xl p-3.5 border"
      style={{ width: cardWidth, backgroundColor: colors.card, borderColor: colors.cardBorder }}
    >
      <View className="flex-row justify-between items-start">
        <View className="flex-1 pr-2">
          <Text className="font-display-bold text-[15px]" style={{ color: colors.text }} numberOfLines={1}>
            {game.venue}
          </Text>
          <Text className="text-[12.5px] mt-0.5" style={{ color: colors.textTertiary }} numberOfLines={1}>
            {game.date} · {game.time} · {game.suburb}
          </Text>
        </View>
        <SkillPill skill={game.skill} fit={levelFit(viewerTierOrdinal, game.skillTierOrdinal)} />
      </View>
      <View className="flex-row justify-between items-center mt-2">
        <Text className="font-display-bold text-[15px]" style={{ color: colors.accent }}>
          ${game.cost}
          <Text className="font-body-semibold text-[12px]" style={{ color: colors.textTertiary }}>
            {" "}
            / player
          </Text>
        </Text>
        <Text className="text-[12.5px] font-body-bold" style={{ color: full ? colors.danger : colors.textMuted }}>
          {full ? "Full" : `${open} spot${open === 1 ? "" : "s"} left`}
        </Text>
      </View>
    </Pressable>
  );
}
