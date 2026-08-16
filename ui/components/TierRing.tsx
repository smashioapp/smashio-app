import { useEffect } from "react";
import { View, Text, Image, Pressable } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { colors, avatarColor, gamesPlayedTier, initial, nextGamesPlayedTier } from "../lib/theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SIZE = 132;
const STROKE = 8;
const R = (SIZE - STROKE) / 2 - 4;
const CIRCUMFERENCE = 2 * Math.PI * R;

function tierMin(id: "Bronze" | "Silver" | "Gold"): number {
  return id === "Gold" ? 25 : id === "Silver" ? 10 : 0;
}

// Profile's anchor (docs/v2-design-plan.md §4.6). The old profile opened with a stats card, a
// tier pill and a reliability gauge all competing; v2 gives the screen one big thing and drops
// everything else to a row. The ring is progress toward the next games-played tier — a target
// you can see, which is the same reason TierBadge traced one around its pill.
export function TierRing({
  profileId,
  name,
  photoUri,
  gamesPlayed,
  subtitle,
  onPress,
}: {
  profileId: string;
  name: string;
  photoUri?: string | null;
  gamesPlayed: number;
  subtitle: string;
  onPress?: () => void;
}) {
  const tier = gamesPlayedTier(gamesPlayed);
  const next = nextGamesPlayedTier(gamesPlayed);
  const currentMin = tierMin(tier.id);
  const span = next ? next.min - currentMin : 1;
  const fraction = next ? Math.min(1, Math.max(0, (gamesPlayed - currentMin) / span)) : 1;

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(220, withTiming(fraction, { duration: 800, easing: Easing.out(Easing.cubic) }));
  }, [fraction]);

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progress.value),
  }));

  const avatar = (
    <View style={{ width: SIZE, height: SIZE }}>
      <Svg width={SIZE} height={SIZE} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke={colors.surfaceAlt} strokeWidth={STROKE} />
        <AnimatedCircle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={colors.accent}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          animatedProps={ringProps}
        />
      </Svg>
      <View
        className="absolute items-center justify-center overflow-hidden"
        style={{
          top: 14,
          left: 14,
          right: 14,
          bottom: 14,
          borderRadius: (SIZE - 28) / 2,
          backgroundColor: avatarColor(profileId),
        }}
      >
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={{ width: SIZE - 28, height: SIZE - 28 }} />
        ) : (
          <Text style={{ color: colors.base, fontSize: 34, fontWeight: "800" }}>{initial(name)}</Text>
        )}
      </View>
      <View
        className="absolute rounded-pill"
        style={{
          bottom: -4,
          right: -4,
          backgroundColor: tier.color,
          paddingHorizontal: 9,
          paddingVertical: 4,
          borderWidth: 3,
          borderColor: colors.base,
        }}
      >
        <Text className="font-body-extrabold text-[10.5px] uppercase" style={{ color: colors.base, letterSpacing: 0.4 }}>
          {tier.id}
        </Text>
      </View>
    </View>
  );

  return (
    <View className="items-center">
      {onPress ? (
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Edit profile">
          {avatar}
        </Pressable>
      ) : (
        avatar
      )}
      <Text className="font-display-bold text-[22px] mt-3.5" style={{ color: colors.text }} numberOfLines={1}>
        {name}
      </Text>
      <Text className="text-[12px] mt-0.5" style={{ color: colors.textSecondary }}>
        {subtitle}
      </Text>
    </View>
  );
}

// "74% to Platinum · Advanced player" in the design. Our tiers are Bronze/Silver/Gold, so this
// states the real remaining count rather than a percentage of an invented tier.
export function tierProgressLabel(gamesPlayed: number, skillLabel: string | null): string {
  const next = nextGamesPlayedTier(gamesPlayed);
  const left = next ? `${next.min - gamesPlayed} game${next.min - gamesPlayed === 1 ? "" : "s"} to ${next.id}` : "Top tier";
  return skillLabel ? `${left} · ${skillLabel} player` : left;
}
