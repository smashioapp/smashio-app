import { useCallback } from "react";
import { View, Text, Pressable } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../../lib/store";
import { colors, gradients } from "../../lib/theme";
import { useMyHostingGames, useMyJoinedGames, useMyPastGames } from "../../lib/queries/games";
import { useMyPendingRequestsCount } from "../../lib/queries/gamePlayers";
import { Screen } from "../../components/Screen";
import { Chip } from "../../components/Chip";
import { GameCard } from "../../components/GameCard";
import { Badge } from "../../components/Badge";
import { CountdownChip } from "../../components/CountdownChip";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { GameCardSkeletonList } from "../../components/Skeleton";
import { RefreshableList } from "../../components/RefreshableList";
import type { Game } from "../../lib/mockData";

export default function MyGames() {
  const { myGamesTab, setMyGamesTab } = useAppStore();
  const joinedQuery = useMyJoinedGames();
  const hostingQuery = useMyHostingGames();
  const pastQuery = useMyPastGames();
  const pendingCountQuery = useMyPendingRequestsCount();
  const queryClient = useQueryClient();

  // Approvals and decisions arrive by push while this screen sits mounted in the background —
  // RN's window-focus refetch is inert without an AppState bridge, so refresh explicitly.
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["my_games"] });
      queryClient.invalidateQueries({ queryKey: ["game_players", "pending_requests_count"] });
    }, [queryClient])
  );

  const joinedCount = joinedQuery.data?.length ?? 0;
  const hostingCount = hostingQuery.data?.length ?? 0;
  const pastCount = pastQuery.data?.length ?? 0;
  const hasPending = (pendingCountQuery.data ?? 0) > 0;

  return (
    <Screen>
      <Text className="font-display text-[26px] px-5 pt-3 pb-2.5" style={{ color: colors.text }}>
        My Games
      </Text>
      <View className="flex-row gap-1.5 px-5 pb-3.5">
        <Chip
          label={joinedCount > 0 ? `Joined ${joinedCount}` : "Joined"}
          active={myGamesTab === "joined"}
          onPress={() => setMyGamesTab("joined")}
        />
        <View>
          <Chip
            label={hostingCount > 0 ? `Hosting ${hostingCount}` : "Hosting"}
            active={myGamesTab === "hosting"}
            onPress={() => setMyGamesTab("hosting")}
          />
          {hasPending && (
            <View
              className="absolute top-0 right-0 w-2 h-2 rounded-full"
              style={{ backgroundColor: colors.accent }}
            />
          )}
        </View>
        <Chip label={pastCount > 0 ? `Past ${pastCount}` : "Past"} active={myGamesTab === "past"} onPress={() => setMyGamesTab("past")} />
      </View>

      {myGamesTab === "joined" &&
        (joinedQuery.isLoading ? (
          <GameCardSkeletonList />
        ) : (
          <RefreshableList
            data={joinedQuery.data ?? []}
            keyExtractor={(g) => g.id}
            contentContainerStyle={{ padding: 20, paddingTop: 0, paddingBottom: 110, gap: 12 }}
            refreshing={joinedQuery.isRefetching}
            onRefresh={() => joinedQuery.refetch()}
            ListEmptyComponent={
              joinedQuery.isError ? (
                <EmptyState
                  title="Couldn't load your games"
                  subtitle="Check your connection and try again."
                  ctaLabel="Retry"
                  onCta={() => joinedQuery.refetch()}
                />
              ) : (
                <EmptyState
                  title="Nothing on your calendar"
                  subtitle="Find a match near you and lock in your spot before it fills up."
                  ctaLabel="Find a game"
                  onCta={() => router.push("/(tabs)/discover")}
                />
              )
            }
            renderItem={({ item, index }) =>
              item.status === "cancelled" ? (
                <CancelledCard game={item} />
              ) : (
                <GameCard game={item} index={index} onPress={() => router.push(`/game/${item.id}`)} />
              )
            }
          />
        ))}

      {myGamesTab === "hosting" &&
        (hostingQuery.isLoading ? (
          <GameCardSkeletonList />
        ) : (
          <RefreshableList
            data={hostingQuery.data ?? []}
            keyExtractor={(g) => g.id}
            contentContainerStyle={{ padding: 20, paddingTop: 0, paddingBottom: 110, gap: 12 }}
            refreshing={hostingQuery.isRefetching}
            onRefresh={() => hostingQuery.refetch()}
            ListEmptyComponent={
              hostingQuery.isError ? (
                <EmptyState
                  title="Couldn't load your games"
                  subtitle="Check your connection and try again."
                  ctaLabel="Retry"
                  onCta={() => hostingQuery.refetch()}
                />
              ) : (
                <EmptyState
                  title="You haven't called a game yet"
                  subtitle="Pick a court, set the time — SMASHIO fills the rest of the roster."
                  ctaLabel="Host a game"
                  onCta={() => router.push("/wizard")}
                />
              )
            }
            renderItem={({ item }) => {
              const cancelled = item.status === "cancelled";
              return (
                <LinearGradient
                  colors={gradients.card}
                  className="rounded-[18px] p-4 border gap-2"
                  style={{ borderColor: colors.cardBorder, opacity: cancelled ? 0.6 : 1 }}
                >
                  <View className="flex-row justify-between">
                    <Text className="font-display-bold text-[16.5px]" style={{ color: colors.text }}>
                      {item.venue}
                    </Text>
                    {cancelled ? (
                      <Badge state="cancelled" label="Cancelled" />
                    ) : (
                      item.verificationStatus !== "none" && (
                        <Badge state={item.verified ? "verified" : "pending"} label={item.verified ? "Verified" : "Pending review"} />
                      )
                    )}
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-[14px]" style={{ color: colors.textDim }}>
                      {item.date} · {item.time}
                    </Text>
                    {!cancelled && <CountdownChip startsAt={item.startsAt} />}
                  </View>
                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={() => router.push(`/game/${item.id}`)}
                      className="self-start rounded-pill px-4 py-2 border-[1.5px]"
                      style={{ borderColor: "rgba(255,255,255,0.15)" }}
                    >
                      <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
                        {cancelled ? "View game" : "Manage game"}
                      </Text>
                    </Pressable>
                    {!cancelled && (
                      <Pressable
                        onPress={() => router.push(`/game/edit/${item.id}`)}
                        className="self-start rounded-pill px-4 py-2 border-[1.5px] flex-row items-center gap-1.5"
                        style={{ borderColor: "rgba(255,255,255,0.15)" }}
                      >
                        <Ionicons name="create-outline" size={14} color={colors.text} />
                        <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
                          Edit
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </LinearGradient>
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

// A cancelled game a player joined stays in their list until it's in the past — it's the only
// place they'll see the cancellation if they missed the push.
function CancelledCard({ game }: { game: Game }) {
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
          The host cancelled this game.
        </Text>
      </LinearGradient>
    </Pressable>
  );
}
