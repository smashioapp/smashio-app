import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system";
import { supabase } from "../supabase";
import type { Database } from "../db.types";
import type { Game } from "../mockData";
import { formatDate, formatDistance, formatTimeRange } from "../format";

// Melbourne CBD, placeholder center until slice 7 wires device geolocation + the map view.
const DEFAULT_LAT = -37.8136;
const DEFAULT_LNG = 144.9631;
const DEFAULT_RADIUS_M = 50_000;
const SPORT_SLUG = "badminton"; // MVP ships badminton only; sport stays data, not code, once a picker exists.

type NearbyGameRow = Database["public"]["Functions"]["nearby_games"]["Returns"][number];

function toGame(row: NearbyGameRow): Game {
  return {
    id: row.id,
    venue: row.venue_name,
    suburb: row.venue_suburb,
    courts: row.court_label ?? "",
    date: formatDate(row.starts_at),
    time: formatTimeRange(row.starts_at, row.ends_at),
    skill: row.skill_tier_label as Game["skill"],
    maxPlayers: row.max_players,
    // No roster yet — game_players/real player avatars land in slice 4.
    joined: [],
    cost: row.cost_total_cents / 100,
    verified: row.verification_status === "verified",
    distance: formatDistance(row.distance_m),
  };
}

export function useDiscoverGames(filter: { tierSlug?: string; tonightOnly?: boolean }) {
  return useQuery({
    queryKey: ["nearby_games", SPORT_SLUG, filter.tierSlug ?? null, filter.tonightOnly ?? false],
    queryFn: async () => {
      let fromTs = new Date().toISOString();
      let toTs: string | undefined;
      if (filter.tonightOnly) {
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);
        toTs = endOfToday.toISOString();
      }

      const { data, error } = await supabase.rpc("nearby_games", {
        lat: DEFAULT_LAT,
        lng: DEFAULT_LNG,
        radius_m: DEFAULT_RADIUS_M,
        sport_slug: SPORT_SLUG,
        from_ts: fromTs,
        to_ts: toTs,
        tier_slugs: filter.tierSlug ? [filter.tierSlug] : undefined,
      });
      if (error) throw error;
      return (data ?? []).map(toGame);
    },
  });
}

const GAME_DURATION_MS = 2 * 60 * 60 * 1000; // Wizard offers a single start time; every game is a fixed 2h block for MVP.

export function useCreateGame() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      venueId: string;
      sportId: string;
      skillTierId: string;
      startsAt: Date;
      maxPlayers: number;
      costTotalCents: number;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");

      const endsAt = new Date(input.startsAt.getTime() + GAME_DURATION_MS);
      const { data, error } = await supabase
        .from("games")
        .insert({
          sport_id: input.sportId,
          venue_id: input.venueId,
          organizer_id: user.id,
          starts_at: input.startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          skill_tier_id: input.skillTierId,
          max_players: input.maxPlayers,
          cost_total_cents: input.costTotalCents,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["nearby_games"] }),
  });
}

export function useUploadConfirmation() {
  return useMutation({
    mutationFn: async ({ gameId, localUri }: { gameId: string; localUri: string }) => {
      const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
      const path = `${gameId}/confirmation.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("confirmations")
        .upload(path, decode(base64), { contentType: "image/jpeg", upsert: true });
      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase.from("games").update({ verification_status: "pending" }).eq("id", gameId);
      if (updateError) throw updateError;
    },
  });
}
