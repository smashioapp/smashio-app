import { useEffect, useRef } from "react";
import { View, Text, Pressable, FlatList, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import { router } from "expo-router";
import { colors } from "../../lib/theme";
import { useTabBarSpace } from "../../lib/nav";
import { makeScrollHideHandler, registerScrollToTop, unregisterScrollToTop } from "../../lib/navScroll";
import { useChatThreads } from "../../lib/queries/messages";
import { Screen } from "../../components/Screen";
import { ChatRowSkeletonList } from "../../components/Skeleton";
import { RefreshableList } from "../../components/RefreshableList";
import { EmptyState } from "../../components/EmptyState";
import { ShuttlecockGlyph } from "../../components/ShuttlecockSpinner";
import type { ChatThread } from "../../lib/queries/messages";

export default function ChatList() {
  const threadsQuery = useChatThreads();
  const threads = threadsQuery.data ?? [];
  const tabBarSpace = useTabBarSpace();
  const listRef = useRef<FlatList<ChatThread>>(null);
  const scrollHide = useRef(makeScrollHideHandler()).current;

  useEffect(() => {
    registerScrollToTop("chat", () => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
    return () => unregisterScrollToTop("chat");
  }, []);

  return (
    <Screen>
      <Text className="font-display text-[26px] px-5 pt-3 pb-3.5" style={{ color: colors.text }}>
        Chat
      </Text>
      {threadsQuery.isLoading ? (
        <ChatRowSkeletonList />
      ) : threads.length === 0 ? (
        <EmptyState
          title="Quiet in here"
          subtitle="Join or host a game and the group chat opens up automatically."
          ctaLabel="Find a game"
          onCta={() => router.push("/(tabs)/discover")}
        />
      ) : (
        <RefreshableList
          ref={listRef}
          data={threads}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: tabBarSpace }}
          refreshing={threadsQuery.isRefetching}
          onRefresh={() => threadsQuery.refetch()}
          onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => scrollHide(e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={32}
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
                <ShuttlecockGlyph size={20} />
              </View>
              <View className="flex-1">
                <View className="flex-row justify-between">
                  <Text className="font-body-bold text-[15.5px]" style={{ color: colors.text }}>
                    {item.title}
                  </Text>
                  <Text className="text-[12.5px] font-body-bold" style={{ color: colors.textMuted }}>
                    {item.time}
                  </Text>
                </View>
                <Text numberOfLines={1} className="text-[14.5px] mt-0.5" style={{ color: colors.textSecondary }}>
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
