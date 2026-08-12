import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "../supabase";
import type { PlaceDetails } from "../places";

// Cold-start shortcut for the wizard's venue step: partner/previously-used venues, so a
// fresh Places search box isn't the only way in when the query is empty.
export function useVenues() {
  return useQuery({
    queryKey: ["venues"],
    queryFn: async () => {
      const { data, error } = await supabase.from("venues").select("id, name, suburb, state, address").order("name").limit(8);
      if (error) throw error;
      return data;
    },
  });
}

// Discover map's dim "no games here" pins (map-plan.md §5.10) — venues near the current
// viewport, independent of whether they have any upcoming games (that diff happens client-side
// against the games already fetched for the map, since venues aren't sport-scoped).
export function useVenuesForMap(center: { lat: number; lng: number } | null, radiusKm: number, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["venuesForMap", center?.lat, center?.lng, radiusKm],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("venues_near", {
        lat: center!.lat,
        lng: center!.lng,
        radius_m: radiusKm * 1000,
      });
      if (error) throw error;
      return data;
    },
    enabled: (options?.enabled ?? true) && center != null,
  });
}

// Upserts a Places-sourced venue (dedupes on google_place_id via the RPC) and returns its id.
export function useUpsertPlaceVenue() {
  return useMutation({
    mutationFn: async (place: PlaceDetails) => {
      const { data, error } = await supabase.rpc("upsert_places_venue", {
        p_name: place.name,
        p_suburb: place.suburb,
        p_state: place.state,
        p_address: place.address,
        p_lat: place.lat,
        p_lng: place.lng,
        p_google_place_id: place.googlePlaceId,
      });
      if (error) throw error;
      return data;
    },
  });
}
