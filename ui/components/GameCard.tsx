import { Pressable, View, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradients } from "../lib/theme";
import { Badge } from "./Badge";
import { SkillPill } from "./SkillPill";
import { AvatarStack } from "./Avatar";
import { Game, perPlayerCost } from "../lib/mockData";

export function GameCard({ game, onPress }: { game: Game; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <LinearGradient
        colors={gradients.card}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        className="rounded-[18px] p-4 border gap-2.5"
        style={{ borderColor: colors.cardBorder }}
      >
        <View className="flex-row justify-between items-start">
          <View className="flex-1 pr-2">
            <Text className="font-display-bold text-[15px]" style={{ color: colors.text }}>
              {game.venue}
            </Text>
            <Text className="text-[11.5px] mt-0.5" style={{ color: colors.textTertiary }}>
              {game.suburb} · {game.distance}
            </Text>
          </View>
          <Badge state={game.verified ? "verified" : "pending"} label={game.verified ? "Verified" : "Pending"} />
        </View>

        <Text className="text-[12px] font-body-semibold" style={{ color: colors.textDim }}>
          {game.date} · {game.time}
        </Text>

        <View className="flex-row items-center justify-between mt-0.5">
          <AvatarStack people={game.joined} />
          <SkillPill skill={game.skill} />
        </View>

        <View
          className="flex-row justify-between items-center pt-1.5 mt-0.5 border-t"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}
        >
          <Text className="font-display-bold text-[16px]" style={{ color: colors.accent }}>
            ${perPlayerCost(game.cost, game.maxPlayers)} <Text className="font-body-semibold text-[11px]" style={{ color: colors.textTertiary }}>/ player</Text>
          </Text>
          <Text className="text-[11px] font-body-bold" style={{ color: colors.textMuted }}>
            {game.joined.length}/{game.maxPlayers} joined
          </Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}
