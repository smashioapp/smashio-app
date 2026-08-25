import { useEffect, useRef, useState } from "react";
import { Pressable, View, Text, Alert, LayoutChangeEvent } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import Animated, { FadeInUp } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { colors, gradients, reliabilityLabel } from "../lib/theme";
import { Avatar, AvatarStack } from "./Avatar";
import { Badge } from "./Badge";
import { Burst } from "./Burst";
import { CountdownChip } from "./CountdownChip";
import { HoldButton } from "./HoldButton";
import { RollingNumber } from "./RollingNumber";
import { SwipeToDecide } from "./SwipeToDecide";
import { VenueCourtHeader } from "./VenueCourtHeader";
import { GameCover } from "./GameCover";
import { Game, Player } from "../lib/mockData";
import { haptics } from "../lib/haptics";
import { supabase } from "../lib/supabase";
import { openDirections } from "../lib/directions";
import { shareGame } from "../lib/share";
import { useCancelGame, useUploadConfirmation } from "../lib/queries/games";
import { useDecideJoinRequest, useLeaveGame, type PendingRequest } from "../lib/queries/gamePlayers";

export type MyRole = "hosting" | "playing" | "requested";

const ROLE_LABEL: Record<MyRole, string> = { hosting: "Hosting", playing: "Playing", requested: "Requested" };
const FILL_HEALTH_WINDOW_MS = 48 * 60 * 60 * 1000;

// The commitment card — you already decided, so scarcity/price are gone; the questions this
// answers are "is it still on, who's coming, and what do I do next" (my-games-plan.md §1).
export function UpcomingGameCard({
  game,
  role,
  roster,
  pendingRequests = [],
  unread = false,
  index = 0,
  onPress,
}: {
  game: Game;
  role: MyRole;
  roster: Player[];
  pendingRequests?: PendingRequest[];
  unread?: boolean;
  index?: number;
  onPress: () => void;
}) {
  const [cardWidth, setCardWidth] = useState(0);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [showFullBurst, setShowFullBurst] = useState(false);
  const leaveGame = useLeaveGame(game.id);
  const decideRequest = useDecideJoinRequest(game.id);
  const cancelGame = useCancelGame(game.id);
  const uploadConfirmation = useUploadConfirmation();

  // Success burst the moment an approval fills the last spot (my-games-plan.md §M6) — the
  // reward lands on the card the host is already looking at, not buried in a toast.
  const prevJoinedCountRef = useRef(game.joinedCount);
  useEffect(() => {
    if (role === "hosting" && prevJoinedCountRef.current < game.maxPlayers && game.joinedCount >= game.maxPlayers) {
      haptics.burst();
      setShowFullBurst(true);
    }
    prevJoinedCountRef.current = game.joinedCount;
  }, [game.joinedCount, game.maxPlayers, role]);

  const organizerPhotoUrl = game.organizerPhotoPath
    ? supabase.storage.from("avatars").getPublicUrl(game.organizerPhotoPath).data.publicUrl
    : null;

  const handleLeave = () => {
    const isRequested = role === "requested";
    Alert.alert(
      isRequested ? "Withdraw request?" : "Leave game?",
      isRequested ? "You'll stop waiting on the host's decision." : "You'll give up your spot in this game.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: isRequested ? "Withdraw" : "Leave",
          style: "destructive",
          onPress: () => {
            haptics.tick();
            leaveGame.mutate();
          },
        },
      ]
    );
  };

  const fillFraction = Math.min(1, game.joinedCount / game.maxPlayers);
  const spotsOpen = game.maxPlayers - game.joinedCount;
  const hoursToGo = Math.max(0, Math.round((new Date(game.startsAt).getTime() - Date.now()) / (60 * 60 * 1000)));
  const showFillHealth =
    role === "hosting" && game.status !== "cancelled" && spotsOpen > 0 && new Date(game.startsAt).getTime() - Date.now() <= FILL_HEALTH_WINDOW_MS;

  const handleUploadConfirmation = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo access to upload your booking confirmation.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (result.canceled) return;
    uploadConfirmation.mutate(
      { gameId: game.id, localUri: result.assets[0].uri },
      { onError: (e) => Alert.alert("Upload failed", e instanceof Error ? e.message : "Try again.") }
    );
  };

  const handleCancelGame = () => {
    haptics.tick();
    cancelGame.mutate(undefined, {
      onError: (e) => Alert.alert("Couldn't cancel game", e instanceof Error ? e.message : "Try again."),
    });
  };

  return (
    <Animated.View entering={FadeInUp.delay(index * 60).duration(320)}>
      <Pressable onPress={onPress}>
        <LinearGradient
          colors={gradients.card}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          className="rounded-[18px] p-4 border gap-2.5"
          style={{ borderColor: colors.cardBorder }}
          onLayout={(e: LayoutChangeEvent) => setCardWidth(e.nativeEvent.layout.width)}
        >
          {cardWidth > 0 &&
            (game.coverKey ? (
              <View style={{ width: cardWidth - 32, height: 46, borderRadius: 14, overflow: "hidden" }}>
                <GameCover coverKey={game.coverKey} size="fill" />
              </View>
            ) : (
              <VenueCourtHeader venueKey={game.venue + game.suburb} width={cardWidth - 32} />
            ))}

          <View className="flex-row justify-between items-start">
            <View className="flex-1 pr-2">
              <View className="flex-row items-center gap-1.5">
                <View className="rounded-pill px-2 py-0.5" style={{ backgroundColor: "rgba(214,255,63,0.12)" }}>
                  <Text className="text-[11px] font-body-extrabold" style={{ color: colors.accent }}>
                    {ROLE_LABEL[role]}
                  </Text>
                </View>
                {role === "hosting" && game.status !== "cancelled" && game.verificationStatus !== "none" && (
                  <Badge state={game.verified ? "verified" : "pending"} label={game.verified ? "Verified" : "Pending"} />
                )}
              </View>
              <Text className="font-display-bold text-[16.5px] mt-1" style={{ color: colors.text }}>
                {game.venue}
              </Text>
              <Text className="text-[13.5px] mt-0.5" style={{ color: colors.textTertiary }}>
                {game.suburb}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center justify-between">
            <Text className="text-[14px] font-body-semibold" style={{ color: colors.textDim }}>
              {game.date} · {game.time}
            </Text>
            <CountdownChip startsAt={game.startsAt} />
          </View>

          {role === "requested" && (
            <Text className="text-[12.5px] font-body-bold" style={{ color: colors.accent }}>
              Awaiting host approval
            </Text>
          )}

          {role !== "hosting" && game.organizerName && (
            <View className="flex-row items-center gap-2">
              <Avatar
                id={game.organizerId}
                name={game.organizerName}
                color={colors.surfaceAlt}
                size={24}
                photoUri={organizerPhotoUrl}
                avatarKey={game.organizerAvatarKey}
              />
              <Text className="text-[13px] font-body-semibold flex-1" style={{ color: colors.textSecondary }} numberOfLines={1}>
                {game.organizerName}
                {game.organizerReliabilityScore != null && (
                  <Text style={{ color: colors.textMuted }}> · {reliabilityLabel(game.organizerReliabilityScore)}</Text>
                )}
              </Text>
            </View>
          )}

          <View className="flex-row items-center justify-between mt-0.5" style={{ position: "relative" }}>
            {roster.length > 0 ? (
              <AvatarStack people={roster} max={4} />
            ) : (
              <View />
            )}
            {role === "hosting" ? (
              <View className="flex-row items-center">
                <RollingNumber
                  from={Math.max(0, game.joinedCount - 1)}
                  to={game.joinedCount}
                  className="text-[13px] font-body-bold"
                  style={{ color: colors.textMuted }}
                />
                <Text className="text-[13px] font-body-bold" style={{ color: colors.textMuted }}>
                  {` of ${game.maxPlayers} in`}
                </Text>
              </View>
            ) : (
              <Text className="text-[13px] font-body-bold" style={{ color: colors.textMuted }}>
                You're in · {game.joinedCount} going
              </Text>
            )}
            {showFullBurst && (
              <Burst origin={{ x: cardWidth / 2 - 32, y: 0 }} count={20} onDone={() => setShowFullBurst(false)} />
            )}
          </View>

          {role === "hosting" && (
            <View className="h-1 rounded-pill overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
              <View
                className="h-1 rounded-pill"
                style={{ width: `${fillFraction * 100}%`, backgroundColor: fillFraction >= 1 ? colors.intermediate : colors.textMuted }}
              />
            </View>
          )}

          {showFillHealth && (
            <View className="flex-row items-center justify-between">
              <Text className="text-[12.5px] font-body-semibold" style={{ color: colors.advanced }}>
                {spotsOpen} {spotsOpen === 1 ? "spot" : "spots"} open · {hoursToGo < 1 ? "<1h" : `${hoursToGo}h`} to go
              </Text>
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  haptics.tap();
                  shareGame(game);
                }}
                className="flex-row items-center gap-1 rounded-pill px-2.5 py-1"
                style={{ backgroundColor: "rgba(255,182,72,0.12)" }}
              >
                <Ionicons name="share-outline" size={12} color={colors.advanced} />
                <Text className="text-[11.5px] font-body-extrabold" style={{ color: colors.advanced }}>
                  Share invite
                </Text>
              </Pressable>
            </View>
          )}

          {role === "hosting" && game.status !== "cancelled" && game.verificationStatus === "none" && (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                handleUploadConfirmation();
              }}
              disabled={uploadConfirmation.isPending}
              className="flex-row items-center gap-2 rounded-xl px-3 py-2.5"
              style={{ backgroundColor: "rgba(214,255,63,0.08)", opacity: uploadConfirmation.isPending ? 0.6 : 1 }}
            >
              <Ionicons name="cloud-upload-outline" size={15} color={colors.accent} />
              <Text className="flex-1 text-[12.5px] font-body-bold" style={{ color: colors.accent }}>
                {uploadConfirmation.isPending ? "Uploading…" : "Upload booking confirmation to get verified"}
              </Text>
            </Pressable>
          )}

          {role === "hosting" && pendingRequests.length > 0 && (
            <View className="gap-2 pt-1">
              <Text className="font-body-extrabold text-[11px] uppercase tracking-wide" style={{ color: colors.textTertiary }}>
                {pendingRequests.length} waiting on you
              </Text>
              {pendingRequests.map((r) => (
                <SwipeToDecide
                  key={r.profileId}
                  canApprove={spotsOpen > 0}
                  onApprove={() => {
                    haptics.tick();
                    decideRequest.mutate({ profileId: r.profileId, approve: true });
                  }}
                  onDecline={() => {
                    haptics.tick();
                    decideRequest.mutate({ profileId: r.profileId, approve: false });
                  }}
                >
                  <View className="flex-row items-center gap-2.5 rounded-xl p-2.5" style={{ backgroundColor: colors.surfaceAlt }}>
                    <Avatar id={r.profileId} name={r.name} color={r.color} size={26} />
                    <Text className="flex-1 text-[13.5px] font-body-semibold" style={{ color: colors.text }} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        haptics.tick();
                        decideRequest.mutate({ profileId: r.profileId, approve: true });
                      }}
                      disabled={spotsOpen <= 0}
                      className="rounded-pill px-3 py-1.5"
                      style={{ backgroundColor: colors.accent, opacity: spotsOpen > 0 ? 1 : 0.4 }}
                    >
                      <Text className="font-body-extrabold text-[12.5px]" style={{ color: colors.base }}>
                        Approve
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        haptics.tick();
                        decideRequest.mutate({ profileId: r.profileId, approve: false });
                      }}
                      className="rounded-pill px-3 py-1.5 border-[1.5px]"
                      style={{ borderColor: "rgba(255,255,255,0.15)" }}
                    >
                      <Text className="font-body-bold text-[12.5px]" style={{ color: colors.text }}>
                        Decline
                      </Text>
                    </Pressable>
                  </View>
                </SwipeToDecide>
              ))}
            </View>
          )}

          {confirmingCancel && (
            <View className="flex-row items-center gap-2 pt-1">
              <View className="flex-1">
                <HoldButton
                  label="Hold to cancel game"
                  completeLabel="Cancelling…"
                  sfx="pop"
                  onComplete={handleCancelGame}
                />
              </View>
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  setConfirmingCancel(false);
                }}
                className="w-11 h-11 rounded-full items-center justify-center border-[1.5px]"
                style={{ borderColor: "rgba(255,255,255,0.15)" }}
              >
                <Ionicons name="close" size={17} color={colors.textDim} />
              </Pressable>
            </View>
          )}

          <View className="flex-row items-center gap-2 pt-1.5 mt-0.5 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            <ActionButton icon="navigate-outline" label="Directions" onPress={() => openDirections(game)} />
            <ActionButton icon="chatbubble-outline" label="Chat" unread={unread} onPress={() => router.push(`/chat/${game.id}`)} />
            <View className="flex-1" />
            {role === "hosting" ? (
              <>
                {game.status !== "cancelled" && !confirmingCancel && (
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      setConfirmingCancel(true);
                    }}
                    className="rounded-pill px-3.5 py-2 border-[1.5px]"
                    style={{ borderColor: "rgba(255,103,103,0.3)" }}
                  >
                    <Text className="font-body-bold text-[12.5px]" style={{ color: colors.danger }}>
                      Cancel
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    router.push(`/game/edit/${game.id}`);
                  }}
                  className="rounded-pill px-3.5 py-2 border-[1.5px]"
                  style={{ borderColor: "rgba(255,255,255,0.15)" }}
                >
                  <Text className="font-body-bold text-[12.5px]" style={{ color: colors.textDim }}>
                    Manage
                  </Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                disabled={leaveGame.isPending}
                onPress={(e) => {
                  e.stopPropagation();
                  handleLeave();
                }}
                className="rounded-pill px-3.5 py-2 border-[1.5px]"
                style={{ borderColor: "rgba(255,255,255,0.15)", opacity: leaveGame.isPending ? 0.6 : 1 }}
              >
                <Text className="font-body-bold text-[12.5px]" style={{ color: colors.textDim }}>
                  {role === "requested" ? "Withdraw" : "Leave"}
                </Text>
              </Pressable>
            )}
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

function ActionButton({
  icon,
  label,
  unread = false,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  unread?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={(e) => {
        e.stopPropagation();
        onPress();
      }}
      className="flex-row items-center gap-1.5 rounded-pill px-3 py-2"
      style={{ backgroundColor: colors.surfaceAlt }}
    >
      <View>
        <Ionicons name={icon} size={14} color={colors.textSecondary} />
        {unread && (
          <View
            className="absolute rounded-full"
            style={{ width: 6, height: 6, top: -2, right: -2, backgroundColor: colors.accent }}
          />
        )}
      </View>
      <Text className="text-[12.5px] font-body-bold" style={{ color: colors.textSecondary }}>
        {label}
      </Text>
    </Pressable>
  );
}
