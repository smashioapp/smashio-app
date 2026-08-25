import { ReactNode } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { HERO_TONE, LAYOUT, type HeroTone } from "../lib/theme";
import { haptics } from "../lib/haptics";
import { SPRING } from "../lib/motion";
import { Glow } from "./Glow";
import { GameCover } from "./GameCover";

// The v2 anchor (docs/v2-design-plan.md §2 rule 1): exactly one of these per screen. Everything
// else on the screen drops to a compact row, which is what makes this read as the one thing
// worth looking at — stacking two Heroes defeats the entire redesign.
export function Hero({
  tone = "accent",
  coverKey,
  onPress,
  children,
}: {
  tone?: HeroTone;
  /** Game cover art painted behind the tone gradient (docs/avatars-plan.md P3). Omit for
   * non-game heroes. */
  coverKey?: string | null;
  onPress?: () => void;
  children: ReactNode;
}) {
  const { bg, border } = HERO_TONE[tone];
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const body = (
    <LinearGradient
      colors={coverKey ? (["transparent", "transparent"] as const) : bg}
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
      {!!coverKey && (
        <View style={StyleSheet.absoluteFill}>
          <GameCover coverKey={coverKey} size="fill" scrim />
        </View>
      )}
      {/* The bloom the design puts behind the top-right corner. Was a vertical LinearGradient in
          a rounded box, which reads as a hard-edged half-disc — Glow is the real radial. */}
      <Glow size={190} color={HERO_TONE[tone].fg} intensity={0.24} style={{ right: -55, top: -55 }} />
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
