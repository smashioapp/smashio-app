import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import type { TierId } from "../theme";

export const RATING_TAGS = [
  { id: "punctual", label: "Punctual", icon: "time-outline" as const },
  { id: "good_sport", label: "Good sport", icon: "happy-outline" as const },
  { id: "strong_player", label: "Strong player", icon: "flash-outline" as const },
  { id: "settled_up", label: "Settled up", icon: "cash-outline" as const },
];

// Which of my past games I've already rated — Past tab reads this to stop re-inviting finished
// work ("Rated ✓" vs "Rate 3 players", my-games-plan.md §M4).
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

// Star distribution for the profile's own rating card (profile-plan.md P2) — player_card
// only returns the average + count, not the 1-5 breakdown, so this reads `ratings` directly
// under its existing "readable by rater and ratee" policy.
export function useRatingDistribution(profileId: string | undefined) {
  return useQuery({
    queryKey: ["ratings", "distribution", profileId],
    queryFn: async (): Promise<Record<1 | 2 | 3 | 4 | 5, number>> => {
      const { data, error } = await supabase.from("ratings").select("stars").eq("ratee_id", profileId!);
      if (error) throw error;
      const dist: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const row of data ?? []) dist[row.stars as 1 | 2 | 3 | 4 | 5]++;
      return dist;
    },
    enabled: !!profileId,
  });
}

// Peer-perceived skill (profile-plan.md P2, Playo's model): each co-player's star rating
// stands in for their read on your skill (1-2 Beginner, 3 Intermediate, 4 Advanced, 5 Pro).
// One vote per rater — only their latest — weighted to the last 25 games rated, same rules
// Playo documents. No new column: reuses `ratings.stars`, the only peer signal we store.
function starsToTier(avgStars: number): TierId {
  if (avgStars < 2.5) return "Beginner";
  if (avgStars < 3.5) return "Intermediate";
  if (avgStars < 4.5) return "Advanced";
  return "Pro";
}

export function usePeerPerceivedSkill(profileId: string | undefined) {
  return useQuery({
    queryKey: ["ratings", "peer_perceived", profileId],
    queryFn: async (): Promise<{ tier: TierId; voteCount: number } | null> => {
      const { data, error } = await supabase
        .from("ratings")
        .select("rater_id, stars, created_at")
        .eq("ratee_id", profileId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const latestByRater = new Map<string, number>();
      for (const row of data ?? []) {
        if (!latestByRater.has(row.rater_id)) latestByRater.set(row.rater_id, row.stars);
      }
      const votes = [...latestByRater.values()].slice(0, 25);
      if (votes.length === 0) return null;
      const avg = votes.reduce((a, b) => a + b, 0) / votes.length;
      return { tier: starsToTier(avg), voteCount: votes.length };
    },
    enabled: !!profileId,
  });
}

export function useSubmitRatingTags() {
  return useMutation({
    mutationFn: async ({ gameId, tags }: { gameId: string; tags: Record<string, string[]> }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");
      const rows = Object.entries(tags).flatMap(([rateeId, tagIds]) =>
        tagIds.map((tag) => ({ game_id: gameId, rater_id: user.id, ratee_id: rateeId, tag }))
      );
      if (rows.length === 0) return;
      const { error } = await supabase
        .from("rating_tags")
        .upsert(rows, { onConflict: "game_id,rater_id,ratee_id,tag", ignoreDuplicates: true });
      if (error) throw error;
    },
  });
}

export function useSubmitRatings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ gameId, stars }: { gameId: string; stars: Record<string, number> }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");
      const rows = Object.entries(stars)
        .filter(([, n]) => n > 0)
        .map(([rateeId, n]) => ({ game_id: gameId, rater_id: user.id, ratee_id: rateeId, stars: n }));
      if (rows.length === 0) return;
      const { error } = await supabase
        .from("ratings")
        .upsert(rows, { onConflict: "game_id,rater_id,ratee_id", ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile_stats"] });
      queryClient.invalidateQueries({ queryKey: ["ratings", "rated_game_ids"] });
    },
  });
}
