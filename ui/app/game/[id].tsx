import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, Alert, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, LAYOUT, reliabilityLabel } from "../../lib/theme";
import { spotsLeft, type Game } from "../../lib/mockData";
import { openDirections } from "../../lib/directions";
import { useAppStore } from "../../lib/store";
import { nextRebookSlot } from "../../lib/schedule";
import { addGameToCalendar, hasCalendarEvent } from "../../lib/calendar";
import { useGameDetail, useGamePreview } from "../../lib/queries/games";
import { useSession } from "../../lib/session";
import { savePendingPath } from "../../lib/pendingGame";
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
  useWaitlistCount,
  useWaitlistPosition,
} from "../../lib/queries/gamePlayers";
import { Badge } from "../../components/Badge";
import { BackButton } from "../../components/BackButton";
import { Button } from "../../components/Button";
import { HoldButton } from "../../components/HoldButton";
import { CountdownChip } from "../../components/CountdownChip";
import { CourtBackdrop } from "../../components/CourtBackdrop";
import { GameCover } from "../../components/GameCover";
import { StatTile, StatTileRow } from "../../components/StatTile";
import { ListRow } from "../../components/ListRow";
import { Avatar, AvatarStack } from "../../components/Avatar";
import { SwipeToDecide } from "../../components/SwipeToDecide";
import { VettingStrip } from "../../components/VettingStrip";
import { haptics } from "../../lib/haptics";
import { shareGame } from "../../lib/share";
import { track } from "../../lib/analytics";
import { ReservedSpots } from "../../components/ReservedSpots";
import { useReservedSpots, useRespondToGameInvite } from "../../lib/queries/reservedSpots";
import { LineupStrip, lineupSummary, type LineupSlot } from "../../components/LineupStrip";
import { useReduceMotion } from "../../lib/motion";
import { GameDetailSkeleton } from "../../components/Skeleton";

const HERO_HEIGHT = 300;

function avatarUrl(photoPath: string | null | undefined): string | null {
  return photoPath ? supabase.storage.from("avatars").getPublicUrl(photoPath).data.publicUrl : null;
}

function goBack() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/");
  }
}

export default function GameDetails() {
  const { id, focus } = useLocalSearchParams<{ id: string; focus?: string }>();
  const gameId = id ?? "";
  const { session, isLoading: sessionLoading } = useSession();
  const gameQuery = useGameDetail(gameId, !!session);
  const game = gameQuery.data;

  const membershipQuery = useMyMembership(gameId, game?.organizerId);
  const rosterQuery = useGameRoster(session ? gameId : "");
  const requestToJoin = useRequestToJoin(gameId);
  const leaveGame = useLeaveGame(gameId);
  const waitlistPositionQuery = useWaitlistPosition(gameId, membershipQuery.data?.status === "waitlisted");
  const waitlistCountQuery = useWaitlistCount(gameId, !!membershipQuery.data?.isOrganizer);
  const organizerCard = usePlayerCard(game?.organizerId);
  const respondToInvite = useRespondToGameInvite(gameId);
  const reservedSpotsQuery = useReservedSpots(session ? gameId : "");
  const removePlayer = useRemovePlayer(gameId);
  const reduceMotion = useReduceMotion();
  const { width: windowWidth } = useWindowDimensions();
  const [onCalendar, setOnCalendar] = useState(false);

  // A join_request push deep-links here with ?focus=requests (docs/notifications-plan.md §7):
  // the requests list sits well below the hero, so landing at the top hides the one thing the
  // notification asked the host to do. Scrolls once, after the section reports its position.
  // A reserved-spot invite link now lands on its own claim screen (/game/claim/[token], band 12
  // of create-game-plan.md) rather than being redeemed silently here — this page no longer
  // parses an ?invite= param at all.
  const viewedTracked = useRef(false);
  useEffect(() => {
    if (!game || viewedTracked.current) return;
    viewedTracked.current = true;
    track("game_viewed", { game_id: gameId, source: focus ? "push" : "discover" });
  }, [game]);

  const scrollRef = useRef<ScrollView>(null);
  const focusedRequests = useRef(false);
  const scrollToRequests = (y: number) => {
    if (focus !== "requests" || focusedRequests.current) return;
    focusedRequests.current = true;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
  };

  useEffect(() => {
    if (!gameId || !session) return;
    hasCalendarEvent(gameId).then(setOnCalendar);
  }, [gameId, session]);

  useEffect(() => {
    if (!sessionLoading && !session && gameId) savePendingPath(`/game/${gameId}`);
  }, [sessionLoading, session, gameId]);

  if (sessionLoading || (session && gameQuery.isLoading)) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.base }}>
        <LinearGradient colors={["#1F1F24", "#141416"]} style={{ height: 150, paddingTop: 56 }}>
          <View className="px-4">
            <BackButton dark onPress={goBack} />
          </View>
        </LinearGradient>
        <GameDetailSkeleton />
      </View>
    );
  }

  if (!session) {
    return <GamePreviewTeaser gameId={gameId} />;
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
    Alert.alert("Leave this game?", "You'll lose your spot, and might need to ask to rejoin.", [
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

  // G8 (quick-wins.md §3.2): reuses Rebook's exact seed shape (my-games/past.tsx handleRebook)
  // so hosts don't re-key a weekly game by hand — only the entry point (an upcoming/live game
  // instead of a past one) and the "duplicate" framing differ.
  const handleDuplicate = () => {
    haptics.tap();
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

  const confirmLeaveWaitlist = () => {
    Alert.alert("Leave the waitlist?", "You'll lose your spot in the queue — you can join it again later.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave waitlist",
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

  // Lineup slots: host, then joins in join order, then holds, then open — stable order, never
  // re-sorts (create-game-plan.md §4.5).
  const named = reservedSpotsQuery.data ?? [];
  const namedSlots: LineupSlot[] = named.map((s) => ({
    kind: "named",
    id: s.id,
    label: s.claimedName ?? s.invitedName ?? s.label,
    claimed: !!s.claimedBy,
    invitedProfileId: s.invitedProfileId,
    avatarKey: s.invitedAvatarKey,
    photoUri: s.invitedPhotoUri,
    expiringSoon: !s.pinned && !!s.expiresAt && new Date(s.expiresAt).getTime() - Date.now() <= 2 * 60 * 60 * 1000 && new Date(s.expiresAt).getTime() > Date.now(),
  }));
  const joinedSlots: LineupSlot[] = joined.map((p) => ({ kind: "joined", id: p.id, name: p.name, avatarKey: p.avatarKey, photoUri: p.photoUri }));
  const anonCount = Math.max(0, game.reservedSpots - named.length);
  const anonSlots: LineupSlot[] = Array.from({ length: anonCount }, (_, i) => ({ kind: "anon", id: `anon-${i}` }));
  const filledForStrip = 1 + joinedSlots.length + namedSlots.length + anonSlots.length;
  const openSlots: LineupSlot[] = cancelled ? [] : Array.from({ length: Math.max(0, game.maxPlayers - filledForStrip) }, (_, i) => ({ kind: "open", id: `open-${i}` }));
  const lineupSlots: LineupSlot[] = [
    { kind: "host", id: game.organizerId, name: organizer?.displayName || game.organizerName || "Host", avatarKey: organizer?.avatarKey },
    ...joinedSlots,
    ...namedSlots,
    ...anonSlots,
    ...openSlots,
  ];

  return (
    <View className="flex-1" style={{ backgroundColor: colors.base }}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Anchor (docs/v2-design-plan.md §4.3): the one hero on this screen. */}
        <View style={{ height: HERO_HEIGHT, backgroundColor: colors.surface, overflow: "hidden" }}>
          <View pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
            {game.coverKey && game.coverKey !== "auto" ? (
              <GameCover coverKey={game.coverKey} size="hero" scrim />
            ) : (
              <CourtBackdrop reduceMotion={!!reduceMotion} size={{ width: windowWidth, height: HERO_HEIGHT }} />
            )}
          </View>

          <View className="px-4 flex-row justify-between items-center" style={{ paddingTop: 56 }}>
            <BackButton dark onPress={goBack} />
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
                  ? "You cancelled this game. Everyone who joined has been let know."
                  : "The host cancelled this game. Your spot's been freed up."}
              </Text>
            </View>
          )}

          <View className="flex-row items-center justify-between mb-4">
            {joined.length > 0 ? <AvatarStack people={joined} max={5} /> : <View />}
            {!cancelled && (
              <Text className="font-body-bold text-[13px]" style={{ color: full ? colors.danger : colors.textSecondary }}>
                {full ? "Full" : `${open} ${open === 1 ? "spot" : "spots"} left`} · {game.joinedCount + 1}/{game.maxPlayers} joined
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
                <Avatar
                  id={organizer.id}
                  name={organizer.displayName}
                  color={colors.surfaceAlt}
                  photoUri={organizer.photoPath ? supabase.storage.from("avatars").getPublicUrl(organizer.photoPath).data.publicUrl : null}
                  avatarKey={organizer.avatarKey}
                  size={36}
                />
                <View className="flex-1 min-w-0">
                  <Text numberOfLines={1} className="font-body-semibold text-[13.5px]" style={{ color: colors.text }}>
                    {organizer.displayName} · Host
                  </Text>
                  <Text numberOfLines={1} className="text-[11.5px] mt-0.5" style={{ color: colors.textSecondary }}>
                    {organizer.reliabilityScore != null
                      ? `Reliability ${organizer.reliabilityScore} · ${reliabilityLabel(organizer.reliabilityScore)}`
                      : "Reliability hidden by this host"}
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
            <ListRow title="Share game link" accessory="chevron" divider={isOrganizer && !cancelled} onPress={() => shareGame(game)} />
            {isOrganizer && !cancelled && (
              <ListRow title="Duplicate this game" accessory="chevron" divider={false} onPress={handleDuplicate} />
            )}
          </View>

          {isOrganizer && !cancelled && <JoinRequests gameId={gameId} full={full} onLayoutY={scrollToRequests} />}

          {/* Lineup strip (create-game-plan.md §4.4/§4.5): the host is slot one, not a separate
              card above a roster that doesn't contain them. Same component as the draft card's
              WHO row. Filled/held management still lives in ReservedSpots below — this is the
              at-a-glance read; that's the action surface. */}
          <View className="flex-row items-center justify-between mt-5.5 mb-2.5">
            <Text className="font-body-extrabold text-[13px] uppercase tracking-wide" style={{ color: colors.textTertiary }}>
              Lineup
            </Text>
            {isOrganizer && !cancelled && !!waitlistCountQuery.data && (
              <Text className="text-[12px] font-body-semibold" style={{ color: colors.textTertiary }}>
                {waitlistCountQuery.data} on waitlist
              </Text>
            )}
          </View>
          <LineupStrip
            slots={lineupSlots}
            courtsBooked={game.courtsBooked}
            onExpand={() => scrollRef.current?.scrollTo({ y: 999999, animated: true })}
            onTapSlot={(slot) => {
              if (slot.kind !== "host" && slot.kind !== "joined") return;
              if (slot.kind === "joined" && isOrganizer && !cancelled) {
                Alert.alert(slot.name, undefined, [
                  { text: "View profile", onPress: () => router.push(`/player/${slot.id}`) },
                  {
                    text: "Remove from game",
                    style: "destructive",
                    onPress: () =>
                      Alert.alert(`Remove ${slot.name}?`, "They'll be let know and their spot opens back up.", [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Remove",
                          style: "destructive",
                          onPress: () => {
                            haptics.tap();
                            removePlayer.mutate(slot.id, {
                              onError: (e) => Alert.alert("Couldn't remove player", e instanceof Error ? e.message : "Give it another go."),
                            });
                          },
                        },
                      ]),
                  },
                  { text: "Cancel", style: "cancel" },
                ]);
                return;
              }
              router.push(`/player/${slot.id}`);
            }}
          />
          <Text className="text-[12px] mt-2.5" style={{ color: cancelled ? colors.textMuted : colors.textSecondary }}>
            {lineupSummary(lineupSlots, perPlayer)}
          </Text>

          {!!session && (
            <ReservedSpots gameId={gameId} isOrganizer={isOrganizer} reservedSpots={game.reservedSpots} cancelled={cancelled} />
          )}

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
        ) : membership?.status === "invited" ? (
          // D10: the host held a spot with this player's name on it. They owe money for it, so
          // they answer — nobody is silently enrolled.
          <View className="flex-row gap-2.5">
            <View className="flex-1">
              <Button
                testID="game-invite-decline"
                label="Decline"
                variant="secondary"
                onPress={() =>
                  respondToInvite.mutate(false, {
                    onError: (err) => Alert.alert("Couldn't decline", err instanceof Error ? err.message : "Give it another go."),
                  })
                }
              />
            </View>
            <View className="flex-1">
              <Button
                testID="game-invite-accept"
                label={`Take my spot · $${perPlayer}`}
                loading={respondToInvite.isPending}
                onPress={() =>
                  respondToInvite.mutate(true, {
                    onError: (err) => Alert.alert("Couldn't accept", err instanceof Error ? err.message : "Give it another go."),
                  })
                }
              />
            </View>
          </View>
        ) : membership?.status === "requested" ? (
          <Button testID="game-cta" label="Request sent" variant="secondary" disabled />
        ) : membership?.status === "waitlisted" ? (
          <Button
            testID="game-cta"
            label={waitlistPositionQuery.data ? `On the waitlist · #${waitlistPositionQuery.data}` : "On the waitlist"}
            variant="secondary"
            loading={leaveGame.isPending}
            onPress={confirmLeaveWaitlist}
          />
        ) : full ? (
          <HoldButton
            testID="game-cta"
            label="Hold to join waitlist"
            completeLabel="You're on the list"
            sfx="chime"
            onComplete={() => {
              requestToJoin.mutate(
                { waitlisted: true },
                { onError: () => Alert.alert("Couldn't join the waitlist", "Give it another go.") }
              );
            }}
          />
        ) : (
          <HoldButton
            testID="game-cta"
            label={`Hold to join · $${perPlayer}`}
            completeLabel="Request sent"
            sfx="chime"
            onComplete={() => {
              requestToJoin.mutate(
                { waitlisted: false },
                { onError: () => Alert.alert("Couldn't send request", "Give it another go.") }
              );
            }}
          />
        )}
      </View>
    </View>
  );
}

// Shown for a shared game link opened while logged out (see AGENTS.md re: private beta —
// full detail, roster, and organizer identity stay behind login; this is deliberately thin).
function GamePreviewTeaser({ gameId }: { gameId: string }) {
  const previewQuery = useGamePreview(gameId, true);
  const preview = previewQuery.data;

  const goToLogin = () => {
    haptics.tap();
    router.push("/onboarding");
  };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.base }}>
      <LinearGradient colors={["#1F1F24", "#141416"]} style={{ paddingTop: 56, paddingBottom: 20 }}>
        <View className="px-4">
          <BackButton dark onPress={goBack} />
        </View>
      </LinearGradient>

      <View className="flex-1 px-5 pt-6">
        {previewQuery.isLoading ? (
          <GameDetailSkeleton />
        ) : !preview || preview.status === "cancelled" ? (
          <Text style={{ color: colors.textSecondary }}>Game not found</Text>
        ) : (
          <>
            <Text className="font-display text-[27px]" style={{ color: colors.text }}>
              {preview.venue}
            </Text>
            <Text className="text-[14px] mt-1" style={{ color: colors.textDim }}>
              {preview.suburb} · {preview.date} · {preview.time}
            </Text>

            <StatTileRow>
              <StatTile value={`$${preview.costCents / 100}`} label="per player" tone={colors.accent} />
              <StatTile value={`${preview.maxPlayers}`} label="max players" />
              <StatTile value={preview.skill} label="skill level" small />
            </StatTileRow>

            <Text className="text-[14.5px] mt-6" style={{ color: colors.textSecondary, lineHeight: 21 }}>
              Log in or create an account to see who's playing, chat, and join in.
            </Text>
          </>
        )}
      </View>

      <View className="px-5 pb-8 pt-3.5" style={{ backgroundColor: colors.base }}>
        <Button label="Log in / Create account" onPress={goToLogin} />
      </View>
    </View>
  );
}

function JoinRequests({
  gameId,
  full,
  onLayoutY,
}: {
  gameId: string;
  full: boolean;
  onLayoutY: (y: number) => void;
}) {
  const requestsQuery = useJoinRequests(gameId);
  const decide = useDecideJoinRequest(gameId);
  const requests = requestsQuery.data ?? [];

  if (requests.length === 0) return null;

  return (
    <View onLayout={(e) => onLayoutY(e.nativeEvent.layout.y)}>
      <Text className="font-body-extrabold text-[13px] uppercase tracking-wide mt-5.5" style={{ color: colors.textTertiary }}>
        Join requests ({requests.length})
      </Text>
      <Text className="text-[12px] mb-2.5" style={{ color: colors.textMuted }}>
        Swipe a request right to approve, left to decline
      </Text>
      {full && (
        <Text className="text-[13.5px] mb-2.5" style={{ color: colors.advanced }}>
          Your game's full. Raise max players in Edit, or decline these requests.
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
                { onError: (e) => Alert.alert("Couldn't approve", e instanceof Error ? e.message : "Give it another go.") }
              )
            }
            onDecline={() => decide.mutate({ profileId: r.profileId, approve: false })}
          >
            <View
              className="flex-row items-center gap-3 rounded-xl p-3 border"
              style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}
            >
              <Pressable onPress={() => router.push(`/player/${r.profileId}`)}>
                <Avatar id={r.profileId} name={r.name} color={r.color} size={36} />
              </Pressable>
              <Pressable className="flex-1" onPress={() => router.push(`/player/${r.profileId}`)}>
                <Text className="font-body-semibold text-[14.5px]" style={{ color: colors.text }}>
                  {r.name}
                </Text>
                <VettingStrip profileId={r.profileId} />
              </Pressable>
              <Pressable
                testID={`game-approve-${r.profileId}`}
                onPress={() => {
                  if (full) {
                    Alert.alert("Game's full", "Raise max players in Edit before approving anyone else.");
                    return;
                  }
                  haptics.tap();
                  decide.mutate(
                    { profileId: r.profileId, approve: true },
                    { onError: (e) => Alert.alert("Couldn't approve", e instanceof Error ? e.message : "Give it another go.") }
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
                testID={`game-decline-${r.profileId}`}
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
    </View>
  );
}
