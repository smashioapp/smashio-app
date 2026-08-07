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

export function badgeTone(state: "verified" | "pending" | "cancelled") {
  const map = {
    verified: { bg: "rgba(53,214,166,0.15)", fg: colors.intermediate },
    pending: { bg: "rgba(255,182,72,0.15)", fg: colors.advanced },
    cancelled: { bg: "rgba(255,103,103,0.15)", fg: colors.danger },
  };
  return map[state];
}
