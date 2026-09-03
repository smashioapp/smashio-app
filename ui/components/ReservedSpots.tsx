import { useState } from "react";
import { View, Text, Pressable, TextInput, Alert, Share, ActivityIndicator } from "react-native";
import * as Clipboard from "expo-clipboard";
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
  useSetReservedSpotExpiry,
  usePlayerSearch,
  type ReservedSpot,
} from "../lib/queries/reservedSpots";
import { Sheet } from "./Sheet";
import { track } from "../lib/analytics";

// band 12e's row countdown — "1h 40m" style, matching format.ts's formatCountdown shape but
// driven off a plain ms-left number since it's computed once above, not from an ISO string.
function formatHoldCountdown(msLeft: number): string {
  const totalMins = Math.round(msLeft / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return h === 0 ? `${m}m` : `${h}h ${m}m`;
}

// post-game-plan.md D2/D3/D10/D11, restyled per create-game-plan.md band 12a/12b: five hold
// states rendered distinctly (held-no-name, held-for-a-name, link-sent, invited, claimed), and
// every un-claimed hold is a single tap target that opens a "Manage this hold" sheet in place —
// no separate screen, no iOS-only Alert.prompt (a real Android bug the old row-icon UI had).
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
  const [managing, setManaging] = useState<ReservedSpot | null>(null);

  const named = spots ?? [];
  const anonymous = Math.max(0, reservedSpots - named.length);

  if (!isOrganizer && named.length === 0 && anonymous === 0) return null;

  const holdSpot = () => {
    haptics.tap();
    addSpot.mutate(null, {
      onError: (err) => Alert.alert("Couldn't hold a spot", err instanceof Error ? err.message : "Give it another go."),
    });
  };

  return (
    <View>
      <Text className="font-body-extrabold text-[13px] uppercase tracking-wide mt-5.5 mb-2.5" style={{ color: colors.textTertiary }}>
        Held for friends ({named.length + anonymous})
      </Text>

      {isLoading && <ActivityIndicator color={colors.accent} />}

      {named.map((spot) => (
        <HoldRow key={spot.id} spot={spot} isOrganizer={isOrganizer} cancelled={cancelled} onManage={() => setManaging(spot)} />
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
          onPress={holdSpot}
          disabled={addSpot.isPending}
          className="rounded-pill py-3 items-center border-[1.5px]"
          style={{ borderColor: "rgba(255,255,255,0.15)", opacity: addSpot.isPending ? 0.5 : 1 }}
        >
          <Text className="font-body-bold text-[14.5px]" style={{ color: colors.text }}>
            Hold a spot
          </Text>
        </Pressable>
      )}

      {managing && (
        <ManageHoldSheet gameId={gameId} spot={managing} onClose={() => setManaging(null)} />
      )}
    </View>
  );
}

// The five hold states (band 12a), each a visually distinct tile+row, not read from a caption.
function HoldRow({
  spot,
  isOrganizer,
  cancelled,
  onManage,
}: {
  spot: ReservedSpot;
  isOrganizer: boolean;
  cancelled: boolean;
  onManage: () => void;
}) {
  const claimed = !!spot.claimedBy;
  const invited = !!spot.invitedProfileId && !claimed;
  const linkSent = !!spot.inviteToken && !claimed && !invited;
  const namedNoLink = !!spot.label && !claimed && !invited && !linkSent;

  // band 12e: quiet for most of the window, an amber countdown once inside the last 2 hours.
  const msLeft = spot.expiresAt ? new Date(spot.expiresAt).getTime() - Date.now() : null;
  const expiringSoon = !claimed && !spot.pinned && msLeft != null && msLeft > 0 && msLeft <= 2 * 60 * 60 * 1000;
  const countdown = expiringSoon ? formatHoldCountdown(msLeft!) : null;

  const title = spot.claimedName ?? spot.invitedName ?? (spot.label ? `Held for ${spot.label}` : "Held, no name yet");
  const subtitle = claimed
    ? "Joined just now"
    : invited
      ? "Invited, hasn't answered"
      : linkSent
        ? "Link sent"
        : namedNoLink
          ? "No link sent"
          : null;

  return (
    <Pressable
      onPress={isOrganizer && !cancelled && !claimed ? onManage : undefined}
      className="flex-row items-center gap-3 rounded-2xl px-3.5 py-3 mb-2 border"
      style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}
    >
      <View
        className="w-9 h-9 rounded-full items-center justify-center overflow-hidden"
        style={{
          backgroundColor: spot.label || claimed || invited ? spot.color : colors.surfaceAlt,
          borderWidth: claimed ? 0 : 2,
          borderColor: claimed ? "transparent" : invited ? colors.beginner : colors.advanced,
          borderStyle: claimed ? "solid" : "dashed",
          opacity: invited ? 0.6 : 1,
        }}
      >
        <Text style={{ color: colors.base, fontWeight: "800" }}>
          {initial(spot.claimedName ?? spot.invitedName ?? spot.label ?? "?")}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="font-body-bold text-[15px]" style={{ color: colors.text }}>{title}</Text>
        {subtitle && (
          <Text className="text-[12px]" style={{ color: claimed ? colors.intermediate : colors.textMuted }}>{subtitle}</Text>
        )}
      </View>
      {!claimed && spot.pinned && <Ionicons name="pin-outline" size={14} color={colors.accent3} />}
      {countdown && (
        <View className="flex-row items-center gap-1">
          <Ionicons name="time-outline" size={12} color={colors.advanced} />
          <Text className="font-body-extrabold text-[11px]" style={{ color: colors.advanced }}>{countdown}</Text>
        </View>
      )}
      {isOrganizer && !cancelled && !claimed && (
        <Text className="font-body-bold text-[11.5px]" style={{ color: namedNoLink ? colors.accent3 : colors.danger }}>
          {namedNoLink ? "Get link" : "Manage"}
        </Text>
      )}
    </Pressable>
  );
}

// band 12b — "tapping the anonymous row opens exactly this, in place, no separate screen."
// Reused for every un-claimed hold, not just anonymous ones — naming, inviting, linking and
// releasing are all the same job regardless of what state the spot is currently in.
function ManageHoldSheet({ gameId, spot, onClose }: { gameId: string; spot: ReservedSpot; onClose: () => void }) {
  const rename = useRenameReservedSpot(gameId);
  const removeSpot = useRemoveReservedSpot(gameId);
  const createInvite = useCreateReservedSpotInvite(gameId);
  const setExpiry = useSetReservedSpotExpiry(gameId);
  const [mode, setMode] = useState<"menu" | "name" | "invite">("menu");
  const [nameInput, setNameInput] = useState(spot.label ?? "");
  const [link, setLink] = useState<string | null>(null);

  const getLink = () => {
    haptics.tap();
    createInvite.mutate(spot.id, {
      onSuccess: (url) => setLink(url),
      onError: (err) => Alert.alert("Couldn't make a link", err instanceof Error ? err.message : "Give it another go."),
    });
  };

  const copyForWhatsApp = async () => {
    if (!link) return;
    await Clipboard.setStringAsync(`Here's your spot: ${link}`);
    haptics.success();
    track("share_sent", { kind: "invite" });
    Share.share({ message: `Here's your spot: ${link}` }).catch(() => null);
  };

  const saveName = () => {
    rename.mutate(
      { spotId: spot.id, label: nameInput.trim() },
      {
        onSuccess: onClose,
        onError: (err) => Alert.alert("Couldn't save that", err instanceof Error ? err.message : "Give it another go."),
      }
    );
  };

  const confirmRelease = () => {
    Alert.alert(
      "Release this spot?",
      "It goes open to anyone on Discover, the game doesn't shrink.",
      [
        { text: "Keep holding", style: "cancel" },
        {
          text: "Release",
          style: "destructive",
          onPress: () => {
            removeSpot.mutate(spot.id, {
              onSuccess: onClose,
              onError: (err) => Alert.alert("Couldn't release", err instanceof Error ? err.message : "Give it another go."),
            });
          },
        },
      ]
    );
  };

  return (
    <Sheet visible onClose={onClose} title={mode === "name" ? "Name it" : mode === "invite" ? "Invite someone" : "Manage this hold"}>
      {mode === "menu" && !link && (
        <View>
          <View className="flex-row gap-2 flex-wrap">
            <Pressable onPress={() => setMode("name")} className="rounded-pill px-3.5 py-2 border" style={{ borderColor: colors.cardBorder, backgroundColor: colors.surface }}>
              <Text className="font-body-bold text-[13px]" style={{ color: colors.text }}>Name it</Text>
            </Pressable>
            <Pressable onPress={() => setMode("invite")} className="rounded-pill px-3.5 py-2 border" style={{ borderColor: colors.cardBorder, backgroundColor: colors.surface }}>
              <Text className="font-body-bold text-[13px]" style={{ color: colors.text }}>Invite someone</Text>
            </Pressable>
            <Pressable onPress={getLink} disabled={createInvite.isPending} className="rounded-pill px-3.5 py-2 border" style={{ borderColor: colors.cardBorder, backgroundColor: colors.surface }}>
              <Text className="font-body-bold text-[13px]" style={{ color: colors.text }}>{createInvite.isPending ? "Getting link…" : spot.inviteToken ? "Send a new link" : "Get a link"}</Text>
            </Pressable>
          </View>

          <Text className="font-body-extrabold text-[11px] uppercase mt-4 mb-2" style={{ color: colors.textTertiary, letterSpacing: 0.5 }}>
            Auto-releases
          </Text>
          <View className="flex-row gap-2 flex-wrap">
            {[
              { label: "2h before", hours: 2 },
              { label: "4h before", hours: 4 },
            ].map((o) => {
              const active = !spot.pinned && spot.expiresAt != null;
              return (
                <Pressable
                  key={o.hours}
                  onPress={() => setExpiry.mutate({ spotId: spot.id, hoursBefore: o.hours, pinned: false })}
                  disabled={setExpiry.isPending}
                  className="rounded-pill px-3.5 py-2 border"
                  style={{ borderColor: active ? colors.accent : colors.cardBorder, backgroundColor: colors.surface }}
                >
                  <Text className="font-body-bold text-[12.5px]" style={{ color: colors.text }}>{o.label}</Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setExpiry.mutate({ spotId: spot.id, hoursBefore: 4, pinned: true })}
              disabled={setExpiry.isPending}
              className="rounded-pill px-3.5 py-2 flex-row items-center gap-1.5 border"
              style={{ borderColor: spot.pinned ? colors.accent3 : colors.cardBorder, backgroundColor: colors.surface }}
            >
              <Ionicons name="pin-outline" size={13} color={colors.accent3} />
              <Text className="font-body-bold text-[12.5px]" style={{ color: colors.text }}>Pin, never expires</Text>
            </Pressable>
          </View>
          <Text className="text-[11.5px] mt-2" style={{ color: colors.textMuted }}>
            {spot.pinned
              ? "The host said this one waits, so it does, forever if need be."
              : "Nobody's claimed it by then, it opens back up to anyone."}
          </Text>

          <Pressable onPress={confirmRelease} disabled={removeSpot.isPending} className="items-center py-3.5 mt-4">
            <Text className="font-body-bold text-[13.5px]" style={{ color: colors.danger }}>Release this spot</Text>
          </Pressable>
        </View>
      )}

      {mode === "menu" && link && (
        <View>
          <View className="flex-row items-center gap-2 rounded-2xl px-3.5 py-3 border" style={{ backgroundColor: colors.cardAlt, borderColor: colors.cardBorder }}>
            <Ionicons name="link-outline" size={14} color={colors.accent3} />
            <Text numberOfLines={1} className="flex-1 text-[12px]" style={{ color: colors.textDim }}>{link}</Text>
            <Pressable onPress={() => Clipboard.setStringAsync(link)} hitSlop={6}>
              <Ionicons name="copy-outline" size={14} color={colors.accent3} />
            </Pressable>
          </View>
          <Text className="text-[12px] mt-2" style={{ color: colors.textSecondary }}>
            Single use, first tap wins. Forwarding it to a group chat means whoever's fastest gets the spot.
          </Text>
          <Pressable onPress={copyForWhatsApp} className="rounded-pill py-3 items-center mt-3" style={{ backgroundColor: colors.accent }}>
            <Text className="font-body-extrabold text-[14px]" style={{ color: colors.base }}>Copy for WhatsApp</Text>
          </Pressable>
          <Pressable onPress={getLink} disabled={createInvite.isPending} className="items-center py-3 mt-1">
            <Text className="font-body-bold text-[13px]" style={{ color: colors.textSecondary }}>Send a new link instead</Text>
          </Pressable>
        </View>
      )}

      {mode === "name" && (
        <View>
          <TextInput
            value={nameInput}
            onChangeText={setNameInput}
            placeholder="Who's it for?"
            placeholderTextColor={colors.textMuted}
            maxLength={40}
            autoFocus
            className="rounded-2xl px-3.5 py-3 border text-[15px]"
            style={{ backgroundColor: colors.card, borderColor: colors.cardBorder, color: colors.text }}
          />
          <Pressable onPress={saveName} disabled={rename.isPending} className="rounded-pill py-3.5 items-center mt-3.5" style={{ backgroundColor: colors.accent }}>
            <Text className="font-body-extrabold text-[14.5px]" style={{ color: colors.base }}>{rename.isPending ? "Saving…" : "Save"}</Text>
          </Pressable>
        </View>
      )}

      {mode === "invite" && <InvitePicker gameId={gameId} spotId={spot.id} onDone={onClose} />}
    </Sheet>
  );
}

// D10: the host picks someone they already know, and that person gets a push and decides. This
// is a name-prefix lookup, not a browsable directory.
function InvitePicker({ gameId, spotId, onDone }: { gameId: string; spotId: string; onDone: () => void }) {
  const [term, setTerm] = useState("");
  const { data: results, isFetching } = usePlayerSearch(term);
  const invite = useInviteToReservedSpot(gameId);

  return (
    <View>
      <TextInput
        value={term}
        onChangeText={setTerm}
        placeholder="Search by name"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoFocus
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
