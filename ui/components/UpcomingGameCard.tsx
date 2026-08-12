import { useState } from "react";
import { Pressable, View, Text, Alert, LayoutChangeEvent } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInUp } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { colors, gradients, reliabilityLabel } from "../lib/theme";
import { Avatar, AvatarStack } from "./Avatar";
import { CountdownChip } from "./CountdownChip";
import { VenueCourtHeader } from "./VenueCourtHeader";
import { Game, Player } from "../lib/mockData";
import { haptics } from "../lib/haptics";
import { supabase } from "../lib/supabase";
import { openDirections } from "../lib/directions";
import { useLeaveGame } from "../lib/queries/gamePlayers";

export type MyRole = "hosting" | "playing" | "requested";

const ROLE_LABEL: Record<MyRole, string> = { hosting: "Hosting", playing: "Playing", requested: "Requested" };

// The commitment card — you already decided, so scarcity/price are gone; the questions this
// answers are "is it still on, who's coming, and what do I do next" (my-games-plan.md §1).
export function UpcomingGameCard({
  game,
  role,
  roster,
  unread = false,
  index = 0,
  onPress,
}: {
  game: Game;
  role: MyRole;
  roster: Player[];
  unread?: boolean;
  index?: number;
  onPress: () => void;
}) {
  const [cardWidth, setCardWidth] = useState(0);
  const leaveGame = useLeaveGame(game.id);

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
          {cardWidth > 0 && <VenueCourtHeader venueKey={game.venue + game.suburb} width={cardWidth - 32} />}

          <View className="flex-row justify-between items-start">
            <View className="flex-1 pr-2">
              <View className="flex-row items-center gap-1.5">
                <View className="rounded-pill px-2 py-0.5" style={{ backgroundColor: "rgba(214,255,63,0.12)" }}>
                  <Text className="text-[11px] font-body-extrabold" style={{ color: colors.accent }}>
                    {ROLE_LABEL[role]}
                  </Text>
                </View>
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
              <Avatar name={game.organizerName} color={colors.surfaceAlt} size={24} photoUri={organizerPhotoUrl} />
              <Text className="text-[13px] font-body-semibold flex-1" style={{ color: colors.textSecondary }} numberOfLines={1}>
                {game.organizerName}
                {game.organizerReliabilityScore != null && (
                  <Text style={{ color: colors.textMuted }}> · {reliabilityLabel(game.organizerReliabilityScore)}</Text>
                )}
              </Text>
            </View>
          )}

          <View className="flex-row items-center justify-between mt-0.5">
            {roster.length > 0 ? (
              <AvatarStack people={roster} max={4} />
            ) : (
              <View />
            )}
            <Text className="text-[13px] font-body-bold" style={{ color: colors.textMuted }}>
              {role === "hosting" ? `${game.joinedCount} of ${game.maxPlayers} in` : `You're in · ${game.joinedCount} going`}
            </Text>
          </View>

          {role === "hosting" && (
            <View className="h-1 rounded-pill overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
              <View
                className="h-1 rounded-pill"
                style={{ width: `${fillFraction * 100}%`, backgroundColor: fillFraction >= 1 ? colors.intermediate : colors.textMuted }}
              />
            </View>
          )}

          <View className="flex-row items-center gap-2 pt-1.5 mt-0.5 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            <ActionButton icon="navigate-outline" label="Directions" onPress={() => openDirections(game)} />
            <ActionButton icon="chatbubble-outline" label="Chat" unread={unread} onPress={() => router.push(`/chat/${game.id}`)} />
            <View className="flex-1" />
            {role === "hosting" ? (
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
