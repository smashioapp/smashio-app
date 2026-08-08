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

export const RELIABILITY_EXPLAINER =
  "Reliability tracks how often you show up for games you've joined or approved into. It starts at 100 and drops for no-shows or late cancellations, and recovers slowly the more games you complete without one. It's visible to hosts reviewing join requests.";

export function badgeTone(state: "verified" | "pending" | "cancelled") {
  const map = {
    verified: { bg: "rgba(53,214,166,0.15)", fg: colors.intermediate },
    pending: { bg: "rgba(255,182,72,0.15)", fg: colors.advanced },
    cancelled: { bg: "rgba(255,103,103,0.15)", fg: colors.danger },
  };
  return map[state];
}
