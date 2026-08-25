import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, SectionList, RefreshControl, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { colors } from "../../lib/theme";
import { useTabBarSpace } from "../../lib/nav";
import { makeScrollHideHandler, registerScrollToTop, unregisterScrollToTop } from "../../lib/navScroll";
import { useChatThreads } from "../../lib/queries/messages";
import { Screen } from "../../components/Screen";
import { ChatRowSkeletonList } from "../../components/Skeleton";
import { EmptyState } from "../../components/EmptyState";
import { ShuttlecockGlyph, ShuttlecockSpinner } from "../../components/ShuttlecockSpinner";
import { GameCover } from "../../components/GameCover";
import type { ChatThread } from "../../lib/queries/messages";

type Section = { title: string; data: ChatThread[] };

function UnreadBadge({ count }: { count: number }) {
  return (
    <View
      className="rounded-full items-center justify-center px-1.5"
      style={{ minWidth: 20, height: 20, backgroundColor: colors.accent }}
    >
      <Text className="font-body-bold text-[11px]" style={{ color: colors.base }}>
        {count > 9 ? "9+" : count}
      </Text>
    </View>
  );
}

function ChatRow({ thread }: { thread: ChatThread }) {
  return (
    <Pressable
      testID={`chat-thread-${thread.id}`}
      onPress={() => router.push(`/chat/${thread.id}`)}
      className="flex-row items-center gap-3 px-2 py-3 border-b"
      style={{ borderColor: "rgba(255,255,255,0.05)" }}
    >
      <View
        className="w-[46px] h-[46px] rounded-2xl items-center justify-center overflow-hidden"
        style={{ backgroundColor: colors.surfaceAlt, opacity: thread.closed ? 0.6 : 1 }}
      >
        {thread.coverKey ? (
          <GameCover coverKey={thread.coverKey} size="thumb" />
        ) : (
          <ShuttlecockGlyph size={20} />
        )}
      </View>
      <View className="flex-1">
        <View className="flex-row justify-between">
          <Text
            numberOfLines={1}
            className="font-body-bold text-[15.5px] flex-1 pr-2"
            style={{ color: thread.closed ? colors.textSecondary : colors.text }}
          >
            {thread.title}
          </Text>
          <Text className="text-[12.5px] font-body-bold" style={{ color: colors.textMuted }}>
            {thread.time}
          </Text>
        </View>
        <Text numberOfLines={1} className="text-[14.5px] mt-0.5" style={{ color: colors.textSecondary }}>
          {thread.preview}
        </Text>
      </View>
      {thread.unread && <UnreadBadge count={thread.unreadCount} />}
    </Pressable>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <View className="pt-4 pb-1.5 px-2" style={{ backgroundColor: colors.base }}>
      <Text className="text-[11.5px] font-body-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>
        {title} · {count}
      </Text>
    </View>
  );
}

export default function ChatList() {
  const threadsQuery = useChatThreads();
  const threads = threadsQuery.data ?? [];
  const tabBarSpace = useTabBarSpace();
  const listRef = useRef<SectionList<ChatThread, Section>>(null);
  const scrollHide = useRef(makeScrollHideHandler()).current;
  const [search, setSearch] = useState("");

  useEffect(() => {
    registerScrollToTop("chat", () =>
      listRef.current?.scrollToLocation({ sectionIndex: 0, itemIndex: 0, animated: true, viewOffset: 0 }),
    );
    return () => unregisterScrollToTop("chat");
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => t.title.toLowerCase().includes(q) || t.venue.toLowerCase().includes(q));
  }, [threads, search]);

  const sections = useMemo<Section[]>(() => {
    const upcoming = filtered.filter((t) => !t.closed);
    const past = filtered.filter((t) => t.closed);
    const out: Section[] = [];
    if (upcoming.length > 0) out.push({ title: "Upcoming", data: upcoming });
    if (past.length > 0) out.push({ title: "Past", data: past });
    return out;
  }, [filtered]);

  return (
    <Screen>
      <Text className="font-display text-[26px] px-5 pt-3 pb-3.5" style={{ color: colors.text }}>
        Chat
      </Text>

      {threads.length > 0 && (
        <View className="px-5 pb-3">
          <View
            className="flex-row items-center gap-2 rounded-pill px-4 border"
            style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder, height: 42 }}
          >
            <Ionicons name="search" size={16} color={colors.textTertiary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search chats…"
              placeholderTextColor={colors.textTertiary}
              className="flex-1 text-[14px]"
              style={{ color: colors.text }}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
              </Pressable>
            )}
          </View>
        </View>
      )}

      {threadsQuery.isLoading ? (
        <ChatRowSkeletonList />
      ) : threads.length === 0 ? (
        <EmptyState
          title="Quiet in here"
          subtitle="Join or host a game and the group chat opens up automatically."
          ctaLabel="Find a game"
          onCta={() => router.push("/(tabs)/discover")}
        />
      ) : sections.length === 0 ? (
        <View className="items-center pt-16 px-6">
          <Text className="text-[14.5px] text-center" style={{ color: colors.textSecondary }}>
            No chats match "{search}"
          </Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <SectionList
            ref={listRef}
            sections={sections}
            keyExtractor={(t) => t.id}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: tabBarSpace }}
            refreshControl={
              <RefreshControl
                refreshing={threadsQuery.isRefetching}
                onRefresh={() => threadsQuery.refetch()}
                tintColor="transparent"
                colors={["transparent"]}
                progressBackgroundColor="transparent"
              />
            }
            onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => scrollHide(e.nativeEvent.contentOffset.y)}
            scrollEventThrottle={32}
            renderSectionHeader={({ section }) => <SectionHeader title={section.title} count={section.data.length} />}
            renderItem={({ item }) => <ChatRow thread={item} />}
          />
          <ShuttlecockSpinner active={threadsQuery.isRefetching} />
        </View>
      )}
    </Screen>
  );
}
