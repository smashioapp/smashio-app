import type { Ionicons } from "@expo/vector-icons";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export type Achievement = { id: string; label: string; icon: IconName };

// Reuses TierBadge's ring-toward-next mechanic (profile-plan.md P3) — every achievement here
// is earned by playing, never purchased, per the plan's "no paid badges" rule (§7).
//
// Unlock logic lives server-side now (social-plan.md B0.5, achievement_awards +
// recompute_achievements) — this array is labels and icons only. ids must match the
// achievement_id values recompute_achievements writes.
export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_game", label: "First game", icon: "flag-outline" },
  { id: "first_hosted", label: "First hosted", icon: "key-outline" },
  { id: "played_10", label: "10 games played", icon: "trophy-outline" },
  { id: "played_25", label: "25 games played", icon: "trophy-outline" },
  { id: "played_50", label: "50 games played", icon: "trophy-outline" },
  { id: "streak_4", label: "4-week streak", icon: "flame-outline" },
  { id: "venues_5", label: "5 different venues", icon: "location-outline" },
  { id: "five_star", label: "First 5-star", icon: "star-outline" },
];
