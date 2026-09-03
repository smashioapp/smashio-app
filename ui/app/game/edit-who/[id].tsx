import { useEffect } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, TIERS } from "../../../lib/theme";
import { useGameDetail } from "../../../lib/queries/games";
import { useGameRoster } from "../../../lib/queries/gamePlayers";
import { useReservedSpots } from "../../../lib/queries/reservedSpots";
import { MAX_PLAYERS, MIN_PLAYERS, useAppStore } from "../../../lib/store";
import { EditorHeader, RowLabel } from "../../../components/DraftCardParts";
import { LineupStrip, type LineupSlot } from "../../../components/LineupStrip";
import { ReservedSpots } from "../../../components/ReservedSpots";
import { useSession } from "../../../lib/session";
import { useProfile } from "../../../lib/queries/profile";

// Full-screen WHO row editor (create-game-plan.md band 08a). "This is the one place the strip
// isn't a preview" — every filled slot is someone who actually joined, so joined slots get a
// peek, not a remove action; only holds get name/release. Capacity itself is the add/remove pair
// trailing the strip, replacing the old bare "max players" stepper block.
export default function EditWho() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const gameId = id ?? "";
  const editDraft = useAppStore((s) => s.editDraft);
  const patch = useAppStore((s) => s.patchEditDraft);
  const gameQuery = useGameDetail(gameId);
  const rosterQuery = useGameRoster(gameId);
  const reservedSpotsQuery = useReservedSpots(gameId);
  const { session } = useSession();
  const { data: profile } = useProfile(session?.user.id);

  const missingDraft = !editDraft || editDraft.gameId !== id || !gameQuery.data;
  useEffect(() => {
    if (missingDraft) router.replace(`/game/edit/${id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingDraft]);
  if (missingDraft) return null;
  const d = editDraft.current;
  const game = gameQuery.data;
  const approvedCount = rosterQuery.data?.length ?? 0;
  const named = reservedSpotsQuery.data ?? [];
  const namedSlots: LineupSlot[] = named.map((s) => ({ kind: "named", id: s.id, label: s.claimedName ?? s.invitedName ?? s.label, claimed: !!s.claimedBy }));
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
  const minPlayers = Math.max(MIN_PLAYERS, 1 + approvedCount + Math.max(0, game.reservedSpots - game.reservedClaimed));

  return (
    <View className="flex-1" style={{ backgroundColor: colors.baseAlt }}>
      <EditorHeader title="Who" onBack={() => router.back()} onDone={() => router.back()} />
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 30 }}>
        <RowLabel>{`LINEUP · ${filledCount} of ${d.maxPlayers}`}</RowLabel>
        <View className="flex-row items-center gap-1.5 mt-2.5">
          <LineupStrip slots={lineupSlots} courtsBooked={1} size={40} />
          <Pressable
            onPress={() => patch({ maxPlayers: Math.min(MAX_PLAYERS, d.maxPlayers + 1) })}
            disabled={d.maxPlayers >= MAX_PLAYERS}
            className="w-10 h-10 rounded-full items-center justify-center border-[1.6px]"
            style={{ borderColor: colors.accent3, borderStyle: "dashed", opacity: d.maxPlayers >= MAX_PLAYERS ? 0.4 : 1 }}
          >
            <Ionicons name="add-outline" size={16} color={colors.accent3} />
          </Pressable>
          <Pressable
            onPress={() => patch({ maxPlayers: Math.max(minPlayers, d.maxPlayers - 1) })}
            disabled={d.maxPlayers <= minPlayers}
            className="w-8 h-8 rounded-full items-center justify-center border-[1.6px]"
            style={{ borderColor: colors.textMuted, opacity: d.maxPlayers <= minPlayers ? 0.35 : 1 }}
          >
            <Ionicons name="remove-outline" size={16} color={colors.textSecondary} />
          </Pressable>
        </View>
        <Text className="text-[12px] mt-2" style={{ color: colors.textMuted }}>
          {minPlayers > MIN_PLAYERS
            ? `Joined players can't be silently removed here, only invited-not-joined holds show a Release action, so this can't go below ${minPlayers}.`
            : "No one's joined yet, so you can still change this freely."}
        </Text>

        <RowLabel style={{ marginTop: 18 }}>Held spots</RowLabel>
        <ReservedSpots gameId={gameId} isOrganizer reservedSpots={game.reservedSpots} cancelled={false} />

        <RowLabel style={{ marginTop: 18 }}>Skill range</RowLabel>
        <View className="flex-row gap-2 flex-wrap mb-4">
          {TIERS.map((t) => {
            const minOrd = TIERS.findIndex((x) => x.id === d.skill);
            const maxOrd = TIERS.findIndex((x) => x.id === d.skillMax);
            const ord = TIERS.findIndex((x) => x.id === t.id);
            const inRange = ord >= minOrd && ord <= maxOrd;
            return (
              <Pressable
                key={t.id}
                onPress={() => {
                  if (ord < minOrd) patch({ skill: t.id, skillMax: maxOrd < ord ? t.id : d.skillMax });
                  else if (ord > maxOrd) patch({ skillMax: t.id, skill: minOrd > ord ? t.id : d.skill });
                  else if (t.id === d.skill) patch({ skill: t.id });
                  else patch({ skillMax: t.id });
                }}
                className="rounded-pill px-3.5 py-2 flex-row items-center gap-1.5"
                style={{ backgroundColor: inRange ? colors.surfaceAlt : colors.surface, borderWidth: 1.5, borderColor: inRange ? t.color : "rgba(255,255,255,0.07)" }}
              >
                <View className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                <Text className="font-body-bold text-[12.5px]" style={{ color: inRange ? colors.text : colors.textMuted }}>{t.id}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
