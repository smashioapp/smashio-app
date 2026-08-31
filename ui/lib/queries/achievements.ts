import { useQuery } from "@tanstack/react-query";
import { supabase } from "../supabase";

// Server-side achievements (social-plan.md B0.5) — ui/lib/achievements.ts still owns labels and
// icons, but which ones are unlocked comes from achievement_awards now, not a client check().
export function useAchievementAwards(profileId: string | undefined) {
  return useQuery({
    queryKey: ["achievement_awards", profileId],
    queryFn: async () => {
      const { data, error } = await supabase.from("achievement_awards").select("achievement_id").eq("profile_id", profileId!);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.achievement_id));
    },
    enabled: !!profileId,
  });
}
