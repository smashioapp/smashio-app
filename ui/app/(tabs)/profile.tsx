import { useEffect, useRef, useState } from "react";
import { View, Text, Image, Pressable, ScrollView, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, gradients, initial, tierColor, RELIABILITY_EXPLAINER } from "../../lib/theme";
import { useTabBarSpace } from "../../lib/nav";
import { makeScrollHideHandler, registerScrollToTop, unregisterScrollToTop } from "../../lib/navScroll";
import { LinearGradient } from "expo-linear-gradient";
import { Screen } from "../../components/Screen";
import { Badge } from "../../components/Badge";
import { Sheet } from "../../components/Sheet";
import { RollingNumber } from "../../components/RollingNumber";
import { ReliabilityGauge } from "../../components/ReliabilityGauge";
import { TierBadge } from "../../components/TierBadge";
import { useSession } from "../../lib/session";
import { supabase } from "../../lib/supabase";
import { useProfile, useProfileSports, useProfileStats } from "../../lib/queries/profile";
import { signOut } from "../../lib/auth";
import { shareReferral } from "../../lib/share";
import { haptics } from "../../lib/haptics";

const ROWS = [
  { label: "Edit profile", href: "/profile-edit" as const },
  { label: "Notifications", href: "/notification-settings" as const },
];

export default function Profile() {
  const [reliabilitySheetOpen, setReliabilitySheetOpen] = useState(false);
  const { session } = useSession();
  const userId = session?.user.id;
  const emailVerified = !!session?.user.email_confirmed_at;
  const { data: profile } = useProfile(userId);
  const { data: profileSports } = useProfileSports(userId);
  const { data: stats } = useProfileStats(userId);
  const tabBarSpace = useTabBarSpace();
  const scrollRef = useRef<ScrollView>(null);
  const scrollHide = useRef(makeScrollHideHandler()).current;

  useEffect(() => {
    registerScrollToTop("profile", () => scrollRef.current?.scrollTo({ y: 0, animated: true }));
    return () => unregisterScrollToTop("profile");
  }, []);

  const displayName = profile?.display_name || "—";
  const displaySuburb = profile?.home_suburb || "—";
  const skill = profileSports?.[0]?.skill_tiers?.label ?? "Intermediate";
  const color = tierColor(skill);
  const memberSinceYear = profile ? new Date(profile.created_at).getFullYear() : "—";
  const photoUrl = profile?.photo_path
    ? supabase.storage.from("avatars").getPublicUrl(profile.photo_path).data.publicUrl
    : null;

  const handleLogout = async () => {
    await signOut();
    router.replace("/onboarding");
  };

  return (
    <Screen>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: tabBarSpace }}
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => scrollHide(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={32}
      >
        <View className="items-center gap-2 px-6 pt-2 pb-4">
          <View
            className="w-[84px] h-[84px] rounded-full items-center justify-center overflow-hidden"
            style={{ backgroundColor: colors.pro }}
          >
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} className="w-[84px] h-[84px]" />
            ) : (
              <Text className="font-display text-[24.5px]" style={{ color: colors.base }}>
                {initial(displayName)}
              </Text>
            )}
          </View>
          <Text className="font-display text-[20.5px]" style={{ color: colors.text }}>
            {displayName}
          </Text>
          <Text className="text-[14px]" style={{ color: colors.textTertiary }}>
            {displaySuburb}
          </Text>
          <View className="rounded-pill px-3.5 py-1.5 mt-0.5" style={{ backgroundColor: color + "22" }}>
            <Text className="font-body-extrabold text-[13px] uppercase" style={{ color }}>
              {skill}
            </Text>
          </View>
        </View>

        <View className="flex-row flex-wrap gap-2.5 px-5">
          <LinearGradient colors={gradients.card} className="rounded-2xl p-3.5 items-center border" style={{ borderColor: colors.cardBorder, width: "47%" }}>
            <RollingNumber from={0} to={stats?.gamesPlayed ?? 0} className="font-display-bold text-[22.5px]" style={{ color: colors.text }} />
            <Text className="text-[12.5px] font-body-bold mt-0.5" style={{ color: colors.textTertiary }}>
              Games played
            </Text>
            <View className="mt-1.5">
              <TierBadge gamesPlayed={stats?.gamesPlayed ?? 0} />
            </View>
          </LinearGradient>
          <Pressable style={{ width: "47%" }} onPress={() => setReliabilitySheetOpen(true)}>
            <LinearGradient colors={gradients.card} className="rounded-2xl p-3.5 items-center border" style={{ borderColor: colors.cardBorder }}>
              <ReliabilityGauge score={profile?.reliability_score ?? 0} />
              <View className="flex-row items-center gap-1 mt-1">
                <Text className="text-[12.5px] font-body-bold" style={{ color: colors.textTertiary }}>
                  Reliability
                </Text>
                <Ionicons name="information-circle-outline" size={12} color={colors.textMuted} />
              </View>
            </LinearGradient>
          </Pressable>
        </View>

        <LinearGradient
          colors={gradients.accentDiagonal}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="rounded-2xl mx-5 mt-2.5 px-4 py-3.5 flex-row items-center justify-between"
        >
          <View>
            <Text className="font-body-extrabold text-[11.5px] uppercase tracking-wide" style={{ color: "rgba(10,10,11,0.6)" }}>
              Member since
            </Text>
            <Text className="font-display-bold text-[20px]" style={{ color: colors.base }}>
              {memberSinceYear}
            </Text>
          </View>
          <Ionicons name="ribbon-outline" size={26} color="rgba(10,10,11,0.55)" />
        </LinearGradient>

        <Sheet visible={reliabilitySheetOpen} onClose={() => setReliabilitySheetOpen(false)} title="Reliability score">
          <Text className="text-[15px] leading-5" style={{ color: colors.textSecondary }}>
            {RELIABILITY_EXPLAINER}
          </Text>
          <Text className="font-display-bold text-[26px] mt-1" style={{ color: colors.accent }}>
            {profile?.reliability_score ?? "—"}
            <Text className="font-body-semibold text-[14.5px]" style={{ color: colors.textTertiary }}>
              {" "}
              / 100
            </Text>
          </Text>
        </Sheet>

        <LinearGradient
          colors={gradients.card}
          className="rounded-2xl mx-5 mt-4 border overflow-hidden"
          style={{ borderColor: colors.cardBorder }}
        >
          <Pressable
            onPress={() => {
              haptics.tap();
              shareReferral();
            }}
            className="flex-row justify-between items-center px-3.5 py-3.5"
            style={{ borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}
          >
            <Text className="text-[15px] font-body-semibold" style={{ color: colors.accent }}>
              Invite friends
            </Text>
            <Ionicons name="share-social-outline" size={16} color={colors.accent} />
          </Pressable>
          {ROWS.map((row) => (
            <Pressable
              key={row.label}
              onPress={() => router.push(row.href)}
              className="flex-row justify-between items-center px-3.5 py-3.5"
              style={{ borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}
            >
              <Text className="text-[15px] font-body-semibold" style={{ color: colors.text }}>
                {row.label}
              </Text>
              <Text style={{ color: colors.textMuted }}>›</Text>
            </Pressable>
          ))}
          <View className="flex-row justify-between items-center px-3.5 py-3.5" style={{ borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}>
            <Text className="text-[15px] font-body-semibold" style={{ color: colors.text }}>
              Email verified
            </Text>
            {emailVerified ? (
              <Badge state="verified" label="Verified" />
            ) : (
              <Badge state="pending" label="Unverified" />
            )}
          </View>
          <Pressable
            className="flex-row justify-between items-center px-3.5 py-3.5"
            style={{ borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}
            onPress={handleLogout}
          >
            <Text className="text-[15px] font-body-semibold" style={{ color: colors.danger }}>
              Log out
            </Text>
          </Pressable>
          {/* Play's User Data policy requires this in-app, not just on the website. */}
          <Pressable
            className="flex-row justify-between items-center px-3.5 py-3.5"
            onPress={() => router.push("/delete-account")}
          >
            <Text className="text-[15px] font-body-semibold" style={{ color: colors.danger }}>
              Delete account
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.danger} />
          </Pressable>
        </LinearGradient>
      </ScrollView>
    </Screen>
  );
}
