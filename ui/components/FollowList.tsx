import { View, Text, Pressable, ActivityIndicator, FlatList } from "react-native";
import { router } from "expo-router";
import { Avatar } from "./Avatar";
import { colors, avatarColor } from "../lib/theme";
import { useFollowPlayer, useUnfollowPlayer, type FollowRow } from "../lib/queries/follows";
import { supabase } from "../lib/supabase";

function Row({ row }: { row: FollowRow }) {
  const followPlayer = useFollowPlayer();
  const unfollowPlayer = useUnfollowPlayer();
  const photoUrl = row.photoPath ? supabase.storage.from("avatars").getPublicUrl(row.photoPath).data.publicUrl : null;
  const busy = followPlayer.isPending || unfollowPlayer.isPending;

  return (
    <Pressable
      onPress={() => router.push(`/player/${row.id}`)}
      className="flex-row items-center gap-3 px-5 py-3"
    >
      <Avatar id={row.id} name={row.displayName} color={avatarColor(row.id)} size={44} photoUri={photoUrl} avatarKey={row.avatarKey} />
      <View className="flex-1">
        <Text className="font-body-bold text-[14.5px]" style={{ color: colors.text }}>
          {row.displayName}
        </Text>
        {row.homeSuburb && (
          <Text className="text-[12.5px]" style={{ color: colors.textTertiary }}>
            {row.homeSuburb}
          </Text>
        )}
      </View>
      <Pressable
        disabled={busy}
        onPress={() => (row.isFollowing ? unfollowPlayer.mutate(row.id) : followPlayer.mutate(row.id))}
        className="rounded-pill px-3.5 py-1.5 border"
        style={{
          backgroundColor: row.isFollowing ? "transparent" : colors.accent,
          borderColor: row.isFollowing ? colors.cardBorder : colors.accent,
          opacity: busy ? 0.6 : 1,
        }}
      >
        <Text className="font-body-bold text-[12px]" style={{ color: row.isFollowing ? colors.textSecondary : colors.base }}>
          {row.isFollowing ? "Following" : "Follow"}
        </Text>
      </Pressable>
    </Pressable>
  );
}

export function FollowList({
  data,
  isLoading,
  emptyLabel,
}: {
  data: FollowRow[] | undefined;
  isLoading: boolean;
  emptyLabel: string;
}) {
  if (isLoading) {
    return (
      <View className="items-center justify-center py-16">
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!data || data.length === 0) {
    return (
      <View className="items-center justify-center py-16 px-6">
        <Text className="font-body-semibold text-[14.5px] text-center" style={{ color: colors.textSecondary }}>
          {emptyLabel}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      keyExtractor={(r) => r.id}
      renderItem={({ item }) => <Row row={item} />}
      contentContainerStyle={{ paddingBottom: 40 }}
    />
  );
}
