import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { useSession } from "../session";
import type { Database } from "../db.types";

type Row = Database["public"]["Tables"]["notifications"]["Row"];

export type NotificationItem = {
  id: string;
  type: string;
  gameId: string | null;
  params: Record<string, unknown>;
  title: string | null;
  body: string | null;
  createdAt: string;
  readAt: string | null;
};

function toItem(row: Row): NotificationItem {
  return {
    id: row.id,
    type: row.type,
    gameId: row.game_id,
    params: (row.params as Record<string, unknown>) ?? {},
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

// §7 "Tap routing" — mirrors push-dispatch's screen mapping (index.ts's `rendered.screen`) since
// an inbox row and the push that (may have) accompanied it should land in the same place.
export function routeForNotification(item: NotificationItem): string | null {
  if (!item.gameId) return null;
  switch (item.type) {
    case "join_request":
      return `/game/${item.gameId}?focus=requests`;
    case "post_game_rate":
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
        .select("*")
        .not("sent_at", "is", null)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map(toItem);
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
