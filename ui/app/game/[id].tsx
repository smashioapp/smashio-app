import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, Alert, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, LAYOUT, initial, reliabilityLabel } from "../../lib/theme";
import { spotsLeft, type Game } from "../../lib/mockData";
import { openDirections } from "../../lib/directions";
import { addGameToCalendar, hasCalendarEvent } from "../../lib/calendar";
import { useGameDetail } from "../../lib/queries/games";
import { usePlayerCard } from "../../lib/queries/profile";
import { supabase } from "../../lib/supabase";
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
import { BackButton } from "../../components/BackButton";
import { Button } from "../../components/Button";
import { HoldButton } from "../../components/HoldButton";
import { CountdownChip } from "../../components/CountdownChip";
import { CourtBackdrop } from "../../components/CourtBackdrop";
import { StatTile, StatTileRow } from "../../components/StatTile";
import { ListRow } from "../../components/ListRow";
import { AvatarStack } from "../../components/Avatar";
import { SwipeToDecide } from "../../components/SwipeToDecide";
import { VettingStrip } from "../../components/VettingStrip";
import { haptics } from "../../lib/haptics";
import { shareGame } from "../../lib/share";
import { useReduceMotion } from "../../lib/motion";
import { GameDetailSkeleton } from "../../components/Skeleton";

const HERO_HEIGHT = 300;

function avatarUrl(photoPath: string | null | undefined): string | null {
  return photoPath ? supabase.storage.from("avatars").getPublicUrl(photoPath).data.publicUrl : null;
}

export default function GameDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const gameId = id ?? "";
  const gameQuery = useGameDetail(gameId);
  const game = gameQuery.data;

  const membershipQuery = useMyMembership(gameId, game?.organizerId);
  const rosterQuery = useGameRoster(gameId);
  const requestToJoin = useRequestToJoin(gameId);
  const leaveGame = useLeaveGame(gameId);
  const organizerCard = usePlayerCard(game?.organizerId);
  const reduceMotion = useReduceMotion();
  const { width: windowWidth } = useWindowDimensions();
  const [onCalendar, setOnCalendar] = useState(false);

  useEffect(() => {
    if (!gameId) return;
    hasCalendarEvent(gameId).then(setOnCalendar);
  }, [gameId]);

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

  const heroSubtitle = [game.courts, game.date === "Today" ? `${game.date}, ${game.time}` : `${game.date} · ${game.time}`]
    .filter(Boolean)
    .join(" · ");
  const organizer = organizerCard.data;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.base }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Anchor (docs/v2-design-plan.md §4.3): the one hero on this screen. */}
        <View style={{ height: HERO_HEIGHT, backgroundColor: colors.surface, overflow: "hidden" }}>
          <View pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
            <CourtBackdrop reduceMotion={!!reduceMotion} size={{ width: windowWidth, height: HERO_HEIGHT }} />
          </View>

          <View className="px-4 flex-row justify-between items-center" style={{ paddingTop: 56 }}>
            <BackButton dark onPress={() => router.back()} />
            <View className="flex-row items-center gap-2">
              {isOrganizer && !cancelled && (
                <Pressable
                  onPress={() => {
                    haptics.tap();
                    router.push(`/game/edit/${game.id}`);
                  }}
                  className="w-9 h-9 rounded-full items-center justify-center"
                  style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
                >
                  <Ionicons name="create-outline" size={16} color="#fff" />
                </Pressable>
              )}
              <Pressable
                onPress={() => {
                  haptics.tap();
                  shareGame(game);
                }}
                className="w-9 h-9 rounded-full items-center justify-center"
                style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
              >
                <Ionicons name="share-outline" size={16} color="#fff" />
              </Pressable>
            </View>
          </View>

          <View className="px-5" style={{ position: "absolute", left: 0, right: 0, bottom: 20 }}>
            <View className="flex-row items-center justify-between mb-2">
              {cancelled ? <Badge state="cancelled" label="Cancelled" /> : <CountdownChip startsAt={game.startsAt} />}
              {!cancelled && game.verificationStatus !== "none" && (
                <Badge state={game.verified ? "verified" : "pending"} label={game.verified ? "Verified" : "Pending"} />
              )}
            </View>
            <Text numberOfLines={1} className="font-display text-[27px]" style={{ color: colors.text }}>
              {game.venue}
            </Text>
            <Text numberOfLines={1} className="text-[14px] mt-0.5" style={{ color: colors.textDim }}>
              {heroSubtitle}
            </Text>
          </View>
        </View>

        <View className="px-5 pt-4">
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

          <View className="flex-row items-center justify-between mb-4">
            {joined.length > 0 ? <AvatarStack people={joined} max={5} /> : <View />}
            {!cancelled && (
              <Text className="font-body-bold text-[13px]" style={{ color: full ? colors.danger : colors.textSecondary }}>
                {full ? "Full" : `${open} ${open === 1 ? "spot" : "spots"} left`} · {game.joinedCount}/{game.maxPlayers} joined
              </Text>
            )}
          </View>

          <StatTileRow>
            <StatTile value={`$${perPlayer}`} label="per player" tone={colors.accent} />
            <StatTile value={full ? "Full" : `${open}`} label="spots left" tone={full ? colors.danger : undefined} />
            <StatTile value={game.skill} label="skill level" small />
          </StatTileRow>

          <View className="mt-5">
            {organizer && !isOrganizer && (
              <View className="flex-row items-center gap-2.5" style={{ paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: LAYOUT.HAIRLINE }}>
                <View className="w-9 h-9 rounded-full items-center justify-center overflow-hidden" style={{ backgroundColor: colors.surfaceAlt }}>
                  <Text style={{ color: colors.text, fontSize: 12, fontWeight: "800" }}>{initial(organizer.displayName)}</Text>
                </View>
                <View className="flex-1 min-w-0">
                  <Text numberOfLines={1} className="font-body-semibold text-[13.5px]" style={{ color: colors.text }}>
                    {organizer.displayName} · Host
                  </Text>
                  <Text numberOfLines={1} className="text-[11.5px] mt-0.5" style={{ color: colors.textSecondary }}>
                    Reliability {organizer.reliabilityScore} · {reliabilityLabel(organizer.reliabilityScore)}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    haptics.tap();
                    router.push(`/chat/${game.id}`);
                  }}
                  className="rounded-pill px-3 py-1.5 border"
                  style={{ borderColor: colors.cardBorder }}
                >
                  <Text className="font-body-bold text-[12px]" style={{ color: colors.textDim }}>
                    Message
                  </Text>
                </Pressable>
              </View>
            )}

            <ListRow
              title="View venue & get directions"
              accessory="chevron"
              onPress={() => {
                if (game.venueId) router.push(`/venue/${game.venueId}`);
                else openDirections(game);
              }}
            />
            <ListRow title="Open chat" accessory="chevron" onPress={() => router.push(`/chat/${game.id}`)} />
            {(isOrganizer || membership?.status === "approved") && (
              <ListRow
                title={onCalendar ? "On your calendar · Change" : "Add to calendar"}
                accessory="chevron"
                onPress={() => {
                  haptics.tap();
                  addGameToCalendar(game, organizer?.displayName).then(() => hasCalendarEvent(gameId).then(setOnCalendar));
                }}
              />
            )}
            <ListRow title="Share game link" accessory="chevron" divider={false} onPress={() => shareGame(game)} />
          </View>

          {isOrganizer && !cancelled && <JoinRequests gameId={gameId} full={full} />}

          <Text className="font-body-extrabold text-[13px] uppercase tracking-wide mt-5.5 mb-2.5" style={{ color: colors.textTertiary }}>
            Players joined ({game.joinedCount}/{game.maxPlayers})
          </Text>
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
        </View>
      </ScrollView>

      {/* Fixed bottom pill (docs/v2-design-plan.md §4.3) — full-width now that chat is a
          ListRow above; the old floating chat button next to it is gone. */}
      <View className="px-5 pb-8 pt-3.5" style={{ backgroundColor: colors.base }}>
        {cancelled ? (
          <Button testID="game-cta" label="Game cancelled" variant="secondary" disabled />
        ) : isOrganizer ? (
          <Button testID="game-cta" label="Manage this game" variant="secondary" onPress={() => router.push(`/game/edit/${game.id}`)} />
        ) : membership?.status === "approved" ? (
          <Button testID="game-cta" label="Leave game" variant="secondary" loading={leaveGame.isPending} onPress={confirmLeave} />
        ) : membership?.status === "requested" ? (
          <Button testID="game-cta" label="Request sent" variant="secondary" disabled />
        ) : full ? (
          <Button testID="game-cta" label="Game full" variant="secondary" disabled />
        ) : (
          <HoldButton
            testID="game-cta"
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
