import { useEffect, useState } from "react";
import { View, Text, Pressable, Linking, Alert, ScrollView, Switch, Platform } from "react-native";
import { router } from "expo-router";
import * as StoreReview from "expo-store-review";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradients } from "../lib/theme";
import { Screen } from "../components/Screen";
import { BackButton } from "../components/BackButton";
import { Badge } from "../components/Badge";
import { Sheet } from "../components/Sheet";
import { ListRow, RowSectionLabel } from "../components/ListRow";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { signOut } from "../lib/auth";
import { useProfile, useReferralStats } from "../lib/queries/profile";
import { useSetNotificationCategory, useNotificationPrefs } from "../lib/queries/notificationPrefs";
import { useBlockedPlayers } from "../lib/queries/settings";
import { shareReferral } from "../lib/share";
import { sound } from "../lib/sound";
import { loadSoundEnabled, saveSoundEnabled } from "../lib/soundPrefs";

function referralSubtitle(referrals: { count: number; credits: number } | undefined): string | undefined {
  if (!referrals) return undefined;
  const { count, credits } = referrals;
  const friends = count === 0 ? "No friends joined yet" : count === 1 ? "1 friend joined" : `${count} friends joined`;
  if (credits > 0) return `${friends} · ${credits} priority spot${credits > 1 ? "s" : ""} ready to use`;
  return friends;
}

function providerLabel(provider: string | undefined): string {
  if (provider === "google") return "Google";
  if (provider === "apple") return "Apple";
  return "Email & password";
}

function Group({ children }: { children: React.ReactNode }) {
  return (
    <LinearGradient
      colors={gradients.card}
      className="rounded-2xl border overflow-hidden px-3.5"
      style={{ borderColor: colors.cardBorder }}
    >
      {children}
    </LinearGradient>
  );
}

function ToggleSwitch({ value, onValueChange }: { value: boolean; onValueChange: (v: boolean) => void }) {
  return (
    <Switch value={value} onValueChange={onValueChange} trackColor={{ true: colors.accent, false: "rgba(255,255,255,0.15)" }} />
  );
}

// Identity and account settings are different products (profile-plan.md P4) — this is the
// findable list that used to sit two rows from the tier badge. Rebuilt to the full six-group IA
// from docs/design-brief.md's "Settings — full IA" artboard: everything the design put behind
// the gear that the old three-card version never surfaced.
export default function Settings() {
  const { session } = useSession();
  const userId = session?.user.id;
  const email = session?.user.email;
  const emailVerified = !!session?.user.email_confirmed_at;
  const provider = session?.user.app_metadata?.provider as string | undefined;
  const [resending, setResending] = useState(false);
  const [signInSheetOpen, setSignInSheetOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    loadSoundEnabled().then(setSoundEnabled);
  }, []);

  const toggleSound = (v: boolean) => {
    setSoundEnabled(v);
    sound.setMuted(!v);
    saveSoundEnabled(v);
  };

  const { data: profile } = useProfile(userId);
  const { data: prefs } = useNotificationPrefs();
  const setCategory = useSetNotificationCategory();
  const { data: blocked } = useBlockedPlayers();
  const { data: referrals } = useReferralStats(userId);

  const resendVerification = async () => {
    if (!email) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      Alert.alert("Sent", `Check ${email} for a new verification link.`);
    } catch (e) {
      Alert.alert("Couldn't resend", e instanceof Error ? e.message : "Give it another go.");
    } finally {
      setResending(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Log out?", "You can jump back in any time.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/onboarding");
        },
      },
    ]);
  };

  const rateApp = async () => {
    try {
      if (await StoreReview.hasAction()) {
        await StoreReview.requestReview();
        return;
      }
    } catch {}
    Alert.alert("Not on the store yet", "SMASHIO is in private beta, thanks for testing it early!");
  };

  const buildLabel =
    Platform.OS === "ios"
      ? Constants.expoConfig?.ios?.buildNumber
      : Constants.expoConfig?.android?.versionCode;

  return (
    <Screen>
      <View className="flex-row items-center gap-3 px-5 pt-2 pb-1">
        <BackButton onPress={() => router.back()} />
        <Text className="font-display text-[20px]" style={{ color: colors.text }}>
          Settings
        </Text>
      </View>

      <ScrollView contentContainerClassName="px-5 pt-4 pb-10 gap-5" showsVerticalScrollIndicator={false}>
        <View className="gap-2">
          <RowSectionLabel label="Account" />
          <Group>
            <ListRow
              title="Sign-in method"
              trailing={providerLabel(provider)}
              accessory="chevron"
              divider
              onPress={() => setSignInSheetOpen(true)}
            />
            <View className="py-2.5">
              <View className="flex-row justify-between items-center">
                <Text className="text-[13.5px] font-body-semibold flex-1 pr-2" style={{ color: colors.text }} numberOfLines={1}>
                  {email ?? "Email"}
                </Text>
                {emailVerified ? <Badge state="verified" label="Verified" /> : <Badge state="pending" label="Unverified" />}
              </View>
              {!emailVerified && (
                <View className="mt-1.5 gap-1.5">
                  <Text className="text-[12px] leading-4" style={{ color: colors.textTertiary }}>
                    Verify your email to host games and recover your password.
                  </Text>
                  <Pressable onPress={resendVerification} disabled={resending} hitSlop={6}>
                    <Text className="text-[13px] font-body-bold" style={{ color: colors.accent }}>
                      {resending ? "Sending…" : "Resend verification email"}
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
            <ListRow
              title="Phone number"
              subtitle="Used only for game-day contact"
              accessory="chevron"
              divider={false}
              onPress={() => router.push("/settings/phone")}
            />
          </Group>
        </View>

        <View className="gap-2">
          <RowSectionLabel label="Notifications" />
          <Group>
            <ListRow
              title="Game reminders"
              subtitle="1 hour before kickoff"
              trailingNode={
                <ToggleSwitch
                  value={prefs?.reminders ?? true}
                  onValueChange={(v) => setCategory.mutate({ category: "reminders", enabled: v })}
                />
              }
            />
            <ListRow
              title="Join requests"
              trailingNode={
                <ToggleSwitch
                  value={prefs?.joinRequests ?? true}
                  onValueChange={(v) => setCategory.mutate({ category: "join_requests", enabled: v })}
                />
              }
            />
            <ListRow
              title="New messages"
              trailingNode={
                <ToggleSwitch value={prefs?.chat ?? true} onValueChange={(v) => setCategory.mutate({ category: "chat", enabled: v })} />
              }
            />
            <ListRow
              title="Product news & promos"
              trailingNode={
                <ToggleSwitch
                  value={prefs?.marketing ?? false}
                  onValueChange={(v) => setCategory.mutate({ category: "marketing", enabled: v })}
                />
              }
              divider={false}
            />
          </Group>
          <Pressable className="px-1 pt-1" onPress={() => router.push("/notification-settings")} hitSlop={6}>
            <Text className="text-[13px] font-body-bold" style={{ color: colors.textSecondary }}>
              All notification settings ›
            </Text>
          </Pressable>
        </View>

        <View className="gap-2">
          <RowSectionLabel label="Privacy & visibility" />
          <Group>
            <ListRow
              title="Profile visibility"
              subtitle="Who can open your full profile"
              trailing={profile?.profile_visibility === "players_only" ? "Players I've played with" : "Everyone"}
              accessory="chevron"
              onPress={() => router.push("/settings/visibility")}
            />
            <ListRow
              title="Show suburb on profile"
              trailingNode={
                <ToggleSwitch
                  value={profile?.show_suburb ?? true}
                  onValueChange={async (v) => {
                    const { error } = await supabase.from("profiles").update({ show_suburb: v }).eq("id", userId!);
                    if (error) Alert.alert("Couldn't save that", error.message);
                  }}
                />
              }
            />
            <ListRow
              title="Blocked players"
              trailing={String(blocked?.length ?? 0)}
              accessory="chevron"
              divider={false}
              onPress={() => router.push("/settings/blocked")}
            />
          </Group>
        </View>

        <View className="gap-2">
          <RowSectionLabel label="Preferences" />
          <Group>
            <ListRow
              title="Distance units"
              trailing={profile?.distance_units === "mi" ? "Miles" : "Kilometres"}
              accessory="chevron"
              onPress={() => router.push("/settings/units")}
            />
            <ListRow title="Preferred sports" accessory="chevron" onPress={() => router.push("/settings/sports")} />
            <ListRow
              title="Sound effects"
              subtitle="Hero moments only — joining, publishing, streaks"
              trailingNode={<ToggleSwitch value={soundEnabled} onValueChange={toggleSound} />}
              divider={false}
            />
          </Group>
        </View>

        <View className="gap-2">
          <RowSectionLabel label="Support" />
          <Group>
            <ListRow title="Help centre" accessory="chevron" onPress={() => Linking.openURL("https://smashio.com.au/support.html")} />
            <ListRow title="Contact us" accessory="chevron" onPress={() => Linking.openURL("mailto:hello@smashio.com.au")} />
            <ListRow
              title="Invite friends"
              subtitle={referralSubtitle(referrals)}
              accessory="chevron"
              onPress={() => userId && shareReferral(userId)}
            />
            <ListRow title="Rate SMASHIO" accessory="chevron" divider={false} onPress={rateApp} />
          </Group>
        </View>

        <View className="gap-2">
          <RowSectionLabel label="Legal" />
          <Group>
            <ListRow title="Terms of service" accessory="chevron" onPress={() => Linking.openURL("https://smashio.com.au/terms.html")} />
            <ListRow title="Privacy policy" accessory="chevron" divider={false} onPress={() => Linking.openURL("https://smashio.com.au/privacy.html")} />
          </Group>
        </View>

        <View className="gap-2">
          <Text className="font-body-bold text-[12px] uppercase px-1" style={{ color: colors.danger, letterSpacing: 0.6 }}>
            Danger zone
          </Text>
          <View
            className="rounded-2xl border overflow-hidden px-3.5"
            style={{ borderColor: "rgba(255,103,103,0.28)", backgroundColor: "rgba(255,103,103,0.05)" }}
          >
            <ListRow title="Log out" danger testID="settings-logout" onPress={handleLogout} />
            <ListRow
              title="Delete account"
              subtitle="permanent"
              accessory="chevron"
              danger
              divider={false}
              onPress={() => router.push("/delete-account")}
            />
          </View>
        </View>

        <Text className="text-center text-[11px] mt-1" style={{ color: colors.textMuted }}>
          SMASHIO v{Constants.expoConfig?.version ?? "—"} · build {buildLabel ?? "—"}
        </Text>
      </ScrollView>

      <Sheet visible={signInSheetOpen} onClose={() => setSignInSheetOpen(false)} title="Sign-in method">
        <Text className="text-[13.5px] leading-5" style={{ color: colors.textSecondary }}>
          You signed up with {providerLabel(provider)}. SMASHIO doesn't support switching sign-in
          methods yet, so get in touch with support if you need a different one linked to this account.
        </Text>
      </Sheet>
    </Screen>
  );
}
