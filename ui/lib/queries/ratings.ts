import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";

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
      const { error } = await supabase.from("ratings").upsert(rows, { onConflict: "game_id,rater_id,ratee_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile_stats"] });
      queryClient.invalidateQueries({ queryKey: ["ratings", "rated_game_ids"] });
    },
  });
}
