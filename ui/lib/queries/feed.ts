import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { track } from "../analytics";
import { signAvatarUrl, signAvatarUrls } from "../avatarUrls";
import { preparePhotoForUpload } from "../imagePrep";
import { DEFAULT_LAT, DEFAULT_LNG, SPORT_SLUG } from "./games";
import { uuidv4 } from "./messages";
import type { FeedKind, FeedMode } from "../store";

const PAGE_SIZE = 20;

export type FeedPost = {
  id: string;
  authorId: string | null;
  authorDisplayName: string | null;
  authorPhotoUrl: string | null;
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
  media: PostMedia[];
};

// ---------------------------------------------------------------------------------------------
// Post photos (image-moderation-plan.md §2, social-plan B3a). post_media RLS already decides who
// sees which row: visible rows for everyone who can read the post, plus every row on your own
// post so the author can see "being checked" and "removed" states. Only visible and your own
// review photos get a signed URL (the storage policy refuses the rest anyway).
// ---------------------------------------------------------------------------------------------

export type PostMediaStatus = "visible" | "review" | "rejected";

export type PostMedia = {
  id: string;
  postId: string;
  authorId: string;
  ordinal: number;
  status: PostMediaStatus;
  url: string | null;
};

const POST_MEDIA_URL_TTL_SECONDS = 3600;

export async function fetchPostMedia(postIds: string[]): Promise<Map<string, PostMedia[]>> {
  const out = new Map<string, PostMedia[]>();
  if (postIds.length === 0) return out;
  const { data, error } = await supabase
    .from("post_media")
    .select("id, post_id, author_id, ordinal, media_status, storage_path")
    .in("post_id", postIds)
    .order("ordinal", { ascending: true });
  if (error) throw error;
  const rows = data ?? [];
  const signable = rows.filter((r) => r.media_status !== "rejected").map((r) => r.storage_path);
  const urls = new Map<string, string>();
  if (signable.length > 0) {
    const { data: signed } = await supabase.storage.from("post-media").createSignedUrls(signable, POST_MEDIA_URL_TTL_SECONDS);
    (signed ?? []).forEach((d, i) => {
      if (d.signedUrl) urls.set(signable[i], d.signedUrl);
    });
  }
  for (const r of rows) {
    const list = out.get(r.post_id) ?? [];
    list.push({
      id: r.id,
      postId: r.post_id,
      authorId: r.author_id,
      ordinal: r.ordinal,
      status: r.media_status as PostMediaStatus,
      url: urls.get(r.storage_path) ?? null,
    });
    out.set(r.post_id, list);
  }
  return out;
}

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
      const rows = data ?? [];
      const [urlMap, mediaMap] = await Promise.all([
        signAvatarUrls(rows.map((r) => r.author_photo_path)),
        fetchPostMedia(rows.filter((r) => r.kind !== "system").map((r) => r.id)),
      ]);
      return rows.map(
        (r): FeedPost => ({
          id: r.id,
          authorId: r.author_id,
          authorDisplayName: r.author_display_name,
          authorPhotoUrl: r.author_photo_path ? urlMap.get(r.author_photo_path) ?? null : null,
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
          media: mediaMap.get(r.id) ?? [],
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

export type PickedPhoto = { uri: string; width: number; height: number };

export type FeedGameState = { openSpots: number; status: string; startsAt: string };

// System game posts carry a snapshot payload from publish time; the live row is the truth
// (short-a-player-ux-plan.md §2.1/§7). One query for every game card on the loaded pages. A
// game id missing from the result is gone for this viewer (deleted, link-only), so hide it.
export function useFeedGameStates(gameIds: string[]) {
  const ids = Array.from(new Set(gameIds)).sort();
  return useQuery({
    queryKey: ["feed_game_states", ids],
    queryFn: async (): Promise<Map<string, FeedGameState>> => {
      if (ids.length === 0) return new Map();
      const { data, error } = await supabase.from("games_public").select("id, open_spots, status, starts_at").in("id", ids);
      if (error) throw error;
      const map = new Map<string, FeedGameState>();
      for (const r of data ?? []) {
        if (!r.id) continue;
        map.set(r.id, { openSpots: r.open_spots ?? 0, status: r.status ?? "published", startsAt: r.starts_at ?? "" });
      }
      return map;
    },
    enabled: ids.length > 0,
    staleTime: 30_000,
  });
}

export type CreatePostInput = {
  kind: "question" | "looking_for_players";
  body: string;
  venueId?: string;
  startsAt?: Date;
  skillTierLabel?: string;
  maxPlayers?: number;
  photos?: PickedPhoto[];
};

export type CreatePostResult = { postId: string; photosDropped: number; photosInReview: number };

export const MAX_POST_PHOTOS = 4;

// B2 composer, plus B3a photos. Classification (text and images) runs inside create_post itself
// (20260901070000, 20260925000100), not here: a client-side-only check could be skipped by calling
// the RPC directly. The client's only jobs are the downscale/EXIF strip and the upload; the RPC
// refuses the whole post on flagged text or a confidently violating photo, and reports photos it
// dropped (IM2, classifier timeout) or is holding for review.
export function useCreatePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePostInput): Promise<CreatePostResult> => {
      const photos = (input.photos ?? []).slice(0, MAX_POST_PHOTOS);
      let mediaPaths: string[] | undefined;
      if (photos.length > 0) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Not signed in.");
        const { File } = await import("expo-file-system");
        mediaPaths = await Promise.all(
          photos.map(async (p) => {
            const prepped = await preparePhotoForUpload(p.uri, p.width, p.height);
            const bytes = await new File(prepped).arrayBuffer();
            const path = `${user.id}/${uuidv4()}.jpg`;
            const { error } = await supabase.storage.from("post-media").upload(path, bytes, { contentType: "image/jpeg" });
            if (error) throw error;
            return path;
          })
        );
      }
      const { data, error } = await supabase.rpc("create_post", {
        p_kind: input.kind,
        p_body: input.body,
        p_venue_id: input.venueId,
        p_starts_at: input.startsAt?.toISOString(),
        p_skill_tier_label: input.skillTierLabel,
        p_max_players: input.maxPlayers,
        p_media_paths: mediaPaths,
      });
      if (error) throw error;
      const result = (data ?? {}) as { post_id?: string; photos_dropped?: number; photos_in_review?: number };
      return {
        postId: result.post_id ?? "",
        photosDropped: result.photos_dropped ?? 0,
        photosInReview: result.photos_in_review ?? 0,
      };
    },
    onSuccess: (result, input) => {
      track("post_created", {
        post_id: result.postId,
        kind: input.kind,
        photos: input.photos?.length ?? 0,
        photos_dropped: result.photosDropped,
        photos_in_review: result.photosInReview,
      });
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
  authorPhotoUrl: string | null;
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
      const rows = data ?? [];
      const urlMap = await signAvatarUrls(rows.map((r) => r.author_photo_path));
      return rows.map(
        (r): PostReply => ({
          id: r.id,
          postId: r.post_id,
          authorId: r.author_id,
          authorDisplayName: r.author_display_name,
          authorPhotoUrl: r.author_photo_path ? urlMap.get(r.author_photo_path) ?? null : null,
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
      const [authorPhotoUrl, mediaMap] = await Promise.all([signAvatarUrl(author?.photo_path), fetchPostMedia([data.id as string])]);
      return {
        id: data.id as string,
        authorId: data.author_id as string | null,
        authorDisplayName: author?.display_name ?? null,
        authorPhotoUrl,
        authorAvatarKey: author?.avatar_key ?? null,
        kind: data.kind as string,
        body: data.body as string | null,
        venueId: data.venue_id as string | null,
        payload: (data.payload as Record<string, unknown>) ?? null,
        replyCount: data.reply_count as number,
        reactionCount: data.reaction_count as number,
        createdAt: data.created_at as string,
        acceptedAnswerId: data.accepted_answer_id as string | null,
        media: mediaMap.get(data.id as string) ?? [],
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
  photoUrl: string | null;
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
      const rows = data ?? [];
      const urlMap = await signAvatarUrls(rows.map((r) => r.photo_path));
      return rows.map(
        (r): SuggestedPlayer => ({
          id: r.id,
          displayName: r.display_name,
          photoUrl: r.photo_path ? urlMap.get(r.photo_path) ?? null : null,
          avatarKey: r.avatar_key,
          homeSuburb: r.home_suburb,
          skillTierLabel: r.skill_tier_label,
        })
      );
    },
    enabled: opts.enabled ?? true,
  });
}
