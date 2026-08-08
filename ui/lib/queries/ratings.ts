import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile_stats"] }),
  });
}
