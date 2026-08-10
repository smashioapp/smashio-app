import { useEffect, useState } from "react";
import { LayoutChangeEvent, Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Rect } from "react-native-svg";
import { gamesPlayedTier, nextGamesPlayedTier } from "../lib/theme";
import { SPRING } from "../lib/motion";

const AnimatedRect = Animated.createAnimatedComponent(Rect);

// Bronze/Silver/Gold pill: a shine sweep plays once on mount, the whole thing tilts on
// press, and a thin ring traces progress toward the next tier — a target you can see is
// the cheapest motivation there is.
export function TierBadge({ gamesPlayed }: { gamesPlayed: number }) {
  const tier = gamesPlayedTier(gamesPlayed);
  const next = nextGamesPlayedTier(gamesPlayed);

  const [size, setSize] = useState({ width: 0, height: 0 });
  const shine = useSharedValue(-1);
  const tilt = useSharedValue(0);
  const scale = useSharedValue(1);
  const ringProgress = useSharedValue(0);

  const currentMin = tierMin(tier.id);
  const span = next ? next.min - currentMin : 1;
  const fillFraction = next ? Math.min(1, Math.max(0, (gamesPlayed - currentMin) / span)) : 1;

  useEffect(() => {
    shine.value = withDelay(300, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
    ringProgress.value = withDelay(300, withTiming(fillFraction, { duration: 800, easing: Easing.out(Easing.cubic) }));
  }, [fillFraction]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  const onPressIn = () => {
    tilt.value = withSpring(-6, SPRING.press);
    scale.value = withSpring(0.96, SPRING.press);
  };
  const onPressOut = () => {
    tilt.value = withSpring(0, SPRING.settle);
    scale.value = withSpring(1, SPRING.settle);
  };

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 300 }, { rotateX: `${tilt.value}deg` }, { scale: scale.value }],
  }));

  const shineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shine.value * (size.width + 40) - 20 }, { rotate: "20deg" }],
    opacity: size.width > 0 ? 1 : 0,
  }));

  const perimeter = size.width > 0 ? 2 * (size.width - size.height) + Math.PI * size.height : 0;
  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: perimeter * (1 - ringProgress.value),
  }));

  return (
    <Pressable onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={containerStyle}>
        <View onLayout={onLayout} className="rounded-pill px-2 py-0.5" style={{ backgroundColor: tier.color + "22", overflow: "hidden" }}>
          <Text className="font-body-extrabold text-[11px] uppercase tracking-wide" style={{ color: tier.color }}>
            {tier.id}
          </Text>

          {size.width > 0 && (
            <Animated.View pointerEvents="none" style={[{ position: "absolute", top: -10, bottom: -10, width: 14, backgroundColor: "rgba(255,255,255,0.35)" }, shineStyle]} />
          )}
        </View>

        {size.width > 0 && next && (
          <View pointerEvents="none" style={{ position: "absolute", top: -2, left: -2, right: -2, bottom: -2 }}>
            <Svg width={size.width + 4} height={size.height + 4}>
              <AnimatedRect
                x={1}
                y={1}
                width={size.width + 2}
                height={size.height + 2}
                rx={(size.height + 4) / 2}
                ry={(size.height + 4) / 2}
                fill="none"
                stroke={next.color}
                strokeWidth={1.5}
                strokeDasharray={perimeter}
                animatedProps={ringProps}
                strokeLinecap="round"
              />
            </Svg>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

function tierMin(id: "Bronze" | "Silver" | "Gold"): number {
  return id === "Gold" ? 25 : id === "Silver" ? 10 : 0;
}
