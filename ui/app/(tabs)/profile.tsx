import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, NativeSyntheticEvent, NativeScrollEvent, ActivityIndicator } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import ViewShot, { type ViewShotRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { colors, LAYOUT, gamesPlayedTier, nextGamesPlayedTier, reliabilityLedgerLabel, RELIABILITY_EXPLAINER, avatarColor, type TierId } from "../../lib/theme";
import { useTabBarSpace } from "../../lib/nav";
import { makeScrollHideHandler, registerScrollToTop, unregisterScrollToTop } from "../../lib/navScroll";
import { Screen } from "../../components/Screen";
import { Sheet } from "../../components/Sheet";
import { Avatar } from "../../components/Avatar";
import { SegmentedToggle } from "../../components/SegmentedToggle";
import { ReputationGrid } from "../../components/ReputationGrid";
import { TrophyCase } from "../../components/TrophyCase";
import { ShareCard, type ShareCardFormat } from "../../components/ShareCard";
import { Heatmap } from "../../components/Heatmap";
import { CompletenessMeter } from "../../components/CompletenessMeter";
import { ACHIEVEMENTS } from "../../lib/achievements";
import { buildWeekHeatmap } from "../../lib/format";
import { useSession } from "../../lib/session";
import { usePlayerCard, useLateLeaveCount, useProfileStreak, useProfileActivity } from "../../lib/queries/profile";
import { haptics } from "../../lib/haptics";
import { supabase } from "../../lib/supabase";

type Tab = "overview" | "history" | "trophy";

// v2.1 Profile (design/23bc2cae "profile & reputation redesign") — one scrolling screen, a
// segmented Overview/History/Trophy-case toggle instead of a separate /profile-stats route.
// Reputation (reliability · rating · peer tier · badges) sits directly under the header on
// Overview — no longer a tap away. Settings and Edit profile are satellite screens reached via
// the header gear and the avatar tap, not rows competing with reputation for scroll weight.
export default function Profile() {
  const [tab, setTab] = useState<Tab>("overview");
  const [reliabilitySheetOpen, setReliabilitySheetOpen] = useState(false);
  const [shareFormat, setShareFormat] = useState<ShareCardFormat>("square");
  const [sharing, setSharing] = useState(false);
  const { session } = useSession();
  const userId = session?.user.id;
  const emailVerified = !!session?.user.email_confirmed_at;
  const queryClient = useQueryClient();

  const { data: card, isLoading: cardLoading, isError: cardError, refetch: refetchCard } = usePlayerCard(userId);
  const { data: lateLeaves } = useLateLeaveCount(userId);
  const { data: streak } = useProfileStreak(userId);
  const { data: activity } = useProfileActivity(userId);

  const shotRef = useRef<ViewShotRef>(null);
  const tabBarSpace = useTabBarSpace();
  const scrollRef = useRef<ScrollView>(null);
  const scrollHide = useRef(makeScrollHideHandler()).current;
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    registerScrollToTop("profile", () => scrollRef.current?.scrollTo({ y: 0, animated: true }));
    return () => unregisterScrollToTop("profile");
  }, []);

  const invalidateProfile = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["player_card", userId] }),
      queryClient.invalidateQueries({ queryKey: ["profile_late_leaves", userId] }),
      queryClient.invalidateQueries({ queryKey: ["profile_streak", userId] }),
      queryClient.invalidateQueries({ queryKey: ["profile_activity", userId] }),
    ]);

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
  const photoUrl = card?.photoPath ? supabase.storage.from("avatars").getPublicUrl(card.photoPath).data.publicUrl : null;

  const tier = gamesPlayedTier(gamesPlayed);
  const next = nextGamesPlayedTier(gamesPlayed);
  const currentMin = tier.id === "Gold" ? 25 : tier.id === "Silver" ? 10 : 0;
  const tierFraction = next ? Math.min(1, Math.max(0, (gamesPlayed - currentMin) / (next.min - currentMin))) : 1;

  const heatmapGrid = buildWeekHeatmap(activity?.heatmapDates ?? []);
  const achievementCtx = {
    gamesPlayed,
    gamesHosted,
    weekStreak: streak ?? 0,
    distinctVenueCount: activity?.distinctVenueCount ?? 0,
    hasFiveStarRating: false,
  };
  const achievementsEarned = ACHIEVEMENTS.filter((a) => a.check(achievementCtx)).length;

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
        contentContainerStyle={{ paddingBottom: tabBarSpace, paddingTop: 24 }}
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => scrollHide(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={32}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <View className="flex-row items-center justify-between" style={{ paddingHorizontal: LAYOUT.SCREEN_PAD }}>
          <Text className="font-display text-[26px]" style={{ color: colors.text }}>
            Profile
          </Text>
          <Pressable
            onPress={() => router.push("/settings")}
            hitSlop={8}
            className="w-9 h-9 rounded-full items-center justify-center border"
            style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder }}
            testID="profile-settings-gear"
          >
            <Ionicons name="settings-outline" size={16} color={colors.textTertiary} />
          </Pressable>
        </View>

        {cardLoading && (
          <View className="items-center justify-center" style={{ paddingVertical: 60 }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        )}

        {cardError && !cardLoading && (
          <View className="items-center justify-center gap-3" style={{ paddingVertical: 60, paddingHorizontal: 32 }}>
            <View className="rounded-full items-center justify-center border" style={{ width: 52, height: 52, backgroundColor: colors.surface, borderColor: colors.cardBorder }}>
              <Ionicons name="alert" size={20} color={colors.textSecondary} />
            </View>
            <Text className="font-body-bold text-[14.5px] text-center" style={{ color: colors.text }}>
              Couldn't load your reputation
            </Text>
            <Text className="text-[12.5px] text-center" style={{ color: colors.textSecondary }}>
              Your numbers are safe, this is just a connection hiccup, not a score.
            </Text>
            <Pressable onPress={() => refetchCard()} className="rounded-pill px-5 py-2.5 mt-1" style={{ backgroundColor: colors.accent }}>
              <Text className="font-body-extrabold text-[13px]" style={{ color: colors.base }}>
                Retry
              </Text>
            </Pressable>
          </View>
        )}

        {userId && card && !cardLoading && (
          <>
            <View className="flex-row items-center gap-3.5 mt-2" style={{ paddingHorizontal: LAYOUT.SCREEN_PAD }}>
              <Pressable onPress={() => router.push("/profile-edit")} accessibilityRole="button" accessibilityLabel="Edit profile">
                <View style={{ width: 64, height: 64 }}>
                  <Avatar id={userId} name={card.displayName} color={avatarColor(userId)} size={64} photoUri={photoUrl} avatarKey={card.avatarKey} />
                  <View
                    className="absolute rounded-full items-center justify-center"
                    style={{ bottom: -3, right: -3, width: 24, height: 24, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.base }}
                  >
                    <Ionicons name="pencil" size={11} color={colors.base} />
                  </View>
                </View>
              </Pressable>
              <View className="flex-1 min-w-0">
                <Text className="font-display-bold text-[19px]" style={{ color: colors.text }} numberOfLines={1}>
                  {card.displayName}
                </Text>
                {hasPlayedAnything ? (
                  <View className="flex-row gap-1.5 mt-1.5">
                    <View className="rounded-pill px-2.5 py-1" style={{ backgroundColor: tier.color + "22" }}>
                      <Text className="font-body-extrabold text-[10px] uppercase" style={{ color: tier.color, letterSpacing: 0.3 }}>
                        {tier.id}
                      </Text>
                    </View>
                    <View className="rounded-pill px-2.5 py-1 border" style={{ borderColor: colors.cardBorder }}>
                      <Text className="font-body-semibold text-[10px]" style={{ color: colors.textTertiary }}>
                        Member since {new Date(card.memberSince).getFullYear()}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <Text className="text-[12px] mt-1" style={{ color: colors.textSecondary }}>
                    New player · joined today
                  </Text>
                )}
              </View>
            </View>

            <View className="flex-row gap-5 mt-4" style={{ paddingHorizontal: LAYOUT.SCREEN_PAD }}>
              <Pressable onPress={() => router.push(`/player-followers/${userId}`)}>
                <Text className="font-body-bold text-[13.5px]" style={{ color: colors.text }}>
                  {card.followerCount} <Text style={{ color: colors.textTertiary }}>followers</Text>
                </Text>
              </Pressable>
              <Pressable onPress={() => router.push(`/player-following/${userId}`)}>
                <Text className="font-body-bold text-[13.5px]" style={{ color: colors.text }}>
                  {card.followingCount} <Text style={{ color: colors.textTertiary }}>following</Text>
                </Text>
              </Pressable>
            </View>

            <View className="mt-6" style={{ paddingHorizontal: LAYOUT.SCREEN_PAD }}>
              <SegmentedToggle
                fullWidth
                options={[
                  { key: "overview" as const, label: "Overview" },
                  { key: "history" as const, label: "History", locked: !hasPlayedAnything },
                  { key: "trophy" as const, label: "Trophy case", locked: !hasPlayedAnything },
                ]}
                value={tab}
                onChange={setTab}
              />
            </View>

            <View className="mt-5" style={{ paddingHorizontal: LAYOUT.SCREEN_PAD }}>
              {tab === "overview" && (
                <>
                  {!hasPlayedAnything ? (
                    <View
                      className="rounded-2xl border items-center"
                      style={{ backgroundColor: "rgba(214,255,63,0.05)", borderColor: "rgba(214,255,63,0.3)", padding: 20 }}
                    >
                      <Text className="font-display-bold text-[17px] text-center" style={{ color: colors.text }}>
                        Your reputation kicks off with game one
                      </Text>
                      <Text className="text-[12.5px] text-center mt-1.5" style={{ color: colors.textDim }}>
                        Reliability, badges and how other players rate your skill all unlock once you've played.
                      </Text>
                      <Pressable
                        onPress={() => router.push("/(tabs)/discover")}
                        className="rounded-pill items-center justify-center mt-4"
                        style={{ backgroundColor: colors.accent, height: 46, paddingHorizontal: 24 }}
                      >
                        <Text className="font-body-extrabold text-[13.5px]" style={{ color: colors.base }}>
                          FIND A GAME NEAR YOU
                        </Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View>
                      <Text className="font-body-extrabold text-[11px] uppercase tracking-wide mb-2" style={{ color: colors.textTertiary }}>
                        Reputation · what hosts and players see
                      </Text>
                      <ReputationGrid
                        reliabilityScore={card.reliabilityScore}
                        reliabilityCoaching={reliabilityLedgerLabel(lateLeaves ?? 0, gamesPlayed)}
                        ratingAvg={card.ratingAvg}
                        ratingCount={card.ratingCount}
                        showRating
                        peerTier={(card.peerSkillLabel as TierId | null) ?? null}
                        peerVoteCount={card.peerSkillVotes ?? 0}
                        badgeCounts={card.badgeCounts}
                        onReliabilityPress={() => setReliabilitySheetOpen(true)}
                      />
                    </View>
                  )}

                  <View className="mt-5" style={{ opacity: hasPlayedAnything ? 1 : 0.4 }}>
                    <View className="rounded-2xl border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder, padding: 16 }}>
                      <View className="flex-row items-center justify-between">
                        <Text className="font-body-bold text-[12.5px]" style={{ color: colors.text }}>
                          {tier.id} · {gamesPlayed} game{gamesPlayed === 1 ? "" : "s"} played
                        </Text>
                        {!!streak && streak >= 2 && (
                          <View className="rounded-pill px-2.5 py-1" style={{ backgroundColor: colors.surfaceAlt }}>
                            <Text className="text-[11px] font-body-bold" style={{ color: colors.textDim }}>
                              🔥 {streak}-week streak
                            </Text>
                          </View>
                        )}
                      </View>
                      <View className="h-[6px] rounded-pill overflow-hidden mt-2" style={{ backgroundColor: colors.surfaceAlt }}>
                        <View className="h-full rounded-pill" style={{ width: `${tierFraction * 100}%`, backgroundColor: tier.color }} />
                      </View>
                      <Text className="text-[11px] mt-1.5" style={{ color: colors.textSecondary }}>
                        {next ? `${next.min - gamesPlayed} game${next.min - gamesPlayed === 1 ? "" : "s"} to ${next.id}` : "Top tier"}
                      </Text>
                    </View>
                  </View>

                  {!hasPlayedAnything && (
                    <View className="mt-4">
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

                  {hasPlayedAnything && (
                    <>
                      <View className="flex-row justify-center mt-5" style={{ gap: 8 }}>
                        <FormatPill label="Square" active={shareFormat === "square"} onPress={() => setShareFormat("square")} />
                        <FormatPill label="Story" active={shareFormat === "story"} onPress={() => setShareFormat("story")} />
                      </View>
                      <Pressable
                        onPress={shareCard}
                        disabled={sharing}
                        className="rounded-pill items-center justify-center flex-row mt-3"
                        style={{ height: 52, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.cardBorder, opacity: sharing ? 0.6 : 1, gap: 8 }}
                      >
                        <Text className="font-body-bold text-[13.5px]" style={{ color: colors.text }}>
                          Share my card ↗
                        </Text>
                      </Pressable>
                      <View style={{ position: "absolute", opacity: 0, top: -9999, left: -9999 }} pointerEvents="none">
                        <ViewShot ref={shotRef} options={{ format: "png", quality: 0.92, fileName: "smashio-card" }}>
                          <ShareCard
                            card={card}
                            photoUrl={photoUrl}
                            weekStreak={streak ?? 0}
                            achievementsEarned={achievementsEarned}
                            achievementsTotal={ACHIEVEMENTS.length}
                            format={shareFormat}
                          />
                        </ViewShot>
                      </View>
                    </>
                  )}
                </>
              )}

              {tab === "history" && hasPlayedAnything && (
                <View className="gap-4">
                  {activity && activity.heatmapDates.length > 0 && (
                    <View className="rounded-2xl border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder, padding: 16 }}>
                      <View className="flex-row justify-between items-baseline">
                        <Text className="font-body-bold text-[12.5px]" style={{ color: colors.text }}>
                          Last 12 weeks
                        </Text>
                        <Text className="text-[11px]" style={{ color: colors.textSecondary }}>
                          {activity.heatmapDates.length} games
                        </Text>
                      </View>
                      <View className="mt-3">
                        <Heatmap grid={heatmapGrid} />
                      </View>
                      <View className="flex-row mt-4 pt-3.5 border-t" style={{ borderColor: colors.cardBorder, gap: 14 }}>
                        <View style={{ flex: 1 }}>
                          <Text className="font-display-bold text-[17px]" style={{ color: colors.text }}>
                            {activity.thisMonthCount}
                          </Text>
                          <Text className="text-[10.5px] mt-0.5" style={{ color: colors.textSecondary }}>
                            this month
                          </Text>
                        </View>
                        {!!streak && (
                          <View style={{ flex: 1 }}>
                            <Text className="font-display-bold text-[17px]" style={{ color: colors.text }}>
                              🔥{streak}wk
                            </Text>
                            <Text className="text-[10.5px] mt-0.5" style={{ color: colors.textSecondary }}>
                              streak
                            </Text>
                          </View>
                        )}
                        {activity.mostPlayedVenue && (
                          <View style={{ flex: 1 }}>
                            <Text className="text-[13px] font-body-bold" style={{ color: colors.text }} numberOfLines={1}>
                              {activity.mostPlayedVenue}
                            </Text>
                            <Text className="text-[10.5px] mt-0.5" style={{ color: colors.textSecondary }}>
                              regular spot
                            </Text>
                          </View>
                        )}
                        {activity.mostPlayedWhen && (
                          <View style={{ flex: 1 }}>
                            <Text className="text-[13px] font-body-bold" style={{ color: colors.text }} numberOfLines={1}>
                              {activity.mostPlayedWhen}
                            </Text>
                            <Text className="text-[10.5px] mt-0.5" style={{ color: colors.textSecondary }}>
                              usual time
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  )}

                  {activity && activity.regulars.length > 0 && (
                    <View>
                      <Text className="font-body-extrabold text-[11.5px] uppercase tracking-wide mb-2" style={{ color: colors.textTertiary }}>
                        Regulars
                      </Text>
                      {activity.regulars.map((r) => (
                        <Pressable
                          key={r.id}
                          onPress={() => router.push(`/player/${r.id}`)}
                          className="flex-row items-center gap-2.5"
                          style={{ paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: LAYOUT.HAIRLINE }}
                        >
                          <View className="rounded-full items-center justify-center" style={{ width: 34, height: 34, backgroundColor: r.color }}>
                            <Text style={{ color: colors.base, fontSize: 12, fontWeight: "800" }}>{r.name.charAt(0).toUpperCase()}</Text>
                          </View>
                          <Text className="flex-1 text-[13.5px] font-body-semibold" style={{ color: colors.text }} numberOfLines={1}>
                            {r.name}
                          </Text>
                          <Text className="text-[12px] font-body-bold" style={{ color: colors.textSecondary }}>
                            {r.gamesTogether}×
                          </Text>
                          <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
                        </Pressable>
                      ))}
                    </View>
                  )}

                  {activity && (
                    <View>
                      <Text className="font-body-extrabold text-[11.5px] uppercase tracking-wide" style={{ color: colors.textTertiary }}>
                        Distinct venues
                      </Text>
                      <Text className="font-display-bold text-[20px] mt-1" style={{ color: colors.text }}>
                        {activity.distinctVenueCount} venue{activity.distinctVenueCount === 1 ? "" : "s"} played
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {tab === "trophy" && hasPlayedAnything && <TrophyCase ctx={achievementCtx} />}
            </View>
          </>
        )}

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

function FormatPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="rounded-pill px-4 py-1.5"
      style={{ backgroundColor: active ? colors.accent : colors.surface, borderWidth: active ? 0 : 1, borderColor: colors.cardBorder }}
    >
      <Text className="font-body-bold text-[11.5px]" style={{ color: active ? colors.base : colors.textSecondary }}>
        {label}
      </Text>
    </Pressable>
  );
}
