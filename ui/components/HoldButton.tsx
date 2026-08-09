import { useCallback, useRef, useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Rect } from "react-native-svg";
import { colors, gradients } from "../lib/theme";
import { haptics } from "../lib/haptics";
import { sound, type SfxName } from "../lib/sound";
import { SPRING } from "../lib/motion";
import { Burst } from "./Burst";

const AnimatedRect = Animated.createAnimatedComponent(Rect);

type HoldButtonProps = {
  label: string;
  completeLabel?: string;
  holdMs?: number;
  onComplete: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  sfx?: SfxName;
};

// Our checkbox equivalent: press-and-hold instead of a tap. The effort is the point —
// a ring fills around the button, haptics escalate, and completion fires burst + sound.
// Releasing early springs everything back with no penalty.
export function HoldButton({
  label,
  completeLabel = "Done",
  holdMs = 600,
  onComplete,
  disabled = false,
  fullWidth = true,
  sfx = "pop",
}: HoldButtonProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [completed, setCompleted] = useState(false);
  const [showBurst, setShowBurst] = useState(false);
  const cancelRampRef = useRef<() => void>(() => {});

  const fill = useSharedValue(0);
  const scale = useSharedValue(1);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  }, []);

  const handleComplete = useCallback(() => {
    setCompleted(true);
    setShowBurst(true);
    haptics.burst();
    sound.play(sfx);
    onComplete();
  }, [onComplete, sfx]);

  const onPressIn = () => {
    if (disabled || completed) return;
    cancelRampRef.current();
    cancelRampRef.current = haptics.ramp(holdMs);
    fill.value = withTiming(1, { duration: holdMs, easing: Easing.linear }, (finished) => {
      if (finished) runOnJS(handleComplete)();
    });
    scale.value = withTiming(1.04, { duration: holdMs, easing: Easing.out(Easing.quad) });
  };

  const onPressOut = () => {
    if (completed) return;
    cancelRampRef.current();
    cancelAnimation(fill);
    fill.value = withSpring(0, SPRING.settle);
    scale.value = withSpring(1, SPRING.press);
  };

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const perimeter = 2 * (size.width - size.height) + Math.PI * size.height;
  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: perimeter * (1 - fill.value),
  }));

  const isDisabled = disabled || completed;

  return (
    <Animated.View style={[containerStyle, fullWidth ? { width: "100%" } : undefined]}>
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={isDisabled}
        onLayout={onLayout}
        className={fullWidth ? "w-full" : ""}
      >
        <LinearGradient
          colors={isDisabled ? [colors.surfaceAlt, colors.surfaceAlt] : gradients.accent}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="rounded-pill py-4 px-6 flex-row items-center justify-center"
        >
          <Text className="font-body-extrabold text-[15px]" style={{ color: colors.base }}>
            {completed ? completeLabel : label}
          </Text>
        </LinearGradient>

        {size.width > 0 && !completed && (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Svg width={size.width} height={size.height}>
              <Rect
                x={1}
                y={1}
                width={size.width - 2}
                height={size.height - 2}
                rx={size.height / 2}
                ry={size.height / 2}
                fill="none"
                stroke="rgba(255,255,255,0.18)"
                strokeWidth={2}
              />
              <AnimatedRect
                x={1}
                y={1}
                width={size.width - 2}
                height={size.height - 2}
                rx={size.height / 2}
                ry={size.height / 2}
                fill="none"
                stroke={colors.text}
                strokeWidth={2}
                strokeDasharray={perimeter}
                animatedProps={ringProps}
                strokeLinecap="round"
              />
            </Svg>
          </View>
        )}
      </Pressable>

      {showBurst && size.width > 0 && (
        <Burst
          origin={{ x: size.width / 2, y: size.height / 2 }}
          onDone={() => setShowBurst(false)}
        />
      )}
    </Animated.View>
  );
}
