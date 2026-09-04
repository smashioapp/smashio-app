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
import { useAttendanceMarkedAt, useGameDetail, useGamePreview } from "../../lib/queries/games";
import { useMyRatedGameIds } from "../../lib/queries/ratings";
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
import { CourtBackdrop } from "../../components/CourtBackdrop";
import { GameCover } from "../../components/GameCover";
import { StatTile, StatTileRow } from "../../components/StatTile";
import { Avatar } from "../../components/Avatar";
import { SwipeToDecide } from "../../components/SwipeToDecide";
import { VettingStrip } from "../../components/VettingStrip";
import { haptics } from "../../lib/haptics";
import { copyGameLinkForWhatsApp, shareGame } from "../../lib/share";
import { track } from "../../lib/analytics";
import { ReservedSpots } from "../../components/ReservedSpots";
import { InviteCoplayerSheet } from "../../components/InviteCoplayerSheet";
import { useReservedSpots, useRespondToGameInvite } from "../../lib/queries/reservedSpots";
import { LineupStrip, lineupSummary, type LineupSlot } from "../../components/LineupStrip";
import { useReduceMotion } from "../../lib/motion";
import { GameDetailSkeleton } from "../../components/Skeleton";
import { StatusBand, gameMode } from "../../components/StatusBand";
import { GamePitch } from "../../components/GamePitch";
import { VenueDetailCard } from "../../components/VenueDetailCard";
import { ChatPreviewStrip } from "../../components/ChatPreviewStrip";
import { UtilityChipRow } from "../../components/UtilityChipRow";
import { VerifiedSheet } from "../../components/VerifiedSheet";
import { ReportSheet } from "../../components/ReportSheet";
import { Sheet } from "../../components/Sheet";
import { useUserLocation } from "../../lib/location";
import { haversineMeters, formatDistance } from "../../lib/format";
import { useDistanceUnits } from "../../lib/queries/settings";
import { useDiscoverGames } from "../../lib/queries/games";

const HERO_HEIGHT = 300;

function goBack() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/");
  }
}

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View className="flex-row items-center justify-between mt-5.5 mb-2.5">
      <Text className="font-body-extrabold text-[13px] uppercase tracking-wide" style={{ color: colors.textTertiary }}>
        {children}
      </Text>
      {right}
    </View>
  );
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
  const [verifiedSheetOpen, setVerifiedSheetOpen] = useState(false);
  const [reportSheetOpen, setReportSheetOpen] = useState(false);
  const [leaveSheetOpen, setLeaveSheetOpen] = useState(false);
  const [similarSheetOpen, setSimilarSheetOpen] = useState(false);
  const [invitePastOpen, setInvitePastOpen] = useState(false);
  const distanceUnits = useDistanceUnits();
  const location = useUserLocation();

  const mode = game ? gameMode(game) : "upcoming";
  const attendanceQuery = useAttendanceMarkedAt(gameId, mode === "done");
  const ratedIdsQuery = useMyRatedGameIds(mode === "done" ? [gameId] : []);
  const rated = ratedIdsQuery.data?.has(gameId) ?? false;

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
      <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: colors.base }}>
        <Ionicons name="alert-circle-outline" size={28} color={colors.textTertiary} />
        <Text className="font-display text-[18px] mt-3" style={{ color: colors.text }}>
          This game's gone
        </Text>
        <Text className="text-[13.5px] text-center mt-1.5" style={{ color: colors.textSecondary }}>
          The host may have deleted it, or the link's out of date. No worries, try Discover instead.
        </Text>
        <View className="mt-5 self-stretch">
          <Button label="Back to Discover" variant="secondary" onPress={() => router.replace("/(tabs)/discover")} />
        </View>
      </View>
    );
  }

  const perPlayer = game.cost;
  const joined = rosterQuery.data ?? [];
  const membership = membershipQuery.data;
  const isOrganizer = membership?.isOrganizer ?? false;
  const cancelled = mode === "cancelled";
  const open = spotsLeft(game);
  const full = open === 0;
  const distanceM =
    game.venueLat != null && game.venueLng != null ? haversineMeters(location.lat, location.lng, game.venueLat, game.venueLng) : null;

  const confirmLeave = () => {
    haptics.tap();
    setLeaveSheetOpen(true);
  };

  // G8 (quick-wins.md §3.2): reuses Rebook's exact seed shape (my-games/past.tsx handleRebook)
  // so hosts don't re-key a weekly game by hand — only the entry point (an upcoming/live game
  // instead of a past one) and the "duplicate" framing differ.
  const seedRebook = () => {
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
  };

  const handleDuplicate = () => {
    haptics.tap();
    seedRebook();
    router.push("/wizard");
  };

  const handleRebook = () => {
    haptics.tap();
    seedRebook();
    router.replace("/wizard");
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

  const heldCount = Math.max(0, game.reservedSpots - game.reservedClaimed);
  const daysOut = Math.max(1, Math.ceil((new Date(game.startsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
  const covered = perPlayer * (joined.length + 1);
  const totalCost = perPlayer * game.maxPlayers;
  const shortfall = Math.max(0, totalCost - covered);

  const showHostJob = isOrganizer && !cancelled && (mode === "upcoming" || mode === "imminent" || mode === "live");
  const showDoneRecap = isOrganizer && mode === "done" && !attendanceQuery.data;
  const hostName = organizer?.displayName || game.organizerName || "The host";

  return (
    <View className="flex-1" style={{ backgroundColor: colors.base }}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Anchor (docs/v2-design-plan.md §4.3): the one hero on this screen. Design redesign
            (Prompt 7a): only back + share live in the hero, everything else moved to the
            utility row lower on the page. */}
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

          <View className="px-5" style={{ position: "absolute", left: 0, right: 0, bottom: 20 }}>
            <View className="flex-row items-center justify-between mb-2">
              {cancelled ? (
                <Badge state="cancelled" label="Cancelled" />
              ) : (
                <View />
              )}
              {!cancelled && game.verificationStatus !== "none" && (
                <Pressable
                  onPress={() => {
                    haptics.tap();
                    setVerifiedSheetOpen(true);
                  }}
                >
                  <Badge state={game.verified ? "verified" : "pending"} label={game.verified ? "Verified" : "Pending"} />
                </Pressable>
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

        <View className="px-5 pt-4" style={{ gap: 0 }}>
          <StatusBand
            mode={mode}
            startsAt={game.startsAt}
            endsAt={game.endsAt}
            courts={game.courts}
            distanceM={distanceM}
            doneAt={game.endsAt}
          />

          {cancelled && (
            <View
              className="flex-row items-start gap-2.5 rounded-2xl p-3.5 mt-3 border"
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

          {showHostJob && (
            <View className="mt-3">
              <View
                className="rounded-2xl p-4 border"
                style={{ borderColor: "rgba(214,255,63,0.25)", backgroundColor: colors.card }}
              >
                <Text className="font-body-bold text-[15px]" style={{ color: colors.accent3 }}>
                  {open > 0 ? `${open} ${open === 1 ? "spot" : "spots"} to fill, ${daysOut} ${daysOut === 1 ? "day" : "days"} out` : "Full house"}
                </Text>
                <Text className="text-[12.5px] mt-1" style={{ color: colors.textSecondary }}>
                  {joined.length + 1} of {game.maxPlayers} in{heldCount > 0 ? `, ${heldCount} held` : ""}
                </Text>
              </View>
              <View className="flex-row flex-wrap gap-2 mt-2.5">
                <Pressable
                  className="flex-row items-center gap-1.5 rounded-pill px-3 py-2 border"
                  style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder }}
                  onPress={() => {
                    haptics.tap();
                    shareGame(game);
                  }}
                >
                  <Ionicons name="share-outline" size={13} color={colors.textSecondary} />
                  <Text className="font-body-bold text-[11.5px]" style={{ color: colors.textSecondary }}>
                    Share link
                  </Text>
                </Pressable>
                <Pressable
                  className="flex-row items-center gap-1.5 rounded-pill px-3 py-2 border"
                  style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder }}
                  onPress={() => {
                    haptics.tap();
                    setInvitePastOpen(true);
                  }}
                >
                  <Ionicons name="people-outline" size={13} color={colors.textSecondary} />
                  <Text className="font-body-bold text-[11.5px]" style={{ color: colors.textSecondary }}>
                    Invite from last game
                  </Text>
                </Pressable>
                <Pressable
                  className="flex-row items-center gap-1.5 rounded-pill px-3 py-2 border"
                  style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder }}
                  onPress={() => {
                    haptics.tap();
                    copyGameLinkForWhatsApp(game);
                  }}
                >
                  <Ionicons name="chatbubble-outline" size={13} color={colors.textSecondary} />
                  <Text className="font-body-bold text-[11.5px]" style={{ color: colors.textSecondary }}>
                    Copy for WhatsApp
                  </Text>
                </Pressable>
              </View>
              <JoinRequests gameId={gameId} full={full} onLayoutY={scrollToRequests} />
            </View>
          )}

          {showDoneRecap && (
            <View className="rounded-2xl p-4 mt-3 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
              <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
                Mark who showed
              </Text>
              <Text className="text-[12.5px] mt-1" style={{ color: colors.textSecondary }}>
                Keeps everyone's reliability numbers honest.
              </Text>
            </View>
          )}

          <View className="mt-3.5">
            <GamePitch
              notes={game.notes}
              hostName={hostName}
              format={game.format}
              skill={game.skill}
              skillMax={game.skillTierMax}
              shuttles={game.shuttles}
              courts={game.courts}
              isOrganizer={isOrganizer}
              gameId={gameId}
            />
          </View>

          {/* Lineup strip (create-game-plan.md §4.4/§4.5): the host is slot one, not a separate
              card above a roster that doesn't contain them. Same component as the draft card's
              WHO row. Filled/held management still lives in ReservedSpots below — this is the
              at-a-glance read; that's the action surface. */}
          <SectionLabel
            right={
              !cancelled ? (
                <Text className="text-[11px] font-body-semibold" style={{ color: colors.textTertiary }}>
                  {game.joinedCount + 1}/{game.maxPlayers} joined
                  {isOrganizer && !!waitlistCountQuery.data ? ` · ${waitlistCountQuery.data} waitlist` : ""}
                </Text>
              ) : undefined
            }
          >
            Lineup
          </SectionLabel>
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

          <SectionLabel>Venue</SectionLabel>
          <VenueDetailCard game={game} />

          <SectionLabel>Cost</SectionLabel>
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
                ${totalCost}
              </Text>
            </View>
            {isOrganizer ? (
              <View className="rounded-xl p-3" style={{ backgroundColor: "rgba(214,255,63,0.1)" }}>
                <Text className="text-[13px] font-body-bold" style={{ color: colors.accent }}>
                  Your break-even
                </Text>
                <Text className="text-[12.5px] mt-1" style={{ color: colors.textDim, lineHeight: 18 }}>
                  Court's ${totalCost} total. {joined.length + 1} in at ${perPlayer}, that's ${covered}.{" "}
                  {shortfall > 0 ? `You're $${shortfall} short of covering it, ${open} ${open === 1 ? "spot" : "spots"} left to close the gap.` : "Fully covered."}
                </Text>
              </View>
            ) : (
              <View className="rounded-xl p-3 flex-row justify-between items-center" style={{ backgroundColor: "rgba(214,255,63,0.1)" }}>
                <Text className="text-[14.5px] font-body-bold" style={{ color: colors.accent }}>
                  Your share
                </Text>
                <Text className="font-display-bold text-[20px]" style={{ color: colors.accent }}>
                  ${perPlayer}
                </Text>
              </View>
            )}
          </View>

          <SectionLabel>Good to know</SectionLabel>
          <View className="gap-2">
            {[
              ["Joining", game.autoApprove ? "Auto-approved" : "Host approves each request"],
              ["Visibility", game.visibility === "link_only" ? "Link only" : "Public"],
              ["If you drop out", "Spot opens to the waitlist"],
              ["Bring", "Your own racquet"],
            ].map(([label, value]) => (
              <View key={label} className="flex-row justify-between">
                <Text className="text-[12.5px]" style={{ color: colors.textTertiary }}>
                  {label}
                </Text>
                <Text className="text-[12.5px] font-body-semibold" style={{ color: colors.textSecondary }}>
                  {value}
                </Text>
              </View>
            ))}
          </View>

          {organizer && !isOrganizer && (
            <>
              <SectionLabel>Host</SectionLabel>
              <View className="flex-row items-center gap-2.5" style={{ paddingVertical: 4 }}>
                <Avatar
                  id={organizer.id}
                  name={organizer.displayName}
                  color={colors.surfaceAlt}
                  photoUri={organizer.photoPath ? supabase.storage.from("avatars").getPublicUrl(organizer.photoPath).data.publicUrl : null}
                  avatarKey={organizer.avatarKey}
                  size={44}
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
            </>
          )}

          <View className="mt-5.5">
            <ChatPreviewStrip gameId={gameId} memberCount={game.joinedCount + 1} />
          </View>

          <View className="mt-3.5">
            <UtilityChipRow
              onCalendar={onCalendar}
              onToggleCalendar={
                isOrganizer || membership?.status === "approved"
                  ? () => {
                      haptics.tap();
                      addGameToCalendar(game, organizer?.displayName).then(() => hasCalendarEvent(gameId).then(setOnCalendar));
                    }
                  : undefined
              }
              onShare={() => shareGame(game)}
              onDuplicate={isOrganizer && !cancelled ? handleDuplicate : undefined}
            />
          </View>

          {!isOrganizer && organizer && (
            <Pressable
              className="items-center py-5"
              onPress={() => {
                haptics.tap();
                setReportSheetOpen(true);
              }}
            >
              <Text className="font-body-bold text-[12px]" style={{ color: colors.textTertiary }}>
                Report this game <Text style={{ color: colors.textMuted }}>·</Text> Block host
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      {/* Fixed bottom pill (docs/v2-design-plan.md §4.3). */}
      <View className="px-5 pb-8 pt-3.5" style={{ backgroundColor: colors.base }}>
        {cancelled ? (
          <View className="gap-2">
            <Button testID="game-cta" label="Game cancelled" variant="ghost" disabled />
            <Pressable className="items-center" onPress={() => router.replace("/(tabs)/discover")}>
              <Text className="font-body-bold text-[12.5px]" style={{ color: colors.accent3 }}>
                Find another game tonight
              </Text>
            </Pressable>
          </View>
        ) : isOrganizer ? (
          mode === "done" ? (
            <Button
              testID="game-cta"
              label={attendanceQuery.data ? "Rate your crew" : "Mark attendance"}
              onPress={() => router.push(`/post-game/${game.id}`)}
            />
          ) : (
            <Button testID="game-cta" label="Manage this game" variant="secondary" onPress={() => router.push(`/game/edit/${game.id}`)} />
          )
        ) : mode === "done" ? (
          rated ? (
            <Button testID="game-cta" label="Rebook this game" variant="secondary" onPress={handleRebook} />
          ) : (
            <Button testID="game-cta" label="Rate your crew" onPress={() => router.push(`/post-game/${game.id}`)} />
          )
        ) : membership?.status === "approved" ? (
          mode === "imminent" ? (
            <Button
              testID="game-cta"
              label={distanceM != null ? `Directions, ${formatDistance(distanceM, distanceUnits)} away` : "Directions"}
              onPress={() => openDirections(game)}
            />
          ) : mode === "live" ? (
            <Button testID="game-cta" label="You're in · playing now" variant="secondary" disabled />
          ) : (
            <View className="gap-2">
              <Button testID="game-cta" label="You're in" variant="secondary" disabled />
              <Pressable className="items-center" onPress={confirmLeave}>
                <Text className="font-body-semibold text-[12.5px]" style={{ color: colors.textTertiary }}>
                  Leave game
                </Text>
              </Pressable>
            </View>
          )
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
          <View className="gap-1.5">
            <Button testID="game-cta" label="Request sent" variant="secondary" disabled />
            <Pressable className="items-center" onPress={() => leaveGame.mutate()}>
              <Text className="font-body-semibold text-[11.5px]" style={{ color: colors.textTertiary }}>
                Withdraw request
              </Text>
            </Pressable>
          </View>
        ) : membership?.status === "waitlisted" ? (
          <Button
            testID="game-cta"
            label={waitlistPositionQuery.data ? `On the waitlist · #${waitlistPositionQuery.data}` : "On the waitlist"}
            variant="secondary"
            loading={leaveGame.isPending}
            onPress={confirmLeaveWaitlist}
          />
        ) : full ? (
          <View className="gap-1.5">
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
            <Pressable
              className="items-center"
              onPress={() => {
                haptics.tap();
                setSimilarSheetOpen(true);
              }}
            >
              <Text className="font-body-bold text-[11.5px]" style={{ color: colors.accent3 }}>
                or see similar games nearby
              </Text>
            </Pressable>
          </View>
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

      <VerifiedSheet
        visible={verifiedSheetOpen}
        onClose={() => setVerifiedSheetOpen(false)}
        status={game.verificationStatus}
        hostName={hostName}
      />
      {organizer && (
        <ReportSheet
          visible={reportSheetOpen}
          onClose={() => setReportSheetOpen(false)}
          hostId={organizer.id}
          hostName={organizer.displayName}
          gameId={gameId}
        />
      )}
      <Sheet visible={leaveSheetOpen} onClose={() => setLeaveSheetOpen(false)} title="Leave this game?">
        <Text className="text-[13.5px]" style={{ color: colors.textSecondary, lineHeight: 20 }}>
          Your spot opens up to whoever's next on the waitlist. If you change your mind, you'll need to ask to rejoin, same as anyone
          else.
        </Text>
        <View className="flex-row gap-2.5 mt-2">
          <View className="flex-1">
            <Button label="Stay in" variant="ghost" onPress={() => setLeaveSheetOpen(false)} />
          </View>
          <View className="flex-1">
            <Button
              label="Leave game"
              variant="secondary"
              loading={leaveGame.isPending}
              onPress={() => {
                leaveGame.mutate();
                setLeaveSheetOpen(false);
              }}
            />
          </View>
        </View>
      </Sheet>
      {isOrganizer && <InviteCoplayerSheet gameId={gameId} visible={invitePastOpen} onClose={() => setInvitePastOpen(false)} />}
      {game.venueLat != null && game.venueLng != null && (
        <SimilarGamesSheet
          visible={similarSheetOpen}
          onClose={() => setSimilarSheetOpen(false)}
          excludeId={gameId}
          center={{ lat: game.venueLat, lng: game.venueLng }}
        />
      )}
    </View>
  );
}

// Full-game dead end fix (design redesign artboard 07): rather than a whole new page section
// that only exists in the full state (breaking the "page order never changes" rule), this is a
// light sheet off the waitlist CTA's secondary link.
function SimilarGamesSheet({
  visible,
  onClose,
  excludeId,
  center,
}: {
  visible: boolean;
  onClose: () => void;
  excludeId: string;
  center: { lat: number; lng: number };
}) {
  const gamesQuery = useDiscoverGames({ hasSpotsOnly: true, radiusKm: 10 }, center, { enabled: visible });
  const similar = (gamesQuery.data ?? []).filter((g) => g.id !== excludeId).slice(0, 3);

  return (
    <Sheet visible={visible} onClose={onClose} title="Similar, with spots open">
      {similar.length === 0 ? (
        <Text className="text-[13.5px]" style={{ color: colors.textSecondary }}>
          Nothing else nearby right now, the waitlist's still your best bet.
        </Text>
      ) : (
        <View className="gap-2">
          {similar.map((g) => (
            <Pressable
              key={g.id}
              className="flex-row items-center gap-3 rounded-xl p-2.5"
              style={{ backgroundColor: colors.surface }}
              onPress={() => {
                onClose();
                router.push(`/game/${g.id}`);
              }}
            >
              <View className="w-9 h-9 rounded-xl" style={{ backgroundColor: colors.surfaceAlt }} />
              <View className="flex-1">
                <Text className="font-body-bold text-[12.5px]" style={{ color: colors.text }}>
                  {g.venue}
                </Text>
                <Text className="text-[11px]" style={{ color: colors.textSecondary }}>
                  {g.date} · {g.time} · ${g.cost}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </Sheet>
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
              Sign up to see who's playing and grab a spot.
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
    <View onLayout={(e) => onLayoutY(e.nativeEvent.layout.y)} className="mt-3.5">
      <Text className="font-body-extrabold text-[13px] uppercase tracking-wide" style={{ color: colors.textTertiary }}>
        Join requests ({requests.length})
      </Text>
      <Text className="text-[12px] mb-2.5 mt-0.5" style={{ color: colors.textMuted }}>
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
