import { useState } from "react";
import { View, Text, Pressable, Linking, Alert } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradients } from "../lib/theme";
import { Screen } from "../components/Screen";
import { BackButton } from "../components/BackButton";
import { Badge } from "../components/Badge";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { signOut } from "../lib/auth";

const ROWS = [
  { label: "Notifications", href: "/notification-settings" as const, icon: "notifications-outline" as const },
];

function providerLabel(provider: string | undefined): string {
  if (provider === "google") return "Google";
  if (provider === "apple") return "Apple";
  return "Email & password";
}

// Identity and account settings are different products (profile-plan.md P4) — this is the
// boring, findable list that used to sit two rows from the tier badge.
export default function Settings() {
  const { session } = useSession();
  const email = session?.user.email;
  const emailVerified = !!session?.user.email_confirmed_at;
  const provider = session?.user.app_metadata?.provider as string | undefined;
  const [resending, setResending] = useState(false);

  const resendVerification = async () => {
    if (!email) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      Alert.alert("Sent", `Check ${email} for a new verification link.`);
    } catch (e) {
      Alert.alert("Couldn't resend", e instanceof Error ? e.message : "Try again.");
    } finally {
      setResending(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    router.replace("/onboarding");
  };

  return (
    <Screen>
      <View className="flex-row items-center gap-3 px-5 pt-2 pb-1">
        <BackButton onPress={() => router.back()} />
        <Text className="font-display text-[20px]" style={{ color: colors.text }}>
          Settings
        </Text>
      </View>

      <View className="px-5 pt-4 gap-4">
        <LinearGradient
          colors={gradients.card}
          className="rounded-2xl border overflow-hidden"
          style={{ borderColor: colors.cardBorder }}
        >
          {ROWS.map((row) => (
            <Pressable
              key={row.label}
              onPress={() => router.push(row.href)}
              className="flex-row justify-between items-center px-3.5 py-3.5"
              style={{ borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}
            >
              <View className="flex-row items-center gap-2.5">
                <Ionicons name={row.icon} size={16} color={colors.textSecondary} />
                <Text className="text-[15px] font-body-semibold" style={{ color: colors.text }}>
                  {row.label}
                </Text>
              </View>
              <Text style={{ color: colors.textMuted }}>›</Text>
            </Pressable>
          ))}

          <View
            className="flex-row justify-between items-center px-3.5 py-3.5"
            style={{ borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}
          >
            <View className="flex-row items-center gap-2.5">
              <Ionicons name="key-outline" size={16} color={colors.textSecondary} />
              <Text className="text-[15px] font-body-semibold" style={{ color: colors.text }}>
                Sign-in method
              </Text>
            </View>
            <Text className="text-[13.5px] font-body-semibold" style={{ color: colors.textTertiary }}>
              {providerLabel(provider)}
            </Text>
          </View>

          <View className="px-3.5 py-3.5 gap-2">
            <View className="flex-row justify-between items-center">
              <View className="flex-row items-center gap-2.5 flex-1 pr-2">
                <Ionicons name="mail-outline" size={16} color={colors.textSecondary} />
                <Text className="text-[15px] font-body-semibold flex-1" style={{ color: colors.text }} numberOfLines={1}>
                  {email ?? "Email"}
                </Text>
              </View>
              {emailVerified ? <Badge state="verified" label="Verified" /> : <Badge state="pending" label="Unverified" />}
            </View>
            {!emailVerified && (
              <View className="pl-[26px] gap-1.5">
                <Text className="text-[12.5px] leading-4" style={{ color: colors.textTertiary }}>
                  A verified email unlocks hosting games and password recovery.
                </Text>
                <Pressable onPress={resendVerification} disabled={resending} hitSlop={6}>
                  <Text className="text-[13.5px] font-body-bold" style={{ color: colors.accent }}>
                    {resending ? "Sending…" : "Resend verification email"}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </LinearGradient>

        <LinearGradient
          colors={gradients.card}
          className="rounded-2xl border overflow-hidden"
          style={{ borderColor: colors.cardBorder }}
        >
          <Pressable
            onPress={() => Linking.openURL("https://smashio.com.au/privacy.html")}
            className="flex-row justify-between items-center px-3.5 py-3.5"
          >
            <View className="flex-row items-center gap-2.5">
              <Ionicons name="document-text-outline" size={16} color={colors.textSecondary} />
              <Text className="text-[15px] font-body-semibold" style={{ color: colors.text }}>
                Privacy & legal
              </Text>
            </View>
            <Ionicons name="open-outline" size={14} color={colors.textMuted} />
          </Pressable>
        </LinearGradient>

        <View
          className="rounded-2xl border overflow-hidden"
          style={{ borderColor: "rgba(255,103,103,0.28)", backgroundColor: "rgba(255,103,103,0.05)" }}
        >
          <Pressable
            testID="settings-logout"
            className="flex-row justify-between items-center px-3.5 py-3.5"
            style={{ borderBottomWidth: 1, borderColor: "rgba(255,103,103,0.18)" }}
            onPress={handleLogout}
          >
            <Text className="text-[15px] font-body-semibold" style={{ color: colors.danger }}>
              Log out
            </Text>
          </Pressable>
          <Pressable
            className="flex-row justify-between items-center px-3.5 py-3.5"
            onPress={() => router.push("/delete-account")}
          >
            <Text className="text-[15px] font-body-semibold" style={{ color: colors.danger }}>
              Delete account
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.danger} />
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
