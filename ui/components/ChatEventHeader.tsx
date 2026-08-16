import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, tierColor } from "../lib/theme";
import { formatCountdown } from "../lib/format";
import { BackButton } from "./BackButton";
import type { Game } from "../lib/mockData";

// The merged sticky bar (docs/v2-design-plan.md §4.5) — one slim row replaces the old stacked
// pair (a plain nav header plus this component as a separate collapsing card below it). Always
// dense; there's no expanded state left to collapse out of.
export function ChatEventHeader({
  game,
  onPress,
  onBack,
  onDetails,
}: {
  game: Game;
  onPress: () => void;
  onBack: () => void;
  onDetails: () => void;
}) {
  const cancelled = game.status === "cancelled";
  const dotColor = cancelled ? colors.danger : tierColor(game.skill);
  // formatCountdown only speaks once a game is inside 24h (chat-plan.md's own threshold) — a
  // thread for something further out falls back to the plain date/time instead of going blank,
  // and drops the urgency dot/colour since there's no urgency to signal yet.
  const countingDown = !cancelled && formatCountdown(game.startsAt) != null;
  const subtitle = cancelled ? "Cancelled" : formatCountdown(game.startsAt) ?? `${game.date} · ${game.time}`;
  const subtitleColor = cancelled ? colors.danger : countingDown ? colors.intermediate : colors.textTertiary;

  return (
    <View
      className="flex-row items-center gap-2.5 px-4 border-b"
      style={{ paddingVertical: 10, borderColor: "rgba(255,255,255,0.06)", backgroundColor: colors.surface, borderLeftWidth: 3, borderLeftColor: dotColor }}
    >
      <BackButton onPress={onBack} />

      <Pressable onPress={onPress} className="flex-1 min-w-0">
        <Text numberOfLines={1} className="font-body-bold text-[14.5px]" style={{ color: colors.text }}>
          {[game.venue, game.courts].filter(Boolean).join(" — ")}
        </Text>
        <View className="flex-row items-center gap-1.5 mt-0.5">
          {countingDown && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.intermediate }} />}
          <Text numberOfLines={1} className="text-[12px] font-body-semibold" style={{ color: subtitleColor }}>
            {subtitle}
          </Text>
        </View>
      </Pressable>

      <View className="rounded-pill px-2.5 py-1" style={{ backgroundColor: colors.surfaceAlt }}>
        <Text className="font-body-bold text-[12px]" style={{ color: colors.textDim }}>
          {game.joinedCount}/{game.maxPlayers}
        </Text>
      </View>

      <Pressable onPress={onDetails} className="w-8 h-8 items-center justify-center" hitSlop={8}>
        <Ionicons name="ellipsis-horizontal" size={19} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}
