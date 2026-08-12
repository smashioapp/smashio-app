import { useEffect } from "react";
import { Text } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { colors } from "../lib/theme";

// Shrinks once the list has scrolled a little — a sticky header that stays full-size forever
// eats space the cards should have (Discover D6, My Games M1).
export function DayHeader({ label, compact }: { label: string; compact: boolean }) {
  const progress = useSharedValue(compact ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(compact ? 1 : 0, { duration: 180 });
  }, [compact]);
  const style = useAnimatedStyle(() => ({
    paddingTop: 12 - progress.value * 6,
    paddingBottom: 6 - progress.value * 2,
    transform: [{ scale: 1 - progress.value * 0.12 }],
  }));

  return (
    <Animated.View className="px-5" style={[{ backgroundColor: colors.base }, style]}>
      <Text className="font-display-bold text-[14px]" style={{ color: colors.textSecondary }}>
        {label}
      </Text>
    </Animated.View>
  );
}
