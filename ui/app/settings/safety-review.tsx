import { View, Text, Pressable, ScrollView } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../lib/theme";
import { Screen } from "../../components/Screen";
import { BackButton } from "../../components/BackButton";
import { useSession } from "../../lib/session";
import { useProfile } from "../../lib/queries/profile";
import { useBlockedPlayers } from "../../lib/queries/settings";

function Step({
  icon,
  title,
  detail,
  cta,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  cta: string;
  onPress: () => void;
}) {
  return (
    <View className="rounded-2xl p-4 border gap-2.5" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
      <View className="flex-row items-center gap-2.5">
        <View className="rounded-full items-center justify-center" style={{ width: 32, height: 32, backgroundColor: colors.surfaceAlt }}>
          <Ionicons name={icon} size={15} color={colors.accent} />
        </View>
        <Text className="font-body-bold text-[14.5px] flex-1" style={{ color: colors.text }}>
          {title}
        </Text>
      </View>
      <Text className="text-[12.5px] leading-4.5" style={{ color: colors.textSecondary }}>
        {detail}
      </Text>
      <Pressable onPress={onPress} className="self-start">
        <Text className="text-[13px] font-body-bold" style={{ color: colors.accent }}>
          {cta} ›
        </Text>
      </Pressable>
    </View>
  );
}

// "Guided safety review, modelled on Apple's Safety Check" (design-brief.md Prompt 8 item 7) —
// a short walk through who can see you, what you're sharing, and who's blocked, rather than a
// wall of toggles. Every step reuses an existing screen; this is the front door, not a new
// settings surface of its own.
export default function SafetyReview() {
  const { session } = useSession();
  const { data: profile } = useProfile(session?.user.id);
  const { data: blocked } = useBlockedPlayers();

  return (
    <Screen>
      <View className="flex-row items-center gap-3 px-5 pt-2 pb-1">
        <BackButton onPress={() => router.back()} />
        <Text className="font-display text-[20px]" style={{ color: colors.text }}>
          Safety review
        </Text>
      </View>
      <View className="px-5 pt-1 pb-3">
        <Text className="text-[13px] leading-5" style={{ color: colors.textSecondary }}>
          A quick pass over who can see you, what you're sharing, and who you've blocked.
        </Text>
      </View>
      <ScrollView contentContainerClassName="px-5 pb-10 gap-3" showsVerticalScrollIndicator={false}>
        <Step
          icon="eye-outline"
          title="Who can see your profile"
          detail={
            profile?.profile_visibility === "players_only"
              ? "Set to players you've played with — your reputation stays hidden from everyone else."
              : "Set to everyone — any signed-in player can open your full profile."
          }
          cta="Review visibility"
          onPress={() => router.push("/settings/visibility")}
        />
        <Step
          icon="location-outline"
          title="What you're sharing"
          detail={
            profile?.show_suburb
              ? "Your suburb shows on your profile, as text only, never a map pin."
              : "Your suburb is hidden from your profile."
          }
          cta="Change what shows"
          onPress={() => router.push("/settings")}
        />
        <Step
          icon="ban-outline"
          title="Who you've blocked"
          detail={
            blocked && blocked.length > 0
              ? `${blocked.length} player${blocked.length === 1 ? "" : "s"} blocked. They can't see your profile or ask to join your games.`
              : "Nobody blocked yet. Block anyone from their profile's ⋯ menu."
          }
          cta="Manage blocked players"
          onPress={() => router.push("/settings/blocked")}
        />
        <Step
          icon="flag-outline"
          title="Report and block from anywhere"
          detail="Every player card carries a ⋯ menu with Report and Block — you don't need to come back here to use either one."
          cta="See how you look"
          onPress={() => router.push("/settings/view-as")}
        />
      </ScrollView>
    </Screen>
  );
}
