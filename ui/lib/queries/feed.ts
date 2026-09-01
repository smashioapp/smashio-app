import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { track } from "../analytics";
import { DEFAULT_LAT, DEFAULT_LNG, SPORT_SLUG } from "./games";
import type { FeedKind, FeedMode } from "../store";

const PAGE_SIZE = 20;

export type FeedPost = {
  id: string;
  authorId: string | null;
  authorDisplayName: string | null;
  authorPhotoPath: string | null;
  authorAvatarKey: string | null;
  kind: string;
  body: string | null;
  venueId: string | null;
  venueName: string | null;
  gameId: string | null;
  clubId: string | null;
  payload: Record<string, unknown> | null;
  replyCount: number;
  reactionCount: number;
  createdAt: string;
  distanceBucket: string | null;
  isFollowedAuthor: boolean;
};

// social-plan.md B1 — feed_home. v3 Feed design (screen 1/2) added p_mode + p_kind on top of the
// original radius/follow union (20260901100000_feed_v3_replies_reactions.sql).
export function useFeedHome(
  center: { lat: number; lng: number } = { lat: DEFAULT_LAT, lng: DEFAULT_LNG },
  opts: { mode?: FeedMode; kinds?: FeedKind[]; radiusKm?: number } = {}
) {
  const mode = opts.mode ?? "nearby";
  const kinds = opts.kinds ?? [];
  const radiusM = (opts.radiusKm ?? 15) * 1000;

  return useInfiniteQuery({
    queryKey: ["feed_home", SPORT_SLUG, center.lat, center.lng, mode, kinds.join(","), radiusM],
    queryFn: async ({ pageParam }: { pageParam: { createdAt: string; id: string } | null }) => {
      const { data, error } = await supabase.rpc("feed_home", {
        p_lat: center.lat,
        p_lng: center.lng,
        p_radius_m: radiusM,
        p_sport_slug: SPORT_SLUG,
        p_cursor_created_at: pageParam?.createdAt ?? undefined,
        p_cursor_id: pageParam?.id ?? undefined,
        p_limit: PAGE_SIZE,
        p_mode: mode,
        p_kind: kinds.length > 0 ? kinds : undefined,
      });
      if (error) throw error;
      return (data ?? []).map(
        (r): FeedPost => ({
          id: r.id,
          authorId: r.author_id,
          authorDisplayName: r.author_display_name,
          authorPhotoPath: r.author_photo_path,
          authorAvatarKey: r.author_avatar_key,
          kind: r.kind,
          body: r.body,
          venueId: r.venue_id,
          venueName: r.venue_name,
          gameId: r.game_id,
          clubId: r.club_id,
          payload: (r.payload as Record<string, unknown>) ?? null,
          replyCount: r.reply_count,
          reactionCount: r.reaction_count,
          createdAt: r.created_at,
          distanceBucket: r.distance_bucket,
          isFollowedAuthor: r.is_followed_author,
        })
      );
    },
    initialPageParam: null as { createdAt: string; id: string } | null,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      const last = lastPage[lastPage.length - 1];
      return { createdAt: last.createdAt, id: last.id };
    },
  });
}

export type CreatePostInput = {
  kind: "question" | "looking_for_players";
  body: string;
  venueId?: string;
  startsAt?: Date;
  skillTierLabel?: string;
  maxPlayers?: number;
};

// B2 composer — text only, looking_for_players first (§13.1). Pre-publish classification
// (§10 item 4) runs inside create_post itself now (20260901070000_server_side_moderation.sql),
// not here — a client-side-only check could be skipped by calling the RPC directly, so the RPC
// throws the community-guidelines error itself if the text is flagged.
export function useCreatePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePostInput) => {
      const { data, error } = await supabase.rpc("create_post", {
        p_kind: input.kind,
        p_body: input.body,
        p_venue_id: input.venueId,
        p_starts_at: input.startsAt?.toISOString(),
        p_skill_tier_label: input.skillTierLabel,
        p_max_players: input.maxPlayers,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (postId, input) => {
      track("post_created", { post_id: postId, kind: input.kind });
      queryClient.invalidateQueries({ queryKey: ["feed_home"] });
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Reactions (v3 Feed design's heart strip) — 20260901100000_feed_v3_replies_reactions.sql.
// ---------------------------------------------------------------------------------------------

export function useMyReactedPostIds(postIds: string[], opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["my_reacted_post_ids", [...postIds].sort().join(",")],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_reacted_post_ids", { p_post_ids: postIds });
      if (error) throw error;
      return new Set(data ?? []);
    },
    enabled: (opts.enabled ?? true) && postIds.length > 0,
  });
}

export function useToggleReaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      const { data, error } = await supabase.rpc("toggle_reaction", { p_post_id: postId });
      if (error) throw error;
      return { postId, reacted: data as boolean };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed_home"] });
      queryClient.invalidateQueries({ queryKey: ["my_reacted_post_ids"] });
      queryClient.invalidateQueries({ queryKey: ["post_detail"] });
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Replies (v3 Feed design screen 3, Question detail) — post_replies + accept_reply.
// ---------------------------------------------------------------------------------------------

export type PostReply = {
  id: string;
  postId: string;
  authorId: string | null;
  authorDisplayName: string | null;
  authorPhotoPath: string | null;
  authorAvatarKey: string | null;
  body: string;
  createdAt: string;
  isAccepted: boolean;
};

export function usePostReplies(postId: string | undefined) {
  return useQuery({
    queryKey: ["post_replies", postId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_replies", { p_post_id: postId! });
      if (error) throw error;
      return (data ?? []).map(
        (r): PostReply => ({
          id: r.id,
          postId: r.post_id,
          authorId: r.author_id,
          authorDisplayName: r.author_display_name,
          authorPhotoPath: r.author_photo_path,
          authorAvatarKey: r.author_avatar_key,
          body: r.body,
          createdAt: r.created_at,
          isAccepted: r.is_accepted,
        })
      );
    },
    enabled: !!postId,
  });
}

export function useCreateReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, body }: { postId: string; body: string }) => {
      const { data, error } = await supabase.rpc("create_reply", { p_post_id: postId, p_body: body });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_id, { postId }) => {
      track("reply_created", { post_id: postId });
      queryClient.invalidateQueries({ queryKey: ["post_replies", postId] });
      queryClient.invalidateQueries({ queryKey: ["feed_home"] });
      queryClient.invalidateQueries({ queryKey: ["post_detail", postId] });
    },
  });
}

export function useAcceptReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, replyId }: { postId: string; replyId: string | null }) => {
      const { error } = await supabase.rpc("accept_reply", { p_post_id: postId, p_reply_id: replyId as unknown as string });
      if (error) throw error;
    },
    onSuccess: (_r, { postId }) => {
      queryClient.invalidateQueries({ queryKey: ["post_replies", postId] });
      queryClient.invalidateQueries({ queryKey: ["post_detail", postId] });
      queryClient.invalidateQueries({ queryKey: ["feed_home"] });
    },
  });
}

// Question detail (screen 3) needs the root post itself, not just its replies — feed_home won't
// serve a single row by id, so this reads posts directly (same table the RLS policy on posts
// already scopes to visible + not-blocked).
export function usePostDetail(postId: string | undefined) {
  return useQuery({
    queryKey: ["post_detail", postId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select(
          "id, author_id, kind, body, venue_id, payload, reply_count, reaction_count, created_at, accepted_answer_id, profiles:author_id(display_name, photo_path, avatar_key)"
        )
        .eq("id", postId!)
        .single();
      if (error) throw error;
      const author = data.profiles as { display_name: string | null; photo_path: string | null; avatar_key: string | null } | null;
      return {
        id: data.id as string,
        authorId: data.author_id as string | null,
        authorDisplayName: author?.display_name ?? null,
        authorPhotoPath: author?.photo_path ?? null,
        authorAvatarKey: author?.avatar_key ?? null,
        kind: data.kind as string,
        body: data.body as string | null,
        venueId: data.venue_id as string | null,
        payload: (data.payload as Record<string, unknown>) ?? null,
        replyCount: data.reply_count as number,
        reactionCount: data.reaction_count as number,
        createdAt: data.created_at as string,
        acceptedAnswerId: data.accepted_answer_id as string | null,
      };
    },
    enabled: !!postId,
  });
}

// ---------------------------------------------------------------------------------------------
// Suggested follows (v3 Feed design screen 4, cold-start empty state).
// ---------------------------------------------------------------------------------------------

export type SuggestedPlayer = {
  id: string;
  displayName: string;
  photoPath: string | null;
  avatarKey: string | null;
  homeSuburb: string | null;
  skillTierLabel: string | null;
};

export function useSuggestedFollows(center: { lat: number; lng: number } = { lat: DEFAULT_LAT, lng: DEFAULT_LNG }, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["suggested_players_to_follow", center.lat, center.lng],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("suggested_players_to_follow", {
        p_lat: center.lat,
        p_lng: center.lng,
      });
      if (error) throw error;
      return (data ?? []).map(
        (r): SuggestedPlayer => ({
          id: r.id,
          displayName: r.display_name,
          photoPath: r.photo_path,
          avatarKey: r.avatar_key,
          homeSuburb: r.home_suburb,
          skillTierLabel: r.skill_tier_label,
        })
      );
    },
    enabled: opts.enabled ?? true,
  });
}
