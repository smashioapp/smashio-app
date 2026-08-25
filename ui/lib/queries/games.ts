import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { File } from "expo-file-system";
import { supabase } from "../supabase";
import type { Database } from "../db.types";
import type { Game, PastGame } from "../mockData";
import { formatDate, formatDistance, formatTimeRange, type DistanceUnits } from "../format";
import { durationMs } from "../schedule";
import { avatarColor } from "../theme";
import { prepareConfirmationImage } from "../imagePrep";
import { randomCoverKey } from "../covers";

// Sydney CBD — fallback center when device location is unavailable or denied. Sydney-only for launch.
export const DEFAULT_LAT = -33.8688;
export const DEFAULT_LNG = 151.2093;
const DEFAULT_RADIUS_M = 50_000;
export const SPORT_SLUG = "badminton"; // MVP ships badminton only; sport stays data, not code, once a picker exists.

type NearbyGameRow = Database["public"]["Functions"]["nearby_games"]["Returns"][number];
type GamesPublicRow = Database["public"]["Views"]["games_public"]["Row"];

function toGame(row: NearbyGameRow, units: DistanceUnits = "km"): Game {
  return {
    id: row.id,
    organizerId: row.organizer_id,
    venue: row.venue_name,
    suburb: row.venue_suburb,
    courts: row.court_label ?? "",
    date: formatDate(row.starts_at),
    time: formatTimeRange(row.starts_at, row.ends_at),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: (row.status as Game["status"]) ?? "published",
    skill: row.skill_tier_label as Game["skill"],
    // nearby_games projects the tier by slug/label only — the id is a detail-screen concern
    // (editing), and detail always comes from games_public.
    skillTierId: "",
    maxPlayers: row.max_players,
    courtsBooked: row.courts_booked,
    durationHours: row.duration_hours,
    reservedSpots: row.reserved_spots ?? 0,
    reservedClaimed: row.reserved_claimed ?? 0,
    // Named roster is a separate fetch (useGameRoster), gated by RLS to organizer + approved
    // members — a discover card only ever gets the headcount.
    joined: [],
    joinedCount: row.approved_count ?? 0,
    cost: row.cost_per_player_cents / 100,
    verified: row.verification_status === "verified",
    verificationStatus: (row.verification_status as Game["verificationStatus"]) ?? "none",
    distance: formatDistance(row.distance_m, units),
    distanceM: row.distance_m,
    venueAddress: row.venue_address,
    venueLat: row.venue_lat,
    venueLng: row.venue_lng,
    organizerName: row.organizer_display_name || "Player",
    organizerPhotoPath: row.organizer_photo_path,
    organizerAvatarKey: row.organizer_avatar_key,
    organizerReliabilityScore: row.organizer_reliability_score,
    organizerHostedCount: row.organizer_hosted_count,
    skillTierOrdinal: row.skill_tier_ordinal,
    coverKey: row.cover_key,
  };
}

// my-games list rows (joined/hosting/past) come from games_public directly — no distance_m
// (there's no viewer location to measure from), but organizer_* is joined same as nearby_games.
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
    endsAt: row.ends_at!,
    status: (row.status as Game["status"]) ?? "published",
    skill: row.skill_tier_label as Game["skill"],
    skillTierId: row.skill_tier_id!,
    maxPlayers: row.max_players!,
    courtsBooked: row.courts_booked ?? 1,
    durationHours: row.duration_hours ?? 2,
    reservedSpots: row.reserved_spots ?? 0,
    reservedClaimed: row.reserved_claimed ?? 0,
    joined: [],
    joinedCount: row.approved_count ?? 0,
    cost: (row.cost_per_player_cents ?? 0) / 100,
    verified: row.verification_status === "verified",
    verificationStatus: (row.verification_status as Game["verificationStatus"]) ?? "none",
    distance: "",
    venueAddress: row.venue_address,
    venueLat: row.venue_lat,
    venueLng: row.venue_lng,
    venueId: row.venue_id ?? undefined,
    organizerName: row.organizer_display_name || "Player",
    organizerPhotoPath: row.organizer_photo_path,
    organizerAvatarKey: row.organizer_avatar_key,
    organizerReliabilityScore: row.organizer_reliability_score ?? undefined,
    organizerHostedCount: row.organizer_hosted_count ?? undefined,
    skillTierOrdinal: row.skill_tier_ordinal,
    coverKey: row.cover_key,
  };
}

export type WhenFilter = "tonight" | "tomorrow" | "week" | "all";

// "week" and "all" share the same lower bound (now) — only the upper bound differs — so the
// Hunter's default view (week, no level filter) is just "all" with a 7-day ceiling, not a
// separate code path.
function whenFilterRange(when: WhenFilter): { fromTs: string; toTs?: string } {
  const now = new Date();
  if (when === "tonight") {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    return { fromTs: now.toISOString(), toTs: endOfToday.toISOString() };
  }
  if (when === "tomorrow") {
    const startOfTomorrow = new Date();
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
    startOfTomorrow.setHours(0, 0, 0, 0);
    const endOfTomorrow = new Date(startOfTomorrow);
    endOfTomorrow.setHours(23, 59, 59, 999);
    return { fromTs: startOfTomorrow.toISOString(), toTs: endOfTomorrow.toISOString() };
  }
  if (when === "week") {
    const weekOut = new Date();
    weekOut.setDate(weekOut.getDate() + 7);
    return { fromTs: now.toISOString(), toTs: weekOut.toISOString() };
  }
  return { fromTs: now.toISOString() };
}

export function useDiscoverGames(
  filter: {
    tierSlugs?: string[];
    when?: WhenFilter;
    radiusKm?: number;
    hasSpotsOnly?: boolean;
    verifiedOnly?: boolean;
    maxCostPerPlayerCents?: number | null;
    amenitySlugs?: string[];
    sortBy?: string;
  },
  center: { lat: number; lng: number } = { lat: DEFAULT_LAT, lng: DEFAULT_LNG },
  options: { enabled?: boolean; units?: DistanceUnits } = {}
) {
  const tierSlugs = filter.tierSlugs?.length ? filter.tierSlugs : undefined;
  const when = filter.when ?? "all";
  const radiusM = (filter.radiusKm ?? DEFAULT_RADIUS_M / 1000) * 1000;
  const hasSpotsOnly = filter.hasSpotsOnly ?? false;
  const verifiedOnly = filter.verifiedOnly ?? false;
  const maxCostPerPlayerCents = filter.maxCostPerPlayerCents ?? null;
  const amenitySlugs = filter.amenitySlugs?.length ? filter.amenitySlugs : undefined;
  const sortBy = filter.sortBy ?? "soonest";
  const units = options.units ?? "km";
  return useQuery({
    enabled: options.enabled ?? true,
    queryKey: [
      "nearby_games",
      SPORT_SLUG,
      tierSlugs ?? null,
      when,
      center.lat,
      center.lng,
      radiusM,
      hasSpotsOnly,
      verifiedOnly,
      maxCostPerPlayerCents,
      amenitySlugs ?? null,
      sortBy,
      units,
    ],
    queryFn: async () => {
      const { fromTs, toTs } = whenFilterRange(when);
      const { data, error } = await supabase.rpc("nearby_games", {
        lat: center.lat,
        lng: center.lng,
        radius_m: radiusM,
        sport_slug: SPORT_SLUG,
        from_ts: fromTs,
        to_ts: toTs,
        tier_slugs: tierSlugs,
        has_spots_only: hasSpotsOnly,
        verified_only: verifiedOnly,
        max_cost_per_player_cents: maxCostPerPlayerCents ?? undefined,
        sort_by: sortBy,
        p_amenity_slugs: amenitySlugs,
      });
      if (error) throw error;
      return (data ?? []).map((row) => toGame(row, units));
    },
  });
}

// Pure social proof for the week-pulse strip — deliberately unfiltered by the viewer's own
// level/time/price choices, since "18 games this week" is a claim about the whole scene, not
// about what's currently on screen.
export function useWeekPulseGames(center: { lat: number; lng: number } = { lat: DEFAULT_LAT, lng: DEFAULT_LNG }) {
  return useQuery({
    queryKey: ["nearby_games_pulse", SPORT_SLUG, center.lat, center.lng],
    queryFn: async () => {
      const { fromTs, toTs } = whenFilterRange("week");
      const { data, error } = await supabase.rpc("nearby_games", {
        lat: center.lat,
        lng: center.lng,
        radius_m: DEFAULT_RADIUS_M,
        sport_slug: SPORT_SLUG,
        from_ts: fromTs,
        to_ts: toTs,
        p_exclude_mine: false,
      });
      if (error) throw error;
      return (data ?? []).map((row) => toGame(row));
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
      courtsBooked: number;
      durationHours: number;
      costPerPlayerCents: number;
      reservedSpots?: number;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");

      const endsAt = new Date(input.startsAt.getTime() + durationMs(input.durationHours));
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
          courts_booked: input.courtsBooked,
          duration_hours: input.durationHours,
          cost_per_player_cents: input.costPerPlayerCents,
          reserved_spots: input.reservedSpots ?? 0,
          cover_key: randomCoverKey(),
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
    mutationFn: async (input: {
      startsAt: Date;
      skillTierId: string;
      maxPlayers: number;
      courtsBooked: number;
      durationHours: number;
      costPerPlayerCents: number;
      reservedSpots: number;
    }) => {
      const { error } = await supabase
        .from("games")
        .update({
          starts_at: input.startsAt.toISOString(),
          ends_at: new Date(input.startsAt.getTime() + durationMs(input.durationHours)).toISOString(),
          skill_tier_id: input.skillTierId,
          max_players: input.maxPlayers,
          courts_booked: input.courtsBooked,
          duration_hours: input.durationHours,
          cost_per_player_cents: input.costPerPlayerCents,
          reserved_spots: input.reservedSpots,
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

export function useGameDetail(gameId: string, enabled = true) {
  return useQuery({
    queryKey: ["games_public", gameId],
    queryFn: async () => {
      const { data, error } = await supabase.from("games_public").select("*").eq("id", gameId).single();
      if (error) throw error;
      return toGameFromPublicRow(data);
    },
    enabled: enabled && !!gameId,
  });
}

export type GamePreview = {
  id: string;
  sportSlug: string;
  venue: string;
  suburb: string;
  date: string;
  time: string;
  skill: string;
  maxPlayers: number;
  costCents: number;
  status: string;
};

// Anon-safe teaser for a shared game link (see 20260820000100_game_preview_anon.sql) — used when
// there's no session yet, so the wife/friend clicking a WhatsApp link sees the event before login.
export function useGamePreview(gameId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["game_preview", gameId],
    queryFn: async (): Promise<GamePreview> => {
      // Not in db.types.ts's generated Functions map yet (regenerate after this migration lands).
      const { data, error } = await (supabase.rpc as any)("game_preview", { p_game_id: gameId }).single();
      if (error) throw error;
      if (!data) throw new Error("Game not found");
      return {
        id: data.id,
        sportSlug: data.sport_slug,
        venue: data.venue_name,
        suburb: data.venue_suburb,
        date: formatDate(data.starts_at),
        time: formatTimeRange(data.starts_at, data.ends_at),
        skill: data.skill_tier_label,
        maxPlayers: data.max_players,
        costCents: data.cost_per_player_cents,
        status: data.status,
      };
    },
    enabled: enabled && !!gameId,
    retry: false,
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
      // Both statuses — a request the host hasn't decided yet still belongs on this screen;
      // dropping it until approval makes the one screen named "My Games" silent about it.
      const { data: memberships, error: mErr } = await supabase
        .from("game_players")
        .select("game_id, status")
        .eq("profile_id", user.id)
        .in("status", ["approved", "requested"]);
      if (mErr) throw mErr;
      const statusByGameId = new Map(memberships?.map((m) => [m.game_id, m.status as "approved" | "requested"]));
      const gameIds = [...statusByGameId.keys()];
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
      return (data ?? []).map((row) => ({ ...toGameFromPublicRow(row), myStatus: statusByGameId.get(row.id!) }));
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
      // Approved only — a rejected/left/removed membership isn't a game the user actually
      // played, and history shouldn't count it (or offer a "Rate players" button for it).
      const { data: memberships, error: mErr } = await supabase
        .from("game_players")
        .select("game_id")
        .eq("profile_id", user.id)
        .eq("status", "approved");
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
      // Was a raw game_players select, which is why the host was never on anyone's rating screen
      // — organizers have no game_players row (post-game-plan.md, diagnosis 1). post_game_roster
      // unions the organizer in, drops anyone the host marked as a no-show, and reports what the
      // viewer has already submitted so a partial rating session can be resumed.
      const { data: roster, error: pErr } = await supabase.rpc("post_game_roster", { p_game_id: gameId });
      if (pErr) throw pErr;
      const { data: attendance } = await supabase
        .from("games")
        .select("attendance_marked_at")
        .eq("id", gameId)
        .maybeSingle();
      return {
        id: game.id!,
        venue: game.venue_name!,
        date: formatDate(game.starts_at!),
        time: formatTimeRange(game.starts_at!, game.ends_at!),
        players: (roster ?? []).map((p) => ({
          id: p.profile_id,
          name: p.display_name || "Player",
          color: avatarColor(p.profile_id),
          photoPath: p.photo_path,
          isHost: p.is_host,
          declaredTier: p.declared_tier_label,
          ratedPlayer: p.rated_player,
          ratedHost: p.rated_host,
          skillVoted: p.skill_voted,
        })),
        viewerIsHost: game.organizer_id === user?.id,
        attendanceMarkedAt: attendance?.attendance_marked_at ?? null,
        venueId: game.venue_id ?? null,
        venueSuburb: game.venue_suburb!,
        venueAddress: game.venue_address,
        skill: game.skill_tier_label as PastGame["skill"],
        maxPlayers: game.max_players!,
        courtsBooked: game.courts_booked ?? 1,
        durationHours: game.duration_hours ?? 2,
        cost: (game.cost_per_player_cents ?? 0) / 100,
        startsAtIso: game.starts_at!,
      };
    },
    enabled: !!gameId,
  });
}

export function useUploadConfirmation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ gameId, localUri }: { gameId: string; localUri: string }) => {
      const bytes = await new File(localUri).arrayBuffer();
      const path = `${gameId}/confirmation.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("confirmations")
        .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
      if (uploadError) throw uploadError;

      const { error: parseError } = await supabase.functions.invoke("ai-proxy", {
        body: { game_id: gameId, storage_path: path },
      });
      if (parseError) throw parseError;
    },
    // Wizard's own success screen tracks verified state locally and doesn't need a refetch —
    // this only matters for the M3 upload-from-hosting-card path, where the card must pick up
    // the new verification_status without the user navigating away and back.
    onSuccess: (_data, { gameId }) => invalidateGameLists(queryClient, gameId),
  });
}

export type ConfirmationFile = { localUri: string; mimeType: string };

// Host a Match redesign change 3: multiple confirmation files (photos + PDF), not just one.
// Every file uploads to storage for the record, but only the first still gets parsed/verified
// against — extra files are supporting evidence, not additional signal for the AI proxy.
export function useUploadConfirmationFiles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ gameId, files }: { gameId: string; files: ConfirmationFile[] }) => {
      if (files.length === 0) return;
      for (let i = 0; i < files.length; i++) {
        const { localUri, mimeType } = files[i];
        const ext = mimeType === "application/pdf" ? "pdf" : "jpg";
        const bytes = await new File(localUri).arrayBuffer();
        const path = i === 0 ? `${gameId}/confirmation.${ext}` : `${gameId}/confirmation-${i}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("confirmations")
          .upload(path, bytes, { contentType: mimeType, upsert: true });
        if (uploadError) throw uploadError;
        if (i === 0) {
          const { error: parseError } = await supabase.functions.invoke("ai-proxy", {
            body: { game_id: gameId, storage_path: path },
          });
          if (parseError) throw parseError;
        }
      }
    },
    onSuccess: (_data, { gameId }) => invalidateGameLists(queryClient, gameId),
  });
}

// Host flow plan (docs/host-flow-plan.md). Every field but is_booking_confirmation/confidence
// is nullable — a partial parse is the normal case, not an error (see the failure ladder).
export type ParsedBooking = {
  is_booking_confirmation: boolean;
  venue_name: string | null;
  venue_address: string | null;
  starts_at_local: string | null;
  ends_at_local: string | null;
  courts: number | null;
  court_labels: string[] | null;
  total_cost_aud: number | null;
  booking_reference: string | null;
  confidence: "high" | "medium" | "low";
};

// supabase-js wraps a non-2xx Edge Function response in FunctionsHttpError with the raw fetch
// Response on `.context` — the useful message (rate limit text, Claude failure detail) lives in
// that response body, not on error.message ("Edge Function returned a non-2xx status code").
async function readFunctionsErrorMessage(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context;
  if (!(context instanceof Response)) return fallback;
  try {
    const cloned = context.clone();
    const text = await cloned.text();
    try {
      const json = JSON.parse(text);
      if (typeof json?.error === "string") return json.error;
    } catch {
      // not JSON — a plain-text body like "Too Many Requests" is still useful as-is.
    }
    return text || fallback;
  } catch {
    return fallback;
  }
}

// Step 0 of the receipt-first flow: upload straight to drafts/{uid}/ (no game yet) and parse.
// Client-side downscale to ~1600px long edge before upload — parsing costs real money per call.
export function useParseConfirmation() {
  return useMutation({
    mutationFn: async ({ localUri, width, height }: { localUri: string; width: number; height: number }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");

      const preparedUri = await prepareConfirmationImage(localUri, width, height);
      const bytes = await new File(preparedUri).arrayBuffer();
      const path = `drafts/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("confirmations")
        .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
      if (uploadError) throw uploadError;

      const { data, error } = await supabase.functions.invoke("ai-proxy", {
        body: { mode: "parse", storage_path: path },
      });
      if (error) throw new Error(await readFunctionsErrorMessage(error, "Couldn't read that photo."));
      return data as { confirmation_id: string; parsed: ParsedBooking };
    },
  });
}

// Publish-time: claims a parsed draft onto the game that was just created from it. Server-side
// only decides whether this flips games.verification_status — the client just reports the result.
export function useAttachConfirmation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ confirmationId, gameId }: { confirmationId: string; gameId: string }) => {
      const { error } = await supabase.functions.invoke("ai-proxy", {
        body: { mode: "attach", confirmation_id: confirmationId, game_id: gameId },
      });
      if (error) throw new Error(await readFunctionsErrorMessage(error, "Couldn't attach your booking confirmation."));
    },
    onSuccess: (_data, { gameId }) => invalidateGameLists(queryClient, gameId),
  });
}
