import { useMutation } from "@tanstack/react-query";
import { supabase } from "../supabase";
import type { PlaceDetails } from "../places";

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
