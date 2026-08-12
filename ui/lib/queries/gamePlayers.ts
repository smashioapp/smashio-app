import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { avatarColor } from "../theme";
import type { Player } from "../mockData";

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
        .select("profile_id, profiles(display_name)")
        .eq("game_id", gameId)
        .eq("status", "approved");
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.profile_id,
        name: (row.profiles as { display_name: string } | null)?.display_name || "Player",
        color: avatarColor(row.profile_id),
      }));
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
        .select("game_id, profile_id, profiles(display_name)")
        .in("game_id", sortedIds)
        .eq("status", "approved");
      if (error) throw error;
      const byGame = new Map<string, Player[]>();
      for (const row of data ?? []) {
        const player: Player = {
          id: row.profile_id,
          name: (row.profiles as { display_name: string } | null)?.display_name || "Player",
          color: avatarColor(row.profile_id),
        };
        byGame.set(row.game_id, [...(byGame.get(row.game_id) ?? []), player]);
      }
      return byGame;
    },
    enabled: sortedIds.length > 0,
  });
}

export type Membership = { isOrganizer: boolean; status: "requested" | "approved" | "rejected" | "left" | "removed" | null };

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
  queryClient.invalidateQueries({ queryKey: ["nearby_games"] });
  queryClient.invalidateQueries({ queryKey: ["my_games"] });
}

export function useRequestToJoin(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const uid = await requireUserId();
      const { error } = await supabase.from("game_players").insert({ game_id: gameId, profile_id: uid, status: "requested" });
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
