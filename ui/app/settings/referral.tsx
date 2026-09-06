import { View, Text, Pressable, ScrollView } from "react-native";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradients, avatarColor } from "../../lib/theme";
import { Screen } from "../../components/Screen";
import { BackButton } from "../../components/BackButton";
import { Avatar } from "../../components/Avatar";
import { OfflineStatus, SessionExpiredStatus } from "../../components/SubscreenStatus";
import { useSession } from "../../lib/session";
import { useReferralStats, useReferredFriends } from "../../lib/queries/profile";
import { shareReferral } from "../../lib/share";
import { haptics } from "../../lib/haptics";
import { useOnline } from "../../lib/useOnline";
import { isAuthSessionError } from "../../lib/authError";
import { supabase } from "../../lib/supabase";

// Referral & priority spots as a designed object (design-brief.md Prompt 8 item 11) — pulled out
// of a Support row subtitle into its own screen with the credit balance legible. The invite code
// is real (profiles.referral_code, 20260906000000); the per-friend list is "joined" only — there
// is no invite-sent tracking table, so a "pending" row (Prompt 8a group C2) isn't drawn here
// rather than faked.
export default function Referral() {
  const { session, isLoading: sessionLoading } = useSession();
  const online = useOnline();
  const userId = session?.user.id;
  const { data: referrals, error: referralsError, refetch: refetchReferrals } = useReferralStats(userId);
  const { data: friends, error: friendsError } = useReferredFriends(userId);

  const sessionExpired = (!sessionLoading && !session) || isAuthSessionError(referralsError) || isAuthSessionError(friendsError);

  const copyCode = async () => {
    if (!referrals?.code) return;
    await Clipboard.setStringAsync(referrals.code);
    haptics.tap();
  };

  return (
    <Screen>
      <View className="flex-row items-center gap-3 px-5 pt-2 pb-1">
        <BackButton onPress={() => router.back()} />
        <Text className="font-display text-[20px]" style={{ color: colors.text }}>
          Referral & priority spots
        </Text>
      </View>
      {!online ? (
        <OfflineStatus onRetry={() => refetchReferrals()} />
      ) : sessionExpired ? (
        <SessionExpiredStatus
          onSignIn={() => {
            supabase.auth.signOut().catch(() => {});
            router.replace("/onboarding");
          }}
        />
      ) : (
      <ScrollView contentContainerClassName="px-5 pt-4 pb-10 gap-4" showsVerticalScrollIndicator={false}>
        <LinearGradient colors={gradients.accentDiagonal} className="rounded-2xl p-5 items-center">
          <Text className="font-body-bold text-[12px] uppercase" style={{ color: colors.base, letterSpacing: 0.6, opacity: 0.7 }}>
            Priority spot credits
          </Text>
          <Text className="font-display-bold text-[40px] mt-1" style={{ color: colors.base }}>
            {referrals?.credits ?? 0}
          </Text>
          <Text className="text-[12px] text-center mt-1" style={{ color: colors.base, opacity: 0.75 }}>
            Spent automatically to jump a full game's waitlist
          </Text>
        </LinearGradient>

        <View className="rounded-2xl p-4 border gap-3" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
          <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
            Your invite code
          </Text>
          <Pressable onPress={copyCode} className="rounded-2xl py-3.5 items-center flex-row justify-center gap-2" style={{ backgroundColor: colors.surfaceAlt }}>
            <Text className="font-display-bold text-[20px] tracking-[3px]" style={{ color: colors.accent }}>
              {referrals?.code ?? "……"}
            </Text>
            <Ionicons name="copy-outline" size={16} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            onPress={() => userId && shareReferral(userId)}
            className="rounded-pill py-3 items-center"
            style={{ backgroundColor: colors.accent }}
          >
            <Text className="font-body-extrabold text-[13.5px]" style={{ color: colors.base }}>
              Share your invite
            </Text>
          </Pressable>
        </View>

        <View className="gap-2">
          <Text className="font-body-extrabold text-[11.5px] uppercase tracking-wide" style={{ color: colors.textTertiary }}>
            Friends who joined
          </Text>
          {!friends || friends.length === 0 ? (
            <Text className="text-[12.5px]" style={{ color: colors.textSecondary }}>
              Nobody yet — share your code to earn a priority spot credit per friend who joins.
            </Text>
          ) : (
            <View className="rounded-2xl border overflow-hidden px-3.5" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
              {friends.map((f, i) => (
                <View
                  key={f.id}
                  className="flex-row items-center gap-2.5 py-3"
                  style={i < friends.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.cardBorder } : undefined}
                >
                  <View style={{ width: 30, height: 30 }}>
                    <Avatar id={f.id} name={f.display_name} color={avatarColor(f.id)} size={30} photoUri={null} avatarKey={f.avatar_key} />
                  </View>
                  <Text className="flex-1 text-[13.5px] font-body-semibold" style={{ color: colors.text }} numberOfLines={1}>
                    {f.display_name}
                  </Text>
                  <View className="rounded-pill px-2.5 py-1" style={{ backgroundColor: "rgba(53,214,166,0.15)" }}>
                    <Text className="font-body-extrabold text-[10px] uppercase" style={{ color: colors.intermediate }}>
                      Joined
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
      )}
    </Screen>
  );
}
