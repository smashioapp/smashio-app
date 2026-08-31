import { View, Text } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Screen } from "../../components/Screen";
import { BackButton } from "../../components/BackButton";
import { FollowList } from "../../components/FollowList";
import { colors } from "../../lib/theme";
import { useFollowers } from "../../lib/queries/follows";

export default function PlayerFollowers() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useFollowers(id);

  return (
    <Screen>
      <View className="flex-row items-center gap-3 px-5 pt-2 pb-1">
        <BackButton onPress={() => router.back()} />
        <Text className="font-display text-[18px]" style={{ color: colors.text }}>
          Followers
        </Text>
      </View>
      <FollowList data={data} isLoading={isLoading} emptyLabel="No followers yet." />
    </Screen>
  );
}
