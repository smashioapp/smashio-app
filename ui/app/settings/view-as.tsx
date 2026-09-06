import { View, Text, ScrollView } from "react-native";
import { router } from "expo-router";
import { colors } from "../../lib/theme";
import { Screen } from "../../components/Screen";
import { BackButton } from "../../components/BackButton";
import { PlayerCard } from "../../components/PlayerCard";
import { useSession } from "../../lib/session";
import { useProfile } from "../../lib/queries/profile";

// "How others see you" (design-brief.md Prompt 8 item 7 / Prompt 8's "view as others see you")
// — we ship a visibility setting, a suburb toggle and a block list, and the user could never see
// the result. Renders the same PlayerCard component the "them" side of a roster/join-request
// sees, in "them" mode against your own id, so show_suburb actually applies.
//
// One honest gap: player_card's is_restricted never fires for a viewer looking at their own row
// (20260822000000 — "player_card never restricts a viewer from their own row"), so a
// players_only profile still sees its own full reputation here rather than the true stranger
// view. Rather than fake that gate client-side, we show it as-is plus a banner naming exactly
// what a real stranger wouldn't see.
export default function ViewAs() {
  const { session } = useSession();
  const userId = session?.user.id;
  const { data: profile } = useProfile(userId);
  const restrictedForStrangers = profile?.profile_visibility === "players_only";

  return (
    <Screen>
      <View className="flex-row items-center gap-3 px-5 pt-2 pb-1">
        <BackButton onPress={() => router.back()} />
        <Text className="font-display text-[20px]" style={{ color: colors.text }}>
          How others see you
        </Text>
      </View>
      <View className="px-5 pt-2 pb-3">
        <Text className="text-[12.5px] leading-5" style={{ color: colors.textSecondary }}>
          This is your profile, with your current suburb setting applied.
        </Text>
        {restrictedForStrangers && (
          <View className="rounded-2xl p-3.5 mt-3" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.cardBorder }}>
            <Text className="text-[12px] leading-4" style={{ color: colors.textSecondary }}>
              Your visibility is set to "Players I've played with", so a stranger opening this
              card would see your name, photo and suburb only — reliability, rating and badges
              stay hidden until you've played together, or while they have an open request to
              join your game.
            </Text>
          </View>
        )}
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {userId ? <PlayerCard profileId={userId} mode="them" /> : null}
      </ScrollView>
    </Screen>
  );
}
