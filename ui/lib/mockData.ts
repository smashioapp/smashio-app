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
  status: GameStatus;
  skill: TierId;
  skillTierId: string;
  maxPlayers: number;
  // Named roster — only populated where the viewer is allowed to see it (organizer/approved
  // member); everyone else sees `joinedCount` only. See useGameRoster's RLS-driven privacy.
  joined: Player[];
  joinedCount: number;
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

export type PastPlayer = { id: string; name: string; color: string };
export type PastGame = { id: string; venue: string; date: string; time: string; players: PastPlayer[] };

export function perPlayerCost(cost: number, maxPlayers: number): number {
  return Math.round(cost / maxPlayers);
}

export function spotsLeft(game: Pick<Game, "joinedCount" | "maxPlayers">): number {
  return Math.max(0, game.maxPlayers - game.joinedCount);
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
