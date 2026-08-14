import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, FlatList, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../../lib/store";
import { colors, gradients } from "../../lib/theme";
import { useTabBarSpace } from "../../lib/nav";
import { makeScrollHideHandler, registerScrollToTop, unregisterScrollToTop } from "../../lib/navScroll";
import { BottomRail } from "../../components/BottomRail";
import { HostFab } from "../../components/HostFab";
import { useMyHostingGames, useMyJoinedGames, useMyPastGames, useDiscoverGames } from "../../lib/queries/games";
import { useMyPendingRequestsCount, useMyGamesRoster, useMyHostedPendingRequests } from "../../lib/queries/gamePlayers";
import { useMyRatedGameIds } from "../../lib/queries/ratings";
import { useCreateAlert } from "../../lib/queries/alerts";
import { useChatThreads } from "../../lib/queries/messages";
import { useProfileStreak } from "../../lib/queries/profile";
import { useSession } from "../../lib/session";
import { useUserLocation } from "../../lib/location";
import { dayLabel, monthLabel } from "../../lib/format";
import { nextRebookSlot } from "../../lib/schedule";
import { haptics } from "../../lib/haptics";
import { Screen } from "../../components/Screen";
import { Chip } from "../../components/Chip";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { GameCardSkeletonList } from "../../components/Skeleton";
import { RefreshableList } from "../../components/RefreshableList";
import { DayHeader } from "../../components/DayHeader";
import { Rail } from "../../components/Rail";
import { UpcomingGameCard } from "../../components/UpcomingGameCard";
import { NextUpHero } from "../../components/NextUpHero";
import type { MyRole } from "../../components/UpcomingGameCard";
import type { Game } from "../../lib/mockData";

type AlertRowState = "idle" | "saving" | "saved";

type PastRow = { kind: "month"; id: string; label: string } | { kind: "game"; id: string; game: Game };

const HERO_WINDOW_MS = 24 * 60 * 60 * 1000;

// A game earns the hero treatment while it's live, or once it's inside the 24h window —
// same "day-of" cutoff as the countdown chip's urgency, one level up (my-games-plan.md §M2).
function isHeroWorthy(game: Game, now: Date): boolean {
  const start = new Date(game.startsAt).getTime();
  const end = new Date(game.endsAt).getTime();
  const t = now.getTime();
  return t < end && start - t <= HERO_WINDOW_MS;
}

type UpcomingGame = Game & { role: MyRole };
type UpcomingRow = { kind: "day"; id: string; label: string } | { kind: "game"; id: string; game: UpcomingGame };

// The single agenda (M1): Joined and Hosting are the same calendar, role is an annotation on
// the card, not a tab you have to know to check. See my-games-plan.md §4.
export default function MyGames() {
  const { myGamesTab, setMyGamesTab } = useAppStore();
  const tabBarSpace = useTabBarSpace(true);
  const listRef = useRef<FlatList<any>>(null);
  const scrollHide = useRef(makeScrollHideHandler()).current;

  useEffect(() => {
    registerScrollToTop("my-games", () => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
    return () => unregisterScrollToTop("my-games");
  }, []);
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

  // Ticks slowly so the hero card's 24h window and live/ended state recompute without a refetch
  // — the child hero re-renders itself for the countdown text, this just decides *whether* it shows.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const upcoming: UpcomingGame[] = useMemo(() => {
    const joined = (joinedQuery.data ?? []).map((g) => ({ ...g, role: (g.myStatus === "requested" ? "requested" : "playing") as MyRole }));
    const hosting = (hostingQuery.data ?? []).map((g) => ({ ...g, role: "hosting" as MyRole }));
    return [...joined, ...hosting].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }, [joinedQuery.data, hostingQuery.data]);

  const gameIds = useMemo(() => upcoming.map((g) => g.id), [upcoming]);
  const rosterQuery = useMyGamesRoster(gameIds);
  const hostingIds = useMemo(() => upcoming.filter((g) => g.role === "hosting").map((g) => g.id), [upcoming]);
  const pendingRequestsQuery = useMyHostedPendingRequests(hostingIds);
  const unreadGameIds = useMemo(
    () => new Set((chatThreadsQuery.data ?? []).filter((t) => t.unread).map((t) => t.id)),
    [chatThreadsQuery.data]
  );

  const heroGame = useMemo(
    () => upcoming.find((g) => g.status !== "cancelled" && isHeroWorthy(g, now)),
    [upcoming, now]
  );
  const restUpcoming = useMemo(() => (heroGame ? upcoming.filter((g) => g.id !== heroGame.id) : upcoming), [upcoming, heroGame]);

  const upcomingRows: UpcomingRow[] = useMemo(() => {
    const rows: UpcomingRow[] = [];
    let lastLabel: string | null = null;
    for (const game of restUpcoming) {
      const label = dayLabel(game.startsAt, new Date(), { todayLabel: "Today" });
      if (label !== lastLabel) {
        rows.push({ kind: "day", id: `day-${label}`, label });
        lastLabel = label;
      }
      rows.push({ kind: "game", id: game.id, game });
    }
    return rows;
  }, [restUpcoming]);
  const stickyHeaderIndices = useMemo(() => upcomingRows.flatMap((r, i) => (r.kind === "day" ? [i] : [])), [upcomingRows]);

  const upcomingCount = upcoming.length;
  const pastCount = pastQuery.data?.length ?? 0;
  const hasPending = (pendingCountQuery.data ?? 0) > 0;

  // Past as identity, not archive (my-games-plan.md §M4): games played, streak, most-played
  // venue, and regulars are all derivable from data we already fetch elsewhere on this screen.
  const { session } = useSession();
  const userId = session?.user.id;
  const streakQuery = useProfileStreak(userId);
  const pastGames = pastQuery.data ?? [];
  const pastGameIds = useMemo(() => pastGames.map((g) => g.id), [pastGames]);
  const pastRosterQuery = useMyGamesRoster(pastGameIds);
  const ratedGameIdsQuery = useMyRatedGameIds(pastGameIds);

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

  // Rebook (my-games-plan.md §M4): seeds the wizard draft from the past game instead of the
  // empty-draft "just opens the host flow" it used to be. No venueId (older row, before it was
  // projected) means the wizard opens clean rather than half-filled.
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

  // "Rebook your regular slot" (my-games-plan.md §M5) — the venue+weekday pairing you've played
  // most, sourced from whichever past game matches it (newest first, since useMyPastGames is
  // ordered that way) so the rebook carries real skill/maxPlayers/cost, not a guess.
  const regularSlotGame = useMemo(() => {
    if (pastGames.length === 0) return null;
    const slotKey = (g: Game) => `${g.venue}__${new Date(g.startsAt).getDay()}`;
    const counts = new Map<string, number>();
    for (const g of pastGames) counts.set(slotKey(g), (counts.get(slotKey(g)) ?? 0) + 1);
    const topKey = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return pastGames.find((g) => slotKey(g) === topKey) ?? null;
  }, [pastGames]);

  const showUpcomingDeadEnd = myGamesTab === "upcoming" && !isLoading && !isError && upcoming.length === 0;
  const userLocation = useUserLocation();
  const nearbyWeekQuery = useDiscoverGames({ when: "week" }, userLocation, { enabled: showUpcomingDeadEnd });

  const [alertState, setAlertState] = useState<AlertRowState>("idle");
  const createAlert = useCreateAlert();
  const handleSetAlert = () => {
    setAlertState("saving");
    createAlert.mutate(
      { tierSlugs: [], radiusKm: 25, center: userLocation },
      {
        onSuccess: () => {
          setAlertState("saved");
          haptics.success();
        },
        onError: () => setAlertState("idle"),
      }
    );
  };

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

      <Animated.View key={myGamesTab} entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={{ flex: 1 }}>
      {myGamesTab === "upcoming" && !isLoading && !isError && heroGame && (
        <NextUpHero
          game={heroGame}
          role={heroGame.role}
          roster={rosterQuery.data?.get(heroGame.id) ?? []}
          unread={unreadGameIds.has(heroGame.id)}
          onPress={() => router.push(`/game/${heroGame.id}`)}
        />
      )}

      {myGamesTab === "upcoming" &&
        (isLoading ? (
          <GameCardSkeletonList />
        ) : (
          <RefreshableList
            ref={listRef}
            data={upcomingRows}
            keyExtractor={(r: UpcomingRow) => r.id}
            stickyHeaderIndices={stickyHeaderIndices}
            contentContainerStyle={{ paddingTop: 4, paddingBottom: tabBarSpace }}
            refreshing={joinedQuery.isRefetching || hostingQuery.isRefetching}
            onRefresh={() => {
              joinedQuery.refetch();
              hostingQuery.refetch();
            }}
            onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => scrollHide(e.nativeEvent.contentOffset.y)}
            scrollEventThrottle={32}
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
                <View>
                  <View className="px-5">
                    <EmptyState
                      title="Nothing on your calendar"
                      subtitle="Find a match near you and lock in your spot before it fills up."
                      ctaLabel="Find a game"
                      onCta={() => router.push("/(tabs)/discover")}
                    />
                  </View>
                  {regularSlotGame && (
                    <View className="px-5 pt-1 pb-2">
                      <Pressable
                        onPress={() => handleRebook(regularSlotGame)}
                        className="flex-row items-center justify-between rounded-xl px-4 py-3.5"
                        style={{ backgroundColor: colors.accent }}
                      >
                        <View className="flex-1 pr-2">
                          <Text className="font-body-extrabold text-[14px]" style={{ color: colors.base }}>
                            Rebook your regular slot
                          </Text>
                          <Text className="text-[12.5px] font-body-semibold mt-0.5" style={{ color: "rgba(10,10,11,0.65)" }}>
                            {regularSlotGame.venue} ·{" "}
                            {new Date(regularSlotGame.startsAt).toLocaleDateString("en-AU", { weekday: "long" })}s
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={colors.base} />
                      </Pressable>
                    </View>
                  )}
                  <View className="px-5 pb-2">
                    <Pressable
                      onPress={handleSetAlert}
                      disabled={alertState !== "idle"}
                      className="flex-row items-center justify-center gap-2 rounded-xl px-4 py-3.5 border"
                      style={{
                        borderColor: alertState === "saved" ? "rgba(53,214,166,0.3)" : colors.cardBorder,
                        backgroundColor: alertState === "saved" ? "rgba(53,214,166,0.08)" : colors.surfaceAlt,
                        opacity: alertState === "saving" ? 0.6 : 1,
                      }}
                    >
                      <Ionicons
                        name={alertState === "saved" ? "checkmark-circle" : "notifications-outline"}
                        size={16}
                        color={alertState === "saved" ? colors.intermediate : colors.textSecondary}
                      />
                      <Text
                        className="font-body-bold text-[14px]"
                        style={{ color: alertState === "saved" ? colors.intermediate : colors.textSecondary }}
                      >
                        {alertState === "saved" ? "Alert set — we'll ping you" : alertState === "saving" ? "Saving…" : "Alert me when a game opens up"}
                      </Text>
                    </Pressable>
                  </View>
                  <Rail title="Happening near you this week" games={nearbyWeekQuery.data ?? []} viewerTierOrdinal={null} />
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
                      pendingRequests={pendingRequestsQuery.data?.get(game.id) ?? []}
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
            ref={listRef}
            data={pastRows}
            keyExtractor={(r: PastRow) => r.id}
            contentContainerStyle={{ paddingTop: 4, paddingBottom: tabBarSpace }}
            refreshing={pastQuery.isRefetching}
            onRefresh={() => pastQuery.refetch()}
            onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => scrollHide(e.nativeEvent.contentOffset.y)}
            scrollEventThrottle={32}
            ListHeaderComponent={
              historyStats ? <PastHistoryHeader gamesPlayed={pastCount} stats={historyStats} streak={streakQuery.data ?? 0} /> : null
            }
            ListEmptyComponent={
              pastQuery.isError ? (
                <View className="px-5">
                  <EmptyState
                    title="Couldn't load your games"
                    subtitle="Check your connection and try again."
                    ctaLabel="Retry"
                    onCta={() => pastQuery.refetch()}
                  />
                </View>
              ) : (
                <View className="px-5">
                  <EmptyState
                    title="Your rally history starts here"
                    subtitle="Play your first match and it'll show up right here — ratings, streaks, all of it."
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
                        <View className="rounded-pill px-4 py-2 border-[1.5px] flex-row items-center gap-1.5" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
                          <Ionicons name="checkmark-circle" size={14} color={colors.intermediate} />
                          <Text className="font-body-bold text-[13.5px]" style={{ color: colors.textDim }}>
                            Rated
                          </Text>
                        </View>
                      ) : (
                        <Button
                          label={teammates.length > 0 ? `Rate ${teammates.length} ${teammates.length === 1 ? "player" : "players"}` : "Rate players"}
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
        ))}
      </Animated.View>

      <BottomRail right={<HostFab />} />
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

// A cancelled game stays in the list until it's in the past — it's the only place a player
// or host will see the cancellation if they missed the push. A player gets a way out
// (replacement suggestions); the host who cancelled it doesn't need one.
function CancelledCard({ game, role }: { game: Game; role: MyRole }) {
  const [showReplacements, setShowReplacements] = useState(false);

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
        {role !== "hosting" && !showReplacements && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              haptics.tap();
              setShowReplacements(true);
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
        {role !== "hosting" && showReplacements && <ReplacementSuggestions cancelledGame={game} />}
      </LinearGradient>
    </Pressable>
  );
}

// Same venue first, then same night — a cancellation is a dead end everywhere else in the app
// (my-games-plan.md §M5); this replaces "browse Discover from scratch" with two honest,
// computed-not-fabricated suggestions right where the bad news landed.
function ReplacementSuggestions({ cancelledGame }: { cancelledGame: Game }) {
  const userLocation = useUserLocation();
  const weekQuery = useDiscoverGames({ when: "week" }, userLocation);

  const suggestions = useMemo(() => {
    const cancelledDate = new Date(cancelledGame.startsAt).toDateString();
    const pool = weekQuery.data ?? [];
    const sameVenue = pool.filter((g) => g.venue === cancelledGame.venue);
    const sameNight = pool.filter((g) => g.venue !== cancelledGame.venue && new Date(g.startsAt).toDateString() === cancelledDate);
    return [...sameVenue, ...sameNight].slice(0, 3);
  }, [weekQuery.data, cancelledGame]);

  if (weekQuery.isLoading) {
    return (
      <Text className="text-[12.5px] mt-0.5" style={{ color: colors.textMuted }}>
        Looking for a replacement…
      </Text>
    );
  }

  if (suggestions.length === 0) {
    return (
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
          Nothing matches yet — browse Discover
        </Text>
      </Pressable>
    );
  }

  return (
    <View className="gap-1.5 mt-0.5">
      {suggestions.map((g) => (
        <Pressable
          key={g.id}
          onPress={(e) => {
            e.stopPropagation();
            router.push(`/game/${g.id}`);
          }}
          className="flex-row items-center justify-between rounded-xl px-3 py-2.5"
          style={{ backgroundColor: colors.surfaceAlt }}
        >
          <View className="flex-1 pr-2">
            <Text className="font-body-bold text-[13px]" style={{ color: colors.text }} numberOfLines={1}>
              {g.venue}
            </Text>
            <Text className="text-[12px]" style={{ color: colors.textTertiary }}>
              {g.venue === cancelledGame.venue ? "Same venue" : "Same night"} · {g.date} · {g.time}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
        </Pressable>
      ))}
    </View>
  );
}
