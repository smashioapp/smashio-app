import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, tierColor } from "../../../lib/theme";
import { formatDate, formatTimeRange, formatTimeShort, formatCountdown } from "../../../lib/format";
import { durationMs, formatDuration } from "../../../lib/schedule";
import { useCancelGame, useGameDetail, useUpdateGame } from "../../../lib/queries/games";
import { useGameRoster } from "../../../lib/queries/gamePlayers";
import { useSkillTiers } from "../../../lib/queries/sports";
import { useReservedSpots } from "../../../lib/queries/reservedSpots";
import { LineupStrip, lineupSummary, type LineupSlot } from "../../../components/LineupStrip";
import { BackButton } from "../../../components/BackButton";
import { Sheet } from "../../../components/Sheet";
import { useAppStore, type EditGameFields } from "../../../lib/store";
import { costRow, loudSummary, moreRow, pushPreview, whenRow, whoRow } from "../../../lib/editGameDiff";
import { haptics } from "../../../lib/haptics";
import { useSession } from "../../../lib/session";
import { useProfile } from "../../../lib/queries/profile";
import { shareGame } from "../../../lib/share";

const SPORT_SLUG = "badminton";
// design-brief band 08 item 5: within this of start, the WHEN row grows a caution line and the
// status pill goes amber — editing is still allowed, the host just sees the runway first.
const STARTING_SOON_MS = 2 * 60 * 60 * 1000;

// Host a Game v3 edit mode (create-game-plan.md §9.8, design band 08): a read state you enter and
// leave. Ten stacked blocks collapse to a header, one locked venue line, and four value rows —
// WHEN/WHO/COST/MORE OPTIONS — each pushing to its own full-screen editor (edit-when/edit-who/
// edit-cost/edit-more) instead of expanding in place. Draft state lives in useAppStore().editDraft
// so it survives the push/pop between this screen and its editors.
export default function EditGame() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const gameId = id ?? "";
  const gameQuery = useGameDetail(gameId);
  const game = gameQuery.data;
  const rosterQuery = useGameRoster(gameId);
  const reservedSpotsQuery = useReservedSpots(gameId);
  const { data: tiers = [] } = useSkillTiers(SPORT_SLUG);
  const updateGame = useUpdateGame(gameId);
  const cancelGame = useCancelGame(gameId);
  const { session } = useSession();
  const { data: profile } = useProfile(session?.user.id);

  const editDraft = useAppStore((s) => s.editDraft);
  const initEditDraft = useAppStore((s) => s.initEditDraft);
  const discardEditDraft = useAppStore((s) => s.discardEditDraft);
  const clearEditDraft = useAppStore((s) => s.clearEditDraft);

  const [kebabOpen, setKebabOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState<"failed" | "offline" | null>(null);

  useEffect(() => {
    if (!game) return;
    initEditDraft(gameId, {
      startsAt: new Date(game.startsAt),
      durationHours: game.durationHours,
      courtsBooked: game.courtsBooked,
      courtLabel: game.courts ?? "",
      skill: game.skill,
      skillMax: game.skillTierMax ?? game.skill,
      maxPlayers: game.maxPlayers,
      cost: game.cost,
      format: game.format ?? "social",
      visibility: game.visibility ?? "public",
      autoApprove: game.autoApprove ?? true,
      shuttles: game.shuttles ?? "",
      notes: game.notes ?? "",
      // eslint-disable-next-line
    } as EditGameFields);
    // Leaving the screen entirely (not just pushing to a row editor) clears the draft so a later
    // visit starts from the server's current values, not a stale edit.
    return () => clearEditDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id]);

  if (gameQuery.isLoading || !editDraft || editDraft.gameId !== gameId) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.baseAlt }}>
        <Text style={{ color: colors.textSecondary }}>Loading…</Text>
      </View>
    );
  }
  if (!game) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.baseAlt }}>
        <Text style={{ color: colors.textSecondary }}>Game not found</Text>
      </View>
    );
  }

  const d = editDraft.current;
  const o = editDraft.original;
  const approvedCount = rosterQuery.data?.length ?? 0;
  const cancelled = game.status === "cancelled";

  const named = reservedSpotsQuery.data ?? [];
  const namedSlots: LineupSlot[] = named.map((s) => ({
    kind: "named",
    id: s.id,
    label: s.claimedName ?? s.invitedName ?? s.label,
    claimed: !!s.claimedBy,
    invitedProfileId: s.invitedProfileId,
    avatarKey: s.invitedAvatarKey,
    photoUri: s.invitedPhotoUri,
    expiringSoon: !s.pinned && !!s.expiresAt && new Date(s.expiresAt).getTime() - Date.now() <= 2 * 60 * 60 * 1000 && new Date(s.expiresAt).getTime() > Date.now(),
  }));
  const joinedSlots: LineupSlot[] = (rosterQuery.data ?? []).map((p) => ({ kind: "joined", id: p.id, name: p.name, avatarKey: p.avatarKey, photoUri: p.photoUri }));
  const anonCount = Math.max(0, game.reservedSpots - named.length);
  const anonSlots: LineupSlot[] = Array.from({ length: anonCount }, (_, i) => ({ kind: "anon", id: `anon-${i}` }));
  const filledCount = 1 + joinedSlots.length + namedSlots.length + anonSlots.length;
  const openCount = Math.max(0, d.maxPlayers - filledCount);
  const openSlots: LineupSlot[] = Array.from({ length: openCount }, (_, i) => ({ kind: "open", id: `open-${i}` }));
  const lineupSlots: LineupSlot[] = [
    { kind: "host", id: game.organizerId, name: profile?.display_name || "You", avatarKey: profile?.avatar_key },
    ...joinedSlots,
    ...namedSlots,
    ...anonSlots,
    ...openSlots,
  ];

  const when = whenRow(d, o);
  const who = whoRow(d, o);
  const cost = costRow(d, o);
  const more = moreRow(d, o);
  const anyDirty = when.dirty || who.dirty || cost.dirty || more.dirty;
  const summary = loudSummary(d, o, approvedCount);
  const preview = pushPreview(d, o, game.venue);
  const startsInMs = d.startsAt.getTime() - Date.now();
  const startingSoon = startsInMs > 0 && startsInMs <= STARTING_SOON_MS;
  const countdown = formatCountdown(d.startsAt.toISOString());

  const dirtyRowChangedNames = [when.dirty && "the time", who.dirty && "the lineup", cost.dirty && "the price", more.dirty && "more options"].filter(Boolean) as string[];

  const save = () => {
    const tier = tiers.find((t) => t.label === d.skill);
    const tierMax = tiers.find((t) => t.label === d.skillMax) ?? tier;
    if (!tier) {
      Alert.alert("Not ready yet", "Still loading skill levels, give it a moment.");
      return;
    }
    if (d.startsAt.getTime() <= Date.now()) {
      Alert.alert("Pick a future time", "That start time has already passed.");
      return;
    }
    setSaving(true);
    setSaveFailed(null);
    updateGame.mutate(
      {
        startsAt: d.startsAt,
        skillTierId: tier.id,
        skillTierMaxId: tierMax?.id,
        maxPlayers: d.maxPlayers,
        courtsBooked: d.courtsBooked,
        courtLabel: d.courtLabel,
        durationHours: d.durationHours,
        costPerPlayerCents: Math.round(d.cost * 100),
        reservedSpots: game.reservedSpots,
        visibility: d.visibility,
        autoApprove: d.autoApprove,
        shuttles: d.shuttles,
        notes: d.notes,
      },
      {
        onSuccess: () => {
          haptics.success();
          setSaving(false);
          clearEditDraft();
          router.back();
        },
        onError: (e) => {
          haptics.error();
          setSaving(false);
          // Heuristic, not a live connectivity signal — this app has no NetInfo dependency yet
          // (create-game-plan.md deviation log). A network-shaped error reads as "offline", any
          // other failure reads as "save failed".
          const msg = e instanceof Error ? e.message : "";
          setSaveFailed(/network|fetch|offline/i.test(msg) ? "offline" : "failed");
        },
      }
    );
  };

  const confirmCancel = () => {
    cancelGame.mutate(undefined, {
      onSuccess: () => {
        haptics.success();
        clearEditDraft();
        setCancelOpen(false);
        router.back();
      },
      onError: (e) => {
        haptics.error();
        Alert.alert("Couldn't cancel", e instanceof Error ? e.message : "Give it another go.");
      },
    });
  };

  const moreOptionsSummary = [
    { social: "Social", competitive: "Competitive", drills: "Drills", doubles_rotation: "Doubles rotation" }[d.format] ?? "Social",
    d.visibility === "public" ? "Public" : "Link only",
    d.autoApprove ? "Auto-approve joins" : "Review joins",
    d.shuttles.trim() ? d.shuttles : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const goto = (screen: "edit-when" | "edit-who" | "edit-cost" | "edit-more") => {
    haptics.tap();
    router.push(`/game/${screen}/${gameId}`);
  };

  return (
    <View className="flex-1 pt-14" style={{ backgroundColor: colors.baseAlt, opacity: cancelled ? 0.85 : 1 }}>
      <View className="flex-row items-center justify-between px-5 pb-2">
        <Pressable onPress={() => { clearEditDraft(); router.back(); }} className="flex-row items-center gap-1">
          <Ionicons name="chevron-back-outline" size={17} color={colors.textSecondary} />
          <Text className="font-display text-[18px]" style={{ color: colors.text }}>Edit game</Text>
        </Pressable>
        {!cancelled && (
          <Pressable onPress={() => { haptics.tap(); setKebabOpen(true); }} hitSlop={10}>
            <Ionicons name="ellipsis-horizontal-outline" size={18} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>

      {cancelled ? (
        <View className="px-5">
          <View className="self-start rounded-pill px-2 py-1 mb-2.5" style={{ backgroundColor: colors.surfaceAlt }}>
            <Text className="font-body-extrabold text-[10px]" style={{ color: colors.textSecondary }}>CANCELLED</Text>
          </View>
          <Text className="text-[12.5px] leading-5 mb-4" style={{ color: colors.textSecondary }}>
            This game's off, so there's nothing left to edit. It's kept here as a record for you{approvedCount > 0 ? ` and the ${approvedCount} ${approvedCount === 1 ? "player who was" : "players who were"} in` : ""}.
          </Text>
        </View>
      ) : (
        <View className="px-5 flex-row items-center gap-2 mb-2">
          {game.verified && (
            <View className="flex-row items-center gap-1 rounded-pill px-2 py-1" style={{ backgroundColor: "rgba(53,214,166,0.16)" }}>
              <Ionicons name="checkmark-outline" size={9} color={colors.intermediate} />
              <Text className="font-body-extrabold text-[10px]" style={{ color: colors.intermediate }}>VERIFIED</Text>
            </View>
          )}
          {countdown && (
            <Text className="font-body-bold text-[11.5px]" style={{ color: startingSoon ? colors.advanced : colors.textSecondary }}>{countdown}</Text>
          )}
        </View>
      )}

      <View className="px-5 mb-4">
        <View className="flex-row items-center gap-1.5 mb-1.5">
          <Ionicons name="lock-closed-outline" size={12} color={colors.textTertiary} />
          <Text numberOfLines={1} className="font-body-bold text-[12px] flex-1" style={{ color: colors.textTertiary }}>{game.venue} · locked</Text>
        </View>
        {!cancelled && (
          <Pressable onPress={() => { haptics.tap(); router.push(`/game/${gameId}`); }} className="flex-row items-center gap-1 self-start">
            <Text className="font-body-bold text-[11.5px]" style={{ color: colors.accent3 }}>See what players see</Text>
            <Ionicons name="chevron-forward-outline" size={11} color={colors.accent3} />
          </Pressable>
        )}
      </View>

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: anyDirty && !cancelled ? 140 : 32 }}>
        <ReadRow
          label="WHEN"
          value={`${formatDate(d.startsAt.toISOString())} · ${formatTimeRange(d.startsAt.toISOString(), new Date(d.startsAt.getTime() + durationMs(d.durationHours)).toISOString())} · ${d.courtsBooked} court${d.courtsBooked === 1 ? "" : "s"}`}
          was={when.dirty ? `was ${formatTimeRange(o.startsAt.toISOString(), new Date(o.startsAt.getTime() + durationMs(o.durationHours)).toISOString())}` : undefined}
          dirty={when.dirty}
          loud={when.loud}
          notifyCount={when.loud ? approvedCount : undefined}
          caution={!when.dirty && startingSoon ? "Changing this now reaches players with almost no notice" : undefined}
          cancelled={cancelled}
          onPress={() => goto("edit-when")}
        />
        <ReadRow
          label="WHO"
          value={lineupSummary(lineupSlots, d.cost)}
          was={who.dirty ? `was ${o.maxPlayers} players max` : undefined}
          dirty={who.dirty}
          loud={who.loud}
          notifyCount={who.loud ? approvedCount : undefined}
          cancelled={cancelled}
          onPress={() => goto("edit-who")}
        >
          {!cancelled && (
            <View className="flex-row items-center mt-2.5">
              <LineupStrip slots={lineupSlots.slice(0, 8)} courtsBooked={1} size={26} />
            </View>
          )}
        </ReadRow>
        <ReadRow
          label="COST"
          value={`$${d.cost} per player`}
          was={cost.dirty ? `was $${o.cost} per player` : undefined}
          dirty={cost.dirty}
          loud={cost.loud}
          notifyCount={cost.loud ? approvedCount : undefined}
          cancelled={cancelled}
          onPress={() => goto("edit-cost")}
        />
        {!cancelled && (
          <ReadRow label="MORE OPTIONS" value={moreOptionsSummary} dirty={more.dirty} loud={false} quietEdited={more.dirty} cancelled={cancelled} onPress={() => goto("edit-more")} />
        )}
      </ScrollView>

      {anyDirty && !cancelled && (
        <View className="absolute left-0 right-0 bottom-0 px-5 pb-8 pt-3.5" style={{ backgroundColor: colors.cardAlt, borderTopWidth: 1, borderTopColor: colors.cardBorder }}>
          {saveFailed === "failed" && (
            <View className="mb-2.5">
              <Text className="font-body-bold text-[13px]" style={{ color: colors.danger }}>Something's gone wrong saving that, give it another go.</Text>
              <Text className="text-[11.5px] mt-0.5" style={{ color: colors.textSecondary }}>Your changes are still right here, nothing's lost.</Text>
            </View>
          )}
          {saveFailed === "offline" && (
            <View className="mb-2.5">
              <Text className="font-body-bold text-[13px]" style={{ color: colors.advanced }}>You're offline, we'll save this the second you're back.</Text>
              <Text className="text-[11.5px] mt-0.5" style={{ color: colors.textSecondary }}>Your changes are kept right here either way.</Text>
            </View>
          )}
          {!saveFailed && (
            <>
              {summary && <Text className="font-body-bold text-[13px]" style={{ color: colors.text }}>{summary}</Text>}
              {more.dirty && <Text className="text-[11.5px] mt-0.5" style={{ color: colors.textTertiary }}>Everything else stays quiet, no one's notified.</Text>}
              {preview && (
                <Text className="text-[10.5px] italic mt-1" style={{ color: colors.textTertiary }}>"{preview.title}. {preview.body}"</Text>
              )}
            </>
          )}
          <View className="flex-row gap-2.5 mt-3">
            <Pressable
              onPress={() => { haptics.tap(); if (anyDirty) setDiscardOpen(true); }}
              disabled={saving}
              className="flex-1 rounded-pill py-3.5 items-center border"
              style={{ borderColor: colors.cardBorder, opacity: saving ? 0.4 : 1 }}
            >
              <Text className="font-body-bold text-[14.5px]" style={{ color: colors.text }}>Discard</Text>
            </Pressable>
            <Pressable onPress={save} disabled={saving} className="flex-1 rounded-pill py-3.5 items-center" style={{ backgroundColor: colors.accent, opacity: saving ? 0.6 : 1 }}>
              <Text className="font-body-extrabold text-[14.5px]" style={{ color: colors.base }}>{saving ? "Saving…" : saveFailed ? "Try again" : "Save changes"}</Text>
            </Pressable>
          </View>
        </View>
      )}

      <Sheet visible={kebabOpen} onClose={() => setKebabOpen(false)} title="">
        <Pressable onPress={() => { setKebabOpen(false); router.push(`/game/${gameId}`); }} className="flex-row items-center gap-3 py-3">
          <Ionicons name="open-outline" size={16} color={colors.textSecondary} />
          <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>See what players see</Text>
        </Pressable>
        <View className="h-[1px]" style={{ backgroundColor: colors.cardBorder }} />
        <Pressable onPress={() => { setKebabOpen(false); haptics.tap(); shareGame(game); }} className="flex-row items-center gap-3 py-3">
          <Ionicons name="share-outline" size={16} color={colors.textSecondary} />
          <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>Share this game</Text>
        </Pressable>
        <View className="h-[1px]" style={{ backgroundColor: colors.cardBorder }} />
        <Pressable onPress={() => { setKebabOpen(false); setCancelOpen(true); }} className="flex-row items-center gap-3 py-3">
          <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
          <Text className="font-body-bold text-[14px]" style={{ color: colors.danger }}>Cancel this game</Text>
        </Pressable>
      </Sheet>

      <Sheet visible={discardOpen} onClose={() => setDiscardOpen(false)} title="Discard your changes?">
        <Text className="text-[13px]" style={{ color: colors.textSecondary }}>
          You changed {dirtyRowChangedNames.length <= 1 ? dirtyRowChangedNames[0] ?? "this" : `${dirtyRowChangedNames.slice(0, -1).join(", ")} and ${dirtyRowChangedNames[dirtyRowChangedNames.length - 1]}`}. Leaving now throws that away, nothing's saved yet.
        </Text>
        <Pressable onPress={() => setDiscardOpen(false)} className="rounded-pill py-3.5 items-center mt-4" style={{ backgroundColor: colors.accent }}>
          <Text className="font-body-extrabold text-[14.5px]" style={{ color: colors.base }}>Keep editing</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            discardEditDraft();
            setSaveFailed(null);
            setDiscardOpen(false);
          }}
          className="items-center py-3.5 mt-1"
        >
          <Text className="font-body-bold text-[14px]" style={{ color: colors.danger }}>Discard changes</Text>
        </Pressable>
      </Sheet>

      <Sheet visible={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this game?">
        <Text className="text-[13px]" style={{ color: colors.textSecondary }}>
          {approvedCount > 0 ? `${approvedCount} ${approvedCount === 1 ? "player loses" : "players lose"} their spot. We'll let them know it's off, straight away.` : "We'll let anyone who requested know it's off."}
        </Text>
        <Pressable
          onPress={confirmCancel}
          disabled={cancelGame.isPending}
          className="rounded-pill py-3.5 items-center mt-4"
          style={{ backgroundColor: colors.danger, opacity: cancelGame.isPending ? 0.6 : 1 }}
        >
          <Text className="font-body-extrabold text-[14.5px]" style={{ color: colors.base }}>{cancelGame.isPending ? "Cancelling…" : "Cancel game"}</Text>
        </Pressable>
        <Pressable onPress={() => setCancelOpen(false)} disabled={cancelGame.isPending} className="rounded-pill py-3.5 items-center mt-2.5 border" style={{ borderColor: colors.cardBorder }}>
          <Text className="font-body-bold text-[14.5px]" style={{ color: colors.text }}>Keep it</Text>
        </Pressable>
      </Sheet>
    </View>
  );
}

function ReadRow({
  label,
  value,
  was,
  dirty,
  loud,
  quietEdited,
  notifyCount,
  caution,
  cancelled,
  onPress,
  children,
}: {
  label: string;
  value: string;
  was?: string;
  dirty: boolean;
  loud: boolean;
  quietEdited?: boolean;
  notifyCount?: number;
  caution?: string;
  cancelled: boolean;
  onPress: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={cancelled ? undefined : onPress}
      className="rounded-2xl px-3.5 py-3.5 mb-2.5 border-[1.5px]"
      style={{
        backgroundColor: colors.card,
        borderColor: loud && dirty ? "rgba(255,182,72,.35)" : caution ? "rgba(255,182,72,.28)" : "rgba(255,255,255,.14)",
        opacity: cancelled ? 0.6 : 1,
      }}
    >
      <View className="flex-row justify-between items-start">
        <View className="flex-1 pr-2">
          <Text className="font-body-extrabold text-[10.5px] uppercase" style={{ color: colors.textTertiary, letterSpacing: 0.5 }}>{label}</Text>
          <Text className="font-body-bold text-[15px] mt-1" style={{ color: colors.text }}>{value}</Text>
          {was && <Text className="text-[11px] mt-0.5" style={{ color: colors.textMuted, textDecorationLine: "line-through" }}>{was}</Text>}
        </View>
        {!cancelled && <Ionicons name="chevron-forward-outline" size={14} color={colors.textTertiary} />}
      </View>
      {children}
      {notifyCount != null && (
        <Text className="font-body-extrabold text-[9.5px] mt-2" style={{ color: colors.advanced, letterSpacing: 0.3 }}>
          NOTIFIES {notifyCount} {notifyCount === 1 ? "PLAYER" : "PLAYERS"}
        </Text>
      )}
      {quietEdited && <Text className="text-[10.5px] font-body-bold mt-1.5" style={{ color: colors.textTertiary }}>Edited · no notification sent</Text>}
      {caution && <Text className="text-[11px] font-body-bold mt-1.5" style={{ color: colors.advanced }}>{caution}</Text>}
    </Pressable>
  );
}
