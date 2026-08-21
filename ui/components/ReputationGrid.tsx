import { ReactNode } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, reliabilityLabel, reliabilityColor, tierColor } from "../lib/theme";
import { BehaviourBadges } from "./BehaviourBadges";
import type { TierId } from "../lib/theme";

function Signal({
  label,
  labelColor,
  children,
  onPress,
  style: styleOverride,
}: {
  label: string;
  labelColor?: string;
  children: ReactNode;
  onPress?: () => void;
  style?: { backgroundColor?: string; borderColor?: string };
}) {
  const style = { backgroundColor: colors.card, borderColor: colors.cardBorder, width: "48.5%" as const, ...styleOverride };
  const inner = (
    <>
      <Text className="font-body-extrabold text-[10.5px] uppercase tracking-wide" style={{ color: labelColor ?? colors.textTertiary }}>
        {label}
      </Text>
      <View className="mt-1">{children}</View>
    </>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} className="rounded-2xl border px-3.5 py-3" style={style}>
        {inner}
      </Pressable>
    );
  }
  return (
    <View className="rounded-2xl border px-3.5 py-3" style={style}>
      {inner}
    </View>
  );
}

// The four reputation signals — reliability, rating, peer-perceived tier, behaviour badges —
// are computed differently and answer different questions, so they render as four separate
// cards, never merged into one score (design/23bc2cae "reputation block").
export function ReputationGrid({
  reliabilityScore,
  reliabilityCoaching,
  ratingAvg,
  ratingCount,
  showRating,
  peerTier,
  peerVoteCount,
  badgeCounts,
  onReliabilityPress,
}: {
  reliabilityScore: number | null;
  // Owner-only. Pass the ledger line (e.g. "2 late cancellations in your last 10 games") when
  // the viewer's own band is Fair or Needs work — this state is coaching, never a penalty
  // screen, so it always renders amber and never colors.danger (design brief hard constraint:
  // "how we render bad news without shaming someone into churning").
  reliabilityCoaching?: string | null;
  ratingAvg: number | null;
  ratingCount: number | null;
  showRating: boolean;
  peerTier: TierId | null;
  peerVoteCount: number;
  badgeCounts: Record<string, number>;
  onReliabilityPress?: () => void;
}) {
  const coaching = reliabilityScore != null && reliabilityScore < 75 && !!reliabilityCoaching;
  const relColor = reliabilityScore == null ? colors.textMuted : coaching ? colors.advanced : reliabilityColor(reliabilityScore);
  return (
    <View className="flex-row flex-wrap justify-between" style={{ gap: 8 }}>
      <Signal
        label="Reliability"
        labelColor={relColor}
        onPress={onReliabilityPress}
        style={coaching ? { backgroundColor: "rgba(255,182,72,0.06)", borderColor: "rgba(255,182,72,0.3)" } : undefined}
      >
        {reliabilityScore == null ? (
          <Text className="text-[13px] font-body-bold mt-1" style={{ color: colors.textMuted }}>
            —
          </Text>
        ) : (
          <>
            <View className="flex-row items-baseline gap-1.5">
              <Text className="font-display-bold text-[22px]" style={{ color: relColor }}>
                {reliabilityScore}
              </Text>
              <Text className="text-[11px] font-body-semibold" style={{ color: colors.textSecondary }}>
                {reliabilityLabel(reliabilityScore)}
              </Text>
            </View>
            {coaching && (
              <>
                <Text className="text-[10.5px] mt-1 leading-3.5" style={{ color: colors.textDim }} numberOfLines={2}>
                  {reliabilityCoaching}
                </Text>
                {onReliabilityPress && (
                  <Text className="text-[10.5px] font-body-bold mt-1" style={{ color: colors.advanced }}>
                    How reliability recovers ›
                  </Text>
                )}
              </>
            )}
          </>
        )}
      </Signal>

      <Signal label="Rating">
        {showRating && !!ratingCount && ratingCount > 0 ? (
          <View className="flex-row items-baseline gap-1.5">
            <Ionicons name="star" size={14} color={colors.advanced} style={{ marginBottom: -1 }} />
            <Text className="font-display-bold text-[22px]" style={{ color: colors.text }}>
              {ratingAvg?.toFixed(1)}
            </Text>
            <Text className="text-[11px] font-body-semibold" style={{ color: colors.textSecondary }}>
              · {ratingCount}
            </Text>
          </View>
        ) : (
          <Text className="text-[13px] font-body-bold mt-1" style={{ color: colors.textMuted }}>
            New player
          </Text>
        )}
      </Signal>

      <Signal label="Peer tier">
        {peerTier ? (
          <>
            <Text className="text-[14px] font-body-extrabold mt-1" style={{ color: tierColor(peerTier) }}>
              {peerTier}
            </Text>
            <Text className="text-[10px] mt-0.5" style={{ color: colors.textTertiary }}>
              {peerVoteCount} co-player{peerVoteCount === 1 ? "" : "s"}
            </Text>
          </>
        ) : (
          <Text className="text-[13px] font-body-bold mt-1" style={{ color: colors.textMuted }}>
            —
          </Text>
        )}
      </Signal>

      <Signal label="Badges">
        {Object.keys(badgeCounts).length > 0 ? (
          <View className="mt-1">
            <BehaviourBadges counts={badgeCounts} />
          </View>
        ) : (
          <Text className="text-[13px] font-body-bold mt-1" style={{ color: colors.textMuted }}>
            0 of 4
          </Text>
        )}
      </Signal>
    </View>
  );
}
