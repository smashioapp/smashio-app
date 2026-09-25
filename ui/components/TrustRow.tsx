import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, reliabilityColor } from "../lib/theme";
import { haptics } from "../lib/haptics";
import { courtBookedLabel, type LevelLine } from "../lib/trust";

// The one component the short-a-player trust signals render through (docs/short-a-player-plan.md
// §2). Court booked, level voted, host turns up: three questions that decide a join with
// strangers. Absent signals are omitted, never shown as a negative, so a game with no booking
// and a new host renders nothing at all, which is the normal case, not a warning.
//
//  compact: one line for list rows, map cards and the featured card.
//  full:    stacked rows with a one-line explainer each, tappable to the existing sheets.

type Props = {
  courtStatus?: "none" | "pending" | "verified" | null;
  /** Already gated by turnsUpPercent: null means don't say anything. */
  hostTurnsUp?: number | null;
  /** Host's level, only when earned (voted by enough people). */
  hostLevel?: LevelLine | null;
};

export function TrustRow({
  variant = "compact",
  courtStatus,
  hostTurnsUp,
  hostLevel,
  onCourtPress,
  onLevelPress,
  onHostPress,
}: Props & {
  variant?: "compact" | "full";
  onCourtPress?: () => void;
  onLevelPress?: () => void;
  onHostPress?: () => void;
}) {
  const court = courtBookedLabel(courtStatus);
  const level = hostLevel?.earned ? hostLevel : null;
  if (!court && hostTurnsUp == null && !level) return null;

  if (variant === "compact") return <TrustCompact courtStatus={courtStatus} hostTurnsUp={hostTurnsUp} />;

  return (
    <View className="rounded-2xl border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder, paddingVertical: 4 }}>
      {court && (
        <TrustLine
          icon={courtStatus === "verified" ? "checkmark-circle" : "time-outline"}
          color={courtStatus === "verified" ? colors.intermediate : colors.advanced}
          title={court}
          explainer={courtStatus === "verified" ? "The host uploaded their booking and it checked out." : "The host uploaded a booking, we're checking it now."}
          onPress={onCourtPress}
        />
      )}
      {level && (
        <TrustLine
          icon="people-outline"
          color={colors.textDim}
          title={`Host plays ${level.text}`}
          explainer="Voted by people who've played with them, not picked by the host."
          onPress={onLevelPress}
        />
      )}
      {hostTurnsUp != null && (
        <TrustLine
          icon="checkmark-done-outline"
          color={reliabilityColor(hostTurnsUp)}
          title={`Host turns up ${hostTurnsUp}%`}
          explainer="From the games they've played and hosted here."
          onPress={onHostPress}
        />
      )}
    </View>
  );
}

// Plain text, so it drops into a subtitle line without changing a row's height.
export function TrustCompact({ courtStatus, hostTurnsUp }: Pick<Props, "courtStatus" | "hostTurnsUp">) {
  const booked = courtStatus === "verified";
  if (!booked && hostTurnsUp == null) return null;
  return (
    <Text numberOfLines={1} className="text-[11.5px]" style={{ color: colors.textSecondary }}>
      {booked && (
        <Text className="font-body-bold" style={{ color: colors.intermediate }}>
          ✓ Court booked
        </Text>
      )}
      {booked && hostTurnsUp != null ? " · " : ""}
      {hostTurnsUp != null ? `Host turns up ${hostTurnsUp}%` : ""}
    </Text>
  );
}

function TrustLine({
  icon,
  color,
  title,
  explainer,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  explainer: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={() => {
        haptics.tap();
        onPress?.();
      }}
      className="flex-row items-center gap-3 px-4 py-2.5"
    >
      <Ionicons name={icon} size={18} color={color} />
      <View className="flex-1 min-w-0">
        <Text numberOfLines={1} className="font-body-bold text-[13.5px]" style={{ color: colors.text }}>
          {title}
        </Text>
        <Text numberOfLines={2} className="text-[12px] mt-0.5" style={{ color: colors.textSecondary }}>
          {explainer}
        </Text>
      </View>
      {!!onPress && <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />}
    </Pressable>
  );
}
