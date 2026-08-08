import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system";
import { supabase } from "../supabase";
import type { TablesUpdate } from "../db.types";

async function currentUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return user.id;
}

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ["profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
}

export function useProfileStats(profileId: string | undefined) {
  return useQuery({
    queryKey: ["profile_stats", profileId],
    queryFn: async () => {
      const [organized, joined] = await Promise.all([
        supabase
          .from("games")
          .select("id", { count: "exact", head: true })
          .eq("organizer_id", profileId!)
          .eq("status", "completed"),
        supabase
          .from("game_players")
          .select("game_id, games!inner(status)", { count: "exact", head: true })
          .eq("profile_id", profileId!)
          .eq("status", "approved")
          .eq("games.status", "completed"),
      ]);
      if (organized.error) throw organized.error;
      if (joined.error) throw joined.error;
      return { gamesPlayed: (organized.count ?? 0) + (joined.count ?? 0) };
    },
    enabled: !!profileId,
  });
}

export function useProfileSports(profileId: string | undefined) {
  return useQuery({
    queryKey: ["profile_sports", profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_sports")
        .select("*, skill_tiers(label)")
        .eq("profile_id", profileId!);
      if (error) throw error;
      return data;
    },
    enabled: !!profileId,
  });
}

// Mutations below resolve the current user id at call time via supabase.auth.getUser()
// instead of trusting a prop — right after signup the session context can lag a render
// behind the SDK's own in-memory session, which would otherwise send id=eq.undefined.

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: TablesUpdate<"profiles">) => {
      const id = await currentUserId();
      const { error } = await supabase.from("profiles").update(patch).eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => queryClient.invalidateQueries({ queryKey: ["profile", id] }),
  });
}

export function useUpsertProfileSport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sportId, skillTierId }: { sportId: string; skillTierId: string }) => {
      const id = await currentUserId();
      const { error } = await supabase
        .from("profile_sports")
        .upsert({ profile_id: id, sport_id: sportId, skill_tier_id: skillTierId });
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => queryClient.invalidateQueries({ queryKey: ["profile_sports", id] }),
  });
}

export function useUploadAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (localUri: string) => {
      const id = await currentUserId();
      const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
      const path = `${id}/avatar.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, decode(base64), { contentType: "image/jpeg", upsert: true });
      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase.from("profiles").update({ photo_path: path }).eq("id", id);
      if (updateError) throw updateError;
      return id;
    },
    onSuccess: (id) => queryClient.invalidateQueries({ queryKey: ["profile", id] }),
  });
}
