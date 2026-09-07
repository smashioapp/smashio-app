import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { useSession } from "../session";
import type { Database } from "../db.types";

type Row = Database["public"]["Tables"]["notifications"]["Row"];

export type NotificationItem = {
  id: string;
  type: string;
  gameId: string | null;
  actorId: string | null;
  actorDisplayName: string | null;
  actorPhotoPath: string | null;
  actorAvatarKey: string | null;
  params: Record<string, unknown>;
  title: string | null;
  body: string | null;
  // notifications-v2-plan.md §4.1 — the "why am I seeing this" second line, shown as a third
  // line here since the inbox has room the lock screen doesn't.
  expand: string | null;
  createdAt: string;
  readAt: string | null;
};

type RowWithActor = Row & {
  actor: { display_name: string | null; photo_path: string | null; avatar_key: string | null } | null;
};

function toItem(row: RowWithActor): NotificationItem {
  return {
    id: row.id,
    type: row.type,
    gameId: row.game_id,
    actorId: row.actor_id,
    actorDisplayName: row.actor?.display_name ?? null,
    actorPhotoPath: row.actor?.photo_path ?? null,
    actorAvatarKey: row.actor?.avatar_key ?? null,
    params: (row.params as Record<string, unknown>) ?? {},
    title: row.title,
    body: row.body,
    expand: (row as Row & { expand?: string | null }).expand ?? null,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

// §7 "Tap routing" — mirrors push-dispatch's screen mapping (index.ts's `rendered.screen`) since
// an inbox row and the push that (may have) accompanied it should land in the same place.
// notifications-v2-plan.md §3F widens this to post/player destinations, which have no game_id.
export function routeForNotification(item: NotificationItem): string | null {
  switch (item.type) {
    case "post_reply":
    case "reply_to_thread":
    case "post_reaction":
    case "followed_posted":
      return typeof item.params.post_id === "string" ? `/post/${item.params.post_id}` : null;
    case "new_follower":
      return item.actorId ? `/player/${item.actorId}` : null;
    case "achievement_earned":
      return "/(tabs)/profile";
    case "chat_mention":
      return item.gameId ? `/chat/${item.gameId}` : null;
    case "waitlist_promoted":
      return item.gameId ? `/game/${item.gameId}` : null;
  }

  if (!item.gameId) return null;
  switch (item.type) {
    case "join_request":
      return `/game/${item.gameId}?focus=requests`;
    case "post_game_rate":
      return `/post-game/${item.gameId}`;
    // Attendance is marked on the post-game screen too — it's the gate in front of the rating
    // list, not a separate destination (post-game-plan.md D4).
    case "post_game_attendance":
      return `/post-game/${item.gameId}`;
    case "message":
      return `/chat/${item.gameId}`;
    case "join_decision":
      return item.params.status === "rejected" ? "/(tabs)/discover" : `/game/${item.gameId}`;
    default:
      return `/game/${item.gameId}`;
  }
}

// Mounted once at the root (ui/app/_layout.tsx), like usePushRegistration — a single Realtime
// channel keeps both the inbox list and the unread badge in sync rather than each screen opening
// its own subscription.
export function useNotificationRealtimeSync() {
  const { session } = useSession();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `profile_id=eq.${userId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
          queryClient.invalidateQueries({ queryKey: ["notifications_unread", userId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}

// Only sent_at-stamped rows — an unsent row is either mid-flight (push-dispatch hasn't rendered
// it yet) or was silently dropped by quiet hours (§6.5), neither of which has copy to show.
export function useNotificationsInbox() {
  const { session } = useSession();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ["notifications", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*, actor:profiles!notifications_actor_id_fkey(display_name, photo_path, avatar_key)")
        .not("sent_at", "is", null)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((row) => toItem(row as unknown as RowWithActor));
    },
  });
}

export function useUnreadNotificationCount() {
  const { session } = useSession();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ["notifications_unread", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

// Keeps the home-screen app icon badge in step with the in-app unread count (§ scenario 2 —
// same number both places). Mounted once at the root alongside useNotificationRealtimeSync.
export function useAppIconBadgeSync() {
  const { data: unreadCount } = useUnreadNotificationCount();

  useEffect(() => {
    if (unreadCount === undefined) return;
    Notifications.setBadgeCountAsync(unreadCount).catch(() => {});
  }, [unreadCount]);
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
      queryClient.invalidateQueries({ queryKey: ["notifications_unread", userId] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
      queryClient.invalidateQueries({ queryKey: ["notifications_unread", userId] });
    },
  });
}
