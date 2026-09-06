import { useState } from "react";
import { View, Text, Pressable, ScrollView, Alert } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../lib/theme";
import { Screen } from "../../components/Screen";
import { BackButton } from "../../components/BackButton";
import { OfflineStatus, SessionExpiredStatus } from "../../components/SubscreenStatus";
import { useSession } from "../../lib/session";
import { useOnline } from "../../lib/useOnline";
import { supabase } from "../../lib/supabase";

const HELD = [
  "Your profile: name, photo, suburb, about you, usual nights, home venue and skill level",
  "Your games: hosted, joined, and the venues and times you've played",
  "Your reliability score and the ratings other players gave you",
  "Messages you've sent in game chats",
  "Your device push token and notification preferences",
];

function SoonTag() {
  return (
    <View className="rounded-pill px-2.5 py-1" style={{ backgroundColor: colors.surfaceAlt }}>
      <Text className="font-body-extrabold text-[10px] uppercase" style={{ color: colors.textTertiary, letterSpacing: 0.4 }}>
        Soon
      </Text>
    </View>
  );
}

// "Your data" — the rights ladder, redesigned (design-brief.md Prompt 8 item 9). Export sits
// above delete (Apple's Data & Privacy portal, Play's Data safety expectations, and the
// Australian Privacy Act's access rights all put it there). Download has no export job or email
// pipeline behind it yet (Prompt 8a group B4) — tagged Soon rather than drawn as a live button
// with a stated SLA we can't keep. Delete is one tap away, on the existing screen.
export default function YourData() {
  const [requested, setRequested] = useState(false);
  const { session, isLoading: sessionLoading } = useSession();
  const online = useOnline();
  const sessionExpired = !sessionLoading && !session;

  const requestExport = () => {
    Alert.alert("Not ready yet", "Data export isn't live yet — this button is a placeholder for the work, not a working request.");
  };

  return (
    <Screen>
      <View className="flex-row items-center gap-3 px-5 pt-2 pb-1">
        <BackButton onPress={() => router.back()} />
        <Text className="font-display text-[20px]" style={{ color: colors.text }}>
          Your data
        </Text>
      </View>
      {!online ? (
        <OfflineStatus onRetry={() => {}} />
      ) : sessionExpired ? (
        <SessionExpiredStatus
          onSignIn={() => {
            supabase.auth.signOut().catch(() => {});
            router.replace("/onboarding");
          }}
        />
      ) : (
      <ScrollView contentContainerClassName="px-5 pt-4 pb-10 gap-4" showsVerticalScrollIndicator={false}>
        <View className="rounded-2xl p-4 border gap-3" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
          <Text className="font-body-bold text-[15px]" style={{ color: colors.text }}>
            What we hold
          </Text>
          <View className="gap-2">
            {HELD.map((item) => (
              <View key={item} className="flex-row gap-2.5">
                <Ionicons name="ellipse" size={5} color={colors.textTertiary} style={{ marginTop: 7 }} />
                <Text className="text-[13px] leading-4.5 flex-1" style={{ color: colors.textSecondary }}>
                  {item}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View className="rounded-2xl p-4 border gap-2.5" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
          <View className="flex-row items-center justify-between">
            <Text className="font-body-bold text-[15px]" style={{ color: colors.text }}>
              Download my data
            </Text>
            <SoonTag />
          </View>
          <Text className="text-[12.5px] leading-4.5" style={{ color: colors.textSecondary }}>
            We're building a proper export. For now, email hello@smashio.com.au and we'll pull
            together what we hold on you by hand.
          </Text>
          <Pressable onPress={requestExport} disabled={requested} className="rounded-pill py-3 items-center mt-1" style={{ backgroundColor: colors.surfaceAlt }}>
            <Text className="font-body-bold text-[13.5px]" style={{ color: colors.textSecondary }}>
              Request a copy
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => router.push("/delete-account")}
          className="rounded-2xl p-4 border flex-row items-center justify-between"
          style={{ borderColor: "rgba(255,103,103,0.28)", backgroundColor: "rgba(255,103,103,0.05)" }}
        >
          <View className="flex-1 pr-3">
            <Text className="font-body-bold text-[15px]" style={{ color: colors.danger }}>
              Delete my account
            </Text>
            <Text className="text-[12px] mt-1" style={{ color: colors.textSecondary }}>
              Permanent — see exactly what gets deleted and what stays
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.danger} />
        </Pressable>
      </ScrollView>
      )}
    </Screen>
  );
}
