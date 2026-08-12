import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { colors, gradients, initial, reliabilityLabel, gamesPlayedTier } from "../../lib/theme";
import { usePastGameDetail } from "../../lib/queries/games";
import { useSubmitRatings } from "../../lib/queries/ratings";
import { useSession } from "../../lib/session";
import { useProfile, useProfileStats, useProfileStreak } from "../../lib/queries/profile";
import { useAppStore } from "../../lib/store";
import { nextRebookSlot } from "../../lib/schedule";
import { Screen } from "../../components/Screen";
import { BackButton } from "../../components/BackButton";
import { Burst } from "../../components/Burst";
import { RollingNumber } from "../../components/RollingNumber";
import { haptics } from "../../lib/haptics";
import { SPRING } from "../../lib/motion";
import { SkeletonBlock } from "../../components/Skeleton";

const REVEAL_HOLD_MS = 1200;

function StatOdometer({ label, from, to }: { label: string; from: number; to: number }) {
  return (
    <View className="items-center gap-1">
      <RollingNumber from={from} to={to} className="font-display-bold text-[30px]" style={{ color: colors.text }} />
      <Text className="text-[13px] font-body-semibold uppercase tracking-wide" style={{ color: colors.textTertiary }}>
        {label}
      </Text>
    </View>
  );
}

function Star({ filled, popDelay, popToken, onPress }: { filled: boolean; popDelay: number; popToken: number; onPress: () => void }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (popToken === 0) return;
    scale.value = withDelay(popDelay, withSequence(withSpring(1.4, SPRING.pop), withSpring(1, SPRING.settle)));
  }, [popToken]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable onPress={onPress}>
      <Animated.Text style={[{ fontSize: 18, color: filled ? colors.accent : "rgba(255,255,255,0.15)" }, style]}>★</Animated.Text>
    </Pressable>
  );
}

function StarRow({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [popToken, setPopToken] = useState(0);

  const press = (n: number) => {
    onChange(n);
    setPopToken((t) => t + 1);
    for (let i = 0; i < n; i++) {
      setTimeout(() => haptics.tick(), i * 40);
    }
  };

  return (
    <View className="flex-row gap-0.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} filled={value >= i + 1} popDelay={i < value ? i * 40 : 0} popToken={i < value ? popToken : 0} onPress={() => press(i + 1)} />
      ))}
    </View>
  );
}

function StreakFlame({ streak, burst }: { streak: number; burst: boolean }) {
  const scale = useSharedValue(0.4);

  // Longer streaks get a bigger flame, a bigger overshoot, and a denser burst —
  // the reward should visibly compound, not just repeat.
  const fontSize = Math.min(52, 28 + streak * 2);
  const peakScale = Math.min(1.55, 1.15 + streak * 0.04);
  const particleCount = Math.min(28, 8 + streak * 3);

  useEffect(() => {
    scale.value = withDelay(620, withSequence(withSpring(peakScale, SPRING.pop), withSpring(1, SPRING.settle)));
  }, []);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View className="items-center" style={{ position: "relative" }}>
      <Animated.Text style={[{ fontSize }, style]}>🔥</Animated.Text>
      <Text className="text-[14px] font-body-semibold mt-1" style={{ color: colors.accent }}>
        {streak} week streak
      </Text>
      {burst && <Burst origin={{ x: fontSize / 2, y: fontSize / 2 }} count={particleCount} onDone={() => {}} />}
    </View>
  );
}

function TierUpMoment({ tierId, color, burst }: { tierId: string; color: string; burst: boolean }) {
  const scale = useSharedValue(0.5);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(900, withTiming(1, { duration: 240 }));
    scale.value = withDelay(900, withSequence(withSpring(1.15, SPRING.pop), withSpring(1, SPRING.settle)));
  }, []);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));

  return (
    <View className="items-center" style={{ position: "relative", marginTop: 4 }}>
      <View className="absolute rounded-full" style={{ width: 160, height: 160, backgroundColor: color, opacity: 0.14, top: -30 }} />
      <Animated.View style={[{ alignItems: "center" }, style]}>
        <Text className="font-body-extrabold text-[12px] uppercase tracking-[3px]" style={{ color }}>
          Tier up
        </Text>
        <Text className="font-display text-[36px] mt-0.5" style={{ color }}>
          {tierId}
        </Text>
      </Animated.View>
      {burst && <Burst origin={{ x: 0, y: 30 }} count={34} colors={[color, colors.accent, colors.accentSoft]} onDone={() => {}} />}
    </View>
  );
}

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
  const { data: streak } = useProfileStreak(userId);

  const [revealing, setRevealing] = useState(false);
  const [showFlameBurst, setShowFlameBurst] = useState(false);
  const [showTierBurst, setShowTierBurst] = useState(false);
  const hasStreak = !!streak && streak >= 2;
  const gamesPlayed = stats?.gamesPlayed ?? 0;
  const prevTier = gamesPlayedTier(Math.max(0, gamesPlayed - 1));
  const newTier = gamesPlayedTier(gamesPlayed);
  const tieredUp = gamesPlayed > 0 && prevTier.id !== newTier.id;

  // Same rebook path as the Past tab (my-games-plan.md §M4) — was `router.replace("/wizard")`
  // with an empty draft, which booked nothing, just opened the host flow.
  const handleRebook = () => {
    if (game?.venueId) {
      useAppStore.getState().setRebookSeed({
        venueId: game.venueId,
        venueName: game.venue,
        venueSuburb: game.venueSuburb,
        venueAddress: game.venueAddress ?? "",
        skill: game.skill,
        maxPlayers: game.maxPlayers,
        cost: game.cost,
        startsAt: nextRebookSlot(new Date(game.startsAtIso)),
      });
    }
    router.replace("/wizard");
  };

  const submit = () => {
    haptics.success();
    submitRatings.mutate({ gameId: id ?? "", stars: ratings });
    setRevealing(true);
  };

  useEffect(() => {
    if (!revealing) return;
    const holdMs = tieredUp ? REVEAL_HOLD_MS + 900 : REVEAL_HOLD_MS;
    const t = setTimeout(() => router.replace("/(tabs)/my-games"), holdMs);
    return () => clearTimeout(t);
  }, [revealing, tieredUp]);

  useEffect(() => {
    if (!revealing || !tieredUp) return;
    const t = setTimeout(() => {
      setShowTierBurst(true);
      haptics.burst();
    }, 900);
    return () => clearTimeout(t);
  }, [revealing, tieredUp]);

  useEffect(() => {
    if (!revealing || !hasStreak) return;
    const t = setTimeout(() => {
      setShowFlameBurst(true);
      haptics.burst();
    }, 700);
    return () => clearTimeout(t);
  }, [revealing, hasStreak]);

  if (revealing) {
    const reliability = profile?.reliability_score ?? 0;
    return (
      <Screen>
        <View className="flex-1 items-center justify-center px-8" style={{ gap: 26 }}>
          <Text className="font-display text-[20.5px]" style={{ color: colors.text }}>
            Nice game!
          </Text>
          <View className="flex-row justify-around w-full">
            <StatOdometer label="Games played" from={Math.max(0, gamesPlayed - 1)} to={gamesPlayed} />
            <StatOdometer label={reliability ? reliabilityLabel(reliability) : "Reliability"} from={0} to={reliability} />
          </View>
          {tieredUp ? (
            <TierUpMoment tierId={newTier.id} color={newTier.color} burst={showTierBurst} />
          ) : (
            hasStreak && <StreakFlame streak={streak!} burst={showFlameBurst} />
          )}
        </View>
      </Screen>
    );
  }

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
          <Text className="font-display text-[19px]" style={{ color: colors.text }}>
            Rate your match
          </Text>
        </View>

        <View className="px-5">
          <Text className="text-[14.5px] mb-4.5" style={{ color: colors.textSecondary }}>
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
              <Text className="flex-1 font-body-bold text-[15.5px]" style={{ color: colors.text }}>
                {p.name}
              </Text>
              <StarRow value={ratings[p.id] ?? 0} onChange={(n) => rate(p.id, n)} />
            </View>
          ))}

          <View className="rounded-2xl p-4 my-5 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
            <Text className="font-body-extrabold text-[13px] uppercase mb-2" style={{ color: colors.textTertiary }}>
              Match stats updated
            </Text>
            <View className="flex-row justify-between mb-1.5">
              <Text className="text-[14.5px] font-body-semibold" style={{ color: colors.text }}>
                Games played
              </Text>
              <Text className="text-[14.5px] font-body-semibold" style={{ color: colors.text }}>
                {stats?.gamesPlayed ?? "—"}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-[14.5px] font-body-semibold" style={{ color: colors.text }}>
                Reliability score
              </Text>
              <Text className="text-[14.5px] font-body-semibold" style={{ color: colors.accent }}>
                {profile ? reliabilityLabel(profile.reliability_score) : "—"}
              </Text>
            </View>
            {!!streak && streak >= 2 && (
              <View className="flex-row justify-between mt-1.5 pt-1.5 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                <Text className="text-[14.5px] font-body-semibold" style={{ color: colors.text }}>
                  🔥 Streak
                </Text>
                <Text className="text-[14.5px] font-body-semibold" style={{ color: colors.accent }}>
                  {streak} weeks running
                </Text>
              </View>
            )}
          </View>

          <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} className="rounded-pill mb-2.5">
            <Pressable onPress={submit} className="py-4 items-center">
              <Text className="font-body-extrabold text-[16.5px]" style={{ color: colors.base }}>
                Submit ratings
              </Text>
            </Pressable>
          </LinearGradient>
          <Pressable
            onPress={handleRebook}
            className="rounded-pill py-3.5 items-center border-[1.5px]"
            style={{ borderColor: "rgba(255,255,255,0.15)" }}
          >
            <Text className="font-body-bold text-[15.5px]" style={{ color: colors.text }}>
              Rebook this game
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}
