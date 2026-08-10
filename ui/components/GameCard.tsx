import { useEffect, useRef } from "react";
import { Pressable, View, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withSequence, withSpring } from "react-native-reanimated";
import { colors, gradients } from "../lib/theme";
import { Badge } from "./Badge";
import { SkillPill } from "./SkillPill";
import { AvatarStack } from "./Avatar";
import { CountdownChip } from "./CountdownChip";
import { Game, perPlayerCost, spotsLeft } from "../lib/mockData";
import { haptics } from "../lib/haptics";
import { SPRING } from "../lib/motion";

export function GameCard({ game, onPress, index = 0 }: { game: Game; onPress: () => void; index?: number }) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const joinedScale = useSharedValue(1);
  const prevJoined = useRef(game.joinedCount);
  useEffect(() => {
    if (prevJoined.current !== game.joinedCount) {
      joinedScale.value = withSequence(withSpring(1.3, SPRING.pop), withSpring(1, SPRING.settle));
      prevJoined.current = game.joinedCount;
    }
  }, [game.joinedCount]);
  const joinedStyle = useAnimatedStyle(() => ({ transform: [{ scale: joinedScale.value }] }));
  const full = spotsLeft(game) === 0;

  return (
    <Animated.View entering={FadeInUp.delay(index * 60).duration(320)} style={animatedStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          haptics.tick();
          scale.value = withSpring(0.97, { damping: 18, stiffness: 300 });
        }}
        onPressOut={() => (scale.value = withSpring(1, { damping: 18, stiffness: 300 }))}
      >
        <LinearGradient
          colors={gradients.card}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          className="rounded-[18px] p-4 border gap-2.5"
          style={{ borderColor: colors.cardBorder }}
        >
          <View className="flex-row justify-between items-start">
            <View className="flex-1 pr-2">
              <Text className="font-display-bold text-[16.5px]" style={{ color: colors.text }}>
                {game.venue}
              </Text>
              <Text className="text-[13.5px] mt-0.5" style={{ color: colors.textTertiary }}>
                {game.suburb} · {game.distance}
              </Text>
            </View>
            {game.verificationStatus !== "none" && (
              <Badge state={game.verified ? "verified" : "pending"} label={game.verified ? "Verified" : "Pending"} />
            )}
          </View>

          <View className="flex-row items-center justify-between">
            <Text className="text-[14px] font-body-semibold" style={{ color: colors.textDim }}>
              {game.date} · {game.time}
            </Text>
            <CountdownChip startsAt={game.startsAt} />
          </View>

          <View className="flex-row items-center justify-between mt-0.5">
            <AvatarStack people={game.joined} />
            <SkillPill skill={game.skill} />
          </View>

          <View
            className="flex-row justify-between items-center pt-1.5 mt-0.5 border-t"
            style={{ borderColor: "rgba(255,255,255,0.06)" }}
          >
            <Text className="font-display-bold text-[17px]" style={{ color: colors.accent }}>
              ${perPlayerCost(game.cost, game.maxPlayers)} <Text className="font-body-semibold text-[13px]" style={{ color: colors.textTertiary }}>/ player</Text>
            </Text>
            <Animated.Text
              className="text-[13px] font-body-bold"
              style={[{ color: full ? colors.danger : colors.textMuted }, joinedStyle]}
            >
              {full ? "Full" : `${game.joinedCount}/${game.maxPlayers} joined`}
            </Animated.Text>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}
