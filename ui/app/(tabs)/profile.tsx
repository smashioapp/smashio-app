import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInUp } from "react-native-reanimated";
import ViewShot, { type ViewShotRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { colors, tierColor, RELIABILITY_EXPLAINER, reliabilityLedgerLabel } from "../../lib/theme";
import { useTabBarSpace } from "../../lib/nav";
import { makeScrollHideHandler, registerScrollToTop, unregisterScrollToTop } from "../../lib/navScroll";
import { Screen } from "../../components/Screen";
import { Sheet } from "../../components/Sheet";
import { RollingNumber } from "../../components/RollingNumber";
import { TierBadge } from "../../components/TierBadge";
import { PlayerCard } from "../../components/PlayerCard";
import { Heatmap } from "../../components/Heatmap";
import { RatingDistributionBars } from "../../components/RatingDistributionBars";
import { CompletenessMeter } from "../../components/CompletenessMeter";
import { useSession } from "../../lib/session";
import {
  usePlayerCard,
  useProfileStreak,
  useProfileActivity,
  useLateLeaveCount,
} from "../../lib/queries/profile";
import { useRatingDistribution, usePeerPerceivedSkill } from "../../lib/queries/ratings";
import { useQueryClient } from "@tanstack/react-query";
import { shareReferral } from "../../lib/share";
import { haptics } from "../../lib/haptics";
import { buildWeekHeatmap } from "../../lib/format";
import { ACHIEVEMENTS } from "../../lib/achievements";

export default function Profile() {
  const [reliabilitySheetOpen, setReliabilitySheetOpen] = useState(false);
  const { session } = useSession();
  const userId = session?.user.id;
  const emailVerified = !!session?.user.email_confirmed_at;
  const queryClient = useQueryClient();

  const { data: card } = usePlayerCard(userId);
  const { data: streak } = useProfileStreak(userId);
  const { data: activity } = useProfileActivity(userId);
  const { data: distribution } = useRatingDistribution(userId);
  const { data: peerSkill } = usePeerPerceivedSkill(userId);
  const { data: lateLeaves } = useLateLeaveCount(userId);

  const tabBarSpace = useTabBarSpace();
  const scrollRef = useRef<ScrollView>(null);
  const scrollHide = useRef(makeScrollHideHandler()).current;
  const shotRef = useRef<ViewShotRef>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    registerScrollToTop("profile", () => scrollRef.current?.scrollTo({ y: 0, animated: true }));
    return () => unregisterScrollToTop("profile");
  }, []);

  const invalidateProfile = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["player_card", userId] }),
      queryClient.invalidateQueries({ queryKey: ["profile_streak", userId] }),
      queryClient.invalidateQueries({ queryKey: ["profile_activity", userId] }),
      queryClient.invalidateQueries({ queryKey: ["ratings", "distribution", userId] }),
      queryClient.invalidateQueries({ queryKey: ["ratings", "peer_perceived", userId] }),
      queryClient.invalidateQueries({ queryKey: ["profile_late_leaves", userId] }),
    ]);

  // Play a game, come back — stats were whatever React Query cached until now
  // (profile-plan.md P0: My Games solved this with useFocusEffect, Profile hadn't).
  useFocusEffect(() => {
    invalidateProfile();
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await invalidateProfile();
    setRefreshing(false);
  };

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
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: tabBarSpace }}
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => scrollHide(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={32}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <View className="flex-row justify-end px-5 pt-2">
          <Pressable
            onPress={() => router.push("/settings")}
            className="w-9 h-9 rounded-full items-center justify-center"
            style={{ backgroundColor: colors.surfaceAlt }}
          >
            <Ionicons name="settings-outline" size={17} color={colors.text} />
          </Pressable>
        </View>

        <ViewShot ref={shotRef} options={{ format: "png", quality: 0.92, fileName: "smashio-card" }}>
          <View style={{ backgroundColor: colors.base }}>
            {userId && (
              <PlayerCard
                profileId={userId}
                mode="me"
                onEditPress={() => router.push("/profile-edit")}
                verified={emailVerified}
              />
            )}
          </View>
        </ViewShot>

        {card && (
          <Pressable onPress={() => setReliabilitySheetOpen(true)} className="mx-5 mt-1">
            <Text className="text-[12px] font-body-semibold text-center" style={{ color: colors.textMuted }}>
              {reliabilityLedgerLabel(lateLeaves ?? 0, gamesPlayed)} · tap for details
            </Text>
          </Pressable>
        )}

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

        <View className="flex-row gap-2.5 px-5 mt-4">
          <Pressable
            onPress={shareCard}
            disabled={sharing}
            className="flex-1 rounded-2xl py-3.5 items-center flex-row justify-center gap-2 border"
            style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder, opacity: sharing ? 0.6 : 1 }}
          >
            <Ionicons name="image-outline" size={16} color={colors.text} />
            <Text className="font-body-bold text-[13.5px]" style={{ color: colors.text }}>
              Share my card
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              haptics.tap();
              if (userId) shareReferral(userId);
            }}
            className="flex-1 rounded-2xl py-3.5 items-center flex-row justify-center gap-2"
            style={{ backgroundColor: colors.accent }}
          >
            <Ionicons name="share-social-outline" size={16} color={colors.base} />
            <Text className="font-body-extrabold text-[13.5px]" style={{ color: colors.base }}>
              Invite friends
            </Text>
          </Pressable>
        </View>

        <Sheet visible={reliabilitySheetOpen} onClose={() => setReliabilitySheetOpen(false)} title="Reliability score">
          <Text className="text-[15px] leading-5" style={{ color: colors.textSecondary }}>
            {RELIABILITY_EXPLAINER}
          </Text>
          <Text className="font-display-bold text-[26px] mt-1" style={{ color: colors.accent }}>
            {card?.reliabilityScore ?? "—"}
            <Text className="font-body-semibold text-[14.5px]" style={{ color: colors.textTertiary }}>
              {" "}
              / 100
            </Text>
          </Text>
          <Text className="text-[13.5px] mt-1" style={{ color: colors.textTertiary }}>
            {reliabilityLedgerLabel(lateLeaves ?? 0, gamesPlayed)}
          </Text>
        </Sheet>
      </ScrollView>
    </Screen>
  );
}
