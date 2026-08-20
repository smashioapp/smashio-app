import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { colors, LAYOUT, reliabilityLabel, reliabilityColor, reliabilityLedgerLabel, RELIABILITY_EXPLAINER } from "../../lib/theme";
import { useTabBarSpace } from "../../lib/nav";
import { makeScrollHideHandler, registerScrollToTop, unregisterScrollToTop } from "../../lib/navScroll";
import { Screen } from "../../components/Screen";
import { Sheet } from "../../components/Sheet";
import { ListRow } from "../../components/ListRow";
import { TierRing, tierProgressLabel } from "../../components/TierRing";
import { BehaviourBadges } from "../../components/BehaviourBadges";
import { useSession } from "../../lib/session";
import { usePlayerCard, useLateLeaveCount } from "../../lib/queries/profile";
import { shareReferral } from "../../lib/share";
import { haptics } from "../../lib/haptics";
import { supabase } from "../../lib/supabase";

// v2 Profile (docs/v2-design-plan.md §4.6) — one anchor (TierRing), a reliability card, a
// games-played line + behaviour chips, then settings rows. Everything the old screen packed in
// below that (rating distribution, peer-perceived skill, streak, activity tiles, heatmap,
// regulars, achievements, completeness, share-my-card) moved wholesale to /profile-stats —
// reached from the "Stats & achievements ›" row. Nothing in backlog B14 is deleted.
export default function Profile() {
  const [reliabilitySheetOpen, setReliabilitySheetOpen] = useState(false);
  const { session } = useSession();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  const { data: card } = usePlayerCard(userId);
  const { data: lateLeaves } = useLateLeaveCount(userId);

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
  const selfTier = card?.sports.find((s) => s.sportSlug === "badminton")?.tierLabel ?? card?.sports[0]?.tierLabel ?? null;
  const photoUrl = card?.photoPath ? supabase.storage.from("avatars").getPublicUrl(card.photoPath).data.publicUrl : null;

  return (
    <Screen>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: tabBarSpace, paddingTop: 24 }}
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => scrollHide(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={32}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {userId && card && (
          <TierRing
            profileId={userId}
            name={card.displayName}
            photoUri={photoUrl}
            gamesPlayed={gamesPlayed}
            subtitle={tierProgressLabel(gamesPlayed, selfTier)}
            onPress={() => router.push("/profile-edit")}
          />
        )}

        {card && (
          <View className="flex-row mt-5" style={{ paddingHorizontal: LAYOUT.SCREEN_PAD }}>
            <View
              className="flex-1 flex-row rounded-2xl border"
              style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder, padding: 16 }}
            >
              <View className="items-start" style={{ flex: 1 }}>
                <Text className="font-display text-[30px]" style={{ color: reliabilityColor(card.reliabilityScore) }}>
                  {card.reliabilityScore}
                </Text>
                <Text className="text-[12.5px] font-body-bold mt-0.5" style={{ color: colors.textSecondary }}>
                  Reliability · {reliabilityLabel(card.reliabilityScore)}
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: colors.cardBorder, marginHorizontal: 14 }} />
              <View className="justify-center" style={{ flex: 1 }}>
                <Text className="text-[12.5px] font-body-semibold" style={{ color: colors.textSecondary }}>
                  {reliabilityLedgerLabel(lateLeaves ?? 0, gamesPlayed)}
                </Text>
                <Pressable onPress={() => setReliabilitySheetOpen(true)} hitSlop={6} className="mt-1.5">
                  <Text className="text-[12px] font-body-bold" style={{ color: colors.textTertiary }}>
                    What's this? ›
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {card && (
          <View className="mt-5" style={{ paddingHorizontal: LAYOUT.SCREEN_PAD }}>
            <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
              {gamesPlayed} {gamesPlayed === 1 ? "game" : "games"} played
            </Text>
            {Object.keys(card.badgeCounts).length > 0 && (
              <View className="mt-2.5">
                <BehaviourBadges counts={card.badgeCounts} />
              </View>
            )}
          </View>
        )}

        <View className="mt-6">
          <ListRow title="Stats & achievements" accessory="chevron" onPress={() => router.push("/profile-stats")} />
        </View>

        <View className="mt-4">
          <ListRow title="Edit profile" accessory="chevron" onPress={() => router.push("/profile-edit")} />
          <ListRow title="Notification settings" accessory="chevron" onPress={() => router.push("/notification-settings")} />
          <Pressable
            onPress={() => {
              haptics.tap();
              if (userId) shareReferral(userId);
            }}
            style={{ paddingHorizontal: LAYOUT.SCREEN_PAD }}
          >
            <View
              className="flex-row items-center justify-between"
              style={{ paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: LAYOUT.HAIRLINE }}
            >
              <Text className="font-body-semibold text-[13.5px]" style={{ color: colors.text }}>
                Invite friends
              </Text>
              <View className="rounded-pill px-2.5 py-1" style={{ backgroundColor: colors.accent }}>
                <Text className="font-body-extrabold text-[10.5px] uppercase" style={{ color: colors.base, letterSpacing: 0.4 }}>
                  Earn badges
                </Text>
              </View>
            </View>
          </Pressable>
          <ListRow title="Settings" accessory="chevron" onPress={() => router.push("/settings")} testID="profile-settings" />
          <ListRow title="Delete account" accessory="chevron" danger divider={false} onPress={() => router.push("/delete-account")} />
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
