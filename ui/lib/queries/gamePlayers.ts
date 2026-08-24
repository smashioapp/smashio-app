import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { avatarColor } from "../theme";
import type { Player } from "../mockData";

function photoUrl(path: string | null): string | null {
  return path ? supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl : null;
}

async function requireUserId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return user.id;
}

export function useGameRoster(gameId: string) {
  return useQuery({
    queryKey: ["game_players", "roster", gameId],
    queryFn: async (): Promise<Player[]> => {
      const { data, error } = await supabase
        .from("game_players")
        .select("profile_id, profiles(display_name, photo_path, avatar_key)")
        .eq("game_id", gameId)
        .eq("status", "approved");
      if (error) throw error;
      return (data ?? []).map((row) => {
        const profile = row.profiles as { display_name: string; photo_path: string | null; avatar_key: string | null } | null;
        return {
          id: row.profile_id,
          name: profile?.display_name || "Player",
          color: avatarColor(row.profile_id),
          photoUri: photoUrl(profile?.photo_path ?? null),
          avatarKey: profile?.avatar_key ?? null,
        };
      });
    },
    enabled: !!gameId,
  });
}

// One query across every game on My Games, not one per card — cheap under RLS
// (organizer + approved members can read game_players) and the roster-faces upgrade doesn't
// scale with list length.
export function useMyGamesRoster(gameIds: string[]) {
  const sortedIds = [...gameIds].sort();
  return useQuery({
    queryKey: ["game_players", "my_games_roster", sortedIds],
    queryFn: async (): Promise<Map<string, Player[]>> => {
      if (sortedIds.length === 0) return new Map();
      const { data, error } = await supabase
        .from("game_players")
        .select("game_id, profile_id, attended, profiles(display_name, photo_path, avatar_key)")
        .in("game_id", sortedIds)
        .eq("status", "approved");
      if (error) throw error;
      const byGame = new Map<string, Player[]>();
      for (const row of data ?? []) {
        // A host-marked no-show is off the roster for every downstream use — roster faces on the
        // card, and the "Rate N players" count (post-game-plan.md D4). attended === null means
        // the host never marked, so nobody is excluded.
        if (row.attended === false) continue;
        const profile = row.profiles as { display_name: string; photo_path: string | null; avatar_key: string | null } | null;
        const player: Player = {
          id: row.profile_id,
          name: profile?.display_name || "Player",
          color: avatarColor(row.profile_id),
          photoUri: photoUrl(profile?.photo_path ?? null),
          avatarKey: profile?.avatar_key ?? null,
        };
        byGame.set(row.game_id, [...(byGame.get(row.game_id) ?? []), player]);
      }
      return byGame;
    },
    enabled: sortedIds.length > 0,
  });
}

export type Membership = {
  isOrganizer: boolean;
  // 'invited' is the host direct-adding someone to a reserved spot; the player answers, not the
  // host (post-game-plan.md D10). 'declined' is their no.
  status: "requested" | "invited" | "approved" | "rejected" | "left" | "removed" | "declined" | null;
};

export function useMyMembership(gameId: string, organizerId: string | null | undefined) {
  return useQuery({
    queryKey: ["game_players", "membership", gameId],
    queryFn: async (): Promise<Membership> => {
      const uid = await requireUserId();
      const { data, error } = await supabase
        .from("game_players")
        .select("status")
        .eq("game_id", gameId)
        .eq("profile_id", uid)
        .maybeSingle();
      if (error) throw error;
      return { isOrganizer: organizerId === uid, status: (data?.status as Membership["status"]) ?? null };
    },
    enabled: !!gameId && organizerId !== undefined,
  });
}

export function useJoinRequests(gameId: string) {
  return useQuery({
    queryKey: ["game_players", "requests", gameId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("game_players")
        .select("profile_id, requested_at, profiles(display_name)")
        .eq("game_id", gameId)
        .eq("status", "requested")
        .order("requested_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        profileId: row.profile_id,
        name: (row.profiles as { display_name: string } | null)?.display_name || "Player",
        color: avatarColor(row.profile_id),
      }));
    },
    enabled: !!gameId,
  });
}

// Badge count for the tab bar — total pending join requests across every game this user organizes.
export function useMyPendingRequestsCount() {
  return useQuery({
    queryKey: ["game_players", "pending_requests_count"],
    queryFn: async (): Promise<number> => {
      const uid = await requireUserId();
      const { data: hosting, error: hErr } = await supabase.from("games").select("id").eq("organizer_id", uid);
      if (hErr) throw hErr;
      const gameIds = (hosting ?? []).map((g) => g.id);
      if (gameIds.length === 0) return 0;
      const { count, error } = await supabase
        .from("game_players")
        .select("profile_id", { count: "exact", head: true })
        .in("game_id", gameIds)
        .eq("status", "requested");
      if (error) throw error;
      return count ?? 0;
    },
  });
}

function invalidateGame(queryClient: ReturnType<typeof useQueryClient>, gameId: string) {
  queryClient.invalidateQueries({ queryKey: ["game_players", "roster", gameId] });
  queryClient.invalidateQueries({ queryKey: ["game_players", "membership", gameId] });
  queryClient.invalidateQueries({ queryKey: ["game_players", "requests", gameId] });
  queryClient.invalidateQueries({ queryKey: ["game_players", "pending_requests_count"] });
  // Prefix match — these two are keyed by the full (sorted) game-id list, not a single gameId,
  // so a partial ["game_players", "<name>"] key catches every variant currently cached.
  queryClient.invalidateQueries({ queryKey: ["game_players", "my_games_roster"] });
  queryClient.invalidateQueries({ queryKey: ["game_players", "hosted_pending"] });
  queryClient.invalidateQueries({ queryKey: ["nearby_games"] });
  queryClient.invalidateQueries({ queryKey: ["my_games"] });
}

export type PendingRequest = { profileId: string; name: string; color: string };

// Grouped pending-request rows across every game I organize — one query, not one per hosting
// card, so the card can decide in place without a trip to /game/[id] (my-games-plan.md §M3).
export function useMyHostedPendingRequests(gameIds: string[]) {
  const sortedIds = [...gameIds].sort();
  return useQuery({
    queryKey: ["game_players", "hosted_pending", sortedIds],
    queryFn: async (): Promise<Map<string, PendingRequest[]>> => {
      if (sortedIds.length === 0) return new Map();
      const { data, error } = await supabase
        .from("game_players")
        .select("game_id, profile_id, requested_at, profiles(display_name)")
        .in("game_id", sortedIds)
        .eq("status", "requested")
        .order("requested_at", { ascending: true });
      if (error) throw error;
      const byGame = new Map<string, PendingRequest[]>();
      for (const row of data ?? []) {
        const request: PendingRequest = {
          profileId: row.profile_id,
          name: (row.profiles as { display_name: string } | null)?.display_name || "Player",
          color: avatarColor(row.profile_id),
        };
        byGame.set(row.game_id, [...(byGame.get(row.game_id) ?? []), request]);
      }
      return byGame;
    },
    enabled: sortedIds.length > 0,
  });
}

export function useRequestToJoin(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await requireUserId();
      const { error } = await supabase.rpc("request_to_join", { p_game_id: gameId });
      if (error) throw error;
    },
    onSuccess: () => invalidateGame(queryClient, gameId),
  });
}

export function useLeaveGame(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("leave_game", { p_game_id: gameId });
      if (error) throw error;
    },
    onSuccess: () => invalidateGame(queryClient, gameId),
  });
}

// Organiser-side counterpart to leave_game — frees the spot and pushes the player a notice.
export function useRemovePlayer(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (profileId: string) => {
      const { error } = await supabase.rpc("remove_player", { p_game_id: gameId, p_profile_id: profileId });
      if (error) throw error;
    },
    onSuccess: () => invalidateGame(queryClient, gameId),
  });
}

export function useDecideJoinRequest(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ profileId, approve }: { profileId: string; approve: boolean }) => {
      const { error } = await supabase.rpc("decide_join_request", { p_game_id: gameId, p_profile_id: profileId, approve });
      if (error) throw error;
    },
    onSuccess: () => invalidateGame(queryClient, gameId),
  });
}

// Everyone on the roster the host can mark, regardless of whether they turned up — distinct from
// post_game_roster, which is only who the *viewer* may rate. The host needs the whole list to
// mark against; post_game_roster is the result of that marking.
export type AttendanceRow = { profileId: string; name: string; color: string; attended: boolean | null };

export function useGameAttendance(gameId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["game_players", "attendance", gameId],
    queryFn: async (): Promise<AttendanceRow[]> => {
      const { data, error } = await supabase
        .from("game_players")
        .select("profile_id, attended, profiles(display_name)")
        .eq("game_id", gameId)
        .eq("status", "approved");
      if (error) throw error;
      return (data ?? []).map((row) => ({
        profileId: row.profile_id,
        name: (row.profiles as { display_name: string } | null)?.display_name || "Player",
        color: avatarColor(row.profile_id),
        attended: row.attended,
      }));
    },
    enabled: !!gameId && enabled,
  });
}

// Host-only (post-game-plan.md D4). Marking is what releases the rating prompt to everyone else,
// so this invalidates the post-game roster too: the people marked as no-shows have to disappear
// from the rating list immediately, not on the next cold load.
export function useMarkAttendance(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (noShowIds: string[]) => {
      const { error } = await supabase.rpc("mark_attendance", { p_game_id: gameId, p_no_shows: noShowIds });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["game_players", "attendance", gameId] });
      queryClient.invalidateQueries({ queryKey: ["past_game_detail", gameId] });
    },
  });
}
