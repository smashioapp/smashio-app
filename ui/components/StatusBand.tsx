import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../lib/theme";
import { formatDate, formatTimeRange, formatDistance } from "../lib/format";

// Game detail redesign (docs/design-brief.md Prompt 7, artboard 01/10/11): one line that changes
// with lifecycle mode, colour carries the mode, and it never reorders the page around it. Modes
// mirror the mockup exactly except "imminent", which drops the mockup's multi-modal transit ETA
// ("22 min by bus") — there's no directions/ETA API in this codebase, only straight-line distance.
export type GameMode = "upcoming" | "imminent" | "live" | "done" | "cancelled";

export function gameMode(game: { status: string; startsAt: string; endsAt: string }): GameMode {
  if (game.status === "cancelled") return "cancelled";
  const now = Date.now();
  const starts = new Date(game.startsAt).getTime();
  const ends = new Date(game.endsAt).getTime();
  if (game.status === "completed" || now >= ends) return "done";
  if (now >= starts) return "live";
  if (starts - now <= 90 * 60_000) return "imminent";
  return "upcoming";
}

const DAY_MS = 24 * 60 * 60 * 1000;

function upcomingText(startsAt: string, endsAt: string): string {
  const days = Math.max(1, Math.ceil((new Date(startsAt).getTime() - Date.now()) / DAY_MS));
  return `Starts in ${days} ${days === 1 ? "day" : "days"} · ${formatDate(startsAt)}, ${formatTimeRange(startsAt, endsAt).split("–")[0]}`;
}

function tone(mode: GameMode): { bg: string; fg: string } {
  switch (mode) {
    case "imminent":
      return { bg: "rgba(255,182,72,0.12)", fg: colors.advanced };
    case "live":
      return { bg: "rgba(53,214,166,0.12)", fg: colors.intermediate };
    case "done":
      return { bg: colors.surfaceAlt, fg: colors.textTertiary };
    case "cancelled":
      return { bg: "rgba(255,103,103,0.12)", fg: colors.danger };
    default:
      return { bg: colors.surface, fg: colors.textSecondary };
  }
}

export function StatusBand({
  mode,
  startsAt,
  endsAt,
  courts,
  distanceM,
  cancelledAt,
  doneAt,
}: {
  mode: GameMode;
  startsAt: string;
  endsAt: string;
  courts: string;
  distanceM?: number | null;
  cancelledAt?: string | null;
  doneAt?: string | null;
}) {
  const { bg, fg } = tone(mode);
  let icon: keyof typeof Ionicons.glyphMap = "calendar-outline";
  let text = upcomingText(startsAt, endsAt);

  if (mode === "imminent") {
    icon = "time-outline";
    const mins = Math.max(0, Math.round((new Date(startsAt).getTime() - Date.now()) / 60000));
    const away = distanceM != null ? `, about ${formatDistance(distanceM)} away` : "";
    text = `Starts in ${mins} min${away}`;
  } else if (mode === "live") {
    icon = "checkmark-outline";
    text = `On now${courts ? `, ${courts}` : ""} · ends ${formatTimeRange(startsAt, endsAt).split("–")[1]}`;
  } else if (mode === "done") {
    icon = "checkmark-outline";
    text = doneAt ? `Wrapped up ${formatDate(doneAt)}` : "Wrapped up";
  } else if (mode === "cancelled") {
    icon = "close-outline";
    text = cancelledAt ? `Cancelled by the host, ${formatDate(cancelledAt)}` : "Cancelled by the host";
  }

  return (
    <View className="flex-row items-center gap-2 rounded-2xl px-3.5 py-3" style={{ backgroundColor: bg }}>
      {mode === "live" ? (
        <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: fg }} />
      ) : (
        <Ionicons name={icon} size={15} color={fg} />
      )}
      <Text className="flex-1 font-body-bold text-[12.5px]" style={{ color: fg }}>
        {text}
      </Text>
    </View>
  );
}
