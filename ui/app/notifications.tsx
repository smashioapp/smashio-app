import { Alert, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useMemo, useState } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, LAYOUT, avatarColor } from "../lib/theme";
import { Screen } from "../components/Screen";
import { BackButton } from "../components/BackButton";
import { Avatar } from "../components/Avatar";
import { haptics } from "../lib/haptics";
import { supabase } from "../lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import {
  type NotificationItem,
  routeForNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationsInbox,
} from "../lib/queries/notifications";

// Realtime-subscribed activity inbox (docs/notifications-plan.md §5 P2, §7; taxonomy and inline
// actions per notifications-v2-plan.md §4.3 — adding social types roughly doubles the type count,
// and a flat grey list doesn't survive that). The list itself is a plain useQuery —
// ui/lib/queries/notifications.ts's useNotificationRealtimeSync (mounted once at the root)
// invalidates it on any change, so this screen doesn't open its own channel.
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

// §4.3: icon + accent per type — tier palette reused (accent for roster wins, amber for nudges,
// red for cancellations, neutral for social) rather than inventing a second colour system.
const TYPE_STYLE: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  join_request: { icon: "person-add-outline", color: colors.accent },
  player_left: { icon: "exit-outline", color: colors.advanced },
  game_full: { icon: "checkmark-circle-outline", color: colors.intermediate },
  join_decision: { icon: "shield-checkmark-outline", color: colors.accent },
  waitlist_promoted: { icon: "arrow-up-circle-outline", color: colors.accent },
  game_cancelled: { icon: "close-circle-outline", color: "#FF6767" },
  game_rescheduled: { icon: "time-outline", color: colors.advanced },
  details_changed: { icon: "information-circle-outline", color: colors.textSecondary },
  booking_verified: { icon: "shield-checkmark-outline", color: colors.intermediate },
  reminder_24h: { icon: "calendar-outline", color: colors.textSecondary },
  reminder_2h: { icon: "alarm-outline", color: colors.advanced },
  post_game_rate: { icon: "star-outline", color: colors.advanced },
  post_game_attendance: { icon: "clipboard-outline", color: colors.textSecondary },
  game_invite: { icon: "mail-open-outline", color: colors.accent },
  spot_declined: { icon: "person-remove-outline", color: colors.advanced },
  hold_nudge: { icon: "hourglass-outline", color: colors.advanced },
  hold_auto_released: { icon: "lock-open-outline", color: colors.textSecondary },
  nudge_underfilled: { icon: "megaphone-outline", color: colors.advanced },
  nudge_pending: { icon: "hourglass-outline", color: colors.advanced },
  alert_match: { icon: "sparkles-outline", color: colors.accent },
  message: { icon: "chatbubble-outline", color: colors.textSecondary },
  chat_mention: { icon: "at-outline", color: colors.accent },
  post_reply: { icon: "chatbubble-ellipses-outline", color: colors.textSecondary },
  reply_to_thread: { icon: "chatbubbles-outline", color: colors.textSecondary },
  post_reaction: { icon: "heart-outline", color: colors.textSecondary },
  new_follower: { icon: "person-outline", color: colors.textSecondary },
  followed_posted: { icon: "people-outline", color: colors.textSecondary },
  achievement_earned: { icon: "trophy-outline", color: colors.advanced },
};

function typeStyle(type: string) {
  return TYPE_STYLE[type] ?? { icon: "notifications-outline" as const, color: colors.textSecondary };
}

// §4.3 "grouping key" — Today / Yesterday / This week / Earlier.
function groupLabel(iso: string): string {
  const now = new Date();
  const d = new Date(iso);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This week";
  return "Earlier";
}

function groupItems(items: NotificationItem[]): { title: string; data: NotificationItem[] }[] {
  const order = ["Today", "Yesterday", "This week", "Earlier"];
  const buckets = new Map<string, NotificationItem[]>();
  for (const item of items) {
    const key = groupLabel(item.createdAt);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(item);
  }
  return order.filter((k) => buckets.has(k)).map((k) => ({ title: k, data: buckets.get(k)! }));
}

function JoinRequestActions({ item }: { item: NotificationItem }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);

  const act = async (kind: "approve" | "decline") => {
    if (!item.gameId) return;
    haptics.tap();
    setBusy(kind);
    try {
      await supabase.rpc(kind === "approve" ? "approve_join_action" : "decline_join_action", {
        p_notification_id: item.id,
        p_game_id: item.gameId,
      });
      haptics.success();
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications_unread"] });
    } catch (err) {
      Alert.alert("Couldn't do that", err instanceof Error ? err.message : "Give it another go.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View className="flex-row gap-2 mt-2" style={{ marginLeft: 48 }}>
      <Pressable
        onPress={() => act("approve")}
        disabled={busy !== null}
        className="rounded-pill px-4 py-2"
        style={{ backgroundColor: colors.accent, opacity: busy && busy !== "approve" ? 0.5 : 1 }}
      >
        <Text className="text-[12.5px] font-body-bold" style={{ color: colors.base }}>
          {busy === "approve" ? "Approving…" : "Approve"}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => act("decline")}
        disabled={busy !== null}
        className="rounded-pill px-4 py-2 border"
        style={{ borderColor: colors.cardBorder, opacity: busy && busy !== "decline" ? 0.5 : 1 }}
      >
        <Text className="text-[12.5px] font-body-bold" style={{ color: colors.textSecondary }}>
          {busy === "decline" ? "Declining…" : "Decline"}
        </Text>
      </Pressable>
    </View>
  );
}

function NotificationRow({ item, onPress }: { item: NotificationItem; onPress: (item: NotificationItem) => void }) {
  const unread = !item.readAt;
  const style = typeStyle(item.type);
  // §2 principle 9: anything caused by a human carries that person's avatar; anything caused by
  // the system doesn't pretend to.
  const hasActor = !!item.actorId && !!item.actorDisplayName;

  return (
    <Pressable onPress={() => onPress(item)}>
      <View
        className="flex-row gap-3 px-5 py-3.5"
        style={{ borderBottomWidth: 1, borderBottomColor: LAYOUT.HAIRLINE }}
      >
        <View className="pt-0.5">
          {hasActor ? (
            <Avatar
              id={item.actorId!}
              name={item.actorDisplayName!}
              color={avatarColor(item.actorId!)}
              size={34}
              photoUri={item.actorPhotoPath ? supabase.storage.from("avatars").getPublicUrl(item.actorPhotoPath).data.publicUrl : null}
              avatarKey={item.actorAvatarKey}
            />
          ) : (
            <View
              className="items-center justify-center rounded-full"
              style={{ width: 34, height: 34, backgroundColor: colors.surfaceAlt }}
            >
              <Ionicons name={style.icon} size={17} color={style.color} />
            </View>
          )}
        </View>
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-2">
            <Text
              numberOfLines={1}
              className={unread ? "font-body-bold text-[14px] flex-1" : "font-body-semibold text-[14px] flex-1"}
              style={{ color: colors.text }}
            >
              {item.title ?? "Notification"}
            </Text>
            {unread && (
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.accent }} />
            )}
          </View>
          {!!item.body && (
            <Text numberOfLines={2} className="text-[13px] mt-0.5" style={{ color: colors.textSecondary }}>
              {item.body}
            </Text>
          )}
          {!!item.expand && (
            <Text numberOfLines={2} className="text-[12px] mt-1" style={{ color: colors.textTertiary }}>
              {item.expand}
            </Text>
          )}
          <Text className="text-[11.5px] mt-1" style={{ color: colors.textTertiary }}>
            {timeAgo(item.createdAt)}
          </Text>
          {/* §1.4: the tray has Approve/Decline (P3); the inbox didn't, which was backwards. */}
          {item.type === "join_request" && <JoinRequestActions item={item} />}
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

  const sections = useMemo(() => groupItems(items ?? []), [items]);
  const rows = useMemo(
    () => sections.flatMap((s) => [{ kind: "header" as const, title: s.title }, ...s.data.map((item) => ({ kind: "item" as const, item }))]),
    [sections],
  );

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
        data={rows}
        keyExtractor={(row, i) => (row.kind === "header" ? `h-${row.title}` : row.item.id) + i}
        renderItem={({ item: row }) =>
          row.kind === "header" ? (
            <Text
              className="font-body-extrabold text-[11px] uppercase px-5 pt-4 pb-1.5"
              style={{ color: colors.textTertiary, letterSpacing: 0.5 }}
            >
              {row.title}
            </Text>
          ) : (
            <NotificationRow item={row.item} onPress={openItem} />
          )
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} />}
        contentContainerStyle={rows.length > 0 ? undefined : { flex: 1 }}
        ListEmptyComponent={
          !isLoading ? (
            <View className="flex-1 items-center justify-center px-8">
              <Text className="font-body-bold text-[15px]" style={{ color: colors.text }}>
                All quiet for now
              </Text>
              <Text className="text-[13.5px] mt-1.5 text-center" style={{ color: colors.textSecondary }}>
                Join requests, game changes and reminders will pop up here.
              </Text>
            </View>
          ) : null
        }
      />
    </Screen>
  );
}
