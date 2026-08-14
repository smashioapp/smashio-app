import { useEffect, useRef, useState } from "react";
import { Pressable, View, Text, Alert, LayoutChangeEvent } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withSequence, withSpring } from "react-native-reanimated";
import { colors, gradients, reliabilityLabel } from "../lib/theme";
import { Badge } from "./Badge";
import { SkillPill } from "./SkillPill";
import { Avatar } from "./Avatar";
import { CountdownChip } from "./CountdownChip";
import { RollingNumber } from "./RollingNumber";
import { VenueCourtHeader } from "./VenueCourtHeader";
import { Game, spotsLeft, levelFit } from "../lib/mockData";
import { haptics } from "../lib/haptics";
import { SPRING } from "../lib/motion";
import { supabase } from "../lib/supabase";
import { useRequestToJoin, useLeaveGame } from "../lib/queries/gamePlayers";

export function GameCard({
  game,
  onPress,
  index = 0,
  viewerTierOrdinal = null,
  showJoinAction = false,
}: {
  game: Game;
  onPress: () => void;
  index?: number;
  viewerTierOrdinal?: number | null;
  showJoinAction?: boolean;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const [cardWidth, setCardWidth] = useState(0);

  const joinedScale = useSharedValue(1);
  const prevJoined = useRef(game.joinedCount);
  useEffect(() => {
    if (prevJoined.current !== game.joinedCount) {
      joinedScale.value = withSequence(withSpring(1.3, SPRING.pop), withSpring(1, SPRING.settle));
      prevJoined.current = game.joinedCount;
    }
  }, [game.joinedCount]);
  const joinedStyle = useAnimatedStyle(() => ({ transform: [{ scale: joinedScale.value }] }));

  const open = spotsLeft(game);
  const full = open === 0;
  const lastSpot = open === 1;
  // Manufacturing urgency on a game that's barely started filling would be dishonest — only
  // surface the count once the game is at least half full.
  const showScarcity = full || open <= game.maxPlayers / 2;
  const fillFraction = Math.min(1, game.joinedCount / game.maxPlayers);

  const fit = levelFit(viewerTierOrdinal, game.skillTierOrdinal);

  const organizerPhotoUrl = game.organizerPhotoPath
    ? supabase.storage.from("avatars").getPublicUrl(game.organizerPhotoPath).data.publicUrl
    : null;

  const requestToJoin = useRequestToJoin(game.id);
  const leaveGame = useLeaveGame(game.id);
  const handleWithdraw = () => {
    haptics.tick();
    leaveGame.mutate();
  };
  const handleRequestJoin = () => {
    haptics.tick();
    requestToJoin.mutate(undefined, {
      onError: (e) => {
        const message = e instanceof Error ? e.message : "";
        if (message.includes("duplicate key")) {
          Alert.alert("Already requested", "You've already asked to join this game.");
        } else {
          Alert.alert("Couldn't send request", "Please try again.");
        }
      },
    });
  };

  return (
    <Animated.View entering={FadeInUp.delay(index * 60).duration(320)} style={animatedStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          haptics.tick();
          scale.value = withSpring(0.97, { damping: 18, stiffness: 300 });
        }}
        onPressOut={() => (scale.value = withSpring(1, { damping: 18, stiffness: 300 }))}
      >
        <LinearGradient
          colors={gradients.card}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          className="rounded-[18px] p-4 border gap-2.5"
          style={{ borderColor: colors.cardBorder }}
          onLayout={(e: LayoutChangeEvent) => setCardWidth(e.nativeEvent.layout.width)}
        >
          {cardWidth > 0 && <VenueCourtHeader venueKey={game.venue + game.suburb} width={cardWidth - 32} />}

          <View className="flex-row justify-between items-start">
            <View className="flex-1 pr-2">
              <Text className="font-display-bold text-[16.5px]" style={{ color: colors.text }}>
                {game.venue}
              </Text>
              <Text className="text-[13.5px] mt-0.5" style={{ color: colors.textTertiary }}>
                {game.suburb}
                {game.distance ? ` · ${game.distance}` : ""}
              </Text>
            </View>
            {game.verificationStatus !== "none" && (
              <Badge state={game.verified ? "verified" : "pending"} label={game.verified ? "Verified" : "Pending"} />
            )}
          </View>

          <View className="flex-row items-center justify-between">
            <Text className="text-[14px] font-body-semibold" style={{ color: colors.textDim }}>
              {game.date} · {game.time}
            </Text>
            <CountdownChip startsAt={game.startsAt} />
          </View>

          {game.myStatus === "requested" && (
            <Text className="text-[12.5px] font-body-bold" style={{ color: colors.accent }}>
              Awaiting host approval
            </Text>
          )}

          {game.organizerName && (
            <View className="flex-row items-center gap-2">
              <Avatar name={game.organizerName} color={colors.surfaceAlt} size={24} photoUri={organizerPhotoUrl} />
              <Text className="text-[13px] font-body-semibold flex-1" style={{ color: colors.textSecondary }} numberOfLines={1}>
                {game.organizerName}
                {game.organizerHostedCount != null && game.organizerHostedCount > 0 && (
                  <Text style={{ color: colors.textMuted }}> · Hosted {game.organizerHostedCount}</Text>
                )}
                {game.organizerReliabilityScore != null && (
                  <Text style={{ color: colors.textMuted }}> · {reliabilityLabel(game.organizerReliabilityScore)}</Text>
                )}
              </Text>
            </View>
          )}

          <View className="gap-1.5 mt-0.5">
            <View className="flex-row items-center justify-between">
              <SkillPill skill={game.skill} fit={fit} />
              {showScarcity && (
                <Animated.View style={joinedStyle} className="flex-row items-center">
                  {full || lastSpot ? (
                    <Text className="text-[13px] font-body-bold" style={{ color: full ? colors.danger : colors.accent }}>
                      {full ? "Full" : "Last spot"}
                    </Text>
                  ) : (
                    <>
                      <RollingNumber
                        from={game.maxPlayers - prevJoined.current}
                        to={open}
                        className="text-[13px] font-body-bold"
                        style={{ color: colors.textMuted }}
                      />
                      <Text className="text-[13px] font-body-bold" style={{ color: colors.textMuted }}>
                        {" "}
                        spots left
                      </Text>
                    </>
                  )}
                </Animated.View>
              )}
            </View>
            {showScarcity && !full && (
              <View className="h-1 rounded-pill overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
                <View
                  className="h-1 rounded-pill"
                  style={{ width: `${fillFraction * 100}%`, backgroundColor: lastSpot ? colors.accent : colors.textMuted }}
                />
              </View>
            )}
          </View>

          <View
            className="flex-row justify-between items-center pt-1.5 mt-0.5 border-t"
            style={{ borderColor: "rgba(255,255,255,0.06)" }}
          >
            <Text className="font-display-bold text-[17px]" style={{ color: colors.accent }}>
              ${game.cost} <Text className="font-body-semibold text-[13px]" style={{ color: colors.textTertiary }}>/ player</Text>
            </Text>
            {showJoinAction ? (
              <Pressable
                disabled={full || requestToJoin.isPending}
                onPress={(e) => {
                  e.stopPropagation();
                  handleRequestJoin();
                }}
                className="rounded-pill px-3.5 py-2"
                style={{ backgroundColor: full ? colors.surfaceAlt : colors.accent, opacity: requestToJoin.isPending ? 0.6 : 1 }}
              >
                <Text className="font-body-extrabold text-[12.5px]" style={{ color: full ? colors.textMuted : colors.base }}>
                  {full ? "Full" : requestToJoin.isSuccess ? "Requested" : "Request to join"}
                </Text>
              </Pressable>
            ) : game.myStatus === "requested" ? (
              <Pressable
                disabled={leaveGame.isPending}
                onPress={(e) => {
                  e.stopPropagation();
                  handleWithdraw();
                }}
                className="rounded-pill px-3.5 py-2 border-[1.5px]"
                style={{ borderColor: "rgba(255,255,255,0.15)", opacity: leaveGame.isPending ? 0.6 : 1 }}
              >
                <Text className="font-body-bold text-[12.5px]" style={{ color: colors.textDim }}>
                  {leaveGame.isPending ? "Withdrawing…" : "Withdraw request"}
                </Text>
              </Pressable>
            ) : (
              !showScarcity && (
                <View className="flex-row items-center">
                  <RollingNumber
                    from={prevJoined.current}
                    to={game.joinedCount}
                    className="text-[13px] font-body-bold"
                    style={{ color: colors.textMuted }}
                  />
                  <Text className="text-[13px] font-body-bold" style={{ color: colors.textMuted }}>
                    /{game.maxPlayers} joined
                  </Text>
                </View>
              )
            )}
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}
