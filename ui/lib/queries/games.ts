import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { decode } from "base64-arraybuffer";
import { File } from "expo-file-system";
import { supabase } from "../supabase";
import type { Database } from "../db.types";
import type { Game, PastGame } from "../mockData";
import { formatDate, formatDistance, formatTimeRange } from "../format";
import { GAME_DURATION_MS } from "../schedule";
import { avatarColor } from "../theme";

// Sydney CBD — fallback center when device location is unavailable or denied. Sydney-only for launch.
export const DEFAULT_LAT = -33.8688;
export const DEFAULT_LNG = 151.2093;
const DEFAULT_RADIUS_M = 50_000;
const SPORT_SLUG = "badminton"; // MVP ships badminton only; sport stays data, not code, once a picker exists.

type NearbyGameRow = Database["public"]["Functions"]["nearby_games"]["Returns"][number];
type GamesPublicRow = Database["public"]["Views"]["games_public"]["Row"];

function toGame(row: NearbyGameRow): Game {
  return {
    id: row.id,
    organizerId: row.organizer_id,
    venue: row.venue_name,
    suburb: row.venue_suburb,
    courts: row.court_label ?? "",
    date: formatDate(row.starts_at),
    time: formatTimeRange(row.starts_at, row.ends_at),
    startsAt: row.starts_at,
    status: (row.status as Game["status"]) ?? "published",
    skill: row.skill_tier_label as Game["skill"],
    // nearby_games projects the tier by slug/label only — the id is a detail-screen concern
    // (editing), and detail always comes from games_public.
    skillTierId: "",
    maxPlayers: row.max_players,
    // Named roster is a separate fetch (useGameRoster), gated by RLS to organizer + approved
    // members — a discover card only ever gets the headcount.
    joined: [],
    joinedCount: row.approved_count ?? 0,
    cost: row.cost_total_cents / 100,
    verified: row.verification_status === "verified",
    verificationStatus: (row.verification_status as Game["verificationStatus"]) ?? "none",
    distance: formatDistance(row.distance_m),
    venueAddress: row.venue_address,
    venueLat: row.venue_lat,
    venueLng: row.venue_lng,
  };
}

// my-games list rows (joined/hosting/past) come from games_public directly — no distance_m.
function toGameFromPublicRow(row: GamesPublicRow): Game {
  return {
    id: row.id!,
    organizerId: row.organizer_id!,
    venue: row.venue_name!,
    suburb: row.venue_suburb!,
    courts: row.court_label ?? "",
    date: formatDate(row.starts_at!),
    time: formatTimeRange(row.starts_at!, row.ends_at!),
    startsAt: row.starts_at!,
    status: (row.status as Game["status"]) ?? "published",
    skill: row.skill_tier_label as Game["skill"],
    skillTierId: row.skill_tier_id!,
    maxPlayers: row.max_players!,
    joined: [],
    joinedCount: row.approved_count ?? 0,
    cost: (row.cost_total_cents ?? 0) / 100,
    verified: row.verification_status === "verified",
    verificationStatus: (row.verification_status as Game["verificationStatus"]) ?? "none",
    distance: "",
    venueAddress: row.venue_address,
    venueLat: row.venue_lat,
    venueLng: row.venue_lng,
  };
}

export function useDiscoverGames(
  filter: { tierSlug?: string; tonightOnly?: boolean },
  center: { lat: number; lng: number } = { lat: DEFAULT_LAT, lng: DEFAULT_LNG }
) {
  return useQuery({
    queryKey: ["nearby_games", SPORT_SLUG, filter.tierSlug ?? null, filter.tonightOnly ?? false, center.lat, center.lng],
    queryFn: async () => {
      let fromTs = new Date().toISOString();
      let toTs: string | undefined;
      if (filter.tonightOnly) {
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);
        toTs = endOfToday.toISOString();
      }

      const { data, error } = await supabase.rpc("nearby_games", {
        lat: center.lat,
        lng: center.lng,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nearby_games"] });
      queryClient.invalidateQueries({ queryKey: ["my_games"] });
    },
  });
}

function invalidateGameLists(queryClient: ReturnType<typeof useQueryClient>, gameId: string) {
  queryClient.invalidateQueries({ queryKey: ["games_public", gameId] });
  queryClient.invalidateQueries({ queryKey: ["nearby_games"] });
  queryClient.invalidateQueries({ queryKey: ["my_games"] });
}

// Venue is deliberately not editable — it's what the uploaded booking confirmation verifies
// against, so changing it would silently invalidate the Verified badge.
export function useUpdateGame(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { startsAt: Date; skillTierId: string; maxPlayers: number; costTotalCents: number }) => {
      const { error } = await supabase
        .from("games")
        .update({
          starts_at: input.startsAt.toISOString(),
          ends_at: new Date(input.startsAt.getTime() + GAME_DURATION_MS).toISOString(),
          skill_tier_id: input.skillTierId,
          max_players: input.maxPlayers,
          cost_total_cents: input.costTotalCents,
        })
        .eq("id", gameId);
      if (error) throw error;
    },
    onSuccess: () => invalidateGameLists(queryClient, gameId),
  });
}

// Cancel, never delete: joined players still need the game in their list (with its chat) to
// find out why it's off, and the DB trigger fires the cancellation push off this transition.
export function useCancelGame(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("games").update({ status: "cancelled" }).eq("id", gameId);
      if (error) throw error;
    },
    onSuccess: () => invalidateGameLists(queryClient, gameId),
  });
}

export function useGameDetail(gameId: string) {
  return useQuery({
    queryKey: ["games_public", gameId],
    queryFn: async () => {
      const { data, error } = await supabase.from("games_public").select("*").eq("id", gameId).single();
      if (error) throw error;
      return toGameFromPublicRow(data);
    },
    enabled: !!gameId,
  });
}

export function useMyJoinedGames() {
  return useQuery({
    queryKey: ["my_games", "joined"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];
      const { data: memberships, error: mErr } = await supabase
        .from("game_players")
        .select("game_id")
        .eq("profile_id", user.id)
        .eq("status", "approved");
      if (mErr) throw mErr;
      const gameIds = (memberships ?? []).map((m) => m.game_id);
      if (gameIds.length === 0) return [];
      // Cancelled games stay in the list until they're in the past — dropping them the
      // instant the organiser cancels is how a player ends up turning up to nothing.
      const { data, error } = await supabase
        .from("games_public")
        .select("*")
        .in("id", gameIds)
        .in("status", ["published", "cancelled"])
        // ends_at, not starts_at — a game you're at right now must stay in the list. The
        // completion cron only sweeps hourly, so this is what actually retires a finished one.
        .gte("ends_at", new Date().toISOString())
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(toGameFromPublicRow);
    },
  });
}

export function useMyHostingGames() {
  return useQuery({
    queryKey: ["my_games", "hosting"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("games_public")
        .select("*")
        .eq("organizer_id", user.id)
        .in("status", ["published", "cancelled"])
        // ends_at, not starts_at — a game you're at right now must stay in the list. The
        // completion cron only sweeps hourly, so this is what actually retires a finished one.
        .gte("ends_at", new Date().toISOString())
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(toGameFromPublicRow);
    },
  });
}

// Games are only 'completed' once slice 6's hourly cron flips them — this tab is real but
// stays empty in practice until that cron exists.
export function useMyPastGames() {
  return useQuery({
    queryKey: ["my_games", "past"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];
      const { data: memberships, error: mErr } = await supabase.from("game_players").select("game_id").eq("profile_id", user.id);
      if (mErr) throw mErr;
      const memberIds = (memberships ?? []).map((m) => m.game_id);
      const orClauses = [`organizer_id.eq.${user.id}`];
      if (memberIds.length > 0) orClauses.push(`id.in.(${memberIds.join(",")})`);
      const { data, error } = await supabase
        .from("games_public")
        .select("*")
        .or(orClauses.join(","))
        .eq("status", "completed")
        .order("starts_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(toGameFromPublicRow);
    },
  });
}

export function usePastGameDetail(gameId: string) {
  return useQuery({
    queryKey: ["past_game_detail", gameId],
    queryFn: async (): Promise<PastGame | null> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: game, error: gErr } = await supabase.from("games_public").select("*").eq("id", gameId).single();
      if (gErr) throw gErr;
      const { data: players, error: pErr } = await supabase
        .from("game_players")
        .select("profile_id, profiles(display_name)")
        .eq("game_id", gameId)
        .eq("status", "approved");
      if (pErr) throw pErr;
      return {
        id: game.id!,
        venue: game.venue_name!,
        date: formatDate(game.starts_at!),
        time: formatTimeRange(game.starts_at!, game.ends_at!),
        players: (players ?? [])
          .filter((p) => p.profile_id !== user?.id)
          .map((p) => ({
            id: p.profile_id,
            name: (p.profiles as { display_name: string } | null)?.display_name || "Player",
            color: avatarColor(p.profile_id),
          })),
      };
    },
    enabled: !!gameId,
  });
}

export function useUploadConfirmation() {
  return useMutation({
    mutationFn: async ({ gameId, localUri }: { gameId: string; localUri: string }) => {
      const base64 = await new File(localUri).base64();
      const path = `${gameId}/confirmation.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("confirmations")
        .upload(path, decode(base64), { contentType: "image/jpeg", upsert: true });
      if (uploadError) throw uploadError;

      const { error: parseError } = await supabase.functions.invoke("ai-proxy", {
        body: { game_id: gameId, storage_path: path },
      });
      if (parseError) throw parseError;
    },
  });
}
