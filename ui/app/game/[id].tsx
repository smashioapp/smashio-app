import { View, Text, Pressable, ScrollView, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, gradients, initial } from "../../lib/theme";
import { spotsLeft, type Game } from "../../lib/mockData";
import { openDirections } from "../../lib/directions";
import { addGameToCalendar } from "../../lib/calendar";
import { useGameDetail } from "../../lib/queries/games";
import {
  useDecideJoinRequest,
  useGameRoster,
  useJoinRequests,
  useLeaveGame,
  useMyMembership,
  useRemovePlayer,
  useRequestToJoin,
} from "../../lib/queries/gamePlayers";
import { Badge } from "../../components/Badge";
import { SkillPill } from "../../components/SkillPill";
import { BackButton } from "../../components/BackButton";
import { Button } from "../../components/Button";
import { HoldButton } from "../../components/HoldButton";
import { CountdownChip } from "../../components/CountdownChip";
import { SwipeToDecide } from "../../components/SwipeToDecide";
import { VettingStrip } from "../../components/VettingStrip";
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

  const perPlayer = game.cost;
  const joined = rosterQuery.data ?? [];
  const membership = membershipQuery.data;
  const isOrganizer = membership?.isOrganizer ?? false;
  const cancelled = game.status === "cancelled";
  const open = spotsLeft(game);
  const full = open === 0;

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
            <View className="flex-row items-center gap-2">
              {isOrganizer && !cancelled && (
                <Pressable
                  onPress={() => {
                    haptics.tap();
                    router.push(`/game/edit/${game.id}`);
                  }}
                  className="flex-row items-center gap-1.5 h-9 px-3.5 rounded-pill"
                  style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
                >
                  <Ionicons name="create-outline" size={15} color={colors.text} />
                  <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
                    Edit
                  </Text>
                </Pressable>
              )}
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
          </View>
        </LinearGradient>

        <View className="px-5 pt-4.5">
          {cancelled && (
            <View
              className="flex-row items-start gap-2.5 rounded-2xl p-3.5 mb-4 border"
              style={{ backgroundColor: "rgba(255,103,103,0.1)", borderColor: "rgba(255,103,103,0.3)" }}
            >
              <Ionicons name="close-circle-outline" size={17} color={colors.danger} style={{ marginTop: 1 }} />
              <Text className="flex-1 text-[14px]" style={{ color: colors.danger }}>
                {isOrganizer
                  ? "You cancelled this game. Everyone who joined has been notified."
                  : "The host cancelled this game. Your spot has been released."}
              </Text>
            </View>
          )}

          <View className="flex-row justify-between items-start">
            <Text className="font-display text-[22.5px] flex-1 pr-3" style={{ color: colors.text }}>
              {game.venue}
            </Text>
            {cancelled ? (
              <Badge state="cancelled" label="Cancelled" />
            ) : (
              game.verificationStatus !== "none" && (
                <Badge state={game.verified ? "verified" : "pending"} label={game.verified ? "Verified" : "Pending"} />
              )
            )}
          </View>
          <View className="flex-row items-center justify-between mt-1">
            <Text className="text-[14.5px]" style={{ color: colors.textTertiary }}>
              {game.suburb}
              {game.courts ? ` · ${game.courts}` : ""}
            </Text>
            {!cancelled && <CountdownChip startsAt={game.startsAt} />}
          </View>

          <Pressable
            onPress={() => {
              haptics.tap();
              openDirections(game);
            }}
            className="flex-row items-center gap-3 rounded-2xl px-3.5 py-3 mt-3.5 border"
            style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}
          >
            <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: "rgba(214,255,63,0.12)" }}>
              <Ionicons name="navigate" size={16} color={colors.accent} />
            </View>
            <View className="flex-1">
              <Text className="font-body-semibold text-[14.5px]" style={{ color: colors.text }} numberOfLines={2}>
                {game.venueAddress ?? game.suburb}
              </Text>
              <Text className="text-[13px] mt-0.5" style={{ color: colors.textTertiary }}>
                Tap for directions
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
          </Pressable>

          {game.venueId && (
            <Pressable
              onPress={() => {
                haptics.tap();
                router.push(`/venue/${game.venueId}`);
              }}
              className="flex-row items-center gap-3 rounded-2xl px-3.5 py-3 mt-2 border"
              style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}
            >
              <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: "rgba(214,255,63,0.12)" }}>
                <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
              </View>
              <Text className="flex-1 font-body-semibold text-[14.5px]" style={{ color: colors.text }}>
                View venue
              </Text>
              <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
            </Pressable>
          )}

          <View className="flex-row gap-2 mt-2.5">
            <View className="flex-1 rounded-xl px-3.5 py-2.5 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
              <Text className="text-[14.5px] font-body-semibold" style={{ color: colors.text }}>
                {game.date}
              </Text>
            </View>
            <View className="flex-1 rounded-xl px-3.5 py-2.5 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
              <Text className="text-[14.5px] font-body-semibold" style={{ color: colors.text }}>
                {game.time}
              </Text>
            </View>
            <View className="flex-1 items-center justify-center">
              <SkillPill skill={game.skill} />
            </View>
          </View>

          <View className="flex-row items-center justify-between mt-5.5 mb-2.5">
            <Text className="font-body-extrabold text-[13px] uppercase tracking-wide" style={{ color: colors.textTertiary }}>
              Players joined ({game.joinedCount}/{game.maxPlayers})
            </Text>
            {!cancelled && (
              <View
                className="rounded-pill px-2.5 py-1"
                style={{ backgroundColor: full ? "rgba(255,103,103,0.12)" : "rgba(214,255,63,0.12)" }}
              >
                <Text className="font-body-extrabold text-[11.5px] uppercase" style={{ color: full ? colors.danger : colors.accent }}>
                  {full ? "Full" : `${open} ${open === 1 ? "spot" : "spots"} left`}
                </Text>
              </View>
            )}
          </View>
          <View className="flex-row flex-wrap gap-2.5">
            {joined.map((p) => (
              <RosterAvatar key={p.id} gameId={gameId} player={p} canRemove={isOrganizer && !cancelled} />
            ))}
          </View>

          <Text className="font-body-extrabold text-[13px] uppercase tracking-wide mt-5.5 mb-2.5" style={{ color: colors.textTertiary }}>
            Cost
          </Text>
          <View className="rounded-2xl p-4 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
            <View className="flex-row justify-between mb-2">
              <Text className="text-[14.5px]" style={{ color: colors.textSecondary }}>
                {game.courtsBooked} {game.courtsBooked === 1 ? "court" : "courts"} · {game.durationHours}h booking
              </Text>
              <Text className="text-[14.5px] font-body-bold" style={{ color: colors.text }}>
                ${perPlayer} / player
              </Text>
            </View>
            <View className="flex-row justify-between mb-2.5">
              <Text className="text-[14.5px]" style={{ color: colors.textSecondary }}>
                If full · {game.maxPlayers} players
              </Text>
              <Text className="text-[14.5px] font-body-bold" style={{ color: colors.text }}>
                ${perPlayer * game.maxPlayers}
              </Text>
            </View>
            <View className="rounded-xl p-3 flex-row justify-between items-center" style={{ backgroundColor: "rgba(214,255,63,0.1)" }}>
              <Text className="text-[14.5px] font-body-bold" style={{ color: colors.accent }}>
                Your share
              </Text>
              <Text className="font-display-bold text-[20px]" style={{ color: colors.accent }}>
                ${perPlayer}
              </Text>
            </View>
          </View>

          {isOrganizer && !cancelled && <JoinRequests gameId={gameId} full={full} />}
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
          {cancelled ? (
            <Button label="Game cancelled" variant="secondary" disabled />
          ) : isOrganizer ? (
            <Button label="Manage this game" variant="secondary" onPress={() => router.push(`/game/edit/${game.id}`)} />
          ) : membership?.status === "approved" ? (
            <Button label="Leave game" variant="secondary" loading={leaveGame.isPending} onPress={confirmLeave} />
          ) : membership?.status === "requested" ? (
            <Button label="Request sent" variant="secondary" disabled />
          ) : full ? (
            <Button label="Game full" variant="secondary" disabled />
          ) : (
            <HoldButton
              label={`Hold to join · $${perPlayer}`}
              completeLabel="Request sent"
              sfx="chime"
              onComplete={() => {
                requestToJoin.mutate(undefined, {
                  onSuccess: () => addGameToCalendar(game, { silent: true }).catch(() => {}),
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

function RosterAvatar({
  gameId,
  player,
  canRemove,
}: {
  gameId: string;
  player: { id: string; name: string; color: string };
  canRemove: boolean;
}) {
  const removePlayer = useRemovePlayer(gameId);

  const confirmRemove = () => {
    if (!canRemove) return;
    Alert.alert(`Remove ${player.name}?`, "They'll be notified and their spot opens back up.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          haptics.tap();
          removePlayer.mutate(player.id, {
            onError: (e) => Alert.alert("Couldn't remove player", e instanceof Error ? e.message : "Try again."),
          });
        },
      },
    ]);
  };

  return (
    <Pressable
      onPress={() => router.push(`/player/${player.id}`)}
      onLongPress={confirmRemove}
      disabled={removePlayer.isPending}
      className="items-center gap-1.5"
      style={{ width: 52, opacity: removePlayer.isPending ? 0.4 : 1 }}
    >
      <View className="w-[38px] h-[38px] rounded-full items-center justify-center" style={{ backgroundColor: player.color }}>
        <Text style={{ color: colors.base, fontSize: 12, fontWeight: "800" }}>{initial(player.name)}</Text>
      </View>
      <Text className="text-[12px] font-body-semibold" style={{ color: colors.textSecondary }} numberOfLines={1}>
        {player.name}
      </Text>
      {canRemove && (
        <Pressable
          onPress={confirmRemove}
          hitSlop={8}
          className="absolute w-[18px] h-[18px] rounded-full items-center justify-center border"
          style={{ top: -2, right: 3, backgroundColor: colors.surfaceAlt, borderColor: colors.cardBorder }}
        >
          <Ionicons name="close" size={11} color={colors.danger} />
        </Pressable>
      )}
    </Pressable>
  );
}

function JoinRequests({ gameId, full }: { gameId: string; full: boolean }) {
  const requestsQuery = useJoinRequests(gameId);
  const decide = useDecideJoinRequest(gameId);
  const requests = requestsQuery.data ?? [];

  if (requests.length === 0) return null;

  return (
    <>
      <Text className="font-body-extrabold text-[13px] uppercase tracking-wide mt-5.5" style={{ color: colors.textTertiary }}>
        Join requests ({requests.length})
      </Text>
      <Text className="text-[12px] mb-2.5" style={{ color: colors.textMuted }}>
        Swipe a request right to approve, left to decline
      </Text>
      {full && (
        <Text className="text-[13.5px] mb-2.5" style={{ color: colors.advanced }}>
          Your game is full. Raise max players in Edit, or decline these requests.
        </Text>
      )}
      <View className="gap-2.5">
        {requests.map((r) => (
          <SwipeToDecide
            key={r.profileId}
            canApprove={!full}
            onApprove={() =>
              decide.mutate(
                { profileId: r.profileId, approve: true },
                { onError: (e) => Alert.alert("Couldn't approve", e instanceof Error ? e.message : "Try again.") }
              )
            }
            onDecline={() => decide.mutate({ profileId: r.profileId, approve: false })}
          >
            <View
              className="flex-row items-center gap-3 rounded-xl p-3 border"
              style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}
            >
              <Pressable onPress={() => router.push(`/player/${r.profileId}`)}>
                <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: r.color }}>
                  <Text style={{ color: colors.base, fontSize: 12, fontWeight: "800" }}>{initial(r.name)}</Text>
                </View>
              </Pressable>
              <Pressable className="flex-1" onPress={() => router.push(`/player/${r.profileId}`)}>
                <Text className="font-body-semibold text-[14.5px]" style={{ color: colors.text }}>
                  {r.name}
                </Text>
                <VettingStrip profileId={r.profileId} />
              </Pressable>
              <Pressable
                onPress={() => {
                  if (full) {
                    Alert.alert("Game is full", "Raise max players in Edit before approving anyone else.");
                    return;
                  }
                  haptics.tap();
                  decide.mutate(
                    { profileId: r.profileId, approve: true },
                    { onError: (e) => Alert.alert("Couldn't approve", e instanceof Error ? e.message : "Try again.") }
                  );
                }}
                className="rounded-pill px-3.5 py-2"
                style={{ backgroundColor: colors.accent, opacity: full ? 0.4 : 1 }}
              >
                <Text className="font-body-extrabold text-[14px]" style={{ color: colors.base }}>
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
                <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
                  Decline
                </Text>
              </Pressable>
            </View>
          </SwipeToDecide>
        ))}
      </View>
    </>
  );
}
