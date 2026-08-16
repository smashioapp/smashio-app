import { View, Text, Pressable, ScrollView } from "react-native";
import { router } from "expo-router";
import { colors, LAYOUT, tierColor } from "../lib/theme";
import { formatTimeShort } from "../lib/format";
import { haptics } from "../lib/haptics";
import type { Game } from "../lib/mockData";

export const RAIL_CARD_WIDTH = 132;

// The v2 "Rail" weight (docs/v2-design-plan.md §3.3) — scan-only. A rail used to be a shelf of
// full GameCards, which meant three cards of identical weight sat side by side and none of them
// won (rule 2). At this size a rail is a glance, and the anchor above it stays the anchor.
export function RailCard({ game, onPress, dimmed = false }: { game: Game; onPress: () => void; dimmed?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        haptics.tick();
        onPress();
      }}
      style={{
        width: RAIL_CARD_WIDTH,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        borderRadius: LAYOUT.RADIUS.rail,
        padding: 12,
        opacity: dimmed ? 0.6 : 1,
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tierColor(game.skill) }} />
      <Text numberOfLines={2} className="font-body-bold text-[12.5px] mt-1.5" style={{ color: colors.text }}>
        {game.venue}
      </Text>
      <Text numberOfLines={1} className="text-[11px] mt-0.5" style={{ color: colors.textSecondary }}>
        {formatTimeShort(game.startsAt)}
        {game.distance ? ` · ${game.distance}` : ""}
      </Text>
    </Pressable>
  );
}

// A named shelf with a stated reason ("Closing soon", "At your level, near you"). Same curation
// logic Discover always had — only the card weight changed.
export function Rail({ title, games, onSeeAll }: { title: string; games: Game[]; onSeeAll?: () => void }) {
  if (games.length === 0) return null;

  return (
    <View className="mb-4">
      <View
        className="flex-row items-baseline justify-between"
        style={{ paddingHorizontal: LAYOUT.SCREEN_PAD, paddingBottom: 10 }}
      >
        <Text className="font-body-bold text-[13px]" style={{ color: colors.textDim }}>
          {title}
        </Text>
        {onSeeAll && (
          <Pressable onPress={onSeeAll} hitSlop={8}>
            <Text className="text-[12px]" style={{ color: colors.textTertiary }}>
              See all
            </Text>
          </Pressable>
        )}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingHorizontal: LAYOUT.SCREEN_PAD }}
      >
        {games.map((g) => (
          // The design dims its third rail card — that's a mockup's way of showing the row runs
          // off the edge, not a state. Real cards are dimmed only when the game is actually full.
          <RailCard key={g.id} game={g} dimmed={g.joinedCount >= g.maxPlayers} onPress={() => router.push(`/game/${g.id}`)} />
        ))}
      </ScrollView>
    </View>
  );
}
