import { useEffect } from "react";
import { View } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import { colors } from "../lib/theme";

// Cork base + four fanned feathers, drawn simply enough to read at 22px while spinning.
// Exported for reuse anywhere a small badminton glyph is needed in place of a generic icon.
export function ShuttlecockGlyph({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 13 L5 3 L12 6 L19 3 Z" fill={colors.text} opacity={0.85} />
      <Path d="M12 13 L8 2.5 L12 6.5 L16 2.5 Z" fill={colors.accent} opacity={0.7} />
      <Circle cx="12" cy="16" r="4.5" fill={colors.accent} />
      <Circle cx="12" cy="16" r="4.5" fill="none" stroke={colors.base} strokeOpacity={0.25} strokeWidth={0.75} />
    </Svg>
  );
}

// Replaces the stock RefreshControl spinner: a shuttlecock spins continuously while
// `active`, faded in/out. Pair with a RefreshControl whose native indicator is hidden
// (tintColor/colors transparent) — see RefreshableList.
export function ShuttlecockSpinner({ active }: { active: boolean }) {
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (active) {
      opacity.value = withTiming(1, { duration: 160 });
      rotate.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false);
    } else {
      opacity.value = withTiming(0, { duration: 160 });
      cancelAnimation(rotate);
      rotate.value = 0;
    }
  }, [active]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ rotate: `${rotate.value}deg` }],
  }));

  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 12, left: 0, right: 0, alignItems: "center", zIndex: 10 }}>
      <Animated.View style={style}>
        <ShuttlecockGlyph />
      </Animated.View>
    </View>
  );
}
