import { Pressable } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { colors, gradients } from "../lib/theme";
import { navMinimize } from "../lib/navScroll";
import { SPRING } from "../lib/motion";
import { haptics } from "../lib/haptics";
import { sound } from "../lib/sound";

const EXPANDED_WIDTH = 176;
const COLLAPSED_WIDTH = 56;

// Lives in BottomRail's right slot (Discover, My Games only) — moved out of TabBar per
// nav-plan Phase 2a so the bar's four items space evenly and the FAB stops overlapping content.
export function HostFab() {
  const scale = useSharedValue(1);
  const rotate = useSharedValue(0);

  const onPressIn = () => {
    scale.value = withSpring(0.9, SPRING.press);
    rotate.value = withSpring(-14, SPRING.press);
  };
  const onPressOut = () => {
    scale.value = withSpring(1, SPRING.pop);
    rotate.value = withSpring(0, SPRING.pop);
  };

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));
  const widthStyle = useAnimatedStyle(() => ({
    width: COLLAPSED_WIDTH + (1 - navMinimize.value) * (EXPANDED_WIDTH - COLLAPSED_WIDTH),
  }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: 1 - navMinimize.value }));

  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        sound.play("whoosh");
        router.push("/wizard");
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel="Host a game"
    >
      <Animated.View style={[{ height: 56, borderRadius: 28, overflow: "hidden" }, widthStyle, pressStyle]}>
        <LinearGradient
          colors={gradients.accentDiagonal}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 16,
            borderRadius: 28,
            borderWidth: 3,
            borderColor: colors.base,
          }}
        >
          <Ionicons name="add" size={22} color={colors.base} />
          <Animated.Text numberOfLines={1} className="font-body-extrabold text-[14px] ml-1.5" style={[{ color: colors.base }, labelStyle]}>
            Host a game
          </Animated.Text>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}
