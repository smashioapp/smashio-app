import { useEffect } from "react";
import { View, ViewStyle } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from "react-native-reanimated";
import { colors } from "../lib/theme";

export function SkeletonBlock({ style }: { style?: ViewStyle }) {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.9, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[{ backgroundColor: colors.surfaceAlt, borderRadius: 8 }, style, animatedStyle]} />;
}

export function GameCardSkeleton() {
  return (
    <View className="rounded-[18px] p-4 border gap-2.5" style={{ borderColor: colors.cardBorder, backgroundColor: colors.card }}>
      <View className="flex-row justify-between items-start">
        <View className="flex-1 pr-2 gap-1.5">
          <SkeletonBlock style={{ width: "60%", height: 14 }} />
          <SkeletonBlock style={{ width: "40%", height: 10 }} />
        </View>
        <SkeletonBlock style={{ width: 60, height: 20, borderRadius: 100 }} />
      </View>
      <SkeletonBlock style={{ width: "50%", height: 12 }} />
      <View className="flex-row items-center justify-between mt-0.5">
        <SkeletonBlock style={{ width: 70, height: 24, borderRadius: 100 }} />
        <SkeletonBlock style={{ width: 50, height: 20, borderRadius: 100 }} />
      </View>
      <View className="flex-row justify-between items-center pt-1.5 mt-0.5 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <SkeletonBlock style={{ width: 60, height: 16 }} />
        <SkeletonBlock style={{ width: 70, height: 12 }} />
      </View>
    </View>
  );
}

export function GameCardSkeletonList({ count = 3 }: { count?: number }) {
  return (
    <View style={{ padding: 20, paddingTop: 0, gap: 12 }}>
      {Array.from({ length: count }, (_, i) => (
        <GameCardSkeleton key={i} />
      ))}
    </View>
  );
}

export function ChatRowSkeleton() {
  return (
    <View className="flex-row items-center gap-3 px-2 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
      <SkeletonBlock style={{ width: 46, height: 46, borderRadius: 16 }} />
      <View className="flex-1 gap-1.5">
        <View className="flex-row justify-between">
          <SkeletonBlock style={{ width: "40%", height: 13 }} />
          <SkeletonBlock style={{ width: 36, height: 10 }} />
        </View>
        <SkeletonBlock style={{ width: "70%", height: 11 }} />
      </View>
    </View>
  );
}

export function ChatRowSkeletonList({ count = 5 }: { count?: number }) {
  return (
    <View style={{ paddingHorizontal: 12 }}>
      {Array.from({ length: count }, (_, i) => (
        <ChatRowSkeleton key={i} />
      ))}
    </View>
  );
}

export function GameDetailSkeleton() {
  return (
    <View className="px-5 pt-[18px] gap-3.5">
      <SkeletonBlock style={{ width: "70%", height: 22 }} />
      <SkeletonBlock style={{ width: "40%", height: 12 }} />
      <View className="flex-row gap-2 mt-2">
        <SkeletonBlock style={{ flex: 1, height: 40, borderRadius: 12 }} />
        <SkeletonBlock style={{ flex: 1, height: 40, borderRadius: 12 }} />
        <SkeletonBlock style={{ flex: 1, height: 40, borderRadius: 12 }} />
      </View>
      <SkeletonBlock style={{ width: "50%", height: 12, marginTop: 12 }} />
      <View className="flex-row gap-2.5">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonBlock key={i} style={{ width: 52, height: 52, borderRadius: 26 }} />
        ))}
      </View>
      <SkeletonBlock style={{ width: "50%", height: 12, marginTop: 12 }} />
      <SkeletonBlock style={{ width: "100%", height: 130, borderRadius: 16 }} />
    </View>
  );
}
