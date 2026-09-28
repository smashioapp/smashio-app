import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../lib/theme";
import { needsLabel } from "../lib/trust";
import type { FillStatus } from "../lib/queries/games";

// fill-the-spot P3.1 / P3.2 (F12, F13). What a host sees while a spot is open: numbers that make
// waiting feel like progress, and one share action instead of four. Counts only, never names.

export function fillDuration(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 90) return `${mins} min`;
  const hours = Math.round(mins / 6) / 10;
  if (hours < 36) return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
  return `${Math.round(hours / 24)} days`;
}

function Stat({ value, label, tone }: { value: string; label: string; tone: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className="w-2 h-2 rounded-full" style={{ backgroundColor: tone }} />
      <Text className="text-[12.5px]" style={{ color: colors.textSecondary }}>
        <Text className="font-body-bold" style={{ color: colors.text }}>{value}</Text> {label}
      </Text>
    </View>
  );
}

export function FillTracker({
  fill,
  open,
  inCount,
  maxPlayers,
  whenText,
  onShare,
  onPingWider,
  pingPending,
  onInvite,
}: {
  fill: FillStatus | null | undefined;
  open: number;
  inCount: number;
  maxPlayers: number;
  whenText: string;
  onShare: () => void;
  /** Undefined when a wider ping isn't on offer (outside the 36h window, link-only, and so on). */
  onPingWider?: () => void;
  pingPending?: boolean;
  onInvite: () => void;
}) {
  if (open === 0) {
    return (
      <View className="rounded-2xl p-4 border" style={{ borderColor: "rgba(53,214,166,0.35)", backgroundColor: "rgba(53,214,166,0.08)" }}>
        <View className="flex-row items-center gap-2">
          <Ionicons name="checkmark-circle" size={18} color={colors.intermediate} />
          <Text className="font-body-bold text-[15px]" style={{ color: colors.intermediate }}>
            {fill?.filledSeconds != null ? `Filled in ${fillDuration(fill.filledSeconds)}` : "Full, game on"}
          </Text>
        </View>
        <Text className="text-[12.5px] mt-1" style={{ color: colors.textSecondary }}>
          {inCount} of {maxPlayers} in. Nice one.
        </Text>
      </View>
    );
  }

  return (
    <View>
      <View className="rounded-2xl p-4 border" style={{ borderColor: "rgba(214,255,63,0.25)", backgroundColor: colors.card }}>
        <Text className="font-body-bold text-[15px]" style={{ color: colors.accent3 }}>
          {needsLabel(open)} · {whenText}
        </Text>
        <Text className="text-[12.5px] mt-1" style={{ color: colors.textSecondary }}>
          {inCount} of {maxPlayers} in
        </Text>
        <View className="flex-row flex-wrap gap-x-4 gap-y-1.5 mt-3">
          <Stat
            value={fill && fill.pinged > 0 ? String(fill.pinged) : "No"}
            label={fill && fill.pinged > 0 ? "pinged nearby" : "pings yet"}
            tone={colors.accent}
          />
          <Stat value={String(fill?.viewed ?? 0)} label="had a look" tone={colors.advanced} />
          <Stat value={String(fill?.keen ?? 0)} label="keen" tone={colors.intermediate} />
        </View>
      </View>
      <View className="flex-row flex-wrap items-center gap-2 mt-2.5">
        <Pressable
          testID="fill-share"
          onPress={onShare}
          className="flex-row items-center gap-1.5 rounded-pill px-4 py-2.5"
          style={{ backgroundColor: colors.accent }}
        >
          <Ionicons name="share-outline" size={14} color={colors.base} />
          <Text className="font-body-extrabold text-[13px]" style={{ color: colors.base }}>Share to group chat</Text>
        </Pressable>
        {onPingWider && (
          <Pressable
            testID="fill-ping-wider"
            onPress={onPingWider}
            disabled={pingPending}
            className="flex-row items-center gap-1.5 rounded-pill px-3.5 py-2.5 border"
            style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder, opacity: pingPending ? 0.5 : 1 }}
          >
            <Ionicons name="flash-outline" size={13} color={colors.textSecondary} />
            <Text className="font-body-bold text-[12.5px]" style={{ color: colors.textSecondary }}>Ping wider (15 km)</Text>
          </Pressable>
        )}
      </View>
      <Pressable onPress={onInvite} className="flex-row items-center gap-1.5 mt-3 self-start">
        <Ionicons name="people-outline" size={13} color={colors.textTertiary} />
        <Text className="font-body-bold text-[12px]" style={{ color: colors.textTertiary }}>More ways to fill: invite from your last game</Text>
      </Pressable>
    </View>
  );
}
