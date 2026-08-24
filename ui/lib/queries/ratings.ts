import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";

// A rating is either about how someone played or about how they ran the game (post-game-plan.md
// D6). Only the organizer ever collects a 'host' row.
export type RatingDimension = "player" | "host";

export const RATING_TAGS = [
  { id: "punctual", label: "Punctual", icon: "time-outline" as const },
  { id: "good_sport", label: "Good sport", icon: "happy-outline" as const },
  { id: "strong_player", label: "Strong player", icon: "flash-outline" as const },
  { id: "settled_up", label: "Settled up", icon: "cash-outline" as const },
];

// Host tags answer host questions — the things only the person who booked the court controls.
// Kept in lockstep with the rating_tags dimension check constraint (20260824000100).
export const HOST_RATING_TAGS = [
  { id: "organised_well", label: "Well organised", icon: "checkmark-circle-outline" as const },
  { id: "skill_level_accurate", label: "Right skill level", icon: "podium-outline" as const },
  { id: "court_as_described", label: "Court as described", icon: "location-outline" as const },
  { id: "fair_cost_split", label: "Fair cost split", icon: "cash-outline" as const },
  { id: "responsive_in_chat", label: "Answered questions", icon: "chatbubble-outline" as const },
];

// Which of my past games I've already rated — Past tab reads this to stop re-inviting finished
// work ("Rated ✓" vs "Rate 3 players", my-games-plan.md §M4). Reads `ratings` directly, which
// still works after the D8 lockdown: a rater keeps select on their own rows, it's the *ratee*
// side that moved behind the aggregate RPCs.
export function useMyRatedGameIds(gameIds: string[]) {
  const sortedIds = [...gameIds].sort();
  return useQuery({
    queryKey: ["ratings", "rated_game_ids", sortedIds],
    queryFn: async (): Promise<Set<string>> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return new Set();
      const { data, error } = await supabase.from("ratings").select("game_id").eq("rater_id", user.id).in("game_id", sortedIds);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.game_id));
    },
    enabled: sortedIds.length > 0,
  });
}

export type RatingSummary = {
  avg: number | null;
  count: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  badgeCounts: Record<string, number>;
};

// Was a direct `ratings` select filtered by ratee_id, which only worked because the old policy
// let a ratee read their own rows — i.e. read exactly who gave them 2 stars. That policy is gone
// (post-game-plan.md D8); this RPC returns the same numbers with no rater identity in the shape.
export function useRatingSummary(profileId: string | undefined, dimension: RatingDimension = "player") {
  return useQuery({
    queryKey: ["ratings", "summary", profileId, dimension],
    queryFn: async (): Promise<RatingSummary> => {
      const { data, error } = await supabase
        .rpc("rating_summary", { p_profile_id: profileId!, p_dimension: dimension })
        .single();
      if (error) throw error;
      const raw = (data?.distribution ?? {}) as Record<string, number>;
      const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const n of [1, 2, 3, 4, 5] as const) distribution[n] = raw[String(n)] ?? 0;
      return {
        avg: data?.rating_avg ?? null,
        count: data?.rating_count ?? 0,
        distribution,
        badgeCounts: (data?.badge_counts ?? {}) as Record<string, number>,
      };
    },
    enabled: !!profileId,
  });
}

export type PeerSkill = { tierLabel: string; tierSlug: string; voteCount: number };

// Peer-perceived skill. This used to be `starsToTier`: a star average bucketed into a tier, on
// the theory that better players score higher. They don't — a 5-star rating means "great to play
// with", which a friendly beginner earns as easily as a pro. Post-game now asks the question
// outright (skill_votes), and this reads those votes (post-game-plan.md D12).
export function usePeerSkill(profileId: string | undefined, sportSlug = "badminton") {
  return useQuery({
    queryKey: ["ratings", "peer_skill", profileId, sportSlug],
    queryFn: async (): Promise<PeerSkill | null> => {
      const { data, error } = await supabase
        .rpc("peer_skill_vote", { p_profile_id: profileId!, p_sport_slug: sportSlug })
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { tierLabel: data.tier_label, tierSlug: data.tier_slug, voteCount: data.vote_count };
    },
    enabled: !!profileId,
  });
}

export type RatingSubmission = {
  gameId: string;
  // rateeId -> stars, per dimension. The host can appear in both maps.
  stars: Record<string, number>;
  hostStars: Record<string, number>;
  tags: Record<string, string[]>;
  hostTags: Record<string, string[]>;
  // rateeId -> skill_tiers.id
  skillVotes: Record<string, string>;
};

// One mutation for the whole screen rather than the old three separate ones. Post-game submits
// stars, tags and a skill vote together; splitting them meant a mid-way failure left a player
// rated but un-tagged with no way to finish, since ratings are immutable.
//
// Every write is an ignoreDuplicates upsert, so re-submitting a partially-saved screen is a
// no-op on what already landed rather than a unique violation. There's no deadline (D7) — the
// screen is expected to be revisited.
export function useSubmitPostGameRatings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ gameId, stars, hostStars, tags, hostTags, skillVotes }: RatingSubmission) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");

      const ratingRows = [
        ...Object.entries(stars)
          .filter(([, n]) => n > 0)
          .map(([rateeId, n]) => ({ game_id: gameId, rater_id: user.id, ratee_id: rateeId, stars: n, dimension: "player" })),
        ...Object.entries(hostStars)
          .filter(([, n]) => n > 0)
          .map(([rateeId, n]) => ({ game_id: gameId, rater_id: user.id, ratee_id: rateeId, stars: n, dimension: "host" })),
      ];

      if (ratingRows.length > 0) {
        const { error } = await supabase
          .from("ratings")
          .upsert(ratingRows, { onConflict: "game_id,rater_id,ratee_id,dimension", ignoreDuplicates: true });
        if (error) throw error;
      }

      const tagRows = [
        ...Object.entries(tags).flatMap(([rateeId, tagIds]) =>
          tagIds.map((tag) => ({ game_id: gameId, rater_id: user.id, ratee_id: rateeId, tag, dimension: "player" }))
        ),
        ...Object.entries(hostTags).flatMap(([rateeId, tagIds]) =>
          tagIds.map((tag) => ({ game_id: gameId, rater_id: user.id, ratee_id: rateeId, tag, dimension: "host" }))
        ),
      ];

      if (tagRows.length > 0) {
        const { error } = await supabase
          .from("rating_tags")
          .upsert(tagRows, { onConflict: "game_id,rater_id,ratee_id,dimension,tag", ignoreDuplicates: true });
        if (error) throw error;
      }

      const voteRows = Object.entries(skillVotes)
        .filter(([, tierId]) => !!tierId)
        .map(([rateeId, tierId]) => ({ game_id: gameId, rater_id: user.id, ratee_id: rateeId, skill_tier_id: tierId }));

      if (voteRows.length > 0) {
        const { error } = await supabase
          .from("skill_votes")
          .upsert(voteRows, { onConflict: "game_id,rater_id,ratee_id", ignoreDuplicates: true });
        if (error) throw error;
      }
    },
    onSuccess: (_data, { gameId }) => {
      queryClient.invalidateQueries({ queryKey: ["profile_stats"] });
      queryClient.invalidateQueries({ queryKey: ["ratings", "rated_game_ids"] });
      queryClient.invalidateQueries({ queryKey: ["past_game_detail", gameId] });
    },
  });
}
