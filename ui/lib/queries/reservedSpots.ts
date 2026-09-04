import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";
import { avatarColor } from "../theme";
import { captureMutationError } from "../sentry";

function photoUrl(path: string | null): string | null {
  return path ? supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl : null;
}

// A reserved spot the host has put a name, an invite, or a link on (post-game-plan.md D2).
// The remainder of games.reserved_spots is the plain anonymous count the wizard has always had —
// there is no row for those, by design: the host doesn't know who they are yet either.
export type ReservedSpot = {
  id: string;
  label: string | null;
  invitedProfileId: string | null;
  invitedName: string | null;
  invitedAvatarKey: string | null;
  invitedPhotoUri: string | null;
  inviteToken: string | null;
  claimedBy: string | null;
  claimedName: string | null;
  color: string;
  expiresAt: string | null;
  pinned: boolean;
};

export function useReservedSpots(gameId: string) {
  return useQuery({
    queryKey: ["reserved_spots", gameId],
    queryFn: async (): Promise<ReservedSpot[]> => {
      const { data, error } = await supabase
        .from("game_reserved_spots")
        // Two FKs point at profiles from this table, so PostgREST needs the constraint named
        // explicitly or it refuses to embed either. Kept as one string literal — supabase-js
        // parses the select at the type level and a concatenated expression defeats that.
        .select(
          "id, label, invited_profile_id, invite_token, claimed_by, created_at, expires_at, pinned, invited:profiles!game_reserved_spots_invited_profile_id_fkey(display_name, avatar_key, photo_path), claimer:profiles!game_reserved_spots_claimed_by_fkey(display_name)"
        )
        .eq("game_id", gameId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        label: row.label,
        invitedProfileId: row.invited_profile_id,
        invitedName: (row.invited as { display_name: string } | null)?.display_name ?? null,
        invitedAvatarKey: (row.invited as { avatar_key: string | null } | null)?.avatar_key ?? null,
        invitedPhotoUri: photoUrl((row.invited as { photo_path: string | null } | null)?.photo_path ?? null),
        inviteToken: row.invite_token,
        claimedBy: row.claimed_by,
        claimedName: (row.claimer as { display_name: string } | null)?.display_name ?? null,
        color: avatarColor(row.id),
        expiresAt: row.expires_at,
        pinned: row.pinned,
      }));
    },
    enabled: !!gameId,
  });
}

// Every mutation below invalidates the game itself as well as the spot list: a reserved spot is
// capacity, so naming or releasing one moves "spots left" on every card showing this game.
function invalidateSpots(queryClient: ReturnType<typeof useQueryClient>, gameId: string) {
  queryClient.invalidateQueries({ queryKey: ["reserved_spots", gameId] });
  queryClient.invalidateQueries({ queryKey: ["game", gameId] });
  queryClient.invalidateQueries({ queryKey: ["games"] });
  queryClient.invalidateQueries({ queryKey: ["game_players", "roster", gameId] });
}

export function useAddReservedSpot(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (label: string | null) => {
      const { data, error } = await supabase.rpc("add_reserved_spot", { p_game_id: gameId, p_label: label ?? undefined });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => invalidateSpots(queryClient, gameId),
    onError: (error) => captureMutationError("reserved_spot.add", error, { gameId }),
  });
}

export function useRenameReservedSpot(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ spotId, label }: { spotId: string; label: string }) => {
      const { error } = await supabase.rpc("rename_reserved_spot", { p_spot_id: spotId, p_label: label });
      if (error) throw error;
    },
    onSuccess: () => invalidateSpots(queryClient, gameId),
    onError: (error, input) => captureMutationError("reserved_spot.rename", error, { gameId, spotId: input.spotId }),
  });
}

// D3: releasing is the host's call and nobody else's — "my friend cancelled" is the only way a
// held spot ever goes back on the market.
export function useRemoveReservedSpot(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (spotId: string) => {
      const { error } = await supabase.rpc("remove_reserved_spot", { p_spot_id: spotId });
      if (error) throw error;
    },
    onSuccess: () => invalidateSpots(queryClient, gameId),
    onError: (error, spotId) => captureMutationError("reserved_spot.remove", error, { gameId, spotId }),
  });
}

// band 12e: the host adjusts how long a hold waits before auto-release, or pins it to exempt it
// entirely. hoursBefore is ignored when pinned is true.
export function useSetReservedSpotExpiry(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ spotId, hoursBefore, pinned }: { spotId: string; hoursBefore: number; pinned: boolean }) => {
      const { error } = await supabase.rpc("set_reserved_spot_expiry", { p_spot_id: spotId, p_hours_before: hoursBefore, p_pinned: pinned });
      if (error) throw error;
    },
    onSuccess: () => invalidateSpots(queryClient, gameId),
    onError: (error, input) => captureMutationError("reserved_spot.set_expiry", error, { gameId, spotId: input.spotId }),
  });
}

export function useInviteToReservedSpot(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ spotId, profileId }: { spotId: string; profileId: string }) => {
      const { error } = await supabase.rpc("invite_to_reserved_spot", { p_spot_id: spotId, p_profile_id: profileId });
      if (error) throw error;
    },
    onSuccess: () => invalidateSpots(queryClient, gameId),
    onError: (error, input) => captureMutationError("reserved_spot.invite", error, { gameId, spotId: input.spotId }),
  });
}

// Returns the share URL, not the bare token — the token alone is useless to a caller and easy to
// leak into the wrong string. Points at the claim screen (band 12), not the game page directly —
// the token alone resolves the game, so the URL doesn't need to carry the game id at all.
export function useCreateReservedSpotInvite(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (spotId: string) => {
      const { data, error } = await supabase.rpc("create_reserved_spot_invite", { p_spot_id: spotId });
      if (error) throw error;
      return `https://smashio.com.au/game/claim/${data as string}`;
    },
    onSuccess: () => invalidateSpots(queryClient, gameId),
    onError: (error, spotId) => captureMutationError("reserved_spot.create_invite", error, { gameId, spotId }),
  });
}

// Band 12's signed-out landing: a narrow, security-definer read the claim screen can call before
// there's a session (preview_reserved_spot_invite is granted to anon). No row back means the
// token is used, cancelled, or never existed — the claim screen collapses all three into one
// "lost link" state (create-game-plan.md defect #2), since the RPC can't tell them apart.
export type ReservedSpotInvitePreview = {
  gameId: string;
  hostName: string;
  venueName: string;
  venueSuburb: string | null;
  sportName: string;
  startsAt: string;
  costPerPlayerCents: number;
  spotLabel: string | null;
  gameStatus: string;
};

export function usePreviewReservedSpotInvite(token: string | null) {
  return useQuery({
    queryKey: ["reserved_spot_invite_preview", token],
    queryFn: async (): Promise<ReservedSpotInvitePreview | null> => {
      const { data, error } = await supabase.rpc("preview_reserved_spot_invite", { p_token: token as string }).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        gameId: data.game_id,
        hostName: data.host_name,
        venueName: data.venue_name,
        venueSuburb: data.venue_suburb,
        sportName: data.sport_name,
        startsAt: data.starts_at,
        costPerPlayerCents: data.cost_per_player_cents,
        spotLabel: data.spot_label,
        gameStatus: data.game_status,
      };
    },
    enabled: !!token,
    retry: false,
  });
}

// The claim screen's polite decline (band 12) — token-only, no auth required, so a recipient can
// say no without being forced through signup first.
export function useDeclineReservedSpot() {
  return useMutation({
    mutationFn: async (token: string) => {
      const { error } = await supabase.rpc("decline_reserved_spot", { p_token: token });
      if (error) throw error;
    },
    onError: (error) => captureMutationError("reserved_spot.decline", error),
  });
}

// D11: single use. The second person to open the same link gets "already used", not a stolen
// spot. Called from the game screen when it opens with an ?invite= param.
export function useClaimReservedSpot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => {
      const { data, error } = await supabase.rpc("claim_reserved_spot", { p_token: token });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (gameId) => invalidateSpots(queryClient, gameId),
    onError: (error) => captureMutationError("reserved_spot.claim", error),
  });
}

// D10's other half: the invitee decides. Declining hands the spot back to the host rather than
// releasing it to the public — it was held for a friend, and the host may have another in mind.
export function useRespondToGameInvite(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (accept: boolean) => {
      const { error } = await supabase.rpc("respond_to_game_invite", { p_game_id: gameId, p_accept: accept });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateSpots(queryClient, gameId);
      queryClient.invalidateQueries({ queryKey: ["game_players", "membership", gameId] });
    },
    onError: (error) => captureMutationError("reserved_spot.respond_to_invite", error, { gameId }),
  });
}

// design-brief Prompt 7a's "Invite from last game" quick-invite chip: people who've played an
// approved game hosted by this organizer before, and aren't already on this game's roster or
// holds. Organizer-only (recent_coplayers enforces it server-side too).
export type RecentCoplayer = {
  profileId: string;
  name: string;
  avatarKey: string | null;
  photoUri: string | null;
  color: string;
};

export function useRecentCoplayers(gameId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["recent_coplayers", gameId],
    queryFn: async (): Promise<RecentCoplayer[]> => {
      const { data, error } = await supabase.rpc("recent_coplayers", { p_game_id: gameId });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        profileId: row.profile_id,
        name: row.display_name,
        avatarKey: row.avatar_key,
        photoUri: photoUrl(row.photo_path),
        color: avatarColor(row.profile_id),
      }));
    },
    enabled: enabled && !!gameId,
  });
}

// Chains add_reserved_spot + invite_to_reserved_spot so "invite from last game" is one tap:
// hold a fresh spot, then invite this specific person to it, same as the manual "Hold a spot" ->
// "Invite someone" flow but without the intermediate search step since we already know who.
export function useInviteCoplayer(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (profileId: string) => {
      const { data: spotId, error: addError } = await supabase.rpc("add_reserved_spot", { p_game_id: gameId });
      if (addError) throw addError;
      const { error: inviteError } = await supabase.rpc("invite_to_reserved_spot", { p_spot_id: spotId as string, p_profile_id: profileId });
      if (inviteError) throw inviteError;
    },
    onSuccess: () => invalidateSpots(queryClient, gameId),
    onError: (error, profileId) => captureMutationError("reserved_spot.invite_coplayer", error, { gameId, profileId }),
  });
}

// Host-side people search for direct-add. Name prefix only, and deliberately not a full
// directory: it exists to find someone you already know, not to browse the user base.
export function usePlayerSearch(term: string) {
  const query = term.trim();
  return useQuery({
    queryKey: ["player_search", query],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, photo_path")
        .ilike("display_name", `${query}%`)
        .is("deleted_at", null)
        .limit(10);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        name: row.display_name,
        photoPath: row.photo_path,
        color: avatarColor(row.id),
      }));
    },
    enabled: query.length >= 2,
  });
}
