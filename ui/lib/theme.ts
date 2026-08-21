export const colors = {
  base: "#0A0A0B",
  baseAlt: "#08080A",
  surface: "#141416",
  surfaceAlt: "#1F1F24",
  card: "#18181C",
  cardAlt: "#0E0E10",
  cardBorder: "rgba(255,255,255,0.08)",
  accent: "#D6FF3F",
  accentSoft: "#EBFF7A",
  accent2: "#AEE62A",
  accent3: "#9FE020",
  text: "#F5F5F7",
  textDim: "#C7C7CE",
  textSecondary: "#96969E",
  textTertiary: "#7A7A82",
  textMuted: "#5C5C64",
  beginner: "#6FCBFF",
  intermediate: "#35D6A6",
  advanced: "#FFB648",
  pro: "#C08CFF",
  danger: "#FF6767",
};

// v2 layout tokens (docs/v2-design-plan.md §3.1). Screens hand-rolled these numbers before;
// the 2026 redesign frames are drawn on a 24px gutter, not the 20px the app shipped with.
export const LAYOUT = {
  SCREEN_PAD: 24,
  RADIUS: { hero: 26, card: 18, rail: 16, sheet: 28, tile: 16 },
  HAIRLINE: colors.cardBorder,
} as const;

// The one lime-bordered "anchor" treatment (rule 1: one hero per screen). `live` swaps to the
// intermediate green so a game that's already on reads differently from one you can still join.
export const HERO_TONE = {
  accent: { bg: ["#1C1F10", colors.card] as const, border: "rgba(214,255,63,0.4)", fg: colors.accent },
  live: { bg: ["#101C14", colors.card] as const, border: "rgba(53,214,166,0.4)", fg: colors.intermediate },
  urgent: { bg: ["#1F1113", colors.card] as const, border: "rgba(255,103,103,0.4)", fg: colors.danger },
} as const;

export type HeroTone = keyof typeof HERO_TONE;

export const gradients = {
  accent: [colors.accentSoft, colors.accent2] as const,
  accentDiagonal: [colors.accentSoft, colors.accent3] as const,
  card: [colors.card, colors.cardAlt] as const,
};

export type TierId = "Beginner" | "Intermediate" | "Advanced" | "Pro";

export const TIERS: { id: TierId; color: string; desc: string }[] = [
  { id: "Beginner", color: colors.beginner, desc: "New to badminton or casual play" },
  { id: "Intermediate", color: colors.intermediate, desc: "Comfortable rallies, knows the rules" },
  { id: "Advanced", color: colors.advanced, desc: "Strong technique, competitive play" },
  { id: "Pro", color: colors.pro, desc: "Tournament-level / elite players" },
];

export function tierColor(id: string): string {
  return TIERS.find((t) => t.id === id)?.color ?? colors.textSecondary;
}

export function initial(name: string): string {
  return (name || "?").charAt(0).toUpperCase();
}

const AVATAR_PALETTE = [colors.beginner, colors.intermediate, colors.advanced, colors.pro, colors.danger];

// Real profiles have no stored color (that was a mock-data artifact) — derive a stable one
// from the profile id so the same player always renders the same avatar color.
export function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

// Reliability score is a raw 0-100 number (see backend-plan.md's placeholder cron formula) —
// bands it into the copy the UI has always shown.
export function reliabilityLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 50) return "Fair";
  return "Needs work";
}

// Same bands as reliabilityLabel, so the gauge's color always matches its own copy.
export function reliabilityColor(score: number): string {
  if (score >= 90) return colors.intermediate;
  if (score >= 75) return colors.accent;
  if (score >= 50) return colors.advanced;
  return colors.danger;
}

export type PlayerTierId = "Bronze" | "Silver" | "Gold";

export const GAMES_PLAYED_TIERS: { id: PlayerTierId; min: number; color: string }[] = [
  { id: "Gold", min: 25, color: colors.advanced },
  { id: "Silver", min: 10, color: "#C7CDD6" },
  { id: "Bronze", min: 0, color: "#C68A4E" },
];

export function gamesPlayedTier(gamesPlayed: number): { id: PlayerTierId; color: string } {
  const tier = GAMES_PLAYED_TIERS.find((t) => gamesPlayed >= t.min)!;
  return { id: tier.id, color: tier.color };
}

// GAMES_PLAYED_TIERS is ordered highest-min-first, so the tier one index back is the
// next one up. Gold has no next — maxed returns null.
export function nextGamesPlayedTier(gamesPlayed: number): { id: PlayerTierId; color: string; min: number } | null {
  const idx = GAMES_PLAYED_TIERS.findIndex((t) => gamesPlayed >= t.min);
  return idx > 0 ? GAMES_PLAYED_TIERS[idx - 1] : null;
}

// Was TierRing's subtitle line ("N games to Gold · Advanced player"). Moved here when the ring
// was retired for the design's compact avatar+chips header (20260822000000, P4) — kept as a
// general games-tier utility even though nothing calls it today.
export function tierProgressLabel(gamesPlayed: number, skillLabel: string | null): string {
  const next = nextGamesPlayedTier(gamesPlayed);
  const left = next ? `${next.min - gamesPlayed} game${next.min - gamesPlayed === 1 ? "" : "s"} to ${next.id}` : "Top tier";
  return skillLabel ? `${left} · ${skillLabel} player` : left;
}

// Matches the actual nightly formula (recompute_reliability_scores): -5 per late leave
// (approved, then left after the game had already started), floored at 0, recalculated every
// night — it's not a slow climb, a clean night resets you straight back to 100. Keep this copy
// and the SQL formula in sync; profile-plan.md P2 flagged them as disagreeing before this fix.
export const RELIABILITY_EXPLAINER =
  "Reliability starts at 100 and drops 5 points for each game you leave after it's already started. Recalculated nightly — a clean run of games with no late leaves puts you straight back to 100. It's visible to hosts reviewing join requests.";

// The gauge's "ledger" line (profile-plan.md P2: replace the mystery number with the actual
// count driving it) — e.g. "100 · no late cancellations in 14 games".
export function reliabilityLedgerLabel(lateLeaveCount: number, gamesPlayed: number): string {
  if (gamesPlayed === 0) return "No games completed yet";
  if (lateLeaveCount === 0) return `No late cancellations in ${gamesPlayed} game${gamesPlayed === 1 ? "" : "s"}`;
  return `${lateLeaveCount} late cancellation${lateLeaveCount === 1 ? "" : "s"} in ${gamesPlayed} game${gamesPlayed === 1 ? "" : "s"}`;
}

export function badgeTone(state: "verified" | "pending" | "cancelled") {
  const map = {
    verified: { bg: "rgba(53,214,166,0.15)", fg: colors.intermediate },
    pending: { bg: "rgba(255,182,72,0.15)", fg: colors.advanced },
    cancelled: { bg: "rgba(255,103,103,0.15)", fg: colors.danger },
  };
  return map[state];
}

// Venue confidence system (design/23bc2cae): three fixed signal colors so trust reads at a
// glance everywhere it appears — badges, amenity rows, pricing rows, map pins, cards. Reuses
// the existing skill-tier hues (they already match the design's hex values exactly) rather than
// introducing a parallel palette.
export const CONFIDENCE_TONE = {
  verified: { bg: "rgba(53,214,166,0.13)", fg: colors.intermediate, icon: "checkmark-circle" as const, label: "Verified" },
  community: { bg: "rgba(111,203,255,0.13)", fg: colors.beginner, icon: "people-circle-outline" as const, label: "Community" },
  stale: { bg: "rgba(255,182,72,0.13)", fg: colors.advanced, icon: "time-outline" as const, label: "May be out of date" },
  none: { bg: colors.surfaceAlt, fg: colors.textMuted, icon: "help-circle-outline" as const, label: "Unconfirmed" },
} as const;

export const RESTRICTED_TONE = { bg: colors.surfaceAlt, fg: colors.textDim };
