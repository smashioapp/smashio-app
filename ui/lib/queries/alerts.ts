import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import type { Database } from "../db.types";
import { DEFAULT_LAT, DEFAULT_LNG, SPORT_SLUG } from "./games";

type GameAlertRow = Database["public"]["Tables"]["game_alerts"]["Row"];

export type GameAlert = {
  id: string;
  tierSlugs: string[] | null;
  radiusM: number;
  createdAt: string;
};

function toAlert(row: GameAlertRow): GameAlert {
  return { id: row.id, tierSlugs: row.tier_slugs, radiusM: row.radius_m, createdAt: row.created_at };
}

export function useMyAlerts() {
  return useQuery({
    queryKey: ["game_alerts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("game_alerts").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(toAlert);
    },
  });
}

// Saves the current Discover filter set (level + radius) as a standing watch — the retention
// primitive for a stranded session (D5). Time-of-day isn't part of the watch: the trigger fires
// off a brand-new game's insert, whose start time is inherently in the future.
export function useCreateAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tierSlugs: string[]; radiusKm: number; center?: { lat: number; lng: number } | null }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");

      const { data: sport, error: sportError } = await supabase.from("sports").select("id").eq("slug", SPORT_SLUG).single();
      if (sportError) throw sportError;

      const center = input.center ?? { lat: DEFAULT_LAT, lng: DEFAULT_LNG };
      const { error } = await supabase.from("game_alerts").insert({
        profile_id: user.id,
        sport_id: sport.id,
        tier_slugs: input.tierSlugs.length > 0 ? input.tierSlugs : null,
        center_lat: center.lat,
        center_lng: center.lng,
        radius_m: input.radiusKm * 1000,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["game_alerts"] }),
  });
}

export function useDeleteAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase.from("game_alerts").delete().eq("id", alertId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["game_alerts"] }),
  });
}
