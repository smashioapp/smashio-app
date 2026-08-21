import { View, Text, Pressable, Alert } from "react-native";
import { router } from "expo-router";
import { colors } from "../../lib/theme";
import { avatarColor } from "../../lib/theme";
import { Screen } from "../../components/Screen";
import { BackButton } from "../../components/BackButton";
import { Avatar } from "../../components/Avatar";
import { supabase } from "../../lib/supabase";
import { useBlockedPlayers, useUnblockPlayer } from "../../lib/queries/settings";

export default function BlockedPlayers() {
  const { data: blocked, isLoading } = useBlockedPlayers();
  const unblock = useUnblockPlayer();

  const confirmUnblock = (id: string, name: string) => {
    Alert.alert(`Unblock ${name}?`, "They'll be able to see your profile and request to join your games again.", [
      { text: "Cancel", style: "cancel" },
      { text: "Unblock", onPress: () => unblock.mutate(id) },
    ]);
  };

  return (
    <Screen>
      <View className="flex-row items-center gap-3 px-5 pt-2 pb-1">
        <BackButton onPress={() => router.back()} />
        <Text className="font-display text-[20px]" style={{ color: colors.text }}>
          Blocked players
        </Text>
      </View>
      <View className="px-5 pt-4 gap-1">
        {!isLoading && (blocked?.length ?? 0) === 0 && (
          <Text className="text-[13.5px] mt-6 text-center" style={{ color: colors.textTertiary }}>
            You haven't blocked anyone.
          </Text>
        )}
        {blocked?.map((row) => {
          const p = row.profiles;
          if (!p) return null;
          const photoUrl = p.photo_path ? supabase.storage.from("avatars").getPublicUrl(p.photo_path).data.publicUrl : null;
          return (
            <View
              key={p.id}
              className="flex-row items-center gap-3 py-3"
              style={{ borderBottomWidth: 1, borderBottomColor: colors.cardBorder }}
            >
              <Avatar name={p.display_name} color={avatarColor(p.id)} size={38} photoUri={photoUrl} />
              <Text className="flex-1 font-body-semibold text-[14px]" style={{ color: colors.text }} numberOfLines={1}>
                {p.display_name}
              </Text>
              <Pressable onPress={() => confirmUnblock(p.id, p.display_name)} hitSlop={8}>
                <Text className="font-body-bold text-[13px]" style={{ color: colors.accent }}>
                  Unblock
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}
