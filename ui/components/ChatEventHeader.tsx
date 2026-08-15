import { useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { colors } from "../lib/theme";
import { timing } from "../lib/motion";
import { CountdownChip } from "./CountdownChip";
import type { Game } from "../lib/mockData";

// Pinned above the thread — the facts every "what time again? which court?" message is
// really asking for. Collapses to one line past ~40px of scroll, but never leaves
// (chat-plan.md constraint 1).
export function ChatEventHeader({ game, collapsed, onPress }: { game: Game; collapsed: boolean; onPress: () => void }) {
  const progress = useSharedValue(collapsed ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(collapsed ? 1 : 0, timing(180));
  }, [collapsed]);

  const cancelled = game.status === "cancelled";
  const accent = cancelled ? colors.danger : colors.accent;

  const containerStyle = useAnimatedStyle(() => ({
    paddingTop: 12 - progress.value * 4,
    paddingBottom: 12 - progress.value * 6,
  }));
  const detailStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    height: 18 * (1 - progress.value),
  }));

  return (
    <Pressable onPress={onPress}>
      <Animated.View
        className="px-5 flex-row items-center justify-between border-b"
        style={[
          { borderColor: "rgba(255,255,255,0.06)", borderLeftWidth: 3, borderLeftColor: accent, backgroundColor: colors.surface },
          containerStyle,
        ]}
      >
        <View className="flex-1 pr-2">
          <Text numberOfLines={1} className="font-body-bold text-[14px]" style={{ color: cancelled ? colors.danger : colors.text }}>
            {cancelled ? "Cancelled" : `${game.date} · ${game.time}${game.courts ? ` · ${game.courts}` : ""}`}
          </Text>
          <Animated.View style={detailStyle}>
            <Text numberOfLines={1} className="text-[12.5px] mt-0.5" style={{ color: colors.textTertiary }}>
              {game.joinedCount}/{game.maxPlayers} players · ${game.cost.toFixed(0)} each
            </Text>
          </Animated.View>
        </View>
        <View className="flex-row items-center gap-2">
          {!cancelled && <CountdownChip startsAt={game.startsAt} />}
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </View>
      </Animated.View>
    </Pressable>
  );
}
