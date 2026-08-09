import { View, Text, Pressable, ScrollView, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, gradients, initial } from "../../lib/theme";
import { perPlayerCost } from "../../lib/mockData";
import { useGameDetail } from "../../lib/queries/games";
import {
  useDecideJoinRequest,
  useGameRoster,
  useJoinRequests,
  useLeaveGame,
  useMyMembership,
  useRequestToJoin,
} from "../../lib/queries/gamePlayers";
import { Badge } from "../../components/Badge";
import { SkillPill } from "../../components/SkillPill";
import { BackButton } from "../../components/BackButton";
import { Button } from "../../components/Button";
import { HoldButton } from "../../components/HoldButton";
import { CountdownChip } from "../../components/CountdownChip";
import { haptics } from "../../lib/haptics";
import { shareGame } from "../../lib/share";
import { GameDetailSkeleton } from "../../components/Skeleton";

export default function GameDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const gameId = id ?? "";
  const gameQuery = useGameDetail(gameId);
  const game = gameQuery.data;

  const membershipQuery = useMyMembership(gameId, game?.organizerId);
  const rosterQuery = useGameRoster(gameId);
  const requestToJoin = useRequestToJoin(gameId);
  const leaveGame = useLeaveGame(gameId);

  if (gameQuery.isLoading) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.base }}>
        <LinearGradient colors={["#1F1F24", "#141416"]} style={{ height: 150, paddingTop: 56 }}>
          <View className="px-4">
            <BackButton dark onPress={() => router.back()} />
          </View>
        </LinearGradient>
        <GameDetailSkeleton />
      </View>
    );
  }

  if (!game) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.base }}>
        <Text style={{ color: colors.textSecondary }}>Game not found</Text>
      </View>
    );
  }

  const perPlayer = perPlayerCost(game.cost, game.maxPlayers);
  const joined = rosterQuery.data ?? [];
  const membership = membershipQuery.data;

  const confirmLeave = () => {
    Alert.alert("Leave this game?", "You'll lose your spot and may need to request to rejoin.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave game",
        style: "destructive",
        onPress: () => {
          haptics.tap();
          leaveGame.mutate();
        },
      },
    ]);
  };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.base }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <LinearGradient colors={["#1F1F24", "#141416"]} style={{ height: 150, paddingTop: 56 }}>
          <View className="px-4 flex-row justify-between items-center">
            <BackButton dark onPress={() => router.back()} />
            <Pressable
              onPress={() => {
                haptics.tap();
                shareGame(game);
              }}
              className="w-9 h-9 rounded-full items-center justify-center"
              style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
            >
              <Ionicons name="share-outline" size={17} color={colors.text} />
            </Pressable>
          </View>
        </LinearGradient>

        <View className="px-5 pt-4.5">
          <View className="flex-row justify-between items-start">
            <Text className="font-display text-[22px] flex-1 pr-3" style={{ color: colors.text }}>
              {game.venue}
            </Text>
            <Badge state={game.verified ? "verified" : "pending"} label={game.verified ? "Verified" : "Pending"} />
          </View>
          <View className="flex-row items-center justify-between mt-1">
            <Text className="text-[12.5px]" style={{ color: colors.textTertiary }}>
              {game.suburb} · {game.courts}
            </Text>
            <CountdownChip startsAt={game.startsAt} />
          </View>

          <View className="flex-row gap-2 mt-3.5">
            <View className="flex-1 rounded-xl px-3.5 py-2.5 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
              <Text className="text-[12.5px] font-body-semibold" style={{ color: colors.text }}>
                {game.date}
              </Text>
            </View>
            <View className="flex-1 rounded-xl px-3.5 py-2.5 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
              <Text className="text-[12.5px] font-body-semibold" style={{ color: colors.text }}>
                {game.time}
              </Text>
            </View>
            <View className="flex-1 items-center justify-center">
              <SkillPill skill={game.skill} />
            </View>
          </View>

          <Text className="font-body-extrabold text-[11px] uppercase tracking-wide mt-5.5 mb-2.5" style={{ color: colors.textTertiary }}>
            Players joined ({game.joinedCount}/{game.maxPlayers})
          </Text>
          <View className="flex-row flex-wrap gap-2.5">
            {joined.map((p, i) => (
              <View key={i} className="items-center gap-1.5" style={{ width: 52 }}>
                <View
                  className="w-[38px] h-[38px] rounded-full items-center justify-center"
                  style={{ backgroundColor: p.color }}
                >
                  <Text style={{ color: colors.base, fontSize: 12, fontWeight: "800" }}>{initial(p.name)}</Text>
                </View>
                <Text className="text-[10px] font-body-semibold" style={{ color: colors.textSecondary }}>
                  {p.name}
                </Text>
              </View>
            ))}
          </View>

          <Text className="font-body-extrabold text-[11px] uppercase tracking-wide mt-5.5 mb-2.5" style={{ color: colors.textTertiary }}>
            Cost split
          </Text>
          <View className="rounded-2xl p-4 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
            <View className="flex-row justify-between mb-2">
              <Text className="text-[13px]" style={{ color: colors.textSecondary }}>
                Total court cost
              </Text>
              <Text className="text-[13px] font-body-bold" style={{ color: colors.text }}>
                ${game.cost}
              </Text>
            </View>
            <View className="flex-row justify-between mb-2.5">
              <Text className="text-[13px]" style={{ color: colors.textSecondary }}>
                Split {game.maxPlayers} ways · even
              </Text>
              <Text className="text-[13px] font-body-bold" style={{ color: colors.text }}>
                ${perPlayer}
              </Text>
            </View>
            <View className="rounded-xl p-3 flex-row justify-between items-center" style={{ backgroundColor: "rgba(214,255,63,0.1)" }}>
              <Text className="text-[13px] font-body-bold" style={{ color: colors.accent }}>
                Your share
              </Text>
              <Text className="font-display-bold text-[19px]" style={{ color: colors.accent }}>
                ${perPlayer}
              </Text>
            </View>
          </View>

          {membership?.isOrganizer && <JoinRequests gameId={gameId} />}
        </View>
      </ScrollView>

      <View className="px-5 pb-8 pt-3.5 flex-row gap-2.5" style={{ backgroundColor: colors.base }}>
        <Pressable
          onPress={() => router.replace(`/chat/${game.id}`)}
          className="w-14 rounded-pill items-center justify-center border-[1.5px]"
          style={{ borderColor: "rgba(255,255,255,0.15)" }}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={19} color={colors.text} />
        </Pressable>
        <View className="flex-1">
          {membership?.isOrganizer ? (
            <Button label="You're organizing this game" variant="secondary" disabled />
          ) : membership?.status === "approved" ? (
            <Button label="Leave game" variant="secondary" loading={leaveGame.isPending} onPress={confirmLeave} />
          ) : membership?.status === "requested" ? (
            <Button label="Request sent" variant="secondary" disabled />
          ) : (
            <HoldButton
              label={`Hold to join · $${perPlayer}`}
              completeLabel="Request sent"
              sfx="chime"
              onComplete={() => {
                requestToJoin.mutate(undefined, {
                  onError: () => Alert.alert("Couldn't send request", "Please try again."),
                });
              }}
            />
          )}
        </View>
      </View>
    </View>
  );
}

function JoinRequests({ gameId }: { gameId: string }) {
  const requestsQuery = useJoinRequests(gameId);
  const decide = useDecideJoinRequest(gameId);
  const requests = requestsQuery.data ?? [];

  if (requests.length === 0) return null;

  return (
    <>
      <Text className="font-body-extrabold text-[11px] uppercase tracking-wide mt-5.5 mb-2.5" style={{ color: colors.textTertiary }}>
        Join requests ({requests.length})
      </Text>
      <View className="gap-2.5">
        {requests.map((r) => (
          <View
            key={r.profileId}
            className="flex-row items-center gap-3 rounded-xl p-3 border"
            style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}
          >
            <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: r.color }}>
              <Text style={{ color: colors.base, fontSize: 12, fontWeight: "800" }}>{initial(r.name)}</Text>
            </View>
            <Text className="flex-1 font-body-semibold text-[13px]" style={{ color: colors.text }}>
              {r.name}
            </Text>
            <Pressable
              onPress={() => {
                haptics.tap();
                decide.mutate({ profileId: r.profileId, approve: true });
              }}
              className="rounded-pill px-3.5 py-2"
              style={{ backgroundColor: colors.accent }}
            >
              <Text className="font-body-extrabold text-[12px]" style={{ color: colors.base }}>
                Approve
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                haptics.tap();
                decide.mutate({ profileId: r.profileId, approve: false });
              }}
              className="rounded-pill px-3.5 py-2 border-[1.5px]"
              style={{ borderColor: "rgba(255,255,255,0.15)" }}
            >
              <Text className="font-body-bold text-[12px]" style={{ color: colors.text }}>
                Decline
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
    </>
  );
}
