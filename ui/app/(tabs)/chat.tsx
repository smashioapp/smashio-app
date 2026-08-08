import { View, Text, Pressable, FlatList, RefreshControl } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../lib/theme";
import { useChatThreads } from "../../lib/queries/messages";
import { Screen } from "../../components/Screen";
import { ChatRowSkeletonList } from "../../components/Skeleton";

export default function ChatList() {
  const threadsQuery = useChatThreads();
  const threads = threadsQuery.data ?? [];

  return (
    <Screen>
      <Text className="font-display text-[26px] px-5 pt-3 pb-3.5" style={{ color: colors.text }}>
        Chat
      </Text>
      {threadsQuery.isLoading ? (
        <ChatRowSkeletonList />
      ) : threads.length === 0 ? (
        <View className="items-center gap-2.5 px-5 pt-8">
          <Text className="text-[13px] text-center" style={{ color: colors.textSecondary }}>
            No chats yet — join or host a game to start one.
          </Text>
          <Pressable onPress={() => router.push("/(tabs)/discover")} className="rounded-pill px-4 py-2 border-[1.5px]" style={{ borderColor: "rgba(255,255,255,0.15)" }}>
            <Text className="font-body-bold text-[12.5px]" style={{ color: colors.text }}>
              Find a game
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={threads}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 110 }}
          refreshControl={
            <RefreshControl refreshing={threadsQuery.isRefetching} onRefresh={() => threadsQuery.refetch()} tintColor={colors.accent} />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/chat/${item.id}`)}
              className="flex-row items-center gap-3 px-2 py-3 border-b"
              style={{ borderColor: "rgba(255,255,255,0.05)" }}
            >
              <View
                className="w-[46px] h-[46px] rounded-2xl items-center justify-center"
                style={{ backgroundColor: colors.surfaceAlt }}
              >
                <Ionicons name="tennisball-outline" size={20} color={colors.accent} />
              </View>
              <View className="flex-1">
                <View className="flex-row justify-between">
                  <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
                    {item.venue}
                  </Text>
                  <Text className="text-[10.5px] font-body-bold" style={{ color: colors.textMuted }}>
                    {item.time}
                  </Text>
                </View>
                <Text numberOfLines={1} className="text-[12.5px] mt-0.5" style={{ color: colors.textSecondary }}>
                  {item.preview}
                </Text>
              </View>
              {item.unread && <View className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.accent }} />}
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}
