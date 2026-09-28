import { View, Text, Pressable, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { colors } from "../lib/theme";
import { friendlyWhen } from "../lib/schedule";
import { paymentLine } from "../lib/payment";
import { openDirections } from "../lib/directions";
import { haptics } from "../lib/haptics";
import { useGameHostHere, useSetHostHere } from "../lib/queries/games";
import type { Game } from "../lib/mockData";

// fill-the-spot P5.1: what you need in the two hours before you play, in one card. Court, meet
// point, how many are coming, how to pay, and whether the host has arrived.

export const GAME_DAY_WINDOW_MS = 2 * 60 * 60 * 1000;

export function isGameDay(game: Pick<Game, "startsAt" | "endsAt" | "status">, now: number = Date.now()): boolean {
  if (game.status === "cancelled") return false;
  const start = new Date(game.startsAt).getTime();
  return now >= start - GAME_DAY_WINDOW_MS && now < new Date(game.endsAt).getTime();
}

export function GameDayCard({ game, isHost, playing }: { game: Game; isHost: boolean; playing: number }) {
  const hereQuery = useGameHostHere(game.id, true);
  const setHere = useSetHostHere(game.id);
  const hostName = game.organizerName || "The host";
  const pay = game.cost > 0 ? paymentLine(game, hostName) : null;
  const hostHere = !!hereQuery.data;

  return (
    <View className="rounded-3xl p-4 border" style={{ backgroundColor: colors.card, borderColor: "rgba(214,255,63,0.28)" }}>
      <Text className="font-body-extrabold text-[10.5px] uppercase" style={{ color: colors.accent3, letterSpacing: 0.5 }}>Game day</Text>
      <Text className="font-display text-[19px] mt-1" style={{ color: colors.text }}>
        {game.venue}, {friendlyWhen(new Date(game.startsAt))}
      </Text>
      <View className="mt-3 gap-2">
        <Line icon="grid-outline" text={game.courts ? game.courts : "Court not set yet, check the chat"} />
        <Line icon="people-outline" text={`${playing} playing`} />
        {pay && <Line icon="cash-outline" text={`$${game.cost} each. ${pay}`} />}
        <Line
          icon={hostHere ? "checkmark-circle" : "time-outline"}
          tone={hostHere ? colors.intermediate : undefined}
          text={hostHere ? `${isHost ? "You're" : hostName + "'s"} here` : isHost ? "Tap below when you get there" : `${hostName} hasn't checked in yet`}
        />
      </View>
      <View className="flex-row flex-wrap gap-2 mt-3.5">
        {isHost && !hostHere && (
          <Pressable
            testID="game-day-here"
            disabled={setHere.isPending}
            onPress={() => {
              haptics.tap();
              setHere.mutate(undefined, {
                onError: (e) => Alert.alert("Couldn't do that", e instanceof Error ? e.message : "Give it another go."),
              });
            }}
            className="rounded-pill px-4 py-2.5"
            style={{ backgroundColor: colors.accent, opacity: setHere.isPending ? 0.6 : 1 }}
          >
            <Text className="font-body-extrabold text-[13px]" style={{ color: colors.base }}>I'm here</Text>
          </Pressable>
        )}
        <Pill icon="navigate-outline" label="Directions" onPress={() => openDirections(game)} />
        <Pill icon="chatbubble-outline" label="Chat" onPress={() => router.push(`/chat/${game.id}`)} />
      </View>
    </View>
  );
}

function Line({ icon, text, tone }: { icon: keyof typeof Ionicons.glyphMap; text: string; tone?: string }) {
  return (
    <View className="flex-row items-center gap-2.5">
      <Ionicons name={icon} size={15} color={tone ?? colors.textDim} />
      <Text className="flex-1 text-[13.5px]" style={{ color: tone ?? colors.textSecondary }}>{text}</Text>
    </View>
  );
}

function Pill({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      className="flex-row items-center gap-1.5 rounded-pill px-3.5 py-2.5 border"
      style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder }}
    >
      <Ionicons name={icon} size={13} color={colors.textSecondary} />
      <Text className="font-body-bold text-[12.5px]" style={{ color: colors.textSecondary }}>{label}</Text>
    </Pressable>
  );
}
