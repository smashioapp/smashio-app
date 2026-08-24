import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import type { TablesInsert } from "../db.types";

async function currentUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return user.id;
}

// profile_private (20260822000000) — self-only side table, never joined into player_card. The
// only field on it today is a game-day contact number.
export function usePhone() {
  return useQuery({
    queryKey: ["profile_private_phone"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profile_private").select("phone").maybeSingle();
      if (error) throw error;
      return data?.phone ?? null;
    },
  });
}

export function useSetPhone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (phone: string | null) => {
      const id = await currentUserId();
      const patch: TablesInsert<"profile_private"> = { profile_id: id, phone };
      const { error } = await supabase.from("profile_private").upsert(patch, { onConflict: "profile_id" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile_private_phone"] }),
  });
}

// Own blocklist only — blocks.select RLS is blocker_id = auth.uid(), so this can never return
// who blocked *you* (20260822000000: "surfacing the reverse turns a safety tool into a
// notification").
export function useBlockedPlayers() {
  return useQuery({
    queryKey: ["blocks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blocks")
        .select("blocked_id, created_at, profiles!blocks_blocked_id_fkey(id, display_name, photo_path, avatar_key)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useBlockPlayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (blockedId: string) => {
      const id = await currentUserId();
      const { error } = await supabase.from("blocks").insert({ blocker_id: id, blocked_id: blockedId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blocks"] });
      queryClient.invalidateQueries({ queryKey: ["nearby_games"] });
      queryClient.invalidateQueries({ queryKey: ["player_card"] });
    },
  });
}

export function useUnblockPlayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (blockedId: string) => {
      const id = await currentUserId();
      const { error } = await supabase.from("blocks").delete().eq("blocker_id", id).eq("blocked_id", blockedId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blocks"] });
      queryClient.invalidateQueries({ queryKey: ["nearby_games"] });
      queryClient.invalidateQueries({ queryKey: ["player_card"] });
    },
  });
}

export type ReportReason = "harassment" | "no_show" | "unsafe" | "fake_profile" | "spam" | "other";

// report_user (20260822000000) rate-limits to one report per target per day server-side — a
// second call in the same day throws, surface that error rather than retrying.
export function useReportUser() {
  return useMutation({
    mutationFn: async (input: { reportedId: string; reason: ReportReason; detail?: string; contextGameId?: string }) => {
      const { error } = await supabase.rpc("report_user", {
        p_reported_id: input.reportedId,
        p_reason: input.reason,
        p_detail: input.detail,
        p_context_game_id: input.contextGameId,
      });
      if (error) throw error;
    },
  });
}

// Settings > Preferences > Distance units, read wherever a screen formats a distance. profiles
// select policy is `using (true)` (20260807000200:15) but this only ever reads the signed-in
// user's own row via useProfile's cache — react-query dedupes the subscription across every
// component that calls this, so it's one fetch per session, not one per card.
export function useDistanceUnits(): "km" | "mi" {
  const { data } = useQuery({
    queryKey: ["distance_units"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return "km" as const;
      const { data, error } = await supabase.from("profiles").select("distance_units").eq("id", user.id).maybeSingle();
      if (error) throw error;
      return (data?.distance_units as "km" | "mi" | undefined) ?? "km";
    },
  });
  return data ?? "km";
}
