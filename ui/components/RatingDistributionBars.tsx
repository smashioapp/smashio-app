import { useEffect } from "react";
import { View } from "react-native";
import Animated, { useSharedValue, withDelay, withTiming, useAnimatedStyle, Easing } from "react-native-reanimated";
import { colors } from "../lib/theme";

function Bar({ fraction, delay }: { fraction: number; delay: number }) {
  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withDelay(delay, withTiming(fraction, { duration: 600, easing: Easing.out(Easing.cubic) }));
  }, [fraction]);
  const style = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));
  return (
    <View className="flex-1 h-[6px] rounded-pill overflow-hidden" style={{ backgroundColor: colors.surfaceAlt }}>
      <Animated.View style={[{ height: "100%", borderRadius: 999, backgroundColor: colors.accent }, style]} />
    </View>
  );
}

// Star distribution bars (profile-plan.md P2) — animates on mount per P6.
export function RatingDistributionBars({ distribution }: { distribution: Record<1 | 2 | 3 | 4 | 5, number> }) {
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  return (
    <View className="gap-1.5">
      {([5, 4, 3, 2, 1] as const).map((star, i) => (
        <View key={star} className="flex-row items-center gap-2">
          <Animated.Text style={{ color: colors.textTertiary, fontSize: 11.5, width: 10 }}>{star}</Animated.Text>
          <Bar fraction={total > 0 ? distribution[star] / total : 0} delay={i * 60} />
          <Animated.Text style={{ color: colors.textMuted, fontSize: 11, width: 20, textAlign: "right" }}>
            {distribution[star]}
          </Animated.Text>
        </View>
      ))}
    </View>
  );
}
