import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, gradients } from "../../lib/theme";
import { LinearGradient } from "expo-linear-gradient";
import { Screen } from "../../components/Screen";
import { BackButton } from "../../components/BackButton";
import { useSession } from "../../lib/session";
import { useProfile, useUpdateProfile } from "../../lib/queries/profile";

const OPTIONS: { value: "everyone" | "players_only"; label: string; description: string }[] = [
  { value: "everyone", label: "Everyone", description: "Any signed-in player can open your full profile." },
  {
    value: "players_only",
    label: "Players I've played with",
    description: "Your reliability, rating and badges are hidden from everyone else — except a host you've asked to join, while they're deciding.",
  },
];

// docs/design-brief.md:296 — "design the privacy settings screen so these are understandable,
// not legalese." The carve-out below is the load-bearing part of player_card's is_restricted
// (20260822000000): without it, going players_only makes a join request unvettable.
export default function VisibilitySettings() {
  const { session } = useSession();
  const { data: profile } = useProfile(session?.user.id);
  const update = useUpdateProfile();

  const current = profile?.profile_visibility === "players_only" ? "players_only" : "everyone";

  return (
    <Screen>
      <View className="flex-row items-center gap-3 px-5 pt-2 pb-1">
        <BackButton onPress={() => router.back()} />
        <Text className="font-display text-[20px]" style={{ color: colors.text }}>
          Profile visibility
        </Text>
      </View>
      <View className="px-5 pt-6 gap-3">
        {OPTIONS.map((o) => {
          const active = current === o.value;
          return (
            <Pressable key={o.value} onPress={() => update.mutate({ profile_visibility: o.value })}>
              <LinearGradient
                colors={active ? gradients.accentDiagonal : gradients.card}
                className="rounded-2xl p-4 border"
                style={{ borderColor: active ? colors.accent : colors.cardBorder }}
              >
                <View className="flex-row items-center justify-between">
                  <Text className="font-body-bold text-[15px]" style={{ color: active ? colors.base : colors.text }}>
                    {o.label}
                  </Text>
                  {active && <Ionicons name="checkmark-circle" size={18} color={colors.base} />}
                </View>
                <Text className="text-[12.5px] mt-1.5 leading-4.5" style={{ color: active ? colors.baseAlt : colors.textSecondary }}>
                  {o.description}
                </Text>
              </LinearGradient>
            </Pressable>
          );
        })}
        <Text className="text-[11.5px] mt-1 leading-4" style={{ color: colors.textTertiary }}>
          This never hides your name, photo or that you exist — only the reputation numbers. A
          host deciding a join request from you can always see your full card while your request
          is open, no matter this setting.
        </Text>
      </View>
    </Screen>
  );
}
