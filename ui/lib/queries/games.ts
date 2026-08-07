import { useQuery } from "@tanstack/react-query";
import { supabase } from "../supabase";
import type { Database } from "../db.types";
import type { Game } from "../mockData";

// Melbourne CBD, placeholder center until slice 7 wires device geolocation + the map view.
const DEFAULT_LAT = -37.8136;
const DEFAULT_LNG = 144.9631;
const DEFAULT_RADIUS_M = 50_000;
const SPORT_SLUG = "badminton"; // MVP ships badminton only; sport stays data, not code, once a picker exists.

type NearbyGameRow = Database["public"]["Functions"]["nearby_games"]["Returns"][number];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

function formatTimeRange(startIso: string, endIso: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true }).replace(" ", "");
  return `${fmt(startIso)}–${fmt(endIso)}`;
}

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

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
