import { View, Text, Pressable, ScrollView } from "react-native";
import { router } from "expo-router";
import { colors, gradients, initial, tierColor } from "../../lib/theme";
import { LinearGradient } from "expo-linear-gradient";
import { Screen } from "../../components/Screen";
import { Badge } from "../../components/Badge";
import { useSession } from "../../lib/session";
import { useProfile, useProfileSports, useProfileStats } from "../../lib/queries/profile";
import { signOut } from "../../lib/auth";

const ROWS = ["Edit profile", "Notifications", "Payment methods"];

export default function Profile() {
  const { session } = useSession();
  const userId = session?.user.id;
  const emailVerified = !!session?.user.email_confirmed_at;
  const { data: profile } = useProfile(userId);
  const { data: profileSports } = useProfileSports(userId);
  const { data: stats } = useProfileStats(userId);

  const displayName = profile?.display_name || "—";
  const displaySuburb = profile?.home_suburb || "—";
  const skill = profileSports?.[0]?.skill_tiers?.label ?? "Intermediate";
  const color = tierColor(skill);
  const reliabilityStars = profile ? Math.round(profile.reliability_score / 20) : 0;
  const memberSinceYear = profile ? new Date(profile.created_at).getFullYear() : "—";

  const handleLogout = async () => {
    await signOut();
    router.replace("/onboarding");
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
        <View className="items-center gap-2 px-6 pt-2 pb-4">
          <View
            className="w-[84px] h-[84px] rounded-full items-center justify-center"
            style={{ backgroundColor: colors.pro }}
          >
            <Text className="font-display text-[24px]" style={{ color: colors.base }}>
              {initial(displayName)}
            </Text>
          </View>
          <Text className="font-display text-[20px]" style={{ color: colors.text }}>
            {displayName}
          </Text>
          <Text className="text-[12px]" style={{ color: colors.textTertiary }}>
            {displaySuburb}
          </Text>
          <View className="rounded-pill px-3.5 py-1.5 mt-0.5" style={{ backgroundColor: color + "22" }}>
            <Text className="font-body-extrabold text-[11px] uppercase" style={{ color }}>
              {skill}
            </Text>
          </View>
        </View>

        <View className="flex-row flex-wrap gap-2.5 px-5">
          <LinearGradient colors={gradients.card} className="rounded-2xl p-3.5 items-center border" style={{ borderColor: colors.cardBorder, width: "47%" }}>
            <Text className="font-display-bold text-[22px]" style={{ color: colors.text }}>
              {stats?.gamesPlayed ?? "—"}
            </Text>
            <Text className="text-[10.5px] font-body-bold mt-0.5" style={{ color: colors.textTertiary }}>
              Games played
            </Text>
          </LinearGradient>
          <LinearGradient colors={gradients.card} className="rounded-2xl p-3.5 items-center border" style={{ borderColor: colors.cardBorder, width: "47%" }}>
            <View className="flex-row gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <Text key={n} style={{ fontSize: 16, color: n <= reliabilityStars ? colors.accent : "rgba(255,255,255,0.15)" }}>
                  ★
                </Text>
              ))}
            </View>
            <Text className="text-[10.5px] font-body-bold mt-1" style={{ color: colors.textTertiary }}>
              Reliability
            </Text>
          </LinearGradient>
          <LinearGradient colors={gradients.card} className="rounded-2xl p-3.5 items-center border" style={{ borderColor: colors.cardBorder, width: "47%" }}>
            <Text className="font-display-bold text-[22px]" style={{ color: colors.text }}>
              {memberSinceYear}
            </Text>
            <Text className="text-[10.5px] font-body-bold mt-0.5" style={{ color: colors.textTertiary }}>
              Member since
            </Text>
          </LinearGradient>
        </View>

        <LinearGradient
          colors={gradients.card}
          className="rounded-2xl mx-5 mt-4 border overflow-hidden"
          style={{ borderColor: colors.cardBorder }}
        >
          {ROWS.map((row, i) => (
            <View
              key={row}
              className="flex-row justify-between items-center px-3.5 py-3.5"
              style={{ borderBottomWidth: i < ROWS.length ? 1 : 0, borderColor: "rgba(255,255,255,0.06)" }}
            >
              <Text className="text-[13.5px] font-body-semibold" style={{ color: colors.text }}>
                {row}
              </Text>
              <Text style={{ color: colors.textMuted }}>›</Text>
            </View>
          ))}
          <View className="flex-row justify-between items-center px-3.5 py-3.5" style={{ borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}>
            <Text className="text-[13.5px] font-body-semibold" style={{ color: colors.text }}>
              Email verified
            </Text>
            {emailVerified ? (
              <Badge state="verified" label="Verified" />
            ) : (
              <Badge state="pending" label="Unverified" />
            )}
          </View>
          <Pressable className="flex-row justify-between items-center px-3.5 py-3.5" onPress={handleLogout}>
            <Text className="text-[13.5px] font-body-semibold" style={{ color: colors.danger }}>
              Log out
            </Text>
          </Pressable>
        </LinearGradient>
      </ScrollView>
    </Screen>
  );
}
