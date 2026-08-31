import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";

async function currentUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return user.id;
}

export type FollowRow = {
  id: string;
  displayName: string;
  photoPath: string | null;
  avatarKey: string | null;
  homeSuburb: string | null;
  isFollowing: boolean;
};

function mapRows(data: { id: string; display_name: string; photo_path: string | null; avatar_key: string | null; home_suburb: string | null; is_following: boolean }[]): FollowRow[] {
  return data.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    photoPath: r.photo_path,
    avatarKey: r.avatar_key,
    homeSuburb: r.home_suburb,
    isFollowing: r.is_following,
  }));
}

export function useFollowers(profileId: string | undefined) {
  return useQuery({
    queryKey: ["followers_of", profileId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("followers_of", { target_id: profileId! });
      if (error) throw error;
      return mapRows(data ?? []);
    },
    enabled: !!profileId,
  });
}

export function useFollowing(profileId: string | undefined) {
  return useQuery({
    queryKey: ["following_of", profileId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("following_of", { target_id: profileId! });
      if (error) throw error;
      return mapRows(data ?? []);
    },
    enabled: !!profileId,
  });
}

export function useFollowPlayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (followeeId: string) => {
      const id = await currentUserId();
      const { error } = await supabase.from("follows").insert({ follower_id: id, followee_id: followeeId });
      if (error) throw error;
      return followeeId;
    },
    onSuccess: (followeeId) => {
      queryClient.invalidateQueries({ queryKey: ["player_card", followeeId] });
      queryClient.invalidateQueries({ queryKey: ["followers_of", followeeId] });
      queryClient.invalidateQueries({ queryKey: ["following_of"] });
    },
  });
}

export function useUnfollowPlayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (followeeId: string) => {
      const id = await currentUserId();
      const { error } = await supabase.from("follows").delete().eq("follower_id", id).eq("followee_id", followeeId);
      if (error) throw error;
      return followeeId;
    },
    onSuccess: (followeeId) => {
      queryClient.invalidateQueries({ queryKey: ["player_card", followeeId] });
      queryClient.invalidateQueries({ queryKey: ["followers_of", followeeId] });
      queryClient.invalidateQueries({ queryKey: ["following_of"] });
    },
  });
}
