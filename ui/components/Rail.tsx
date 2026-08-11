import { View, Text, ScrollView } from "react-native";
import { router } from "expo-router";
import { colors } from "../lib/theme";
import { GameCard } from "./GameCard";
import type { Game } from "../lib/mockData";

// A named shelf of games with a stated reason ("Closing soon", "At your level, near you") —
// each game also still appears in the day-grouped list below; the shelf is a curated view onto
// the same data, not a separate pool.
export function Rail({ title, games, viewerTierOrdinal }: { title: string; games: Game[]; viewerTierOrdinal: number | null }) {
  if (games.length === 0) return null;

  return (
    <View className="gap-2.5 mb-1">
      <Text className="font-display-bold text-[15px] px-5" style={{ color: colors.text }}>
        {title}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}>
        {games.map((g, i) => (
          <View key={g.id} style={{ width: 272 }}>
            <GameCard game={g} index={i} onPress={() => router.push(`/game/${g.id}`)} viewerTierOrdinal={viewerTierOrdinal} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
