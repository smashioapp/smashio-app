import { ReactNode } from "react";
import { View, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { HERO_TONE, LAYOUT, type HeroTone } from "../lib/theme";
import { haptics } from "../lib/haptics";
import { SPRING } from "../lib/motion";

// The v2 anchor (docs/v2-design-plan.md §2 rule 1): exactly one of these per screen. Everything
// else on the screen drops to a compact row, which is what makes this read as the one thing
// worth looking at — stacking two Heroes defeats the entire redesign.
export function Hero({
  tone = "accent",
  onPress,
  children,
}: {
  tone?: HeroTone;
  onPress?: () => void;
  children: ReactNode;
}) {
  const { bg, border } = HERO_TONE[tone];
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const body = (
    <LinearGradient
      colors={bg}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={{
        borderRadius: LAYOUT.RADIUS.hero,
        borderWidth: 1.5,
        borderColor: border,
        padding: 20,
        overflow: "hidden",
      }}
    >
      {/* The bloom the design puts behind the top-right corner — a radial in CSS, faked here
          with a soft-edged gradient circle since RN has no radial-gradient. */}
      <View
        pointerEvents="none"
        style={{ position: "absolute", right: -30, top: -30, width: 140, height: 140, borderRadius: 70, opacity: 0.18 }}
      >
        <LinearGradient
          colors={[HERO_TONE[tone].fg, "transparent"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{ flex: 1, borderRadius: 70 }}
        />
      </View>
      {children}
    </LinearGradient>
  );

  if (!onPress) {
    return (
      <Animated.View entering={FadeInDown.duration(320)} style={{ paddingHorizontal: LAYOUT.SCREEN_PAD }}>
        {body}
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.duration(320)} style={[{ paddingHorizontal: LAYOUT.SCREEN_PAD }, pressStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          haptics.tick();
          scale.value = withSpring(0.98, SPRING.press);
        }}
        onPressOut={() => (scale.value = withSpring(1, SPRING.pop))}
      >
        {body}
      </Pressable>
    </Animated.View>
  );
}
