import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, FlatList, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../../lib/store";
import { colors, gradients, LAYOUT, tierColor } from "../../lib/theme";
import { useTabBarSpace } from "../../lib/nav";
import { makeScrollHideHandler, registerScrollToTop, unregisterScrollToTop } from "../../lib/navScroll";
import { useMyHostingGames, useMyJoinedGames, useMyPastGames, useDiscoverGames } from "../../lib/queries/games";
import { useMyGamesRoster } from "../../lib/queries/gamePlayers";
import { useCreateAlert } from "../../lib/queries/alerts";
import { useChatThreads } from "../../lib/queries/messages";
import { useUserLocation } from "../../lib/location";
import { dayLabel, formatTimeShort } from "../../lib/format";
import { nextRebookSlot } from "../../lib/schedule";
import { haptics } from "../../lib/haptics";
import { Screen } from "../../components/Screen";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { GameCardSkeletonList } from "../../components/Skeleton";
import { RefreshableList } from "../../components/RefreshableList";
import { DayHeader } from "../../components/DayHeader";
import { ListRow } from "../../components/ListRow";
import { Rail } from "../../components/RailCard";
import { NextUpHero } from "../../components/NextUpHero";
import type { MyRole } from "../../components/UpcomingGameCard";
import type { Game } from "../../lib/mockData";

type AlertRowState = "idle" | "saving" | "saved";

const ROLE_LABEL: Record<MyRole, string> = { hosting: "Hosting", playing: "Playing", requested: "Requested" };

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
  const tabBarSpace = useTabBarSpace();
  const listRef = useRef<FlatList<any>>(null);
  const scrollHide = useRef(makeScrollHideHandler()).current;

  useEffect(() => {
    registerScrollToTop("my-games", () => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
    return () => unregisterScrollToTop("my-games");
  }, []);
  const joinedQuery = useMyJoinedGames();
  const hostingQuery = useMyHostingGames();
  const pastQuery = useMyPastGames();
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

  const pastCount = pastQuery.data?.length ?? 0;

  // `Hosting N ›` chip (docs/v2-design-plan.md §4.4) filters the agenda to hosted games only —
  // the hero respects it too, so toggling it never leaves a non-hosted hero contradicting the filter.
  const [hostingOnly, setHostingOnly] = useState(false);
  const hostingCount = useMemo(() => upcoming.filter((g) => g.role === "hosting").length, [upcoming]);
  const heroVisible = !!heroGame && (!hostingOnly || heroGame.role === "hosting");
  const agendaGames = useMemo(
    () => (hostingOnly ? restUpcoming.filter((g) => g.role === "hosting") : restUpcoming),
    [restUpcoming, hostingOnly]
  );
  const agendaRows: UpcomingRow[] = useMemo(() => {
    const rows: UpcomingRow[] = [];
    let lastLabel: string | null = null;
    for (const game of agendaGames) {
      const label = dayLabel(game.startsAt, new Date(), { todayLabel: "Today" });
      if (label !== lastLabel) {
        rows.push({ kind: "day", id: `day-${label}`, label });
        lastLabel = label;
      }
      rows.push({ kind: "game", id: game.id, game });
    }
    return rows;
  }, [agendaGames]);
  const agendaStickyHeaderIndices = useMemo(() => agendaRows.flatMap((r, i) => (r.kind === "day" ? [i] : [])), [agendaRows]);

  // Rebook (my-games-plan.md §M4): seeds the wizard draft from a past game instead of the
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
  // most, sourced from whichever past game matches it. Needs the raw past games, not just the
  // count, so it fetches its own slice via the same cached query the past route also reads.
  const pastGames = pastQuery.data ?? [];
  const regularSlotGame = useMemo(() => {
    if (pastGames.length === 0) return null;
    const slotKey = (g: Game) => `${g.venue}__${new Date(g.startsAt).getDay()}`;
    const counts = new Map<string, number>();
    for (const g of pastGames) counts.set(slotKey(g), (counts.get(slotKey(g)) ?? 0) + 1);
    const topKey = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return pastGames.find((g) => slotKey(g) === topKey) ?? null;
  }, [pastGames]);

  const showUpcomingDeadEnd = !isLoading && !isError && upcoming.length === 0;
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
      <View className="flex-row items-center justify-between" style={{ paddingHorizontal: LAYOUT.SCREEN_PAD, paddingTop: 12, paddingBottom: 10 }}>
        <Text className="font-display text-[30px]" style={{ color: colors.text }}>
          My Games
        </Text>
        {hostingCount > 0 && (
          <Pressable
            onPress={() => {
              haptics.tick();
              setHostingOnly((v) => !v);
            }}
            className="rounded-pill px-3.5 py-2"
            style={{ backgroundColor: hostingOnly ? colors.accent : "rgba(214,255,63,0.12)" }}
          >
            <Text className="font-body-extrabold text-[12.5px]" style={{ color: hostingOnly ? colors.base : colors.accent }}>
              Hosting {hostingCount} ›
            </Text>
          </Pressable>
        )}
      </View>

      <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={{ flex: 1 }}>
        {!isLoading && !isError && heroVisible && heroGame && (
          <View className="pb-3">
            <NextUpHero
              game={heroGame}
              role={heroGame.role}
              roster={rosterQuery.data?.get(heroGame.id) ?? []}
              unread={unreadGameIds.has(heroGame.id)}
              onPress={() => router.push(`/game/${heroGame.id}`)}
            />
          </View>
        )}

        {isLoading ? (
          <GameCardSkeletonList />
        ) : (
          <RefreshableList
            ref={listRef}
            data={agendaRows}
            keyExtractor={(r: UpcomingRow) => r.id}
            stickyHeaderIndices={agendaStickyHeaderIndices}
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
                    character="galah-net"
                    title="Couldn't load your games"
                    subtitle="Check your connection and give it another go."
                    ctaLabel="Retry"
                    onCta={() => {
                      joinedQuery.refetch();
                      hostingQuery.refetch();
                    }}
                  />
                </View>
              ) : heroVisible ? null : (
                <View>
                  <View className="px-5">
                    <EmptyState
                      character="wombat-racquet"
                      title={hostingOnly ? "You're not hosting anything upcoming" : "Nothing on your calendar"}
                      subtitle={
                        hostingOnly
                          ? "Host a game and it'll show up here."
                          : "Find a match near you and lock in your spot before it fills up."
                      }
                      ctaLabel={hostingOnly ? "Host a game" : "Find a game"}
                      onCta={() => router.push(hostingOnly ? "/wizard" : "/(tabs)/discover")}
                    />
                  </View>
                  {!hostingOnly && regularSlotGame && (
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
                  {!hostingOnly && (
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
                          {alertState === "saved" ? "Alert set, we'll ping you" : alertState === "saving" ? "Saving…" : "Alert me when a game opens up"}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                  {!hostingOnly && <Rail title="Happening near you this week" games={nearbyWeekQuery.data ?? []} />}
                </View>
              )
            }
            ListFooterComponent={
              !isLoading && !isError ? (
                <Pressable
                  testID="mygames-past-link"
                  onPress={() => router.push("/my-games/past")}
                  className="flex-row items-center justify-between rounded-2xl px-4 py-3.5 mx-5 mt-1 border"
                  style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}
                >
                  <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
                    {pastCount} past {pastCount === 1 ? "game" : "games"}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                </Pressable>
              ) : null
            }
            renderItem={({ item }: { item: UpcomingRow }) => {
              if (item.kind === "day") return <DayHeader label={item.label} compact={false} />;
              const { game } = item;
              if (game.status === "cancelled") {
                return (
                  <View className="px-5 pb-3">
                    <CancelledCard game={game} role={game.role} />
                  </View>
                );
              }
              const unread = unreadGameIds.has(game.id);
              return (
                <View style={{ paddingHorizontal: LAYOUT.SCREEN_PAD }}>
                  <ListRow
                    dotColor={tierColor(game.skill)}
                    title={`${game.venue}, ${formatTimeShort(game.startsAt)}`}
                    subtitle={`${game.skill} · ${ROLE_LABEL[game.role]}`}
                    trailingNode={
                      // social-plan.md N1: the per-row chat entry point Chat's tab used to be —
                      // every game row is a thread reachable straight from the agenda now.
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          router.push(`/chat/${game.id}`);
                        }}
                        hitSlop={8}
                        className="w-7 h-7 items-center justify-center"
                      >
                        <View>
                          <Ionicons name="chatbubble-ellipses-outline" size={16} color={unread ? colors.accent : colors.textTertiary} />
                          {unread && (
                            <View
                              className="absolute rounded-full"
                              style={{ top: -1, right: -1, width: 7, height: 7, backgroundColor: colors.accent, borderWidth: 1.5, borderColor: colors.base }}
                            />
                          )}
                        </View>
                      </Pressable>
                    }
                    accessory="chevron"
                    onPress={() => router.push(`/game/${game.id}`)}
                    testID={`mygames-row-${game.id}`}
                  />
                </View>
              );
            }}
          />
        )}
      </Animated.View>
    </Screen>
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
          {role === "hosting" ? "You cancelled this one." : "The host cancelled this one."}
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
        Having a look for a replacement…
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
          Nothing matches yet, browse Discover
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
