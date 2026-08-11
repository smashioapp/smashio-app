import { ReactNode } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { colors } from "../lib/theme";
import { haptics } from "../lib/haptics";
import { SPRING } from "../lib/motion";

const COMMIT_APPROVE = 90;
const COMMIT_DECLINE = -70;

// Wraps a row (join request, etc.) with a swipe-right-to-approve / swipe-left-to-decline
// gesture. The row's own tap buttons stay in place — this is a faster path layered on
// top, not a replacement, so nothing becomes swipe-only and undiscoverable.
export function SwipeToDecide({
  onApprove,
  onDecline,
  canApprove = true,
  children,
}: {
  onApprove: () => void;
  onDecline: () => void;
  canApprove?: boolean;
  children: ReactNode;
}) {
  const translateX = useSharedValue(0);
  const rowOpacity = useSharedValue(1);

  const commitApprove = () => {
    haptics.tap();
    onApprove();
  };
  const commitDecline = () => {
    haptics.tap();
    onDecline();
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      if (e.translationX > COMMIT_APPROVE) {
        if (canApprove) {
          translateX.value = withTiming(520, { duration: 220 });
          rowOpacity.value = withTiming(0, { duration: 220 }, (finished) => {
            if (finished) runOnJS(commitApprove)();
          });
        } else {
          translateX.value = withSpring(0, SPRING.settle);
          runOnJS(haptics.error)();
        }
      } else if (e.translationX < COMMIT_DECLINE) {
        translateX.value = withTiming(-520, { duration: 220 });
        rowOpacity.value = withTiming(0, { duration: 220 }, (finished) => {
          if (finished) runOnJS(commitDecline)();
        });
      } else {
        translateX.value = withSpring(0, SPRING.settle);
      }
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: rowOpacity.value,
  }));

  const approveBgStyle = useAnimatedStyle(() => ({
    opacity: translateX.value > 8 ? Math.min(1, translateX.value / COMMIT_APPROVE) : 0,
  }));
  const declineBgStyle = useAnimatedStyle(() => ({
    opacity: translateX.value < -8 ? Math.min(1, translateX.value / COMMIT_DECLINE) : 0,
  }));

  return (
    <View style={{ position: "relative" }}>
      <Animated.View
        pointerEvents="none"
        style={[
          { position: "absolute", left: 0, top: 0, bottom: 0, right: "50%", borderRadius: 12, alignItems: "flex-start", justifyContent: "center", paddingLeft: 18, backgroundColor: canApprove ? colors.accent : colors.textMuted },
          approveBgStyle,
        ]}
      >
        <Ionicons name="checkmark" size={20} color={colors.base} />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          { position: "absolute", right: 0, top: 0, bottom: 0, left: "50%", borderRadius: 12, alignItems: "flex-end", justifyContent: "center", paddingRight: 18, backgroundColor: colors.danger },
          declineBgStyle,
        ]}
      >
        <Ionicons name="close" size={20} color={colors.text} />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}
