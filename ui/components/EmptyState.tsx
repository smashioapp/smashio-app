import { useEffect } from "react";
import { View, Text } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { colors } from "../lib/theme";
import { Button } from "./Button";

const LOGO = require("../assets/splash-icon.png");

// Gentle idle float — never distracting, just enough to feel alive instead of static.
function FloatingShuttlecock({ size = 84 }: { size?: number }) {
  const translateY = useSharedValue(0);
  const rotate = useSharedValue(-6);

  useEffect(() => {
    translateY.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
    rotate.value = withRepeat(
      withSequence(
        withTiming(6, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        withTiming(-6, { duration: 1800, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { rotate: `${rotate.value}deg` }],
  }));

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View
        className="absolute rounded-full"
        style={{ width: size * 1.5, height: size * 1.5, backgroundColor: colors.accent, opacity: 0.08 }}
      />
      <Animated.Image source={LOGO} resizeMode="contain" style={[{ width: size, height: size }, style]} />
    </View>
  );
}

export function EmptyState({
  title,
  subtitle,
  ctaLabel,
  onCta,
}: {
  title: string;
  subtitle: string;
  ctaLabel: string;
  onCta: () => void;
}) {
  return (
    <View className="items-center gap-3 pt-12 px-6">
      <FloatingShuttlecock />
      <Text className="font-display-bold text-[19px] text-center" style={{ color: colors.text }}>
        {title}
      </Text>
      <Text className="text-[14.5px] text-center max-w-[250px] leading-5" style={{ color: colors.textSecondary }}>
        {subtitle}
      </Text>
      <View className="mt-1">
        <Button label={ctaLabel} fullWidth={false} onPress={onCta} />
      </View>
    </View>
  );
}
