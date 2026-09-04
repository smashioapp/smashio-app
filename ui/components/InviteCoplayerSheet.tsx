import { View, Text, Pressable, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../lib/theme";
import { haptics } from "../lib/haptics";
import { useInviteCoplayer, useRecentCoplayers } from "../lib/queries/reservedSpots";
import { Avatar } from "./Avatar";
import { Sheet } from "./Sheet";

// design-brief Prompt 7a's host-only quick-invite chip: pick someone who's played with this host
// before instead of typing a name-prefix search. Each tap holds a fresh spot and invites them to
// it in one go (useInviteCoplayer), same outcome as ReservedSpots' manual hold-then-invite flow.
export function InviteCoplayerSheet({ gameId, visible, onClose }: { gameId: string; visible: boolean; onClose: () => void }) {
  const coplayersQuery = useRecentCoplayers(gameId, visible);
  const invite = useInviteCoplayer(gameId);
  const players = coplayersQuery.data ?? [];

  return (
    <Sheet visible={visible} onClose={onClose} title="Invite from a past game">
      {coplayersQuery.isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 8 }} />
      ) : players.length === 0 ? (
        <Text className="text-[13px]" style={{ color: colors.textSecondary }}>
          Nobody from your past games is free to invite here, they're either already in this one or already holding a spot.
        </Text>
      ) : (
        <View className="gap-1">
          {players.map((p) => (
            <Pressable
              key={p.profileId}
              disabled={invite.isPending}
              onPress={() => {
                haptics.tap();
                invite.mutate(p.profileId, {
                  onSuccess: onClose,
                  onError: (err) => Alert.alert("Couldn't invite them", err instanceof Error ? err.message : "Give it another go."),
                });
              }}
              className="flex-row items-center gap-3 py-2.5"
              style={{ opacity: invite.isPending ? 0.5 : 1 }}
            >
              <Avatar id={p.profileId} name={p.name} color={p.color} avatarKey={p.avatarKey} photoUri={p.photoUri} size={36} />
              <Text className="flex-1 font-body-semibold text-[14.5px]" style={{ color: colors.text }}>
                {p.name}
              </Text>
              <Ionicons name="add" size={16} color={colors.accent} />
            </Pressable>
          ))}
        </View>
      )}
    </Sheet>
  );
}
