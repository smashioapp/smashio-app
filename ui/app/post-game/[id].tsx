import { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradients, initial, reliabilityLabel } from "../../lib/theme";
import { usePastGameDetail } from "../../lib/queries/games";
import { useSubmitRatings } from "../../lib/queries/ratings";
import { useSession } from "../../lib/session";
import { useProfile, useProfileStats } from "../../lib/queries/profile";
import { Screen } from "../../components/Screen";
import { BackButton } from "../../components/BackButton";
import { haptics } from "../../lib/haptics";
import { SkeletonBlock } from "../../components/Skeleton";

export default function PostGame() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const gameQuery = usePastGameDetail(id ?? "");
  const game = gameQuery.data;
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const rate = (playerId: string, n: number) => setRatings((r) => ({ ...r, [playerId]: n }));
  const submitRatings = useSubmitRatings();

  const { session } = useSession();
  const userId = session?.user.id;
  const { data: profile } = useProfile(userId);
  const { data: stats } = useProfileStats(userId);

  const submit = () => {
    haptics.success();
    submitRatings.mutate({ gameId: id ?? "", stars: ratings });
    router.replace("/(tabs)/my-games");
  };

  if (gameQuery.isLoading) {
    return (
      <Screen>
        <View className="flex-row items-center gap-3 px-5 pt-1.5 pb-3.5">
          <BackButton onPress={() => router.back()} />
          <SkeletonBlock style={{ width: 140, height: 18 }} />
        </View>
        <View className="px-5 gap-3">
          <SkeletonBlock style={{ width: "60%", height: 13 }} />
          {Array.from({ length: 3 }, (_, i) => (
            <View key={i} className="flex-row items-center gap-3 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              <SkeletonBlock style={{ width: 40, height: 40, borderRadius: 20 }} />
              <SkeletonBlock style={{ flex: 1, height: 14 }} />
            </View>
          ))}
        </View>
      </Screen>
    );
  }

  if (!game) return null;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="flex-row items-center gap-3 px-5 pt-1.5 pb-3.5">
          <BackButton onPress={() => router.back()} />
          <Text className="font-display text-[18px]" style={{ color: colors.text }}>
            Rate your match
          </Text>
        </View>

        <View className="px-5">
          <Text className="text-[13px] mb-4.5" style={{ color: colors.textSecondary }}>
            {game.venue} · {game.date}
          </Text>

          {game.players.map((p) => (
            <View
              key={p.id}
              className="flex-row items-center gap-3 py-3 border-b"
              style={{ borderColor: "rgba(255,255,255,0.06)" }}
            >
              <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: p.color }}>
                <Text style={{ color: colors.base, fontWeight: "800" }}>{initial(p.name)}</Text>
              </View>
              <Text className="flex-1 font-body-bold text-[14px]" style={{ color: colors.text }}>
                {p.name}
              </Text>
              <View className="flex-row gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable key={n} onPress={() => rate(p.id, n)}>
                    <Text style={{ fontSize: 18, color: (ratings[p.id] ?? 0) >= n ? colors.accent : "rgba(255,255,255,0.15)" }}>★</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}

          <View className="rounded-2xl p-4 my-5 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
            <Text className="font-body-extrabold text-[11px] uppercase mb-2" style={{ color: colors.textTertiary }}>
              Match stats updated
            </Text>
            <View className="flex-row justify-between mb-1.5">
              <Text className="text-[13px] font-body-semibold" style={{ color: colors.text }}>
                Games played
              </Text>
              <Text className="text-[13px] font-body-semibold" style={{ color: colors.text }}>
                {stats?.gamesPlayed ?? "—"}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-[13px] font-body-semibold" style={{ color: colors.text }}>
                Reliability score
              </Text>
              <Text className="text-[13px] font-body-semibold" style={{ color: colors.accent }}>
                {profile ? reliabilityLabel(profile.reliability_score) : "—"}
              </Text>
            </View>
          </View>

          <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} className="rounded-pill mb-2.5">
            <Pressable onPress={submit} className="py-4 items-center">
              <Text className="font-body-extrabold text-[15px]" style={{ color: colors.base }}>
                Submit ratings
              </Text>
            </Pressable>
          </LinearGradient>
          <Pressable
            onPress={() => router.replace("/wizard")}
            className="rounded-pill py-3.5 items-center border-[1.5px]"
            style={{ borderColor: "rgba(255,255,255,0.15)" }}
          >
            <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
              Rebook this game
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}
