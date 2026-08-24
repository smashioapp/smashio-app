import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Sentry from "@sentry/react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { colors, gradients, initial, reliabilityLabel, gamesPlayedTier, tierColor } from "../../lib/theme";
import { usePastGameDetail, SPORT_SLUG } from "../../lib/queries/games";
import { useGameAttendance, useMarkAttendance } from "../../lib/queries/gamePlayers";
import { useSubmitPostGameRatings, RATING_TAGS, HOST_RATING_TAGS } from "../../lib/queries/ratings";
import { useSkillTiers } from "../../lib/queries/sports";
import { useSession } from "../../lib/session";
import { useProfile, useProfileStats, useProfileStreak } from "../../lib/queries/profile";
import { useAppStore } from "../../lib/store";
import { nextRebookSlot } from "../../lib/schedule";
import { Screen } from "../../components/Screen";
import { BackButton } from "../../components/BackButton";
import { Burst } from "../../components/Burst";
import { Glow } from "../../components/Glow";
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

function TagRow({
  tags,
  active,
  onToggle,
}: {
  tags: { id: string; label: string }[];
  active: string[];
  onToggle: (tagId: string) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {tags.map((t) => {
        const on = active.includes(t.id);
        return (
          <Pressable
            key={t.id}
            onPress={() => onToggle(t.id)}
            className="rounded-pill px-2.5 py-1 border"
            style={{
              backgroundColor: on ? "rgba(214,255,63,0.14)" : colors.surface,
              borderColor: on ? colors.accent : colors.cardBorder,
            }}
          >
            <Text className="font-body-bold text-[11.5px]" style={{ color: on ? colors.accent : colors.textTertiary }}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// post-game-plan.md D5. The player's own declared tier is shown as the pre-answer so the rater is
// confirming or correcting a claim rather than guessing cold. Nothing here overwrites their
// profile — they keep authority on their own tier; this is the signal we use to nudge them later.
function SkillVoteRow({
  declaredTier,
  tiers,
  selectedTierId,
  onSelect,
}: {
  declaredTier: string | null;
  tiers: { id: string; label: string }[];
  selectedTierId: string | undefined;
  onSelect: (tierId: string) => void;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-[11.5px] font-body-semibold" style={{ color: colors.textMuted }}>
        {declaredTier ? `They play as ${declaredTier}. Right level?` : "What level do they play at?"}
      </Text>
      <View className="flex-row flex-wrap gap-1.5">
        {tiers.map((t) => {
          const on = selectedTierId === t.id;
          const accent = tierColor(t.label);
          return (
            <Pressable
              key={t.id}
              onPress={() => {
                haptics.tick();
                onSelect(t.id);
              }}
              className="rounded-pill px-2.5 py-1 border"
              style={{ backgroundColor: on ? colors.surfaceAlt : colors.surface, borderColor: on ? accent : colors.cardBorder }}
            >
              <Text className="font-body-bold text-[11.5px]" style={{ color: on ? accent : colors.textTertiary }}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
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
      <Glow size={220} color={color} intensity={0.34} style={{ top: -60 }} />
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
  const gameId = id ?? "";
  const gameQuery = usePastGameDetail(gameId);
  const game = gameQuery.data;

  const [stars, setStars] = useState<Record<string, number>>({});
  const [hostStars, setHostStars] = useState<Record<string, number>>({});
  const [tags, setTags] = useState<Record<string, string[]>>({});
  const [hostTags, setHostTags] = useState<Record<string, string[]>>({});
  const [skillVotes, setSkillVotes] = useState<Record<string, string>>({});
  const submit_ = useSubmitPostGameRatings();

  const { data: tiers } = useSkillTiers(SPORT_SLUG);

  // The host is asked who turned up before anyone rates (post-game-plan.md D4). Marking is what
  // releases the rating prompt to everyone else, so it sits above the rating list, not beside it.
  const attendanceOpen = !!game?.viewerIsHost && !game?.attendanceMarkedAt;
  const { data: attendance } = useGameAttendance(gameId, attendanceOpen);
  const markAttendance = useMarkAttendance(gameId);
  const [noShows, setNoShows] = useState<string[]>([]);

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

  const tierOptions = useMemo(
    () =>
      (tiers ?? [])
        .map((t) => ({ id: t.id, label: t.label, ordinal: t.ordinal }))
        .sort((a, b) => a.ordinal - b.ordinal),
    [tiers]
  );

  const toggleTag = (setter: typeof setTags, playerId: string, tagId: string) => {
    haptics.tick();
    setter((t) => {
      const current = t[playerId] ?? [];
      const next = current.includes(tagId) ? current.filter((x) => x !== tagId) : [...current, tagId];
      return { ...t, [playerId]: next };
    });
  };

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
        courtsBooked: game.courtsBooked,
        durationHours: game.durationHours,
        cost: game.cost,
        startsAt: nextRebookSlot(new Date(game.startsAtIso)),
      });
    }
    router.replace("/wizard");
  };

  const confirmAttendance = async () => {
    haptics.tap();
    try {
      await markAttendance.mutateAsync(noShows);
    } catch (err) {
      Sentry.captureException(err, { tags: { screen: "post-game-attendance" }, extra: { gameId } });
      Alert.alert("Couldn't save attendance", err instanceof Error ? err.message : "Please try again.");
    }
  };

  const submit = async () => {
    haptics.success();
    try {
      await submit_.mutateAsync({ gameId, stars, hostStars, tags, hostTags, skillVotes });
      setRevealing(true);
    } catch (err) {
      Sentry.captureException(err, { tags: { screen: "post-game-submit" }, extra: { gameId } });
      const detail = err instanceof Error ? err.message : null;
      Alert.alert("Couldn't submit ratings", detail ?? "Please try again.");
    }
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

  const nothingToRate = game.players.length === 0;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="flex-row items-center gap-3 px-5 pt-1.5 pb-3.5">
          <BackButton onPress={() => router.back()} />
          <Text className="font-display text-[19px]" style={{ color: colors.text }}>
            {attendanceOpen ? "Who turned up?" : "Rate your match"}
          </Text>
        </View>

        <View className="px-5">
          <Text className="text-[14.5px] mb-4.5" style={{ color: colors.textSecondary }}>
            {game.venue} · {game.date}
          </Text>

          {attendanceOpen && (
            <View className="rounded-2xl p-4 mb-5 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
              <Text className="font-body-extrabold text-[13px] uppercase mb-1" style={{ color: colors.textTertiary }}>
                Mark no-shows
              </Text>
              <Text className="text-[12.5px] mb-3" style={{ color: colors.textMuted }}>
                Only you can say who actually played. Anyone you mark drops out of everyone's rating list — and
                can't rate anyone either.
              </Text>
              {(attendance ?? []).map((p) => {
                const missing = noShows.includes(p.profileId);
                return (
                  <Pressable
                    key={p.profileId}
                    testID={`attendance-${p.profileId}`}
                    onPress={() => {
                      haptics.tick();
                      setNoShows((n) => (missing ? n.filter((x) => x !== p.profileId) : [...n, p.profileId]));
                    }}
                    className="flex-row items-center gap-3 py-2.5"
                  >
                    <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: p.color, opacity: missing ? 0.35 : 1 }}>
                      <Text style={{ color: colors.base, fontWeight: "800" }}>{initial(p.name)}</Text>
                    </View>
                    <Text
                      className="flex-1 font-body-bold text-[15px]"
                      style={{ color: missing ? colors.textMuted : colors.text, textDecorationLine: missing ? "line-through" : "none" }}
                    >
                      {p.name}
                    </Text>
                    <View
                      className="rounded-pill px-2.5 py-1 border"
                      style={{
                        backgroundColor: missing ? "rgba(255,255,255,0.04)" : colors.surface,
                        borderColor: missing ? colors.cardBorder : "rgba(214,255,63,0.4)",
                      }}
                    >
                      <Text className="font-body-bold text-[11.5px]" style={{ color: missing ? colors.textMuted : colors.accent }}>
                        {missing ? "No-show" : "Played"}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
              <Pressable
                testID="attendance-confirm"
                onPress={confirmAttendance}
                disabled={markAttendance.isPending}
                className="rounded-pill py-3 items-center mt-2 border-[1.5px]"
                style={{ borderColor: colors.accent, opacity: markAttendance.isPending ? 0.5 : 1 }}
              >
                <Text className="font-body-extrabold text-[14.5px]" style={{ color: colors.accent }}>
                  {noShows.length === 0 ? "Everyone played" : `Confirm — ${noShows.length} no-show${noShows.length === 1 ? "" : "s"}`}
                </Text>
              </Pressable>
            </View>
          )}

          {nothingToRate ? (
            <View className="rounded-2xl p-4 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
              <Text className="font-body-bold text-[14.5px]" style={{ color: colors.text }}>
                Nobody to rate
              </Text>
              <Text className="text-[12.5px] mt-1" style={{ color: colors.textMuted }}>
                Everyone else on this game was marked as a no-show.
              </Text>
            </View>
          ) : (
            game.players.map((p) => {
              const playerStars = stars[p.id] ?? 0;
              const started = playerStars > 0 || p.ratedPlayer;
              return (
                <View key={p.id} className="py-3 border-b gap-2.5" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  <View className="flex-row items-center gap-3">
                    <Pressable className="flex-row items-center gap-3 flex-1" onPress={() => router.push(`/player/${p.id}`)}>
                      <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: p.color }}>
                        <Text style={{ color: colors.base, fontWeight: "800" }}>{initial(p.name)}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="font-body-bold text-[15.5px]" style={{ color: colors.text }}>
                          {p.name}
                        </Text>
                        {p.isHost && (
                          <Text className="text-[11.5px] font-body-semibold" style={{ color: colors.accent }}>
                            Host
                          </Text>
                        )}
                      </View>
                    </Pressable>
                    {p.ratedPlayer ? (
                      <View className="flex-row items-center gap-1">
                        <Ionicons name="checkmark-circle" size={15} color={colors.accent} />
                        <Text className="text-[12px] font-body-semibold" style={{ color: colors.textMuted }}>
                          Rated
                        </Text>
                      </View>
                    ) : (
                      <StarRow value={playerStars} onChange={(n) => setStars((r) => ({ ...r, [p.id]: n }))} />
                    )}
                  </View>

                  {started && !p.ratedPlayer && (
                    <View className="gap-2.5 pl-[52px]">
                      <TagRow tags={RATING_TAGS} active={tags[p.id] ?? []} onToggle={(tagId) => toggleTag(setTags, p.id, tagId)} />
                    </View>
                  )}

                  {started && !p.skillVoted && tierOptions.length > 0 && (
                    <View className="pl-[52px]">
                      <SkillVoteRow
                        declaredTier={p.declaredTier}
                        tiers={tierOptions}
                        selectedTierId={skillVotes[p.id]}
                        onSelect={(tierId) => setSkillVotes((v) => ({ ...v, [p.id]: tierId }))}
                      />
                    </View>
                  )}

                  {/* D6: the host is rated twice. Their play is one question; whether the court,
                      the price and the skill level matched what was advertised is another. */}
                  {p.isHost && !p.ratedHost && (
                    <View className="gap-2 pl-[52px] mt-1 pt-2.5 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                      <View className="flex-row items-center justify-between">
                        <Text className="text-[12px] font-body-extrabold uppercase tracking-wide" style={{ color: colors.textTertiary }}>
                          As host
                        </Text>
                        <StarRow value={hostStars[p.id] ?? 0} onChange={(n) => setHostStars((r) => ({ ...r, [p.id]: n }))} />
                      </View>
                      {(hostStars[p.id] ?? 0) > 0 && (
                        <TagRow tags={HOST_RATING_TAGS} active={hostTags[p.id] ?? []} onToggle={(tagId) => toggleTag(setHostTags, p.id, tagId)} />
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}

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

          {!nothingToRate && (
            <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} className="rounded-pill mb-2.5">
              <Pressable testID="postgame-submit" onPress={submit} disabled={submit_.isPending} className="py-4 items-center">
                <Text className="font-body-extrabold text-[16.5px]" style={{ color: colors.base }}>
                  Submit ratings
                </Text>
              </Pressable>
            </LinearGradient>
          )}
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
