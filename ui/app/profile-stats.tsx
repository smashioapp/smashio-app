import { useRef, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInUp } from "react-native-reanimated";
import ViewShot, { type ViewShotRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { colors, tierColor, LAYOUT } from "../lib/theme";
import { Screen } from "../components/Screen";
import { BackButton } from "../components/BackButton";
import { RollingNumber } from "../components/RollingNumber";
import { TierBadge } from "../components/TierBadge";
import { PlayerCard } from "../components/PlayerCard";
import { Heatmap } from "../components/Heatmap";
import { RatingDistributionBars } from "../components/RatingDistributionBars";
import { CompletenessMeter } from "../components/CompletenessMeter";
import { useSession } from "../lib/session";
import { usePlayerCard, useProfileStreak, useProfileActivity } from "../lib/queries/profile";
import { useRatingDistribution, usePeerPerceivedSkill } from "../lib/queries/ratings";
import { haptics } from "../lib/haptics";
import { buildWeekHeatmap } from "../lib/format";
import { ACHIEVEMENTS } from "../lib/achievements";

// Everything the v2 Profile anchor displaces (docs/v2-design-plan.md §4.6, backlog B14) —
// rating distribution, peer-perceived skill, streak, activity tiles, 12-week heatmap, regulars,
// achievements, completeness meter, share-my-card. Straight move from the old Profile screen,
// restyled to the row/card language; nothing here is new and nothing is deleted.
export default function ProfileStats() {
  const { session } = useSession();
  const userId = session?.user.id;
  const emailVerified = !!session?.user.email_confirmed_at;

  const { data: card } = usePlayerCard(userId);
  const { data: streak } = useProfileStreak(userId);
  const { data: activity } = useProfileActivity(userId);
  const { data: distribution } = useRatingDistribution(userId);
  const { data: peerSkill } = usePeerPerceivedSkill(userId);

  const shotRef = useRef<ViewShotRef>(null);
  const [sharing, setSharing] = useState(false);

  const gamesPlayed = card?.gamesPlayed ?? 0;
  const gamesHosted = card?.gamesHosted ?? 0;
  const hasPlayedAnything = gamesPlayed > 0 || gamesHosted > 0;
  const selfTier = card?.sports.find((s) => s.sportSlug === "badminton")?.tierLabel ?? card?.sports[0]?.tierLabel ?? null;

  const heatmapGrid = buildWeekHeatmap(activity?.heatmapDates ?? []);

  const shareCard = async () => {
    haptics.tap();
    setSharing(true);
    try {
      const uri = await shotRef.current?.capture?.();
      if (uri && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share your Smashio card" });
      }
    } catch {
    } finally {
      setSharing(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="flex-row items-center gap-3" style={{ paddingHorizontal: LAYOUT.SCREEN_PAD, paddingTop: 8, paddingBottom: 4 }}>
          <BackButton onPress={() => router.back()} />
          <Text className="font-display text-[20px]" style={{ color: colors.text }}>
            Stats & achievements
          </Text>
        </View>

        <ViewShot ref={shotRef} options={{ format: "png", quality: 0.92, fileName: "smashio-card" }}>
          <View style={{ backgroundColor: colors.base }}>{userId && <PlayerCard profileId={userId} mode="me" verified={emailVerified} />}</View>
        </ViewShot>

        {card && distribution && (
          <View className="mx-5 mt-4 rounded-2xl p-4 border" style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder }}>
            <RatingDistributionBars distribution={distribution} />
          </View>
        )}

        {peerSkill && selfTier && peerSkill.tier !== selfTier && (
          <View className="mx-5 mt-3 rounded-2xl px-4 py-3 border" style={{ backgroundColor: "rgba(214,255,63,0.06)", borderColor: colors.cardBorder }}>
            <Text className="text-[13px] font-body-semibold" style={{ color: colors.textSecondary }}>
              You say <Text style={{ color: colors.text, fontWeight: "800" }}>{selfTier}</Text> · your co-players say{" "}
              <Text style={{ color: tierColor(peerSkill.tier), fontWeight: "800" }}>{peerSkill.tier}</Text>
            </Text>
          </View>
        )}

        {!hasPlayedAnything ? (
          <View className="mx-5 mt-6 rounded-2xl p-5 items-center gap-3 border" style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder }}>
            <Ionicons name="tennisball-outline" size={28} color={colors.textMuted} />
            <Text className="font-body-bold text-[15px] text-center" style={{ color: colors.text }}>
              No games yet
            </Text>
            <Text className="text-[13.5px] text-center" style={{ color: colors.textTertiary }}>
              Play your first game to start building your reputation.
            </Text>
            <Pressable
              onPress={() => router.push("/(tabs)/discover")}
              className="rounded-pill px-5 py-2.5 mt-1"
              style={{ backgroundColor: colors.accent }}
            >
              <Text className="font-body-extrabold text-[13.5px]" style={{ color: colors.base }}>
                Find a game
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            {!!streak && streak >= 2 && (
              <Animated.View entering={FadeInUp.delay(60).duration(280)} className="mx-5 mt-4 rounded-2xl px-4 py-3.5 flex-row items-center gap-3 border" style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder }}>
                <Text style={{ fontSize: 26 }}>🔥</Text>
                <View>
                  <Text className="font-body-extrabold text-[15px]" style={{ color: colors.text }}>
                    {streak} week streak
                  </Text>
                  <Text className="text-[12.5px]" style={{ color: colors.textTertiary }}>
                    Played at least once every week
                  </Text>
                </View>
              </Animated.View>
            )}

            {activity && (
              <Animated.View entering={FadeInUp.delay(120).duration(280)} className="flex-row gap-2.5 px-5 mt-3">
                <View className="flex-1 rounded-2xl p-3.5 border" style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder }}>
                  <RollingNumber from={0} to={activity.thisMonthCount} className="font-display-bold text-[19px]" style={{ color: colors.text }} />
                  <Text className="text-[11.5px] font-body-bold mt-0.5" style={{ color: colors.textTertiary }}>
                    This month
                  </Text>
                </View>
                {activity.mostPlayedVenue && (
                  <View className="flex-1 rounded-2xl p-3.5 border justify-center" style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder }}>
                    <Text className="font-body-bold text-[13px]" style={{ color: colors.text }} numberOfLines={1}>
                      {activity.mostPlayedVenue}
                    </Text>
                    <Text className="text-[11.5px] font-body-bold mt-0.5" style={{ color: colors.textTertiary }}>
                      Regular spot
                    </Text>
                  </View>
                )}
                {activity.mostPlayedWhen && (
                  <View className="flex-1 rounded-2xl p-3.5 border justify-center" style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder }}>
                    <Text className="font-body-bold text-[13px]" style={{ color: colors.text }} numberOfLines={1}>
                      {activity.mostPlayedWhen}
                    </Text>
                    <Text className="text-[11.5px] font-body-bold mt-0.5" style={{ color: colors.textTertiary }}>
                      Usual time
                    </Text>
                  </View>
                )}
              </Animated.View>
            )}

            {activity && activity.heatmapDates.length > 0 && (
              <Animated.View entering={FadeInUp.delay(180).duration(280)} className="mx-5 mt-3 rounded-2xl p-4 border items-center" style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder }}>
                <Text className="font-body-extrabold text-[12px] uppercase tracking-wide self-start mb-2.5" style={{ color: colors.textTertiary }}>
                  Last 12 weeks
                </Text>
                <Heatmap grid={heatmapGrid} />
              </Animated.View>
            )}

            {activity && activity.regulars.length > 0 && (
              <Animated.View entering={FadeInUp.delay(240).duration(280)} className="mx-5 mt-3 rounded-2xl p-4 border gap-2.5" style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder }}>
                <Text className="font-body-extrabold text-[12px] uppercase tracking-wide" style={{ color: colors.textTertiary }}>
                  Regulars
                </Text>
                {activity.regulars.map((r) => (
                  <Pressable key={r.id} onPress={() => router.push(`/player/${r.id}`)} className="flex-row items-center gap-2.5">
                    <View className="w-7 h-7 rounded-full items-center justify-center" style={{ backgroundColor: r.color }}>
                      <Text style={{ color: colors.base, fontSize: 11, fontWeight: "800" }}>{r.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text className="flex-1 text-[13.5px] font-body-semibold" style={{ color: colors.text }} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Text className="text-[12.5px] font-body-bold" style={{ color: colors.textMuted }}>
                      {r.gamesTogether}×
                    </Text>
                  </Pressable>
                ))}
              </Animated.View>
            )}

            <Animated.View entering={FadeInUp.delay(300).duration(280)} className="mx-5 mt-3 rounded-2xl p-4 border gap-3" style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder }}>
              <View className="flex-row items-center justify-between">
                <Text className="font-body-extrabold text-[12px] uppercase tracking-wide" style={{ color: colors.textTertiary }}>
                  Achievements
                </Text>
                <TierBadge gamesPlayed={gamesPlayed} />
              </View>
              <View className="flex-row flex-wrap gap-2">
                {ACHIEVEMENTS.map((a) => {
                  const unlocked = a.check({
                    gamesPlayed,
                    gamesHosted,
                    weekStreak: streak ?? 0,
                    distinctVenueCount: activity?.distinctVenueCount ?? 0,
                    hasFiveStarRating: (distribution?.[5] ?? 0) > 0,
                  });
                  return (
                    <View
                      key={a.id}
                      className="flex-row items-center gap-1.5 rounded-pill px-2.5 py-1.5 border"
                      style={{
                        backgroundColor: unlocked ? "rgba(214,255,63,0.1)" : colors.surfaceAlt,
                        borderColor: unlocked ? "rgba(214,255,63,0.3)" : colors.cardBorder,
                        opacity: unlocked ? 1 : 0.5,
                      }}
                    >
                      <Ionicons name={a.icon} size={12} color={unlocked ? colors.accent : colors.textMuted} />
                      <Text className="font-body-bold text-[11.5px]" style={{ color: unlocked ? colors.accentSoft : colors.textMuted }}>
                        {a.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </Animated.View>
          </>
        )}

        {card && (
          <View className="mx-5 mt-4">
            <CompletenessMeter
              input={{
                hasPhoto: !!card.photoPath,
                hasSuburb: !!card.homeSuburb,
                hasTier: !!selfTier,
                emailVerified,
                hasFirstGame: hasPlayedAnything,
              }}
            />
          </View>
        )}

        <View className="px-5 mt-4">
          <Pressable
            onPress={shareCard}
            disabled={sharing}
            className="rounded-2xl py-3.5 items-center flex-row justify-center gap-2 border"
            style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder, opacity: sharing ? 0.6 : 1 }}
          >
            <Ionicons name="image-outline" size={16} color={colors.text} />
            <Text className="font-body-bold text-[13.5px]" style={{ color: colors.text }}>
              Share my card
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}
