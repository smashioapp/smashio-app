import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useState } from "react";
import { router } from "expo-router";
import { colors, LAYOUT } from "../lib/theme";
import { Screen } from "../components/Screen";
import { BackButton } from "../components/BackButton";
import { haptics } from "../lib/haptics";
import {
  type NotificationItem,
  routeForNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationsInbox,
} from "../lib/queries/notifications";

// Realtime-subscribed activity inbox (docs/notifications-plan.md §5 P2, §7). The list itself is a
// plain useQuery — ui/lib/queries/notifications.ts's useNotificationRealtimeSync (mounted once at
// the root) invalidates it on any change, so this screen doesn't open its own channel.
function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function NotificationRow({ item, onPress }: { item: NotificationItem; onPress: (item: NotificationItem) => void }) {
  const unread = !item.readAt;
  return (
    <Pressable onPress={() => onPress(item)}>
      <View
        className="flex-row gap-3 px-5 py-3.5"
        style={{ borderBottomWidth: 1, borderBottomColor: LAYOUT.HAIRLINE }}
      >
        <View className="pt-1.5">
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 3.5,
              backgroundColor: unread ? colors.accent : "transparent",
            }}
          />
        </View>
        <View className="flex-1 min-w-0">
          <Text
            numberOfLines={1}
            className={unread ? "font-body-bold text-[14px]" : "font-body-semibold text-[14px]"}
            style={{ color: colors.text }}
          >
            {item.title ?? "Notification"}
          </Text>
          {!!item.body && (
            <Text numberOfLines={2} className="text-[13px] mt-0.5" style={{ color: colors.textSecondary }}>
              {item.body}
            </Text>
          )}
          <Text className="text-[11.5px] mt-1" style={{ color: colors.textTertiary }}>
            {timeAgo(item.createdAt)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function NotificationsInbox() {
  const { data: items, isLoading, refetch } = useNotificationsInbox();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const openItem = (item: NotificationItem) => {
    haptics.tick();
    if (!item.readAt) markRead.mutate(item.id);
    const route = routeForNotification(item);
    if (route) router.push(route as never);
  };

  const hasUnread = !!items?.some((i) => !i.readAt);

  return (
    <Screen>
      <View className="flex-row items-center justify-between gap-3 px-5 pt-2 pb-1">
        <View className="flex-row items-center gap-3">
          <BackButton onPress={() => router.back()} />
          <Text className="font-display text-[20px]" style={{ color: colors.text }}>
            Notifications
          </Text>
        </View>
        {hasUnread && (
          <Pressable
            onPress={() => {
              haptics.tap();
              markAllRead.mutate();
            }}
            hitSlop={8}
          >
            <Text className="text-[12.5px] font-body-semibold" style={{ color: colors.textSecondary }}>
              Mark all read
            </Text>
          </Pressable>
        )}
      </View>

      <FlatList
        data={items ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <NotificationRow item={item} onPress={openItem} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} />}
        contentContainerStyle={items && items.length > 0 ? undefined : { flex: 1 }}
        ListEmptyComponent={
          !isLoading ? (
            <View className="flex-1 items-center justify-center px-8">
              <Text className="font-body-bold text-[15px]" style={{ color: colors.text }}>
                Nothing yet
              </Text>
              <Text className="text-[13.5px] mt-1.5 text-center" style={{ color: colors.textSecondary }}>
                Join requests, game changes and reminders will show up here.
              </Text>
            </View>
          ) : null
        }
      />
    </Screen>
  );
}
