import { TierId } from "./theme";

export type Player = { id: string; name: string; color: string };

export type GameStatus = "published" | "cancelled" | "completed";

export type Game = {
  id: string;
  organizerId: string;
  venue: string;
  suburb: string;
  courts: string;
  date: string;
  time: string;
  startsAt: string;
  endsAt: string;
  status: GameStatus;
  skill: TierId;
  skillTierId: string;
  maxPlayers: number;
  courtsBooked: number;
  durationHours: number;
  // Spots the host has taken off max_players for people joining outside the app (own friends,
  // teammates). A subset may be *named* (game_reserved_spots rows) and invitable; the rest is a
  // plain count. See spotsLeft below.
  reservedSpots: number;
  // How many of those reserved spots a friend has actually claimed. A claimed spot has become an
  // approved roster row, so it's already inside joinedCount — subtracting the raw reservedSpots
  // would charge for it twice.
  reservedClaimed: number;
  // Named roster — only populated where the viewer is allowed to see it (organizer/approved
  // member); everyone else sees `joinedCount` only. See useGameRoster's RLS-driven privacy.
  joined: Player[];
  joinedCount: number;
  // Per-player price, set directly by the host — not derived from a total booking cost divided
  // by maxPlayers (a host with 2 spare slots on a $40 court can still charge $8 each).
  cost: number;
  verified: boolean;
  verificationStatus: "none" | "pending" | "verified";
  distance: string;
  // Raw metres — only nearby_games projects it (games_public rows have no distance concept).
  // Kept alongside the formatted `distance` string so the fallback ladder can compare against
  // the current radius filter without re-parsing "3.2 km".
  distanceM?: number | null;
  venueAddress: string | null;
  venueLat: number | null;
  venueLng: number | null;
  // Only populated by toGameFromPublicRow (my-games) — nearby_games doesn't project it, and
  // Discover cards never need it. Rebook (M4) is the only consumer: the wizard's venue step
  // needs the venues.id row, not just the display fields.
  venueId?: string;
  // Only populated by nearby_games (Discover) — games_public rows (my-games) don't join
  // profiles, so a card falls back to no host row rather than showing stale/wrong identity.
  organizerName?: string;
  organizerPhotoPath?: string | null;
  organizerReliabilityScore?: number;
  organizerHostedCount?: number;
  skillTierOrdinal?: number | null;
  // Only populated by useMyJoinedGames — the viewer's own membership row status, so a
  // requested-but-not-yet-approved game can render "Awaiting host" instead of vanishing.
  myStatus?: "approved" | "requested";
};

export type PastPlayer = {
  id: string;
  name: string;
  color: string;
  photoPath: string | null;
  // The host is rated twice — as a player like anyone else, and as a host (post-game-plan.md D6).
  isHost: boolean;
  // What this player says their own tier is. Shown next to the skill vote so the rater is
  // answering "is that right?" rather than guessing in a vacuum.
  declaredTier: string | null;
  // What the viewer has already submitted for this person. Ratings are immutable and there's no
  // deadline (D7), so a half-finished screen has to come back showing what's already locked in.
  ratedPlayer: boolean;
  ratedHost: boolean;
  skillVoted: boolean;
};
export type PastGame = {
  id: string;
  venue: string;
  date: string;
  time: string;
  // Only people the viewer may rate: attendees, host included, viewer excluded. A no-show the
  // host marked is absent from every copy of this list.
  players: PastPlayer[];
  // Viewer is the organizer, so they get the attendance controls.
  viewerIsHost: boolean;
  // Null until the host marks who showed. While it's null nobody has been excluded, which is why
  // the fallback prompt asks everyone to rate everyone (D4).
  attendanceMarkedAt: string | null;
  // Rebook fields (M4) — post-game's "Rebook this game" needs the same source data as the
  // Past tab's card, not just what the ratings screen itself displays.
  venueId: string | null;
  venueSuburb: string;
  venueAddress: string | null;
  skill: TierId;
  maxPlayers: number;
  courtsBooked: number;
  durationHours: number;
  cost: number;
  startsAtIso: string;
};

// Mirrors public.open_spots (post-game-plan.md D1). The host always occupies one of max_players
// — `4` means the host plus 3 others — and an unclaimed reserved spot is held back on top of
// that. The DB projects this as `open_spots` on games_public/nearby_games; this is the same
// formula for local/mock rows and for anything holding a Game built by hand.
export function spotsLeft(game: Pick<Game, "joinedCount" | "maxPlayers" | "reservedSpots" | "reservedClaimed">): number {
  const heldForFriends = Math.max(0, game.reservedSpots - game.reservedClaimed);
  return Math.max(0, game.maxPlayers - 1 - game.joinedCount - heldForFriends);
}

export type LevelFit = "below" | "match" | "one-above" | "above";

// null means we can't judge fit (viewer has no tier set for this sport, or the row predates
// skill_tier_ordinal) — callers should fall back to showing the plain skill label instead of
// guessing at a verdict.
export function levelFit(viewerOrdinal: number | null | undefined, gameOrdinal: number | null | undefined): LevelFit | null {
  if (viewerOrdinal == null || gameOrdinal == null) return null;
  if (gameOrdinal === viewerOrdinal) return "match";
  if (gameOrdinal === viewerOrdinal + 1) return "one-above";
  if (gameOrdinal > viewerOrdinal) return "above";
  return "below";
}
