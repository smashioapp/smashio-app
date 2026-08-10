import { useEffect } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { colors, reliabilityColor } from "../lib/theme";
import { RollingNumber } from "./RollingNumber";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Replaces the flat "87/100" text with an arc that fills on mount, colored by band —
// a number you glance at once vs. a shape that draws your eye while it fills.
export function ReliabilityGauge({ score, size = 76 }: { score: number; size?: number }) {
  const strokeWidth = 7;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useSharedValue(0);
  const color = reliabilityColor(score);

  useEffect(() => {
    progress.value = withDelay(120, withTiming(score / 100, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [score]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
        />
      </Svg>
      <RollingNumber from={0} to={score} className="font-display-bold text-[20px]" style={{ color: colors.text }} />
    </View>
  );
}
