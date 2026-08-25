import { useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../../lib/store";
import { colors, gradients, LAYOUT } from "../../lib/theme";
import { useTabBarSpace } from "../../lib/nav";
import { useMyPastGames } from "../../lib/queries/games";
import { useMyGamesRoster } from "../../lib/queries/gamePlayers";
import { useMyRatedGameIds } from "../../lib/queries/ratings";
import { useProfileStreak } from "../../lib/queries/profile";
import { useSession } from "../../lib/session";
import { monthLabel } from "../../lib/format";
import { nextRebookSlot } from "../../lib/schedule";
import { Screen } from "../../components/Screen";
import { Button } from "../../components/Button";
import { BackButton } from "../../components/BackButton";
import { EmptyState } from "../../components/EmptyState";
import { GameCardSkeletonList } from "../../components/Skeleton";
import { RefreshableList } from "../../components/RefreshableList";
import type { Game } from "../../lib/mockData";

type PastRow = { kind: "month"; id: string; label: string } | { kind: "game"; id: string; game: Game };

// The `12 past games ›` route (docs/v2-design-plan.md §4.4) — carries the old My Games "Past"
// tab wholesale (backlog B13): history header (streak/most-played/regulars), month grouping,
// rate-players, rebook. Straight move, nothing dropped — the agenda screen is upcoming-only now.
export default function PastGames() {
  const tabBarSpace = useTabBarSpace();
  const pastQuery = useMyPastGames();
  const pastGames = pastQuery.data ?? [];
  const pastGameIds = useMemo(() => pastGames.map((g) => g.id), [pastGames]);
  const pastRosterQuery = useMyGamesRoster(pastGameIds);
  const ratedGameIdsQuery = useMyRatedGameIds(pastGameIds);

  const { session } = useSession();
  const userId = session?.user.id;
  const streakQuery = useProfileStreak(userId);

  const historyStats = useMemo(() => {
    if (pastGames.length === 0) return null;
    const venueCounts = new Map<string, number>();
    for (const g of pastGames) venueCounts.set(g.venue, (venueCounts.get(g.venue) ?? 0) + 1);
    const topVenue = [...venueCounts.entries()].sort((a, b) => b[1] - a[1])[0];

    const teammateCounts = new Map<string, { name: string; count: number }>();
    for (const players of pastRosterQuery.data?.values() ?? []) {
      for (const p of players) {
        if (p.id === userId) continue;
        const entry = teammateCounts.get(p.id) ?? { name: p.name, count: 0 };
        entry.count += 1;
        teammateCounts.set(p.id, entry);
      }
    }
    const topRegular = [...teammateCounts.values()].sort((a, b) => b.count - a.count)[0];

    return {
      venue: topVenue ? { name: topVenue[0], count: topVenue[1] } : null,
      regular: topRegular && topRegular.count >= 2 ? topRegular : null,
    };
  }, [pastGames, pastRosterQuery.data, userId]);

  const pastRows: PastRow[] = useMemo(() => {
    const rows: PastRow[] = [];
    let lastLabel: string | null = null;
    for (const game of pastGames) {
      const label = monthLabel(game.startsAt);
      if (label !== lastLabel) {
        rows.push({ kind: "month", id: `month-${label}`, label });
        lastLabel = label;
      }
      rows.push({ kind: "game", id: game.id, game });
    }
    return rows;
  }, [pastGames]);

  const handleRebook = (game: Game) => {
    if (game.venueId) {
      useAppStore.getState().setRebookSeed({
        venueId: game.venueId,
        venueName: game.venue,
        venueSuburb: game.suburb,
        venueAddress: game.venueAddress ?? "",
        skill: game.skill,
        maxPlayers: game.maxPlayers,
        courtsBooked: game.courtsBooked,
        durationHours: game.durationHours,
        cost: game.cost,
        startsAt: nextRebookSlot(new Date(game.startsAt)),
      });
    }
    router.push("/wizard");
  };

  return (
    <Screen>
      <View className="flex-row items-center gap-3" style={{ paddingHorizontal: LAYOUT.SCREEN_PAD, paddingTop: 8, paddingBottom: 4 }}>
        <BackButton onPress={() => router.back()} />
        <Text className="font-display text-[20px]" style={{ color: colors.text }}>
          Past games
        </Text>
      </View>

      {pastQuery.isLoading ? (
        <GameCardSkeletonList />
      ) : (
        <RefreshableList
          data={pastRows}
          keyExtractor={(r: PastRow) => r.id}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: tabBarSpace }}
          refreshing={pastQuery.isRefetching}
          onRefresh={() => pastQuery.refetch()}
          ListHeaderComponent={
            historyStats ? <PastHistoryHeader gamesPlayed={pastGames.length} stats={historyStats} streak={streakQuery.data ?? 0} /> : null
          }
          ListEmptyComponent={
            pastQuery.isError ? (
              <View className="px-5">
                <EmptyState
                  title="Couldn't load your games"
                  subtitle="Check your connection and give it another go."
                  ctaLabel="Retry"
                  onCta={() => pastQuery.refetch()}
                />
              </View>
            ) : (
              <View className="px-5">
                <EmptyState
                  title="Your rally history starts here"
                  subtitle="Play your first match and it'll show up right here, ratings, streaks, all of it."
                  ctaLabel="Find a game"
                  onCta={() => router.push("/(tabs)/discover")}
                />
              </View>
            )
          }
          renderItem={({ item }: { item: PastRow }) => {
            if (item.kind === "month") {
              return (
                <Text
                  className="font-body-extrabold text-[12.5px] uppercase tracking-wide px-5 pt-2 pb-2.5"
                  style={{ color: colors.textTertiary }}
                >
                  {item.label}
                </Text>
              );
            }
            const game = item.game;
            const teammates = (pastRosterQuery.data?.get(game.id) ?? []).filter((p) => p.id !== userId);
            // The host holds a slot but has no game_players row, so they never appeared in this
            // count — and they are rateable, twice over (post-game-plan.md D1/D6). Add them for
            // everyone except the host themselves.
            const rateableCount = teammates.length + (game.organizerId === userId ? 0 : 1);
            const rated = ratedGameIdsQuery.data?.has(game.id) ?? false;
            return (
              <View className="px-5 pb-3">
                <LinearGradient colors={gradients.card} className="rounded-[18px] p-4 border gap-2.5" style={{ borderColor: colors.cardBorder }}>
                  <Text className="font-display-bold text-[16.5px]" style={{ color: colors.text }}>
                    {game.venue}
                  </Text>
                  <Text className="text-[14px]" style={{ color: colors.textTertiary }}>
                    {game.date} · {game.time}
                  </Text>
                  <View className="flex-row gap-2">
                    {rated ? (
                      <View
                        testID={`mygames-past-rated-${game.id}`}
                        className="rounded-pill px-4 py-2 border-[1.5px] flex-row items-center gap-1.5"
                        style={{ borderColor: "rgba(255,255,255,0.1)" }}
                      >
                        <Ionicons name="checkmark-circle" size={14} color={colors.intermediate} />
                        <Text className="font-body-bold text-[13.5px]" style={{ color: colors.textDim }}>
                          Rated
                        </Text>
                      </View>
                    ) : (
                      <Button
                        testID={`mygames-past-rate-${game.id}`}
                        label={rateableCount > 0 ? `Rate ${rateableCount} ${rateableCount === 1 ? "player" : "players"}` : "Rate players"}
                        size="sm"
                        fullWidth={false}
                        onPress={() => router.push(`/post-game/${game.id}`)}
                      />
                    )}
                    <Pressable
                      onPress={() => handleRebook(game)}
                      className="rounded-pill px-4 py-2 border-[1.5px] items-center justify-center"
                      style={{ borderColor: "rgba(255,255,255,0.15)" }}
                    >
                      <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
                        Rebook
                      </Text>
                    </Pressable>
                  </View>
                </LinearGradient>
              </View>
            );
          }}
        />
      )}
    </Screen>
  );
}

// History as identity, not receipt list (my-games-plan.md §M4) — games played, streak,
// most-played venue, and the person you keep ending up on court with.
function PastHistoryHeader({
  gamesPlayed,
  stats,
  streak,
}: {
  gamesPlayed: number;
  stats: { venue: { name: string; count: number } | null; regular: { name: string; count: number } | null };
  streak: number;
}) {
  return (
    <View className="px-5 pb-4">
      <LinearGradient colors={gradients.card} className="rounded-[18px] p-4 border gap-3" style={{ borderColor: colors.cardBorder }}>
        <View className="flex-row items-center justify-between">
          <Text className="font-display-bold text-[19px]" style={{ color: colors.text }}>
            {gamesPlayed} {gamesPlayed === 1 ? "game" : "games"} played
          </Text>
          {streak >= 2 && (
            <View className="flex-row items-center gap-1.5">
              <Text style={{ fontSize: 16 }}>🔥</Text>
              <Text className="font-body-bold text-[13.5px]" style={{ color: colors.accent }}>
                {streak} week streak
              </Text>
            </View>
          )}
        </View>
        {stats.venue && (
          <View className="flex-row items-center gap-2">
            <Ionicons name="location" size={14} color={colors.textTertiary} />
            <Text className="text-[13.5px] font-body-semibold" style={{ color: colors.textSecondary }}>
              Most played at <Text style={{ color: colors.text }}>{stats.venue.name}</Text> · {stats.venue.count}×
            </Text>
          </View>
        )}
        {stats.regular && (
          <View className="flex-row items-center gap-2">
            <Ionicons name="people" size={14} color={colors.textTertiary} />
            <Text className="text-[13.5px] font-body-semibold" style={{ color: colors.textSecondary }}>
              You've played with <Text style={{ color: colors.text }}>{stats.regular.name}</Text> {stats.regular.count}×
            </Text>
          </View>
        )}
      </LinearGradient>
    </View>
  );
}
