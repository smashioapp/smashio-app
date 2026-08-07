import { TierId, colors } from "./theme";

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
};

export const GAMES: Game[] = [
  {
    id: "g1",
    organizerId: "",
    venue: "Melbourne Sports Centre",
    suburb: "Albert Park VIC",
    courts: "Courts 3–4",
    date: "Sat, 8 Aug",
    time: "7:00–9:00 PM",
    skill: "Intermediate",
    maxPlayers: 8,
    joined: [
      { name: "Jack", color: colors.beginner },
      { name: "Ava", color: colors.advanced },
      { name: "Liam", color: colors.pro },
    ],
    joinedCount: 3,
    cost: 64,
    verified: true,
    distance: "2.1 km",
  },
  {
    id: "g2",
    organizerId: "",
    venue: "Bounce Badminton",
    suburb: "Richmond VIC",
    courts: "Court 1",
    date: "Sun, 9 Aug",
    time: "6:00–8:00 PM",
    skill: "Advanced",
    maxPlayers: 4,
    joined: [
      { name: "Noah", color: colors.intermediate },
      { name: "Chloe", color: colors.beginner },
    ],
    joinedCount: 2,
    cost: 72,
    verified: true,
    distance: "3.4 km",
  },
  {
    id: "g3",
    organizerId: "",
    venue: "Victorian Badminton Centre",
    suburb: "Boronia VIC",
    courts: "Courts 5–6",
    date: "Sun, 9 Aug",
    time: "10:00 AM–12:00 PM",
    skill: "Beginner",
    maxPlayers: 10,
    joined: [{ name: "Mia", color: colors.pro }],
    joinedCount: 1,
    cost: 60,
    verified: false,
    distance: "8.7 km",
  },
  {
    id: "g4",
    organizerId: "",
    venue: "Preston Sports Hub",
    suburb: "Preston VIC",
    courts: "Court 2",
    date: "Mon, 10 Aug",
    time: "7:30–9:30 PM",
    skill: "Pro",
    maxPlayers: 4,
    joined: [
      { name: "Ryan", color: colors.danger },
      { name: "Zoe", color: colors.intermediate },
      { name: "Ethan", color: colors.beginner },
    ],
    joinedCount: 3,
    cost: 88,
    verified: true,
    distance: "5.5 km",
  },
];

export type PastPlayer = { id: string; name: string; color: string };
export type PastGame = { id: string; venue: string; date: string; time: string; players: PastPlayer[] };

export type ChatMessage = { from: string; me: boolean; color?: string; text: string; time: string };

export const CHAT_SEED: Record<string, ChatMessage[]> = {
  g1: [
    { from: "Jack", me: false, color: colors.beginner, text: "Keen for Saturday, court 3 right?", time: "6:12 PM" },
    { from: "You", me: true, text: "Yep confirmed, see you all there.", time: "6:14 PM" },
    { from: "Ava", me: false, color: colors.advanced, text: "Bringing a spare racquet if anyone needs one.", time: "6:20 PM" },
  ],
  g2: [
    { from: "Noah", me: false, color: colors.intermediate, text: "Running 5 min late, save my spot!", time: "5:40 PM" },
    { from: "You", me: true, text: "All good, we'll warm up without you.", time: "5:41 PM" },
  ],
};

export function perPlayerCost(cost: number, maxPlayers: number): number {
  return Math.round(cost / maxPlayers);
}
