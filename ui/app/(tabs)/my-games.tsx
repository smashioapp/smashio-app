import { useCallback, useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../../lib/store";
import { colors, gradients } from "../../lib/theme";
import { useMyHostingGames, useMyJoinedGames, useMyPastGames } from "../../lib/queries/games";
import { useMyPendingRequestsCount, useMyGamesRoster } from "../../lib/queries/gamePlayers";
import { useChatThreads } from "../../lib/queries/messages";
import { dayLabel } from "../../lib/format";
import { Screen } from "../../components/Screen";
import { Chip } from "../../components/Chip";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { GameCardSkeletonList } from "../../components/Skeleton";
import { RefreshableList } from "../../components/RefreshableList";
import { DayHeader } from "../../components/DayHeader";
import { UpcomingGameCard } from "../../components/UpcomingGameCard";
import type { MyRole } from "../../components/UpcomingGameCard";
import type { Game } from "../../lib/mockData";

type UpcomingGame = Game & { role: MyRole };
type UpcomingRow = { kind: "day"; id: string; label: string } | { kind: "game"; id: string; game: UpcomingGame };

// The single agenda (M1): Joined and Hosting are the same calendar, role is an annotation on
// the card, not a tab you have to know to check. See my-games-plan.md §4.
export default function MyGames() {
  const { myGamesTab, setMyGamesTab } = useAppStore();
  const joinedQuery = useMyJoinedGames();
  const hostingQuery = useMyHostingGames();
  const pastQuery = useMyPastGames();
  const pendingCountQuery = useMyPendingRequestsCount();
  const chatThreadsQuery = useChatThreads();
  const queryClient = useQueryClient();

  // Approvals and decisions arrive by push while this screen sits mounted in the background —
  // RN's window-focus refetch is inert without an AppState bridge, so refresh explicitly.
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["my_games"] });
      queryClient.invalidateQueries({ queryKey: ["game_players", "pending_requests_count"] });
    }, [queryClient])
  );

  const isLoading = joinedQuery.isLoading || hostingQuery.isLoading;
  const isError = joinedQuery.isError || hostingQuery.isError;

  const upcoming: UpcomingGame[] = useMemo(() => {
    const joined = (joinedQuery.data ?? []).map((g) => ({ ...g, role: (g.myStatus === "requested" ? "requested" : "playing") as MyRole }));
    const hosting = (hostingQuery.data ?? []).map((g) => ({ ...g, role: "hosting" as MyRole }));
    return [...joined, ...hosting].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }, [joinedQuery.data, hostingQuery.data]);

  const gameIds = useMemo(() => upcoming.map((g) => g.id), [upcoming]);
  const rosterQuery = useMyGamesRoster(gameIds);
  const unreadGameIds = useMemo(
    () => new Set((chatThreadsQuery.data ?? []).filter((t) => t.unread).map((t) => t.id)),
    [chatThreadsQuery.data]
  );

  const upcomingRows: UpcomingRow[] = useMemo(() => {
    const rows: UpcomingRow[] = [];
    let lastLabel: string | null = null;
    for (const game of upcoming) {
      const label = dayLabel(game.startsAt, new Date(), { todayLabel: "Today" });
      if (label !== lastLabel) {
        rows.push({ kind: "day", id: `day-${label}`, label });
        lastLabel = label;
      }
      rows.push({ kind: "game", id: game.id, game });
    }
    return rows;
  }, [upcoming]);
  const stickyHeaderIndices = useMemo(() => upcomingRows.flatMap((r, i) => (r.kind === "day" ? [i] : [])), [upcomingRows]);

  const upcomingCount = upcoming.length;
  const pastCount = pastQuery.data?.length ?? 0;
  const hasPending = (pendingCountQuery.data ?? 0) > 0;

  return (
    <Screen>
      <Text className="font-display text-[26px] px-5 pt-3 pb-2.5" style={{ color: colors.text }}>
        My Games
      </Text>
      <View className="flex-row gap-1.5 px-5 pb-3.5">
        <View>
          <Chip
            label={upcomingCount > 0 ? `Upcoming ${upcomingCount}` : "Upcoming"}
            active={myGamesTab === "upcoming"}
            onPress={() => setMyGamesTab("upcoming")}
          />
          {hasPending && (
            <View className="absolute top-0 right-0 w-2 h-2 rounded-full" style={{ backgroundColor: colors.accent }} />
          )}
        </View>
        <Chip label={pastCount > 0 ? `Past ${pastCount}` : "Past"} active={myGamesTab === "past"} onPress={() => setMyGamesTab("past")} />
      </View>

      {myGamesTab === "upcoming" &&
        (isLoading ? (
          <GameCardSkeletonList />
        ) : (
          <RefreshableList
            data={upcomingRows}
            keyExtractor={(r: UpcomingRow) => r.id}
            stickyHeaderIndices={stickyHeaderIndices}
            contentContainerStyle={{ paddingTop: 4, paddingBottom: 110 }}
            refreshing={joinedQuery.isRefetching || hostingQuery.isRefetching}
            onRefresh={() => {
              joinedQuery.refetch();
              hostingQuery.refetch();
            }}
            ListEmptyComponent={
              isError ? (
                <View className="px-5">
                  <EmptyState
                    title="Couldn't load your games"
                    subtitle="Check your connection and try again."
                    ctaLabel="Retry"
                    onCta={() => {
                      joinedQuery.refetch();
                      hostingQuery.refetch();
                    }}
                  />
                </View>
              ) : (
                <View className="px-5">
                  <EmptyState
                    title="Nothing on your calendar"
                    subtitle="Find a match near you and lock in your spot before it fills up."
                    ctaLabel="Find a game"
                    onCta={() => router.push("/(tabs)/discover")}
                  />
                </View>
              )
            }
            renderItem={({ item }: { item: UpcomingRow }) => {
              if (item.kind === "day") return <DayHeader label={item.label} compact={false} />;
              const { game } = item;
              return (
                <View className="px-5 pb-3">
                  {game.status === "cancelled" ? (
                    <CancelledCard game={game} role={game.role} />
                  ) : (
                    <UpcomingGameCard
                      game={game}
                      role={game.role}
                      roster={rosterQuery.data?.get(game.id) ?? []}
                      unread={unreadGameIds.has(game.id)}
                      onPress={() => router.push(`/game/${game.id}`)}
                    />
                  )}
                </View>
              );
            }}
          />
        ))}

      {myGamesTab === "past" &&
        (pastQuery.isLoading ? (
          <GameCardSkeletonList />
        ) : (
          <RefreshableList
            data={pastQuery.data ?? []}
            keyExtractor={(g) => g.id}
            contentContainerStyle={{ padding: 20, paddingTop: 0, paddingBottom: 110, gap: 12 }}
            refreshing={pastQuery.isRefetching}
            onRefresh={() => pastQuery.refetch()}
            ListEmptyComponent={
              pastQuery.isError ? (
                <EmptyState
                  title="Couldn't load your games"
                  subtitle="Check your connection and try again."
                  ctaLabel="Retry"
                  onCta={() => pastQuery.refetch()}
                />
              ) : (
                <EmptyState
                  title="Your rally history starts here"
                  subtitle="Play your first match and it'll show up right here — ratings, streaks, all of it."
                  ctaLabel="Find a game"
                  onCta={() => router.push("/(tabs)/discover")}
                />
              )
            }
            renderItem={({ item }) => (
              <LinearGradient colors={gradients.card} className="rounded-[18px] p-4 border gap-2.5" style={{ borderColor: colors.cardBorder }}>
                <Text className="font-display-bold text-[16.5px]" style={{ color: colors.text }}>
                  {item.venue}
                </Text>
                <Text className="text-[14px]" style={{ color: colors.textTertiary }}>
                  {item.date} · {item.time}
                </Text>
                <View className="flex-row gap-2">
                  <Button label="Rate players" size="sm" fullWidth={false} onPress={() => router.push(`/post-game/${item.id}`)} />
                  <Pressable
                    onPress={() => router.push("/wizard")}
                    className="rounded-pill px-4 py-2 border-[1.5px] items-center justify-center"
                    style={{ borderColor: "rgba(255,255,255,0.15)" }}
                  >
                    <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
                      Rebook
                    </Text>
                  </Pressable>
                </View>
              </LinearGradient>
            )}
          />
        ))}
    </Screen>
  );
}

// A cancelled game stays in the list until it's in the past — it's the only place a player
// or host will see the cancellation if they missed the push. A player gets a way out
// (replacement suggestions); the host who cancelled it doesn't need one.
function CancelledCard({ game, role }: { game: Game; role: MyRole }) {
  return (
    <Pressable onPress={() => router.push(`/game/${game.id}`)}>
      <LinearGradient
        colors={gradients.card}
        className="rounded-[18px] p-4 border gap-2"
        style={{ borderColor: "rgba(255,103,103,0.3)" }}
      >
        <View className="flex-row justify-between items-start">
          <Text className="font-display-bold text-[16.5px] flex-1 pr-2" style={{ color: colors.textSecondary }}>
            {game.venue}
          </Text>
          <Badge state="cancelled" label="Cancelled" />
        </View>
        <Text className="text-[14px]" style={{ color: colors.textTertiary, textDecorationLine: "line-through" }}>
          {game.date} · {game.time}
        </Text>
        <Text className="text-[13.5px]" style={{ color: colors.danger }}>
          {role === "hosting" ? "You cancelled this game." : "The host cancelled this game."}
        </Text>
        {role !== "hosting" && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              router.push("/(tabs)/discover");
            }}
            className="self-start rounded-pill px-3.5 py-2 border-[1.5px] flex-row items-center gap-1.5 mt-0.5"
            style={{ borderColor: "rgba(255,255,255,0.15)" }}
          >
            <Ionicons name="search-outline" size={13} color={colors.text} />
            <Text className="font-body-bold text-[12.5px]" style={{ color: colors.text }}>
              Find a replacement
            </Text>
          </Pressable>
        )}
      </LinearGradient>
    </Pressable>
  );
}
