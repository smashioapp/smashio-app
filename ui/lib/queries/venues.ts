import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "../supabase";
import type { PlaceDetails } from "../places";

export type VenueAmenity = {
  slug: string;
  label: string;
  icon: string;
  category: "essentials" | "gear" | "comfort" | "access";
  availability: "yes" | "no" | "paid" | "nearby" | "unknown";
  note: string | null;
};

export type VenuePricingBand = {
  id: string;
  label: string;
  days: number[];
  starts_time: string | null;
  ends_time: string | null;
  cents: number;
  unit: "court_hour" | "person_hour" | "person_session";
  notes: string | null;
};

export type VenueProfile = {
  courts_badminton: number | null;
  courts_total: number | null;
  dedicated: boolean;
  surface: string | null;
  bookability: "public" | "club_only" | "members_only" | "unknown";
  club_contact: string | null;
  booking_platform: string | null;
  booking_url: string | null;
  website_url: string | null;
  phone: string | null;
  opening_hours: Record<string, [string, string][]> | null;
  access_notes: string | null;
  summary: string | null;
  confidence: "high" | "medium" | "low";
  verified_at: string | null;
} | null;

export type VenueDetail = {
  id: string;
  name: string;
  suburb: string;
  state: string;
  address: string | null;
  lat: number;
  lng: number;
  region: string | null;
  slug: string | null;
  profile: VenueProfile;
  amenities: VenueAmenity[];
  pricing_bands: VenuePricingBand[];
  photos: { id: string; storage_path: string; credit: string | null }[];
  upcoming_game_count: number;
  next_game_at: string | null;
};

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

// Venue directory screen (venues-plan.md §5.1, §7.3). Facility data barely changes day to day,
// so a long staleTime avoids refetching on every nav back into the screen.
export function useVenueDetail(id: string | undefined) {
  return useQuery({
    queryKey: ["venueDetail", id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("venue_detail", { p_venue_id: id! });
      if (error) throw error;
      return data as unknown as VenueDetail | null;
    },
    enabled: !!id,
    staleTime: 60 * 60 * 1000,
  });
}

// Approved venue_photos storage_paths need a signed URL — the bucket is private (A5) so a
// pending/rejected photo can't be fetched by guessing its path.
export function useVenuePhotoUrls(paths: string[]) {
  return useQuery({
    queryKey: ["venuePhotoUrls", paths],
    queryFn: async () => {
      if (paths.length === 0) return [];
      const { data, error } = await supabase.storage.from("venue-photos").createSignedUrls(paths, 3600);
      if (error) throw error;
      return (data ?? []).map((d) => d.signedUrl).filter((u): u is string => !!u);
    },
    enabled: paths.length > 0,
    staleTime: 30 * 60 * 1000,
  });
}

export function useReportCorrection() {
  return useMutation({
    mutationFn: async (input: { venueId: string; field: string; suggestedValue?: string; note?: string }) => {
      const { data, error } = await supabase.rpc("report_venue_correction", {
        p_venue_id: input.venueId,
        p_field: input.field,
        p_suggested_value: input.suggestedValue,
        p_note: input.note,
      });
      if (error) throw error;
      return data;
    },
  });
}

// Wizard cold start (§5.3) — deferred to A2, no venue_search RPC yet. useVenues above already
// covers the empty-query partner-venue shortcut it's meant to sit alongside.

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
