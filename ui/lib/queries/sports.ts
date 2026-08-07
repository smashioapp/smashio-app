import { useQuery } from "@tanstack/react-query";
import { supabase } from "../supabase";

export function useSports() {
  return useQuery({
    queryKey: ["sports"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sports").select("*").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useSkillTiers(sportSlug: string) {
  return useQuery({
    queryKey: ["skill_tiers", sportSlug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("skill_tiers")
        .select("*, sports!inner(slug)")
        .eq("sports.slug", sportSlug)
        .order("ordinal");
      if (error) throw error;
      return data;
    },
  });
}
