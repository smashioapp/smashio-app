import { View, Text, ScrollView } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Screen } from "../../components/Screen";
import { BackButton } from "../../components/BackButton";
import { PlayerCard } from "../../components/PlayerCard";
import { colors } from "../../lib/theme";
import { useSession } from "../../lib/session";

// The public player card (profile-plan.md P1) — wired from roster avatars, join-request rows,
// the organizer row, chat headers and the post-game rating list. Was previously dead: no
// route existed, so every avatar in the app was inert.
export default function PlayerProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const isSelf = session?.user.id === id;

  return (
    <Screen>
      <View className="flex-row items-center gap-3 px-5 pt-2 pb-1">
        <BackButton onPress={() => router.back()} />
        <Text className="font-display text-[18px]" style={{ color: colors.text }}>
          Player
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {id ? <PlayerCard profileId={id} mode={isSelf ? "me" : "them"} /> : null}
      </ScrollView>
    </Screen>
  );
}
