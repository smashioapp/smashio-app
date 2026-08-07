import { TierId, colors } from "./theme";

export type Venue = {
  id: string;
  name: string;
  suburb: string;
  courts: string;
};

export const VENUES: Venue[] = [
  { id: "v1", name: "Melbourne Sports Centre", suburb: "Albert Park VIC", courts: "Courts 1–8" },
  { id: "v2", name: "Bounce Badminton", suburb: "Richmond VIC", courts: "Courts 1–4" },
  { id: "v3", name: "Victorian Badminton Centre", suburb: "Boronia VIC", courts: "Courts 1–10" },
  { id: "v4", name: "Preston Sports Hub", suburb: "Preston VIC", courts: "Courts 1–6" },
];

export const DATES = ["Today", "Tomorrow", "Sat 8 Aug", "Sun 9 Aug"];
export const TIMES = ["6:00 PM", "7:00 PM", "7:30 PM", "8:00 PM", "9:00 AM", "10:00 AM"];

export type Player = { name: string; color: string };

export type Game = {
  id: string;
  venue: string;
  suburb: string;
  courts: string;
  date: string;
  time: string;
  skill: TierId;
  maxPlayers: number;
  joined: Player[];
  cost: number;
  verified: boolean;
  distance: string;
};

export const GAMES: Game[] = [
  {
    id: "g1",
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
    cost: 64,
    verified: true,
    distance: "2.1 km",
  },
  {
    id: "g2",
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
    cost: 72,
    verified: true,
    distance: "3.4 km",
  },
  {
    id: "g3",
    venue: "Victorian Badminton Centre",
    suburb: "Boronia VIC",
    courts: "Courts 5–6",
    date: "Sun, 9 Aug",
    time: "10:00 AM–12:00 PM",
    skill: "Beginner",
    maxPlayers: 10,
    joined: [{ name: "Mia", color: colors.pro }],
    cost: 60,
    verified: false,
    distance: "8.7 km",
  },
  {
    id: "g4",
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
    cost: 88,
    verified: true,
    distance: "5.5 km",
  },
];

export type HostingGame = {
  id: string;
  venue: string;
  date: string;
  time: string;
  verified: boolean;
};

export const HOSTING: HostingGame[] = [
  { id: "g3", venue: "Victorian Badminton Centre", date: "Sun, 9 Aug", time: "10:00 AM–12:00 PM", verified: false },
];

export type PastPlayer = { id: string; name: string; color: string };
export type PastGame = { id: string; venue: string; date: string; time: string; players: PastPlayer[] };

export const PAST: PastGame[] = [
  {
    id: "g5",
    venue: "Sydney Olympic Park Badminton Courts",
    date: "Tue, 4 Aug",
    time: "7:00–9:00 PM",
    players: [
      { id: "p1", name: "Jack", color: colors.beginner },
      { id: "p2", name: "Ava", color: colors.advanced },
      { id: "p3", name: "Liam", color: colors.pro },
    ],
  },
];

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

export function findGame(id: string): Game | HostingGame | undefined {
  return GAMES.find((g) => g.id === id) ?? HOSTING.find((g) => g.id === id);
}

export function findPast(id: string): PastGame | undefined {
  return PAST.find((g) => g.id === id);
}

export function perPlayerCost(cost: number, maxPlayers: number): number {
  return Math.round(cost / maxPlayers);
}
