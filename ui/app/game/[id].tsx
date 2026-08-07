import { View, Text, Pressable, ScrollView } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, gradients, initial } from "../../lib/theme";
import { findGame, perPlayerCost, Game } from "../../lib/mockData";
import { Badge } from "../../components/Badge";
import { SkillPill } from "../../components/SkillPill";
import { BackButton } from "../../components/BackButton";

export default function GameDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const game = findGame(id) as Game | undefined;

  if (!game) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.base }}>
        <Text style={{ color: colors.textSecondary }}>Game not found</Text>
      </View>
    );
  }

  const perPlayer = perPlayerCost(game.cost, game.maxPlayers);
  const joined = "joined" in game ? game.joined : [];

  return (
    <View className="flex-1" style={{ backgroundColor: colors.base }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <LinearGradient colors={["#1F1F24", "#141416"]} style={{ height: 150, paddingTop: 56 }}>
          <View className="px-4">
            <BackButton dark onPress={() => router.back()} />
          </View>
        </LinearGradient>

        <View className="px-5 pt-4.5">
          <View className="flex-row justify-between items-start">
            <Text className="font-display text-[22px] flex-1 pr-3" style={{ color: colors.text }}>
              {game.venue}
            </Text>
            <Badge state={game.verified ? "verified" : "pending"} label={game.verified ? "Verified" : "Pending"} />
          </View>
          <Text className="text-[12.5px] mt-1" style={{ color: colors.textTertiary }}>
            {game.suburb} · {game.courts}
          </Text>

          <View className="flex-row gap-2 mt-3.5">
            <View className="flex-1 rounded-xl px-3.5 py-2.5 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
              <Text className="text-[12.5px] font-body-semibold" style={{ color: colors.text }}>
                {game.date}
              </Text>
            </View>
            <View className="flex-1 rounded-xl px-3.5 py-2.5 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
              <Text className="text-[12.5px] font-body-semibold" style={{ color: colors.text }}>
                {game.time}
              </Text>
            </View>
            <View className="flex-1 items-center justify-center">
              <SkillPill skill={game.skill} />
            </View>
          </View>

          <Text className="font-body-extrabold text-[11px] uppercase tracking-wide mt-5.5 mb-2.5" style={{ color: colors.textTertiary }}>
            Players joined ({joined.length}/{game.maxPlayers})
          </Text>
          <View className="flex-row flex-wrap gap-2.5">
            {joined.map((p, i) => (
              <View key={i} className="items-center gap-1.5" style={{ width: 52 }}>
                <View
                  className="w-[38px] h-[38px] rounded-full items-center justify-center"
                  style={{ backgroundColor: p.color }}
                >
                  <Text style={{ color: colors.base, fontSize: 12, fontWeight: "800" }}>{initial(p.name)}</Text>
                </View>
                <Text className="text-[10px] font-body-semibold" style={{ color: colors.textSecondary }}>
                  {p.name}
                </Text>
              </View>
            ))}
          </View>

          <Text className="font-body-extrabold text-[11px] uppercase tracking-wide mt-5.5 mb-2.5" style={{ color: colors.textTertiary }}>
            Cost split
          </Text>
          <View className="rounded-2xl p-4 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
            <View className="flex-row justify-between mb-2">
              <Text className="text-[13px]" style={{ color: colors.textSecondary }}>
                Total court cost
              </Text>
              <Text className="text-[13px] font-body-bold" style={{ color: colors.text }}>
                ${game.cost}
              </Text>
            </View>
            <View className="flex-row justify-between mb-2.5">
              <Text className="text-[13px]" style={{ color: colors.textSecondary }}>
                Split {game.maxPlayers} ways · even
              </Text>
              <Text className="text-[13px] font-body-bold" style={{ color: colors.text }}>
                ${perPlayer}
              </Text>
            </View>
            <View className="rounded-xl p-3 flex-row justify-between items-center" style={{ backgroundColor: "rgba(214,255,63,0.1)" }}>
              <Text className="text-[13px] font-body-bold" style={{ color: colors.accent }}>
                Your share
              </Text>
              <Text className="font-display-bold text-[19px]" style={{ color: colors.accent }}>
                ${perPlayer}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <View className="px-5 pb-8 pt-3.5 flex-row gap-2.5" style={{ backgroundColor: colors.base }}>
        <Pressable
          onPress={() => router.replace(`/chat/${game.id}`)}
          className="w-14 rounded-pill items-center justify-center border-[1.5px]"
          style={{ borderColor: "rgba(255,255,255,0.15)" }}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={19} color={colors.text} />
        </Pressable>
        <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} className="flex-1 rounded-pill">
          <Pressable onPress={() => router.back()} className="py-4 items-center">
            <Text className="font-body-extrabold text-[15px]" style={{ color: colors.base }}>
              Join Game — ${perPlayer}
            </Text>
          </Pressable>
        </LinearGradient>
      </View>
    </View>
  );
}
