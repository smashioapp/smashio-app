import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../../lib/store";
import { colors, gradients } from "../../lib/theme";
import { useMyHostingGames, useMyJoinedGames, useMyPastGames } from "../../lib/queries/games";
import { Screen } from "../../components/Screen";
import { Chip } from "../../components/Chip";
import { GameCard } from "../../components/GameCard";
import { Badge } from "../../components/Badge";
import { CountdownChip } from "../../components/CountdownChip";
import { Button } from "../../components/Button";
import { GameCardSkeletonList } from "../../components/Skeleton";
import { RefreshableList } from "../../components/RefreshableList";
import type { Game } from "../../lib/mockData";

export default function MyGames() {
  const { myGamesTab, setMyGamesTab } = useAppStore();
  const joinedQuery = useMyJoinedGames();
  const hostingQuery = useMyHostingGames();
  const pastQuery = useMyPastGames();

  return (
    <Screen>
      <Text className="font-display text-[26px] px-5 pt-3 pb-2.5" style={{ color: colors.text }}>
        My Games
      </Text>
      <View className="flex-row gap-1.5 px-5 pb-3.5">
        <Chip label="Joined" active={myGamesTab === "joined"} onPress={() => setMyGamesTab("joined")} />
        <Chip label="Hosting" active={myGamesTab === "hosting"} onPress={() => setMyGamesTab("hosting")} />
        <Chip label="Past" active={myGamesTab === "past"} onPress={() => setMyGamesTab("past")} />
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
              <View className="items-center gap-2.5 pt-14">
                <Text className="text-[14.5px]" style={{ color: colors.textSecondary }}>
                  No games joined yet.
                </Text>
                <Button label="Find a game" fullWidth={false} onPress={() => router.push("/(tabs)/discover")} />
              </View>
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
              <View className="items-center gap-2.5 pt-14">
                <Text className="text-[14.5px]" style={{ color: colors.textSecondary }}>
                  No games hosted yet.
                </Text>
                <Button label="Host a game" fullWidth={false} onPress={() => router.push("/wizard")} />
              </View>
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
              <View className="items-center gap-2.5 pt-14">
                <Text className="text-[14.5px]" style={{ color: colors.textSecondary }}>
                  No past games yet.
                </Text>
                <Button label="Find a game" fullWidth={false} onPress={() => router.push("/(tabs)/discover")} />
              </View>
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
