import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { colors } from "../lib/theme";
import { haptics } from "../lib/haptics";
import { useChatThreads } from "../lib/queries/messages";

// Game detail redesign artboard 06 — a live row, not a chevron, so the room reads as alive before
// you tap in. useChatThreads() is the same RPC the Chat tab already uses (social-plan N1); this
// just filters to the one thread for this game rather than adding a new endpoint.
export function ChatPreviewStrip({ gameId, memberCount }: { gameId: string; memberCount: number }) {
  const threadsQuery = useChatThreads();
  const thread = threadsQuery.data?.find((t) => t.id === gameId);

  return (
    <Pressable
      className="flex-row items-center gap-3 rounded-2xl p-3.5 border"
      style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}
      onPress={() => {
        haptics.tap();
        router.push(`/chat/${gameId}`);
      }}
    >
      <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: colors.surfaceAlt }}>
        <Ionicons name="chatbubble-outline" size={16} color={colors.textTertiary} />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="font-body-bold text-[13px]" style={{ color: colors.text }}>
          Game chat · {memberCount} {memberCount === 1 ? "person" : "people"}
        </Text>
        <Text numberOfLines={1} className="text-[12px] mt-0.5" style={{ color: colors.textSecondary }}>
          {thread?.preview ?? "Say hi before the game"}
        </Text>
      </View>
      {thread && thread.unreadCount > 0 ? (
        <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: colors.accent }}>
          <Text className="font-body-extrabold text-[11px]" style={{ color: colors.base }}>
            {thread.unreadCount}
          </Text>
        </View>
      ) : (
        thread?.time && (
          <Text className="text-[11px]" style={{ color: colors.textTertiary }}>
            {thread.time}
          </Text>
        )
      )}
    </Pressable>
  );
}
