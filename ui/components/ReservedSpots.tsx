import { useState } from "react";
import { View, Text, Pressable, TextInput, Alert, Share, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, initial } from "../lib/theme";
import { haptics } from "../lib/haptics";
import {
  useReservedSpots,
  useAddReservedSpot,
  useRenameReservedSpot,
  useRemoveReservedSpot,
  useInviteToReservedSpot,
  useCreateReservedSpotInvite,
  usePlayerSearch,
  type ReservedSpot,
} from "../lib/queries/reservedSpots";
import { track } from "../lib/analytics";

// post-game-plan.md D2/D3/D10/D11. The host holds N spots off max_players; a subset can carry a
// friend's name, a direct invite, or a share link. Members see the named ones so the headcount
// makes sense; only the host can add, invite, or release.
//
// The anonymous remainder (reserved_spots minus the named rows) is deliberately not a row here —
// it's a count the host set in the wizard for people they haven't identified yet.
export function ReservedSpots({
  gameId,
  isOrganizer,
  reservedSpots,
  cancelled,
}: {
  gameId: string;
  isOrganizer: boolean;
  reservedSpots: number;
  cancelled: boolean;
}) {
  const { data: spots, isLoading } = useReservedSpots(gameId);
  const addSpot = useAddReservedSpot(gameId);
  const removeSpot = useRemoveReservedSpot(gameId);
  const createInvite = useCreateReservedSpotInvite(gameId);
  const [inviteTarget, setInviteTarget] = useState<string | null>(null);

  const named = spots ?? [];
  const anonymous = Math.max(0, reservedSpots - named.length);

  if (!isOrganizer && named.length === 0 && anonymous === 0) return null;

  const promptAdd = () => {
    haptics.tap();
    Alert.prompt?.(
      "Hold a spot",
      "Who's it for? You can leave this blank and name them later.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Hold spot",
          onPress: (name?: string) =>
            addSpot.mutate(name?.trim() || null, {
              onError: (err) => Alert.alert("Couldn't hold a spot", err instanceof Error ? err.message : "Give it another go."),
            }),
        },
      ],
      "plain-text"
    ) ??
      // Alert.prompt is iOS-only; Android gets an unnamed spot it can rename from the row.
      addSpot.mutate(null, {
        onError: (err) => Alert.alert("Couldn't hold a spot", err instanceof Error ? err.message : "Give it another go."),
      });
  };

  const shareInvite = (spot: ReservedSpot) => {
    haptics.tap();
    createInvite.mutate(spot.id, {
      onSuccess: async (url) => {
        const result = await Share.share({ message: `Here's your spot: ${url}` }).catch(() => null);
        if (result?.action === Share.sharedAction) track("share_sent", { kind: "invite" });
      },
      onError: (err) => Alert.alert("Couldn't make an invite", err instanceof Error ? err.message : "Give it another go."),
    });
  };

  const confirmRelease = (spot: ReservedSpot) => {
    Alert.alert(
      "Release this spot?",
      `${spot.label ?? "This spot"} goes back on the market for anyone to join.`,
      [
        { text: "Keep holding", style: "cancel" },
        {
          text: "Release",
          style: "destructive",
          onPress: () =>
            removeSpot.mutate(spot.id, {
              onError: (err) => Alert.alert("Couldn't release", err instanceof Error ? err.message : "Give it another go."),
            }),
        },
      ]
    );
  };

  return (
    <View>
      <Text className="font-body-extrabold text-[13px] uppercase tracking-wide mt-5.5 mb-2.5" style={{ color: colors.textTertiary }}>
        Held for friends ({named.length + anonymous})
      </Text>

      {isLoading && <ActivityIndicator color={colors.accent} />}

      {named.map((spot) => (
        <View
          key={spot.id}
          className="flex-row items-center gap-3 rounded-2xl px-3.5 py-3 mb-2 border"
          style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}
        >
          <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: spot.color }}>
            <Text style={{ color: colors.base, fontWeight: "800" }}>
              {initial(spot.claimedName ?? spot.invitedName ?? spot.label ?? "?")}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="font-body-bold text-[15px]" style={{ color: colors.text }}>
              {spot.claimedName ?? spot.invitedName ?? spot.label ?? "Unnamed spot"}
            </Text>
            <Text className="text-[12px]" style={{ color: colors.textMuted }}>
              {spot.claimedBy
                ? "In the game"
                : spot.invitedProfileId
                  ? "Invited, waiting on them"
                  : spot.inviteToken
                    ? "Link sent"
                    : "Held, not invited yet"}
            </Text>
          </View>
          {isOrganizer && !cancelled && !spot.claimedBy && (
            <View className="flex-row gap-1.5">
              {!spot.invitedProfileId && (
                <>
                  <Pressable
                    onPress={() => setInviteTarget(spot.id)}
                    hitSlop={6}
                    className="w-8 h-8 rounded-full items-center justify-center border"
                    style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder }}
                  >
                    <Ionicons name="person-add-outline" size={14} color={colors.textTertiary} />
                  </Pressable>
                  <Pressable
                    onPress={() => shareInvite(spot)}
                    hitSlop={6}
                    className="w-8 h-8 rounded-full items-center justify-center border"
                    style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder }}
                  >
                    <Ionicons name="link-outline" size={14} color={colors.textTertiary} />
                  </Pressable>
                </>
              )}
              <Pressable
                onPress={() => confirmRelease(spot)}
                hitSlop={6}
                className="w-8 h-8 rounded-full items-center justify-center border"
                style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder }}
              >
                <Ionicons name="close" size={14} color={colors.textTertiary} />
              </Pressable>
            </View>
          )}
        </View>
      ))}

      {anonymous > 0 && (
        <View className="rounded-2xl px-3.5 py-3 mb-2 border" style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder }}>
          <Text className="text-[13.5px]" style={{ color: colors.textSecondary }}>
            {anonymous} more spot{anonymous === 1 ? "" : "s"} held without a name
            {isOrganizer ? ", tap Hold a spot to name one." : "."}
          </Text>
        </View>
      )}

      {isOrganizer && !cancelled && (
        <Pressable
          testID="reserved-add"
          onPress={promptAdd}
          disabled={addSpot.isPending}
          className="rounded-pill py-3 items-center border-[1.5px]"
          style={{ borderColor: "rgba(255,255,255,0.15)", opacity: addSpot.isPending ? 0.5 : 1 }}
        >
          <Text className="font-body-bold text-[14.5px]" style={{ color: colors.text }}>
            Hold a spot
          </Text>
        </Pressable>
      )}

      {inviteTarget && (
        <InvitePicker gameId={gameId} spotId={inviteTarget} onDone={() => setInviteTarget(null)} />
      )}
    </View>
  );
}

// D10: the host picks someone they already know, and that person gets a push and decides. This
// is a name-prefix lookup, not a browsable directory.
function InvitePicker({ gameId, spotId, onDone }: { gameId: string; spotId: string; onDone: () => void }) {
  const [term, setTerm] = useState("");
  const { data: results, isFetching } = usePlayerSearch(term);
  const invite = useInviteToReservedSpot(gameId);

  return (
    <View className="rounded-2xl p-3.5 mt-2 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
      <View className="flex-row items-center justify-between mb-2">
        <Text className="font-body-extrabold text-[12.5px] uppercase" style={{ color: colors.textTertiary }}>
          Invite someone
        </Text>
        <Pressable onPress={onDone} hitSlop={8}>
          <Ionicons name="close" size={16} color={colors.textTertiary} />
        </Pressable>
      </View>
      <TextInput
        value={term}
        onChangeText={setTerm}
        placeholder="Search by name"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        className="rounded-xl px-3 py-2.5 text-[14.5px]"
        style={{ backgroundColor: colors.surface, color: colors.text }}
      />
      {term.trim().length < 2 ? (
        <Text className="text-[12px] mt-2" style={{ color: colors.textMuted }}>
          Type at least 2 letters.
        </Text>
      ) : isFetching ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 10 }} />
      ) : (results ?? []).length === 0 ? (
        <Text className="text-[12px] mt-2" style={{ color: colors.textMuted }}>
          Nobody by that name. They may not be on Smashio yet, try sending a link instead.
        </Text>
      ) : (
        (results ?? []).map((p) => (
          <Pressable
            key={p.id}
            onPress={() => {
              haptics.tap();
              invite.mutate(
                { spotId, profileId: p.id },
                {
                  onSuccess: onDone,
                  onError: (err) => Alert.alert("Couldn't invite", err instanceof Error ? err.message : "Give it another go."),
                }
              );
            }}
            className="flex-row items-center gap-3 py-2.5"
          >
            <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: p.color }}>
              <Text style={{ color: colors.base, fontWeight: "800" }}>{initial(p.name)}</Text>
            </View>
            <Text className="flex-1 font-body-bold text-[14.5px]" style={{ color: colors.text }}>
              {p.name}
            </Text>
            <Ionicons name="add" size={16} color={colors.accent} />
          </Pressable>
        ))
      )}
    </View>
  );
}
