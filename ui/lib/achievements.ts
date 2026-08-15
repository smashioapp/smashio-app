import type { Ionicons } from "@expo/vector-icons";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export type AchievementContext = {
  gamesPlayed: number;
  gamesHosted: number;
  weekStreak: number;
  distinctVenueCount: number;
  hasFiveStarRating: boolean;
};

export type Achievement = { id: string; label: string; icon: IconName; check: (ctx: AchievementContext) => boolean };

// Reuses TierBadge's ring-toward-next mechanic (profile-plan.md P3) — every achievement here
// is earned by playing, never purchased, per the plan's "no paid badges" rule (§7).
export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_game", label: "First game", icon: "flag-outline", check: (c) => c.gamesPlayed >= 1 },
  { id: "first_hosted", label: "First hosted", icon: "key-outline", check: (c) => c.gamesHosted >= 1 },
  { id: "played_10", label: "10 games played", icon: "trophy-outline", check: (c) => c.gamesPlayed >= 10 },
  { id: "played_25", label: "25 games played", icon: "trophy-outline", check: (c) => c.gamesPlayed >= 25 },
  { id: "played_50", label: "50 games played", icon: "trophy-outline", check: (c) => c.gamesPlayed >= 50 },
  { id: "streak_4", label: "4-week streak", icon: "flame-outline", check: (c) => c.weekStreak >= 4 },
  { id: "venues_5", label: "5 different venues", icon: "location-outline", check: (c) => c.distinctVenueCount >= 5 },
  { id: "five_star", label: "First 5-star", icon: "star-outline", check: (c) => c.hasFiveStarRating },
];
