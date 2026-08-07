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
        name: (row.profiles as { display_name: string } | null)?.display_name || "Player",
        color: avatarColor(row.profile_id),
      }));
    },
    enabled: !!gameId,
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

function invalidateGame(queryClient: ReturnType<typeof useQueryClient>, gameId: string) {
  queryClient.invalidateQueries({ queryKey: ["game_players", "roster", gameId] });
  queryClient.invalidateQueries({ queryKey: ["game_players", "membership", gameId] });
  queryClient.invalidateQueries({ queryKey: ["game_players", "requests", gameId] });
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
