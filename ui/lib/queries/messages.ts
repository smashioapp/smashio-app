import { useCallback, useEffect } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { avatarColor } from "../theme";
import { formatDate } from "../format";
import type { Database } from "../db.types";

const PAGE_SIZE = 50;

export function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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

function avatarUrl(photoPath: string | null | undefined): string | null {
  return photoPath ? supabase.storage.from("avatars").getPublicUrl(photoPath).data.publicUrl : null;
}

export type ChatMessageKind = "text" | "image" | "system" | "game_share";
export type SendStatus = "sent" | "pending" | "failed";
export type ApprovalStatus = "approved" | "pending";

export type ReplyPreview = { senderId: string | null; body: string; kind: ChatMessageKind };

export type ChatMessage = {
  id: string;
  clientId: string | null;
  kind: ChatMessageKind;
  systemEvent: string | null;
  senderId: string | null;
  me: boolean;
  body: string;
  // A storage path for a sent image ("{game}/{uid}/{uuid}.jpg"), or a local "file://" uri
  // while an optimistic send is still pending upload. Resolve the former to a viewable URL
  // with useSignedChatImageUrl — the bucket is private, so this can't be a public URL.
  imagePath: string | null;
  mentions: string[];
  createdAt: string;
  time: string;
  status: SendStatus;
  replyTo: ReplyPreview | null;
  gameShareId: string | null;
  approvalStatus: ApprovalStatus;
};

type MessageRow = Database["public"]["Tables"]["messages"]["Row"];

function toChatMessage(row: MessageRow, uid: string): ChatMessage {
  return {
    id: row.id,
    clientId: row.client_id,
    kind: row.kind as ChatMessageKind,
    systemEvent: row.system_event,
    senderId: row.sender_id,
    me: row.sender_id === uid,
    body: row.body,
    imagePath: row.image_path,
    mentions: row.mentions ?? [],
    createdAt: row.created_at,
    time: formatClock(row.created_at),
    status: "sent",
    replyTo: row.reply_to_message_id
      ? { senderId: row.reply_to_sender_id, body: row.reply_to_body ?? "", kind: (row.reply_to_kind as ChatMessageKind) ?? "text" }
      : null,
    gameShareId: row.game_share_id,
    approvalStatus: row.approval_status as ApprovalStatus,
  };
}

// Signed URLs (private bucket) expire in 1h — staleTime just under that so the cache
// refreshes itself before a stale link 403s in the image bubble.
export function useSignedChatImageUrl(imagePath: string | null) {
  return useQuery({
    queryKey: ["chat_media_url", imagePath],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("chat-media").createSignedUrl(imagePath!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
    enabled: !!imagePath && !imagePath.startsWith("file://"),
    staleTime: 50 * 60 * 1000,
  });
}

type MessagesPage = { items: ChatMessage[]; oldestCursor: string | null };

function messagesQueryKey(gameId: string) {
  return ["messages", gameId] as const;
}

function patchMessages(
  queryClient: ReturnType<typeof useQueryClient>,
  gameId: string,
  updater: (pages: MessagesPage[]) => MessagesPage[],
) {
  queryClient.setQueryData<InfiniteData<MessagesPage>>(messagesQueryKey(gameId), (old) => {
    if (!old) return old;
    return { ...old, pages: updater(old.pages) };
  });
}

// Pages are fetched newest-first (pages[0] = latest 50), each page internally ascending —
// flatten with reverse() so the render list ends up oldest-to-newest overall.
export function flattenMessagePages(data: InfiniteData<MessagesPage> | undefined): ChatMessage[] {
  if (!data) return [];
  return data.pages.slice().reverse().flatMap((p) => p.items);
}

export function useMessages(gameId: string) {
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: messagesQueryKey(gameId),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<MessagesPage> => {
      const uid = await requireUserId();
      let q = supabase
        .from("messages")
        .select("*")
        .eq("game_id", gameId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (pageParam) q = q.lt("created_at", pageParam);
      const { data, error } = await q;
      if (error) throw error;
      const items = (data ?? []).slice().reverse().map((r) => toChatMessage(r, uid));
      return { items, oldestCursor: items[0]?.createdAt ?? null };
    },
    getNextPageParam: (lastPage) => (lastPage.items.length === PAGE_SIZE ? lastPage.oldestCursor : undefined),
    enabled: !!gameId,
  });

  useEffect(() => {
    if (!gameId) return;
    let uid: string | null = null;
    requireUserId().then((id) => (uid = id));

    const channel = supabase
      .channel(`messages:${gameId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `game_id=eq.${gameId}` },
        (payload) => {
          if (!uid) return;
          const row = payload.new as MessageRow;
          const incoming = toChatMessage(row, uid);
          patchMessages(queryClient, gameId, (pages) => {
            if (pages.length === 0) return [{ items: [incoming], oldestCursor: incoming.createdAt }];
            const already = pages.some((p) => p.items.some((m) => m.id === incoming.id || (m.clientId && m.clientId === incoming.clientId)));
            if (already) {
              return pages.map((p, i) =>
                i === 0
                  ? { ...p, items: p.items.map((m) => (m.clientId && m.clientId === incoming.clientId ? incoming : m)) }
                  : p,
              );
            }
            const [first, ...rest] = pages;
            return [{ ...first, items: [...first.items, incoming] }, ...rest];
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `game_id=eq.${gameId}` },
        (payload) => {
          const row = payload.new as MessageRow;
          if (!row.deleted_at) return;
          patchMessages(queryClient, gameId, (pages) => pages.map((p) => ({ ...p, items: p.items.filter((m) => m.id !== row.id) })));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  return { ...query, messages: flattenMessagePages(query.data) };
}

export function useSendMessage(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      clientId,
      text,
      mentions,
      replyTo,
    }: {
      clientId: string;
      text: string;
      mentions: string[];
      replyTo?: ChatMessage | null;
    }) => {
      const uid = await requireUserId();
      const { data, error } = await supabase
        .from("messages")
        .insert({
          game_id: gameId,
          sender_id: uid,
          body: text,
          kind: "text",
          mentions,
          client_id: clientId,
          reply_to_message_id: replyTo?.id ?? null,
          reply_to_sender_id: replyTo?.senderId ?? null,
          reply_to_body: replyTo?.body ?? null,
          reply_to_kind: replyTo?.kind ?? null,
        })
        .select("*")
        .single();
      if (error) {
        if ((error as { code?: string }).code === "23505") {
          const { data: existing } = await supabase.from("messages").select("*").eq("client_id", clientId).single();
          if (existing) return existing;
        }
        throw error;
      }
      return data;
    },
    onMutate: async ({ clientId, text, replyTo }) => {
      const uid = await requireUserId();
      const optimistic: ChatMessage = {
        id: clientId,
        clientId,
        kind: "text",
        systemEvent: null,
        senderId: uid,
        me: true,
        body: text,
        imagePath: null,
        mentions: [],
        createdAt: new Date().toISOString(),
        time: formatClock(new Date().toISOString()),
        status: "pending",
        replyTo: replyTo ? { senderId: replyTo.senderId, body: replyTo.body, kind: replyTo.kind } : null,
        gameShareId: null,
        approvalStatus: "approved",
      };
      patchMessages(queryClient, gameId, (pages) => {
        if (pages.length === 0) return [{ items: [optimistic], oldestCursor: optimistic.createdAt }];
        const [first, ...rest] = pages;
        return [{ ...first, items: [...first.items, optimistic] }, ...rest];
      });
    },
    onSuccess: (data, { clientId }) => {
      const uid = data.sender_id!;
      const resolved = toChatMessage(data as MessageRow, uid);
      patchMessages(queryClient, gameId, (pages) =>
        pages.map((p) => ({ ...p, items: p.items.map((m) => (m.clientId === clientId ? resolved : m)) })),
      );
    },
    onError: (_err, { clientId }) => {
      patchMessages(queryClient, gameId, (pages) =>
        pages.map((p) => ({ ...p, items: p.items.map((m) => (m.clientId === clientId ? { ...m, status: "failed" as const } : m)) })),
      );
    },
  });
}

// A game shared into the current thread — always the game the thread itself belongs to (RLS
// requires the sender to actually be a member of the shared game), rendered as a live card.
export function useSendGameShare(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId }: { clientId: string }) => {
      const uid = await requireUserId();
      const { data, error } = await supabase
        .from("messages")
        .insert({ game_id: gameId, sender_id: uid, body: "", kind: "game_share", game_share_id: gameId, client_id: clientId })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onMutate: async ({ clientId }) => {
      const uid = await requireUserId();
      const optimistic: ChatMessage = {
        id: clientId,
        clientId,
        kind: "game_share",
        systemEvent: null,
        senderId: uid,
        me: true,
        body: "",
        imagePath: null,
        mentions: [],
        createdAt: new Date().toISOString(),
        time: formatClock(new Date().toISOString()),
        status: "pending",
        replyTo: null,
        gameShareId: gameId,
        approvalStatus: "approved",
      };
      patchMessages(queryClient, gameId, (pages) => {
        if (pages.length === 0) return [{ items: [optimistic], oldestCursor: optimistic.createdAt }];
        const [first, ...rest] = pages;
        return [{ ...first, items: [...first.items, optimistic] }, ...rest];
      });
    },
    onSuccess: (data, { clientId }) => {
      const resolved = toChatMessage(data as MessageRow, (data as MessageRow).sender_id!);
      patchMessages(queryClient, gameId, (pages) =>
        pages.map((p) => ({ ...p, items: p.items.map((m) => (m.clientId === clientId ? resolved : m)) })),
      );
    },
    onError: (_err, { clientId }) => {
      patchMessages(queryClient, gameId, (pages) =>
        pages.map((p) => ({ ...p, items: p.items.map((m) => (m.clientId === clientId ? { ...m, status: "failed" as const } : m)) })),
      );
    },
  });
}

export function useSendChatImage(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId, localUri, caption }: { clientId: string; localUri: string; caption: string }) => {
      const uid = await requireUserId();
      const { File } = await import("expo-file-system");
      const bytes = await new File(localUri).arrayBuffer();
      const path = `${gameId}/${uid}/${uuidv4()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("chat-media")
        .upload(path, bytes, { contentType: "image/jpeg" });
      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from("messages")
        .insert({ game_id: gameId, sender_id: uid, body: caption, kind: "image", image_path: path, client_id: clientId })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onMutate: async ({ clientId, localUri, caption }) => {
      const uid = await requireUserId();
      const optimistic: ChatMessage = {
        id: clientId,
        clientId,
        kind: "image",
        systemEvent: null,
        senderId: uid,
        me: true,
        body: caption,
        imagePath: localUri,
        mentions: [],
        createdAt: new Date().toISOString(),
        time: formatClock(new Date().toISOString()),
        status: "pending",
        replyTo: null,
        gameShareId: null,
        approvalStatus: "approved",
      };
      patchMessages(queryClient, gameId, (pages) => {
        if (pages.length === 0) return [{ items: [optimistic], oldestCursor: optimistic.createdAt }];
        const [first, ...rest] = pages;
        return [{ ...first, items: [...first.items, optimistic] }, ...rest];
      });
    },
    onSuccess: (data, { clientId }) => {
      const resolved = toChatMessage(data as MessageRow, (data as MessageRow).sender_id!);
      patchMessages(queryClient, gameId, (pages) =>
        pages.map((p) => ({ ...p, items: p.items.map((m) => (m.clientId === clientId ? resolved : m)) })),
      );
    },
    onError: (_err, { clientId }) => {
      patchMessages(queryClient, gameId, (pages) =>
        pages.map((p) => ({ ...p, items: p.items.map((m) => (m.clientId === clientId ? { ...m, status: "failed" as const } : m)) })),
      );
    },
  });
}

export function useRetryMessage(gameId: string) {
  const send = useSendMessage(gameId);
  return (message: ChatMessage) => {
    if (!message.clientId) return;
    send.mutate({ clientId: message.clientId, text: message.body, mentions: message.mentions });
  };
}

export function useDeleteMessage(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase.rpc("delete_message", { p_message_id: messageId });
      if (error) throw error;
    },
    onSuccess: (_data, messageId) => {
      patchMessages(queryClient, gameId, (pages) => pages.map((p) => ({ ...p, items: p.items.filter((m) => m.id !== messageId) })));
    },
  });
}

export type ChatGameMeta = {
  chatMode: "open" | "announce";
  chatClosedAt: string | null;
  chatPauseUntil: string | null;
  chatPhotoApproval: boolean;
};

// games (not games_public) is readable by any authenticated user, so this is a direct
// select rather than a games_public view change — keeps the wide, well-established view
// contract untouched for one small chat-only detail.
export function useChatGameMeta(gameId: string) {
  return useQuery({
    queryKey: ["chat_game_meta", gameId],
    queryFn: async (): Promise<ChatGameMeta> => {
      const { data, error } = await supabase
        .from("games")
        .select("chat_mode, chat_closed_at, chat_pause_until, chat_photo_approval")
        .eq("id", gameId)
        .single();
      if (error) throw error;
      return {
        chatMode: data.chat_mode as "open" | "announce",
        chatClosedAt: data.chat_closed_at,
        chatPauseUntil: data.chat_pause_until,
        chatPhotoApproval: data.chat_photo_approval,
      };
    },
    enabled: !!gameId,
  });
}

export function useSetBroadcastSettings(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pauseUntil, photoApproval }: { pauseUntil: string | null; photoApproval: boolean }) => {
      const { error } = await supabase.rpc("set_chat_broadcast_settings", {
        p_game_id: gameId,
        // Generated Functions typing can't express SQL nullability from arg type alone
        // (timestamptz -> string, no `| null`) — the RPC param itself has no NOT NULL,
        // so this is safe at runtime; unpausing genuinely sends SQL NULL.
        p_pause_until: pauseUntil as string,
        p_photo_approval: photoApproval,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat_game_meta", gameId] }),
  });
}

export function useApproveChatPhoto(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase.rpc("approve_chat_photo", { p_message_id: messageId });
      if (error) throw error;
    },
    onSuccess: (_data, messageId) => {
      patchMessages(queryClient, gameId, (pages) =>
        pages.map((p) => ({ ...p, items: p.items.map((m) => (m.id === messageId ? { ...m, approvalStatus: "approved" as const } : m)) })),
      );
    },
  });
}

// ---------------------------------------------------------------------------------------
// Reactions — grouped client-side (emoji -> count + whether I reacted) from the raw rows,
// kept in its own realtime-backed query rather than joined into the messages page so the
// paginated message fetch stays untouched/cheap.
// ---------------------------------------------------------------------------------------

export type MessageReaction = { emoji: string; count: number; mine: boolean };

function reactionsQueryKey(gameId: string) {
  return ["message_reactions", gameId] as const;
}

export function useMessageReactions(gameId: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: reactionsQueryKey(gameId),
    queryFn: async (): Promise<Record<string, MessageReaction[]>> => {
      const uid = await requireUserId();
      const { data, error } = await supabase
        .from("message_reactions")
        .select("message_id, profile_id, emoji, messages!inner(game_id)")
        .eq("messages.game_id", gameId);
      if (error) throw error;
      const grouped: Record<string, Map<string, MessageReaction>> = {};
      for (const row of data ?? []) {
        const byEmoji = (grouped[row.message_id] ??= new Map());
        const existing = byEmoji.get(row.emoji) ?? { emoji: row.emoji, count: 0, mine: false };
        existing.count += 1;
        if (row.profile_id === uid) existing.mine = true;
        byEmoji.set(row.emoji, existing);
      }
      return Object.fromEntries(Object.entries(grouped).map(([id, m]) => [id, [...m.values()]]));
    },
    enabled: !!gameId,
  });

  useEffect(() => {
    if (!gameId) return;
    const channel = supabase
      .channel(`message_reactions:${gameId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, () => {
        queryClient.invalidateQueries({ queryKey: reactionsQueryKey(gameId) });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId, queryClient]);

  return query.data ?? {};
}

export function useToggleReaction(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      const { error } = await supabase.rpc("toggle_message_reaction", { p_message_id: messageId, p_emoji: emoji });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reactionsQueryKey(gameId) }),
  });
}

export function useMarkThreadRead(gameId: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => {
      const uid = await requireUserId();
      const { error } = await supabase
        .from("message_reads")
        .upsert({ game_id: gameId, profile_id: uid, last_read_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat_threads"] }),
  });

  const markRead = useCallback(() => {
    if (gameId) mutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  // Fires on mount, on blur (leaving the thread), and when the app backgrounds — today it
  // only fired once on mount, so anything arriving while the user reads stayed unread.
  useFocusEffect(
    useCallback(() => {
      markRead();
      return () => markRead();
    }, [markRead]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") markRead();
    });
    return () => sub.remove();
  }, [markRead]);

  return mutation;
}

export type ChatThread = {
  id: string;
  venue: string;
  title: string;
  time: string;
  preview: string;
  unread: boolean;
  unreadCount: number;
  closed: boolean;
  coverKey: string | null;
};

export function useChatThreads(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["chat_threads"],
    queryFn: async (): Promise<ChatThread[]> => {
      const { data, error } = await supabase.rpc("chat_threads");
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.game_id,
        venue: row.venue_name,
        title: row.starts_at ? `${row.venue_name} · ${formatDate(row.starts_at)}` : row.venue_name,
        time: row.last_message_at ? formatClock(row.last_message_at) : "",
        preview: row.last_message_body
          ? row.last_message_kind === "system"
            ? row.last_message_body
            : `${row.last_message_sender_is_me ? "You: " : ""}${row.last_message_kind === "image" ? "📷 Photo" : row.last_message_body}`
          : "No messages yet",
        unread: (row.unread_count ?? 0) > 0,
        unreadCount: row.unread_count ?? 0,
        closed: !!row.chat_closed_at || row.game_status === "cancelled" || row.game_status === "completed",
        coverKey: row.cover_key,
      }));
    },
    enabled: options.enabled ?? true,
  });
}

// ---------------------------------------------------------------------------------------
// Chat members — avatars, names, mute state, host flag. Long staleTime: an unknown sender
// on an inbound realtime event should cost one small fetch, not a full thread refetch.
// ---------------------------------------------------------------------------------------

export type ChatMember = {
  id: string;
  name: string;
  photoUri: string | null;
  avatarKey: string | null;
  color: string;
  isHost: boolean;
  muted: boolean;
  status: string;
};

export function useChatMembers(gameId: string, organizerId?: string) {
  return useQuery({
    queryKey: ["chat_members", gameId],
    queryFn: async (): Promise<ChatMember[]> => {
      const { data, error } = await supabase
        .from("game_players")
        .select("profile_id, status, chat_muted_at, profiles(display_name, photo_path, avatar_key)")
        .eq("game_id", gameId)
        .eq("status", "approved");
      if (error) throw error;

      const members: ChatMember[] = (data ?? []).map((r) => {
        const profile = r.profiles as { display_name: string; photo_path: string | null; avatar_key: string | null } | null;
        return {
          id: r.profile_id,
          name: profile?.display_name || "Player",
          photoUri: avatarUrl(profile?.photo_path),
          avatarKey: profile?.avatar_key ?? null,
          color: avatarColor(r.profile_id),
          isHost: r.profile_id === organizerId,
          muted: !!r.chat_muted_at,
          status: r.status,
        };
      });

      if (organizerId && !members.some((m) => m.id === organizerId)) {
        const { data: org } = await supabase.from("profiles").select("display_name, photo_path, avatar_key").eq("id", organizerId).single();
        members.push({
          id: organizerId,
          name: org?.display_name || "Host",
          photoUri: avatarUrl(org?.photo_path),
          avatarKey: org?.avatar_key ?? null,
          color: avatarColor(organizerId),
          isHost: true,
          muted: false,
          status: "approved",
        });
      }
      return members;
    },
    enabled: !!gameId,
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------------------
// Host control RPCs.
// ---------------------------------------------------------------------------------------

export function useSetChatMode(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (mode: "open" | "announce") => {
      const { error } = await supabase.rpc("set_chat_mode", { p_game_id: gameId, p_mode: mode });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat_game_meta", gameId] }),
  });
}

export function useSetPlayerChatMute(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ profileId, muted }: { profileId: string; muted: boolean }) => {
      const { error } = await supabase.rpc("set_player_chat_mute", { p_game_id: gameId, p_profile_id: profileId, p_muted: muted });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat_members", gameId] }),
  });
}

export function useCloseChat(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("close_chat", { p_game_id: gameId });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat_game_meta", gameId] }),
  });
}

// ---------------------------------------------------------------------------------------
// Per-thread notification prefs.
// ---------------------------------------------------------------------------------------

export type ChatPrefLevel = "all" | "mentions" | "none";
export type ChatPrefs = { level: ChatPrefLevel; mutedUntil: string | null };

export function useChatPrefs(gameId: string) {
  return useQuery({
    queryKey: ["chat_prefs", gameId],
    queryFn: async (): Promise<ChatPrefs> => {
      const uid = await requireUserId();
      const { data, error } = await supabase
        .from("chat_prefs")
        .select("level, muted_until")
        .eq("game_id", gameId)
        .eq("profile_id", uid)
        .maybeSingle();
      if (error) throw error;
      return { level: (data?.level as ChatPrefLevel) ?? "all", mutedUntil: data?.muted_until ?? null };
    },
    enabled: !!gameId,
  });
}

export function useSetChatPrefs(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<ChatPrefs>) => {
      const uid = await requireUserId();
      const update = {
        game_id: gameId,
        profile_id: uid,
        ...(patch.level !== undefined ? { level: patch.level } : {}),
        ...(patch.mutedUntil !== undefined ? { muted_until: patch.mutedUntil } : {}),
      };
      const { error } = await supabase.from("chat_prefs").upsert(update, { onConflict: "game_id,profile_id" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat_prefs", gameId] }),
  });
}

// Snooze durations (WhatsApp-style): a fixed hour count, or "until the game ends" — the one
// duration nobody else offers, computed from the game's own ends_at.
export function snoozeUntil(hours: number, gameEndsAtIso?: string): string {
  if (hours === -1 && gameEndsAtIso) {
    return new Date(new Date(gameEndsAtIso).getTime() + 24 * 60 * 60 * 1000).toISOString();
  }
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}
