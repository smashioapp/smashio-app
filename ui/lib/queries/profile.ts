import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { File } from "expo-file-system";
import { supabase } from "../supabase";
import type { TablesUpdate } from "../db.types";
import { computeWeekStreak } from "../format";
import { avatarColor } from "../theme";

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

// "Games played" only counts completed games where you were an approved roster member —
// hosting alone (never joining your own roster) is a separate honest number, not folded in
// (profile-plan.md P0: two true counts beat one wrong one).
export function useProfileStats(profileId: string | undefined) {
  return useQuery({
    queryKey: ["profile_stats", profileId],
    queryFn: async () => {
      const [hosted, played] = await Promise.all([
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
      if (hosted.error) throw hosted.error;
      if (played.error) throw played.error;
      return { gamesPlayed: played.count ?? 0, gamesHosted: hosted.count ?? 0 };
    },
    enabled: !!profileId,
  });
}

// gtm-plan.md G7: referred_by attribution existed but nothing counted it. count is every
// profile crediting this user as their referrer (lifetime); credits is priority_credits still
// unspent, banked one-per-referral and spent automatically on the next full-game waitlist join.
export function useReferralStats(profileId: string | undefined) {
  return useQuery({
    queryKey: ["referral_stats", profileId],
    queryFn: async () => {
      const [count, profile] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("referred_by", profileId!),
        supabase.from("profiles").select("referral_priority_credits").eq("id", profileId!).single(),
      ]);
      if (count.error) throw count.error;
      if (profile.error) throw profile.error;
      return { count: count.count ?? 0, credits: profile.data.referral_priority_credits };
    },
    enabled: !!profileId,
  });
}

export function useProfileStreak(profileId: string | undefined) {
  return useQuery({
    queryKey: ["profile_streak", profileId],
    queryFn: async () => {
      const [organized, joined] = await Promise.all([
        supabase.from("games").select("starts_at").eq("organizer_id", profileId!).eq("status", "completed"),
        supabase
          .from("game_players")
          .select("games!inner(starts_at, status)")
          .eq("profile_id", profileId!)
          .eq("status", "approved")
          .eq("games.status", "completed"),
      ]);
      if (organized.error) throw organized.error;
      if (joined.error) throw joined.error;
      const dates = [
        ...(organized.data ?? []).map((g) => g.starts_at),
        ...(joined.data ?? []).map((r) => (r.games as unknown as { starts_at: string }).starts_at),
      ];
      return computeWeekStreak(dates);
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
        .select("*, skill_tiers(slug, label, ordinal)")
        .eq("profile_id", profileId!);
      if (error) throw error;
      return data;
    },
    enabled: !!profileId,
  });
}

export type PlayerCard = {
  id: string;
  displayName: string;
  photoPath: string | null;
  homeSuburb: string | null;
  memberSince: string;
  gamesPlayed: number;
  gamesHosted: number;
  reliabilityScore: number | null;
  reliabilityBand: string | null;
  ratingAvg: number | null;
  ratingCount: number | null;
  // How this player's *hosting* has been rated, kept apart from how they play (post-game-plan.md
  // D6). Null until they've hosted a game somebody rated.
  hostRatingAvg: number | null;
  hostRatingCount: number | null;
  gamesTogether: number | null;
  badgeCounts: Record<string, number>;
  hostBadgeCounts: Record<string, number>;
  // What co-players voted this player's tier at, as opposed to what they call themselves. Null
  // until anyone has voted (D5) — never inferred from stars, which is what it replaced.
  peerSkillLabel: string | null;
  peerSkillVotes: number | null;
  sports: { sportSlug: string; tierLabel: string; tierOrdinal: number }[];
  // true when the profile has gone players_only and the viewer hasn't earned a read (no shared
  // games, not a host this player has an open request with) — see player_card's is_restricted,
  // 20260822000000. Reputation fields above are null in that case, never a fake zero.
  restricted: boolean;
  avatarKey: string | null;
};

// The public player card (profile-plan.md P1) — security-definer RPC, not a view, because
// game_players (joined-game counts, games-together) is only readable to a game's own
// organizer/members under RLS. One round trip for any profile id, self included.
//
// player_card returns zero rows — not an error — for a blocked or deleted profile
// (20260822000000). maybeSingle() surfaces that as `data: null` instead of throwing, so the UI
// can tell "gone" apart from "network failed" and skip offering a Retry that can never work.
export function usePlayerCard(targetId: string | undefined) {
  return useQuery({
    queryKey: ["player_card", targetId],
    queryFn: async (): Promise<PlayerCard | null> => {
      const { data, error } = await supabase.rpc("player_card", { target_id: targetId! }).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        displayName: data.display_name,
        photoPath: data.photo_path,
        homeSuburb: data.home_suburb,
        memberSince: data.member_since,
        gamesPlayed: data.games_played,
        gamesHosted: data.games_hosted,
        reliabilityScore: data.reliability_score,
        reliabilityBand: data.reliability_band,
        ratingAvg: data.rating_avg,
        ratingCount: data.rating_count,
        hostRatingAvg: data.host_rating_avg,
        hostRatingCount: data.host_rating_count,
        gamesTogether: data.games_together,
        badgeCounts: (data.badge_counts as Record<string, number>) ?? {},
        hostBadgeCounts: (data.host_badge_counts as Record<string, number>) ?? {},
        peerSkillLabel: data.peer_skill_label,
        peerSkillVotes: data.peer_skill_votes,
        sports: ((data.sports as { sport_slug: string; tier_label: string; tier_ordinal: number }[]) ?? []).map((s) => ({
          sportSlug: s.sport_slug,
          tierLabel: s.tier_label,
          tierOrdinal: s.tier_ordinal,
        })),
        restricted: data.restricted,
        avatarKey: data.avatar_key,
      };
    },
    enabled: !!targetId,
  });
}

export type ProfileActivity = {
  thisMonthCount: number;
  mostPlayedVenue: string | null;
  mostPlayedWhen: string | null;
  heatmapDates: string[];
  distinctVenueCount: number;
  regulars: { id: string; name: string; color: string; gamesTogether: number }[];
};

const NIGHT_BUCKETS = [
  { label: "mornings", from: 0, to: 12 },
  { label: "afternoons", from: 12, to: 17 },
  { label: "evenings", from: 17, to: 24 },
];

// Stat block + regulars + heatmap (profile-plan.md P3) — all derived from game_players/games
// under existing RLS, no new backend. Regulars requires reading the full roster of every game
// this profile played in, which RLS allows because the caller is an approved member of each.
export function useProfileActivity(profileId: string | undefined) {
  return useQuery({
    queryKey: ["profile_activity", profileId],
    queryFn: async (): Promise<ProfileActivity> => {
      const [organized, joined] = await Promise.all([
        supabase
          .from("games")
          .select("id, starts_at, venue_id, venues(name)")
          .eq("organizer_id", profileId!)
          .eq("status", "completed"),
        supabase
          .from("game_players")
          .select("games!inner(id, starts_at, venue_id, status, venues(name))")
          .eq("profile_id", profileId!)
          .eq("status", "approved")
          .eq("games.status", "completed"),
      ]);
      if (organized.error) throw organized.error;
      if (joined.error) throw joined.error;

      type Row = { id: string; starts_at: string; venue_name: string | null };
      const rows: Row[] = [
        ...(organized.data ?? []).map((g) => ({ id: g.id, starts_at: g.starts_at, venue_name: (g.venues as { name: string } | null)?.name ?? null })),
        ...(joined.data ?? []).map((r) => {
          const g = r.games as unknown as { id: string; starts_at: string; venue_name?: unknown; venues: { name: string } | null };
          return { id: g.id, starts_at: g.starts_at, venue_name: g.venues?.name ?? null };
        }),
      ];

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const thisMonthCount = rows.filter((r) => new Date(r.starts_at) >= monthStart).length;

      const venueCounts = new Map<string, number>();
      const nightCounts = new Map<string, number>();
      for (const r of rows) {
        if (r.venue_name) venueCounts.set(r.venue_name, (venueCounts.get(r.venue_name) ?? 0) + 1);
        const d = new Date(r.starts_at);
        const day = d.toLocaleDateString("en-AU", { weekday: "long" });
        const hour = d.getHours();
        const bucket = NIGHT_BUCKETS.find((b) => hour >= b.from && hour < b.to)?.label ?? "evenings";
        const key = `${day} ${bucket}`;
        nightCounts.set(key, (nightCounts.get(key) ?? 0) + 1);
      }
      const mostPlayedVenue = [...venueCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const mostPlayedWhen = [...nightCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      const heatmapDates = rows.map((r) => r.starts_at);

      let regulars: ProfileActivity["regulars"] = [];
      const gameIds = rows.map((r) => r.id);
      if (gameIds.length > 0) {
        const { data: co, error: coErr } = await supabase
          .from("game_players")
          .select("profile_id, profiles(display_name)")
          .in("game_id", gameIds)
          .eq("status", "approved")
          .neq("profile_id", profileId!);
        if (coErr) throw coErr;
        const counts = new Map<string, { name: string; n: number }>();
        for (const row of co ?? []) {
          const name = (row.profiles as { display_name: string } | null)?.display_name || "Player";
          const existing = counts.get(row.profile_id);
          counts.set(row.profile_id, { name, n: (existing?.n ?? 0) + 1 });
        }
        regulars = [...counts.entries()]
          .map(([id, v]) => ({ id, name: v.name, color: avatarColor(id), gamesTogether: v.n }))
          .sort((a, b) => b.gamesTogether - a.gamesTogether)
          .slice(0, 5);
      }

      return { thisMonthCount, mostPlayedVenue, mostPlayedWhen, heatmapDates, distinctVenueCount: venueCounts.size, regulars };
    },
    enabled: !!profileId,
  });
}

// Drives the reliability gauge's ledger line (profile-plan.md P2) — the exact count the
// nightly cron's formula runs on, not a summary of it.
export function useLateLeaveCount(profileId: string | undefined) {
  return useQuery({
    queryKey: ["profile_late_leaves", profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("game_players")
        .select("decided_at, games!inner(starts_at)")
        .eq("profile_id", profileId!)
        .eq("status", "left");
      if (error) throw error;
      return (data ?? []).filter((r) => r.decided_at && r.decided_at > (r.games as unknown as { starts_at: string }).starts_at).length;
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

// Settings > Preferred sports "off" path — drops the tier row entirely rather than writing a
// null tier, since profile_sports' pk is (profile_id, sport_id) and a sport you don't play
// shouldn't carry a skill tier at all.
export function useRemoveProfileSport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sportId: string) => {
      const id = await currentUserId();
      const { error } = await supabase.from("profile_sports").delete().eq("profile_id", id).eq("sport_id", sportId);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => queryClient.invalidateQueries({ queryKey: ["profile_sports", id] }),
  });
}

// profile-plan.md P5 — unlocks a distance fallback when location permission is denied, and
// a "games near home" default on Discover, once enough profiles carry a home_point.
export function useSetHomePoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ lat, lng }: { lat: number; lng: number }) => {
      const { error } = await supabase.rpc("set_home_point", { p_lat: lat, p_lng: lng });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile"] }),
  });
}

export function useUploadAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (localUri: string) => {
      const id = await currentUserId();
      const bytes = await new File(localUri).arrayBuffer();
      const path = `${id}/avatar.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase.from("profiles").update({ photo_path: path }).eq("id", id);
      if (updateError) throw updateError;
      return id;
    },
    onSuccess: (id) => queryClient.invalidateQueries({ queryKey: ["profile", id] }),
  });
}

// Prefills from the OAuth provider's own photo (e.g. Google's `avatar_url`) — fetched
// server-side-shaped, so it goes straight to arrayBuffer, no base64 round trip needed.
export function useUploadAvatarFromUrl() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (remoteUrl: string) => {
      const id = await currentUserId();
      const response = await fetch(remoteUrl);
      const arrayBuffer = await response.arrayBuffer();
      const path = `${id}/avatar.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, arrayBuffer, { contentType: "image/jpeg", upsert: true });
      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase.from("profiles").update({ photo_path: path }).eq("id", id);
      if (updateError) throw updateError;
      return id;
    },
    onSuccess: (id) => queryClient.invalidateQueries({ queryKey: ["profile", id] }),
  });
}
