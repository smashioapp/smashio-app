import { TierId } from "./theme";

export type Player = { name: string; color: string };

export type Game = {
  id: string;
  organizerId: string;
  venue: string;
  suburb: string;
  courts: string;
  date: string;
  time: string;
  skill: TierId;
  maxPlayers: number;
  // Named roster — only populated where the viewer is allowed to see it (organizer/approved
  // member); everyone else sees `joinedCount` only. See useGameRoster's RLS-driven privacy.
  joined: Player[];
  joinedCount: number;
  cost: number;
  verified: boolean;
  distance: string;
  venueAddress: string | null;
  venueLat: number | null;
  venueLng: number | null;
};

export type PastPlayer = { id: string; name: string; color: string };
export type PastGame = { id: string; venue: string; date: string; time: string; players: PastPlayer[] };

export function perPlayerCost(cost: number, maxPlayers: number): number {
  return Math.round(cost / maxPlayers);
}
