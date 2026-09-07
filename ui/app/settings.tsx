import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, Linking, Alert, ScrollView, Switch, Platform, TextInput } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as StoreReview from "expo-store-review";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradients } from "../lib/theme";
import { Screen } from "../components/Screen";
import { BackButton } from "../components/BackButton";
import { Badge } from "../components/Badge";
import { ListRow, RowSectionLabel } from "../components/ListRow";
import { OfflineStatus, SessionExpiredStatus } from "../components/SubscreenStatus";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { signOut } from "../lib/auth";
import { useProfile, useReferralStats, useUpdateProfile } from "../lib/queries/profile";
import { useBlockedPlayers } from "../lib/queries/settings";
import { sound } from "../lib/sound";
import { loadSoundEnabled, saveSoundEnabled } from "../lib/soundPrefs";
import { haptics } from "../lib/haptics";
import { loadHapticsEnabled, saveHapticsEnabled } from "../lib/hapticsPrefs";
import { useOnline } from "../lib/useOnline";
import { isAuthSessionError } from "../lib/authError";

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
  return <Switch value={value} onValueChange={onValueChange} trackColor={{ true: colors.accent, false: "rgba(255,255,255,0.15)" }} />;
}

// The coloured glyph tile every row in the v3 IA carries (design-brief.md Prompt 8 item 5, "row
// glyphs" — iOS/Android system Settings and Instagram's IA both use one per row once a list runs
// past a single screen).
function Glyph({ name, color }: { name: keyof typeof Ionicons.glyphMap; color: string }) {
  return (
    <View className="rounded-lg items-center justify-center" style={{ width: 28, height: 28, backgroundColor: color + "22" }}>
      <Ionicons name={name} size={14} color={color} />
    </View>
  );
}

type Row = {
  key: string;
  glyph: keyof typeof Ionicons.glyphMap;
  glyphColor: string;
  title: string;
  subtitle?: string;
  trailing?: string;
  trailingNode?: React.ReactNode;
  accessory?: "chevron" | "none";
  onPress?: () => void;
};

function matches(row: Row, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return row.title.toLowerCase().includes(q) || (row.subtitle ?? "").toLowerCase().includes(q);
}

// Rebuilt to the v3 IA (docs/design-brief.md Prompt 8/8a): "You & privacy" leads — the highest
// load-bearing group on a stranger-meeting app — over account plumbing (Instagram/Threads'
// "Settings and activity" puts the same group first). A search field filters every row flat
// once the list runs past one screen (iOS/Android system Settings' primary IA past that point).
// The destructive ladder is three weights, not two: Log out is a neutral card on its own, Delete
// account is alone in red — a danger box that fits both taught the user red means nothing
// (item 9).
export default function Settings() {
  const { session, isLoading: sessionLoading } = useSession();
  const online = useOnline();
  const userId = session?.user.id;
  const email = session?.user.email;
  const emailVerified = !!session?.user.email_confirmed_at;
  const [resending, setResending] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [query, setQuery] = useState("");
  const updateProfile = useUpdateProfile(userId);

  useEffect(() => {
    loadSoundEnabled().then(setSoundEnabled);
    loadHapticsEnabled().then(setHapticsEnabled);
  }, []);

  const toggleSound = (v: boolean) => {
    setSoundEnabled(v);
    sound.setMuted(!v);
    saveSoundEnabled(v);
  };

  const toggleHaptics = (v: boolean) => {
    setHapticsEnabled(v);
    haptics.setMuted(!v);
    saveHapticsEnabled(v);
    if (v) haptics.tap();
  };

  const { data: profile, error: profileError, refetch: refetchProfile } = useProfile(userId);
  const { data: blocked, error: blockedError } = useBlockedPlayers();
  const { data: referrals, error: referralsError } = useReferralStats(userId);

  const sessionExpired =
    (!sessionLoading && !session) ||
    isAuthSessionError(profileError) ||
    isAuthSessionError(blockedError) ||
    isAuthSessionError(referralsError) ||
    isAuthSessionError(updateProfile.error);

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
    Alert.alert("Not on the store yet", "Smashio is in private beta, thanks for testing it early!");
  };

  const buildLabel = Platform.OS === "ios" ? Constants.expoConfig?.ios?.buildNumber : Constants.expoConfig?.android?.versionCode;

  const groups: { label: string; rows: Row[] }[] = useMemo(
    () => [
      {
        label: "You & privacy",
        rows: [
          {
            key: "visibility",
            glyph: "eye-outline",
            glyphColor: colors.intermediate,
            title: "Profile visibility",
            subtitle: "Who can open your full profile",
            trailing: profile?.profile_visibility === "players_only" ? "Players I've played with" : "Everyone",
            accessory: "chevron",
            onPress: () => router.push("/settings/visibility"),
          },
          {
            key: "show-suburb",
            glyph: "location-outline",
            glyphColor: colors.beginner,
            title: "Show suburb on profile",
            trailingNode: (
              <ToggleSwitch
                value={profile?.show_suburb ?? true}
                onValueChange={(v) =>
                  updateProfile.mutate(
                    { show_suburb: v },
                    { onError: (e) => Alert.alert("Couldn't save that", e instanceof Error ? e.message : "Give it another go.") }
                  )
                }
              />
            ),
          },
          {
            key: "view-as",
            glyph: "person-circle-outline",
            glyphColor: colors.beginner,
            title: "How others see you",
            subtitle: "Preview your public profile",
            accessory: "chevron",
            onPress: () => router.push("/settings/view-as"),
          },
          {
            key: "safety",
            glyph: "shield-checkmark-outline",
            glyphColor: colors.accent2,
            title: "Safety review",
            subtitle: "A quick check of what's shared and who's blocked",
            accessory: "chevron",
            onPress: () => router.push("/settings/safety-review"),
          },
          {
            key: "blocked",
            glyph: "ban-outline",
            glyphColor: colors.danger,
            title: "Blocked players",
            trailing: String(blocked?.length ?? 0),
            accessory: "chevron",
            onPress: () => router.push("/settings/blocked"),
          },
        ],
      },
      {
        label: "Account",
        rows: [
          {
            key: "sign-in",
            glyph: "key-outline",
            glyphColor: colors.advanced,
            title: "Sign-in & security",
            subtitle: emailVerified ? "Verified" : "Email not verified",
            accessory: "chevron",
            onPress: () => router.push("/settings/sign-in-security"),
          },
          {
            key: "phone",
            glyph: "call-outline",
            glyphColor: colors.textSecondary,
            title: "Phone number",
            subtitle: "Used only for game-day contact",
            accessory: "chevron",
            onPress: () => router.push("/settings/phone"),
          },
          {
            key: "your-data",
            glyph: "download-outline",
            glyphColor: colors.textSecondary,
            title: "Your data",
            subtitle: "What we hold, download, or delete",
            accessory: "chevron",
            onPress: () => router.push("/settings/your-data"),
          },
        ],
      },
      {
        label: "Notifications",
        rows: [
          {
            key: "notifications",
            glyph: "notifications-outline",
            glyphColor: colors.accent,
            title: "Notifications",
            subtitle: "Every category, quiet hours and your saved alerts, in one place",
            accessory: "chevron",
            onPress: () => router.push("/notification-settings"),
          },
        ],
      },
      {
        label: "Preferences & accessibility",
        rows: [
          {
            key: "units",
            glyph: "navigate-outline",
            glyphColor: colors.beginner,
            title: "Distance units",
            trailing: profile?.distance_units === "mi" ? "Miles" : "Kilometres",
            accessory: "chevron",
            onPress: () => router.push("/settings/units"),
          },
          {
            key: "sports",
            glyph: "options-outline",
            glyphColor: colors.pro,
            title: "Preferred sports",
            accessory: "chevron",
            onPress: () => router.push("/settings/sports"),
          },
          {
            key: "sound",
            glyph: "volume-high-outline",
            glyphColor: colors.textSecondary,
            title: "Sound effects",
            subtitle: "Hero moments only — joining, publishing, streaks",
            trailingNode: <ToggleSwitch value={soundEnabled} onValueChange={toggleSound} />,
          },
          {
            key: "haptics",
            glyph: "pulse-outline",
            glyphColor: colors.textSecondary,
            title: "Haptics",
            subtitle: "Vibration on taps, holds and celebrations",
            trailingNode: <ToggleSwitch value={hapticsEnabled} onValueChange={toggleHaptics} />,
          },
          {
            key: "reduce-motion",
            glyph: "contrast-outline",
            glyphColor: colors.textSecondary,
            title: "Reduce motion",
            subtitle: "Controlled by your phone's system setting, not Smashio",
          },
        ],
      },
      {
        label: "Support",
        rows: [
          {
            key: "help",
            glyph: "help-circle-outline",
            glyphColor: colors.textSecondary,
            title: "Help centre",
            accessory: "chevron",
            onPress: () => Linking.openURL("https://smashio.com.au/support.html"),
          },
          {
            key: "contact",
            glyph: "chatbubble-ellipses-outline",
            glyphColor: colors.textSecondary,
            title: "Contact us",
            accessory: "chevron",
            onPress: () => Linking.openURL("mailto:hello@smashio.com.au"),
          },
          {
            key: "referral",
            glyph: "gift-outline",
            glyphColor: colors.accent,
            title: "Referral & priority spots",
            subtitle: referrals ? `${referrals.credits} credit${referrals.credits === 1 ? "" : "s"} · ${referrals.count} friend${referrals.count === 1 ? "" : "s"} joined` : undefined,
            accessory: "chevron",
            onPress: () => router.push("/settings/referral"),
          },
          {
            key: "rate",
            glyph: "star-outline",
            glyphColor: colors.advanced,
            title: "Rate Smashio",
            accessory: "chevron",
            onPress: rateApp,
          },
        ],
      },
      {
        label: "Legal",
        rows: [
          {
            key: "terms",
            glyph: "document-text-outline",
            glyphColor: colors.textSecondary,
            title: "Terms of service",
            accessory: "chevron",
            onPress: () => Linking.openURL("https://smashio.com.au/terms.html"),
          },
          {
            key: "guidelines",
            glyph: "people-outline",
            glyphColor: colors.textSecondary,
            title: "Community guidelines",
            accessory: "chevron",
            onPress: () => Linking.openURL("https://smashio.com.au/community-guidelines.html"),
          },
          {
            key: "privacy-policy",
            glyph: "shield-outline",
            glyphColor: colors.textSecondary,
            title: "Privacy policy",
            accessory: "chevron",
            onPress: () => Linking.openURL("https://smashio.com.au/privacy.html"),
          },
        ],
      },
    ],
    [profile, blocked, referrals, emailVerified, soundEnabled, hapticsEnabled]
  );

  const searching = query.trim().length > 0;
  const flatResults = useMemo(() => {
    if (!searching) return [];
    return groups.flatMap((g) => g.rows.filter((r) => matches(r, query)).map((r) => ({ ...r, group: g.label })));
  }, [groups, query, searching]);

  return (
    <Screen>
      <View className="flex-row items-center gap-3 px-5 pt-2 pb-1">
        <BackButton onPress={() => router.back()} />
        <Text className="font-display text-[20px]" style={{ color: colors.text }}>
          Settings
        </Text>
      </View>

      {!online ? (
        <OfflineStatus onRetry={() => refetchProfile()} />
      ) : sessionExpired ? (
        <SessionExpiredStatus
          onSignIn={() => {
            supabase.auth.signOut().catch(() => {});
            router.replace("/onboarding");
          }}
        />
      ) : (
      <>
      <View className="px-5 pt-3">
        <View className="rounded-2xl px-3.5 flex-row items-center gap-2" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.cardBorder, height: 44 }}>
          <Ionicons name="search" size={15} color={colors.textTertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search settings"
            placeholderTextColor={colors.textMuted}
            className="flex-1 text-[13.5px] font-body-semibold"
            style={{ color: colors.text }}
          />
          {searching && (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView contentContainerClassName="px-5 pt-4 pb-10 gap-5" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {searching ? (
          <View className="gap-2">
            <RowSectionLabel label={flatResults.length > 0 ? `${flatResults.length} result${flatResults.length === 1 ? "" : "s"}` : "No results"} />
            {flatResults.length === 0 ? (
              <View className="items-center py-10 gap-2">
                <Ionicons name="search" size={22} color={colors.textMuted} />
                <Text className="text-[13px]" style={{ color: colors.textSecondary }}>
                  No settings match "{query}"
                </Text>
              </View>
            ) : (
              <Group>
                {flatResults.map((r, i) => (
                  <ListRow
                    key={r.key}
                    title={r.title}
                    subtitle={r.subtitle ?? r.group}
                    trailing={r.trailing}
                    trailingNode={r.trailingNode}
                    accessory={r.accessory ?? "none"}
                    leading={<Glyph name={r.glyph} color={r.glyphColor} />}
                    divider={i < flatResults.length - 1}
                    onPress={r.onPress}
                  />
                ))}
              </Group>
            )}
          </View>
        ) : (
          <>
            {groups.map((g) => (
              <View className="gap-2" key={g.label}>
                <RowSectionLabel label={g.label} />
                <Group>
                  {g.rows.map((r, i) => (
                    <View key={r.key}>
                      <ListRow
                        title={r.title}
                        subtitle={r.subtitle}
                        trailing={r.trailing}
                        trailingNode={r.trailingNode}
                        accessory={r.accessory ?? "none"}
                        leading={<Glyph name={r.glyph} color={r.glyphColor} />}
                        divider={i < g.rows.length - 1}
                        onPress={r.onPress}
                      />
                      {r.key === "sign-in" && !emailVerified && (
                        <View className="pb-2.5 -mt-1.5 pl-[38px]">
                          <Pressable onPress={resendVerification} disabled={resending} hitSlop={6}>
                            <Text className="text-[12.5px] font-body-bold" style={{ color: colors.accent }}>
                              {resending ? "Sending…" : "Resend verification email"}
                            </Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  ))}
                </Group>
              </View>
            ))}

            <View className="gap-2">
              <Text className="font-body-bold text-[12px] uppercase px-1" style={{ color: colors.textTertiary, letterSpacing: 0.6 }}>
                Session
              </Text>
              <Group>
                <ListRow
                  title="Log out"
                  subtitle="You can jump back in any time"
                  leading={<Glyph name="log-out-outline" color={colors.textSecondary} />}
                  divider={false}
                  testID="settings-logout"
                  onPress={handleLogout}
                />
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
                <ListRow
                  title="Delete account"
                  subtitle="permanent"
                  accessory="chevron"
                  danger
                  divider={false}
                  leading={<Glyph name="trash-outline" color={colors.danger} />}
                  onPress={() => router.push("/delete-account")}
                />
              </View>
            </View>

            <Text className="text-center text-[11px] mt-1" style={{ color: colors.textMuted }}>
              Smashio v{Constants.expoConfig?.version ?? "—"} · build {buildLabel ?? "—"}
            </Text>
          </>
        )}
      </ScrollView>
      </>
      )}
    </Screen>
  );
}
