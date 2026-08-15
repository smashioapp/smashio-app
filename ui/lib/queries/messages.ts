import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { avatarColor } from "../theme";
import { formatDate } from "../format";

async function requireUserId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return user.id;
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export type ChatMessage = { from: string; senderId: string; me: boolean; color?: string; text: string; time: string };

export function useMessages(gameId: string) {
  const queryClient = useQueryClient();
  const queryKey = ["messages", gameId];

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<ChatMessage[]> => {
      const uid = await requireUserId();
      const { data: rows, error } = await supabase
        .from("messages")
        .select("sender_id, body, created_at")
        .eq("game_id", gameId)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const senderIds = [...new Set((rows ?? []).map((r) => r.sender_id))].filter((id) => id !== uid);
      const names: Record<string, string> = {};
      if (senderIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("id, display_name").in("id", senderIds);
        for (const p of profiles ?? []) names[p.id] = p.display_name;
      }

      return (rows ?? []).map((r) => ({
        from: r.sender_id === uid ? "You" : names[r.sender_id] || "Player",
        senderId: r.sender_id,
        me: r.sender_id === uid,
        color: r.sender_id === uid ? undefined : avatarColor(r.sender_id),
        text: r.body,
        time: formatClock(r.created_at),
      }));
    },
    enabled: !!gameId,
  });

  // Payload rows don't carry the sender's name, and a naive per-event cache patch would need
  // to duplicate the name-lookup logic above — invalidating and refetching is simpler and chat
  // volume is low enough for MVP.
  useEffect(() => {
    if (!gameId) return;
    const channel = supabase
      .channel(`messages:${gameId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `game_id=eq.${gameId}` },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  return query;
}

export function useSendMessage(gameId: string) {
  return useMutation({
    mutationFn: async (text: string) => {
      const uid = await requireUserId();
      const { error } = await supabase.from("messages").insert({ game_id: gameId, sender_id: uid, body: text });
      if (error) throw error;
    },
  });
}

export function useMarkThreadRead(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const uid = await requireUserId();
      const { error } = await supabase
        .from("message_reads")
        .upsert({ game_id: gameId, profile_id: uid, last_read_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat_threads"] }),
  });
}

export type ChatThread = { id: string; venue: string; title: string; time: string; preview: string; unread: boolean };

export function useChatThreads() {
  return useQuery({
    queryKey: ["chat_threads"],
    queryFn: async (): Promise<ChatThread[]> => {
      const uid = await requireUserId();

      const { data: memberships, error: mErr } = await supabase
        .from("game_players")
        .select("game_id")
        .eq("profile_id", uid)
        .eq("status", "approved");
      if (mErr) throw mErr;
      const { data: hosting, error: hErr } = await supabase.from("games").select("id").eq("organizer_id", uid);
      if (hErr) throw hErr;

      const gameIds = [...new Set([...(memberships ?? []).map((m) => m.game_id), ...(hosting ?? []).map((h) => h.id)])];
      if (gameIds.length === 0) return [];

      const { data: games, error: gErr } = await supabase
        .from("games_public")
        .select("id, venue_name, starts_at")
        .in("id", gameIds);
      if (gErr) throw gErr;
      const venueById: Record<string, string> = {};
      const startsAtById: Record<string, string> = {};
      for (const g of games ?? []) {
        venueById[g.id!] = g.venue_name!;
        startsAtById[g.id!] = g.starts_at!;
      }

      const { data: messages, error: msgErr } = await supabase
        .from("messages")
        .select("game_id, sender_id, body, created_at")
        .in("game_id", gameIds)
        .order("created_at", { ascending: false });
      if (msgErr) throw msgErr;

      const { data: reads, error: rErr } = await supabase
        .from("message_reads")
        .select("game_id, last_read_at")
        .eq("profile_id", uid)
        .in("game_id", gameIds);
      if (rErr) throw rErr;
      const readAtByGame: Record<string, string> = {};
      for (const r of reads ?? []) readAtByGame[r.game_id] = r.last_read_at;

      const lastByGame = new Map<string, NonNullable<typeof messages>[number]>();
      for (const m of messages ?? []) if (!lastByGame.has(m.game_id)) lastByGame.set(m.game_id, m);

      return gameIds
        .filter((id) => venueById[id])
        .map((id) => {
          const last = lastByGame.get(id);
          const readAt = readAtByGame[id];
          const startsAt = startsAtById[id];
          return {
            id,
            venue: venueById[id],
            title: startsAt ? `${venueById[id]} · ${formatDate(startsAt)}` : venueById[id],
            time: last ? formatClock(last.created_at) : "",
            preview: last ? `${last.sender_id === uid ? "You: " : ""}${last.body}` : "No messages yet",
            unread: !!last && (!readAt || last.created_at > readAt),
          };
        })
        .sort((a, b) => {
          const ta = lastByGame.get(a.id)?.created_at ?? "";
          const tb = lastByGame.get(b.id)?.created_at ?? "";
          return tb.localeCompare(ta);
        });
    },
  });
}
