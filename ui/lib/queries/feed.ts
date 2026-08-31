import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { DEFAULT_LAT, DEFAULT_LNG, SPORT_SLUG } from "./games";

const RADIUS_M = 20000;
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

// social-plan.md B1 — feed_home only, no screen yet (N1 mounts it, §13.6 step 4). Centre
// defaults to Discover's own DEFAULT_LAT/LNG, deliberately not a badminton-denser point
// (§6.1: a location-less user seeing different centres on two surfaces would be incoherent).
export function useFeedHome(center: { lat: number; lng: number } = { lat: DEFAULT_LAT, lng: DEFAULT_LNG }) {
  return useInfiniteQuery({
    queryKey: ["feed_home", SPORT_SLUG, center.lat, center.lng],
    queryFn: async ({ pageParam }: { pageParam: { createdAt: string; id: string } | null }) => {
      const { data, error } = await supabase.rpc("feed_home", {
        p_lat: center.lat,
        p_lng: center.lng,
        p_radius_m: RADIUS_M,
        p_sport_slug: SPORT_SLUG,
        p_cursor_created_at: pageParam?.createdAt ?? undefined,
        p_cursor_id: pageParam?.id ?? undefined,
        p_limit: PAGE_SIZE,
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
  kind: "text" | "looking_for_players";
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feed_home"] }),
  });
}
