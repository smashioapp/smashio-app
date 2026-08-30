import { View, Text, Pressable } from "react-native";
import { colors, tierColor } from "../lib/theme";
import { formatTimeShort } from "../lib/format";
import { Game, spotsLeft } from "../lib/mockData";
import { haptics } from "../lib/haptics";

// Venue-anchored map sheet card (docs/v2-design-plan.md §4.2) — the peek carousel groups by
// venue, not by game: one card is "Riverside Badminton Centre · 1.8km" with a court row per
// game there, instead of one card per game repeating the venue name.
export function MapCarouselCard({
  venueGames,
  cardWidth,
  onSelectGame,
}: {
  venueGames: Game[];
  cardWidth: number;
  onSelectGame: (gameId: string) => void;
}) {
  const first = venueGames[0];
  return (
    <View
      className="rounded-2xl p-3.5 border"
      style={{ width: cardWidth, backgroundColor: colors.card, borderColor: colors.cardBorder, gap: 10 }}
    >
      <Text numberOfLines={1} className="font-display-bold text-[15px]" style={{ color: colors.text }}>
        {[first.venue, first.distance].filter(Boolean).join(" · ")}
      </Text>
      <View style={{ gap: 8 }}>
        {venueGames.map((g) => {
          const open = spotsLeft(g);
          return (
            <Pressable
              key={g.id}
              onPress={() => {
                haptics.tick();
                onSelectGame(g.id);
              }}
              className="flex-row items-center gap-2"
            >
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tierColor(g.skill) }} />
              <View className="flex-1 min-w-0">
                <Text numberOfLines={1} className="font-body-semibold text-[13px]" style={{ color: colors.text }}>
                  {[g.courts, formatTimeShort(g.startsAt)].filter(Boolean).join(" · ")}
                </Text>
                <Text numberOfLines={1} className="text-[11.5px] mt-0.5" style={{ color: colors.textSecondary }}>
                  {g.skill} · {open === 0 ? "Full" : `${g.joinedCount + 1}/${g.maxPlayers} joined`}
                </Text>
              </View>
              <Text className="font-display-bold text-[12.5px]" style={{ color: colors.textDim }}>
                ${g.cost}/pl
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
