import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, Alert, TextInput } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { colors, TIERS, tierColor, type TierId } from "../../../lib/theme";
import { formatDate, formatTimeRange, formatTimeShort } from "../../../lib/format";
import { DURATION_STEP_HOURS, MAX_DURATION_HOURS, MIN_DURATION_HOURS, durationMs, formatDuration, slotAt } from "../../../lib/schedule";
import { MAX_COST_PER_PLAYER_PER_HOUR, MAX_COURTS_BOOKED, MAX_PLAYERS, MIN_COURTS_BOOKED, MIN_PLAYERS } from "../../../lib/store";
import { useCancelGame, useGameDetail, useUpdateGame } from "../../../lib/queries/games";
import { useGameRoster } from "../../../lib/queries/gamePlayers";
import { useSkillTiers } from "../../../lib/queries/sports";
import { useReservedSpots } from "../../../lib/queries/reservedSpots";
import { Button } from "../../../components/Button";
import { BackButton } from "../../../components/BackButton";
import { Sheet } from "../../../components/Sheet";
import { AccordionRow, PriceSlider, RowLabel, Stepper } from "../../../components/DraftCardParts";
import { LineupStrip, lineupSummary, type LineupSlot } from "../../../components/LineupStrip";
import { ReservedSpots } from "../../../components/ReservedSpots";
import { haptics } from "../../../lib/haptics";
import { useSession } from "../../../lib/session";
import { useProfile } from "../../../lib/queries/profile";

const SPORT_SLUG = "badminton";
const COURT_CHIPS = [1, 2, 3, 4, 5, 6];
const DURATION_CHIPS = [1, 1.5, 2, 2.5];

// Host a Game v3 (create-game-plan.md §9.8): edit is a mode of the same draft card, not a
// separate form — venue locked with its reason, a persistent "players will be notified" line,
// save instead of publish. Reuses AccordionRow/LineupStrip from the create flow (wizard.tsx /
// DraftCardParts.tsx) so create and edit can't drift apart again.
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

  const [startsAt, setStartsAt] = useState<Date | null>(null);
  const [skill, setSkill] = useState<TierId>("Intermediate");
  const [skillMax, setSkillMax] = useState<TierId>("Intermediate");
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [courtsBooked, setCourtsBooked] = useState(1);
  const [courtsExpanded, setCourtsExpanded] = useState(false);
  const [courtLabel, setCourtLabel] = useState("");
  const [durationHours, setDurationHours] = useState(1.5);
  const [cost, setCost] = useState(8);
  const [reservedSpots, setReservedSpots] = useState(0);
  const [format, setFormat] = useState("social");
  const [visibility, setVisibility] = useState<"public" | "link_only">("public");
  const [autoApprove, setAutoApprove] = useState(true);
  const [shuttles, setShuttles] = useState("");
  const [notes, setNotes] = useState("");

  const [expandedRow, setExpandedRow] = useState<"when" | "who" | "cost" | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!game || startsAt) return;
    setStartsAt(new Date(game.startsAt));
    setSkill(game.skill);
    setSkillMax(game.skillTierMax ?? game.skill);
    setMaxPlayers(game.maxPlayers);
    setCourtsBooked(game.courtsBooked);
    setCourtLabel(game.courts ?? "");
    setDurationHours(game.durationHours);
    setCost(game.cost);
    setReservedSpots(game.reservedSpots);
    setFormat(game.format ?? "social");
    setVisibility(game.visibility ?? "public");
    setAutoApprove(game.autoApprove ?? true);
    setShuttles(game.shuttles ?? "");
    setNotes(game.notes ?? "");
  }, [game, startsAt]);

  const approvedCount = rosterQuery.data?.length ?? 0;
  const reservedClaimed = game?.reservedClaimed ?? 0;
  const heldForFriends = Math.max(0, reservedSpots - reservedClaimed);
  const minPlayers = Math.max(MIN_PLAYERS, 1 + approvedCount + heldForFriends);
  const maxCost = durationHours * MAX_COST_PER_PLAYER_PER_HOUR;

  if (gameQuery.isLoading || !startsAt) {
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

  const endsAt = new Date(startsAt.getTime() + durationMs(durationHours));
  const rescheduled = startsAt.toISOString() !== game.startsAt;
  const startInPast = startsAt.getTime() <= Date.now();

  const named = reservedSpotsQuery.data ?? [];
  const namedSlots: LineupSlot[] = named.map((s) => ({ kind: "named", id: s.id, label: s.claimedName ?? s.invitedName ?? s.label, claimed: !!s.claimedBy }));
  const joinedSlots: LineupSlot[] = (rosterQuery.data ?? []).map((p) => ({ kind: "joined", id: p.id, name: p.name, avatarKey: p.avatarKey, photoUri: p.photoUri }));
  const anonCount = Math.max(0, reservedSpots - named.length);
  const anonSlots: LineupSlot[] = Array.from({ length: anonCount }, (_, i) => ({ kind: "anon", id: `anon-${i}` }));
  const filledCount = 1 + joinedSlots.length + namedSlots.length + anonSlots.length;
  const openCount = Math.max(0, maxPlayers - filledCount);
  const openSlots: LineupSlot[] = Array.from({ length: openCount }, (_, i) => ({ kind: "open", id: `open-${i}` }));
  const lineupSlots: LineupSlot[] = [
    { kind: "host", id: game.organizerId, name: profile?.display_name || "You", avatarKey: profile?.avatar_key },
    ...joinedSlots,
    ...namedSlots,
    ...anonSlots,
    ...openSlots,
  ];

  const save = () => {
    const tier = tiers.find((t) => t.label === skill);
    const tierMax = tiers.find((t) => t.label === skillMax) ?? tier;
    if (!tier) {
      Alert.alert("Not ready yet", "Still loading skill levels, give it a moment.");
      return;
    }
    if (startInPast) {
      Alert.alert("Pick a future time", "That start time has already passed.");
      return;
    }
    updateGame.mutate(
      {
        startsAt,
        skillTierId: tier.id,
        skillTierMaxId: tierMax?.id,
        maxPlayers,
        courtsBooked,
        courtLabel,
        durationHours,
        costPerPlayerCents: Math.round(cost * 100),
        reservedSpots,
        visibility,
        autoApprove,
        shuttles,
        notes,
      },
      {
        onSuccess: () => {
          haptics.success();
          router.back();
        },
        onError: (e) => {
          haptics.error();
          Alert.alert("Couldn't save changes", e instanceof Error ? e.message : "Give it another go.");
        },
      }
    );
  };

  const confirmCancel = () => {
    Alert.alert(
      "Cancel this game?",
      approvedCount > 0
        ? `${approvedCount} ${approvedCount === 1 ? "player" : "players"} will be notified and lose their spot. This can't be undone.`
        : "This can't be undone.",
      [
        { text: "Keep game", style: "cancel" },
        {
          text: "Cancel game",
          style: "destructive",
          onPress: () =>
            cancelGame.mutate(undefined, {
              onSuccess: () => {
                haptics.success();
                router.back();
              },
              onError: (e) => {
                haptics.error();
                Alert.alert("Couldn't cancel", e instanceof Error ? e.message : "Give it another go.");
              },
            }),
        },
      ]
    );
  };

  const moreOptionsSummary = [
    { social: "Social", competitive: "Competitive", drills: "Drills", doubles_rotation: "Doubles rotation" }[format] ?? "Social",
    visibility === "public" ? "Public" : "Link only",
    autoApprove ? "Auto-approve" : "Review joins",
    shuttles.trim() ? shuttles : "No shuttle note",
  ].join(" · ");

  return (
    <View className="flex-1 pt-14" style={{ backgroundColor: colors.baseAlt }}>
      <View className="flex-row items-center gap-3 px-5 pb-3">
        <BackButton dark onPress={() => router.back()} />
        <Text className="font-display text-[20px]" style={{ color: colors.text }}>Edit game</Text>
      </View>

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Same cover preview shell as the draft card, minus the DRAFT badge — the venue can't
            change post-publish, so this row is display-only with its reason. */}
        <View className="rounded-3xl overflow-hidden mb-2" style={{ height: 120, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, justifyContent: "flex-end", padding: 14 }}>
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="lock-closed" size={11} color={colors.textMuted} />
            <Text className="font-body-bold text-[10px] uppercase" style={{ color: colors.textMuted, letterSpacing: 0.5 }}>Venue locked</Text>
          </View>
          <Text numberOfLines={1} className="font-display text-[17px] mt-1" style={{ color: colors.text }}>{game.venue}</Text>
          <Text className="text-[12px] mt-0.5" style={{ color: colors.textSecondary }}>{game.venueAddress ?? game.suburb}</Text>
        </View>
        <Text className="text-[12px] mb-5" style={{ color: colors.textMuted }}>
          Venue can't be changed after publish — it's what your booking confirmation verifies, and people already agreed to a place.
        </Text>

        <AccordionRow
          label="WHEN"
          value={startInPast ? null : `${formatDate(startsAt.toISOString())} · ${formatTimeShort(startsAt.toISOString())} · ${formatDuration(durationHours)} · ${courtsBooked} court${courtsBooked === 1 ? "" : "s"}`}
          placeholder="Pick a date and time"
          expanded={expandedRow === "when"}
          onToggle={() => setExpandedRow(expandedRow === "when" ? null : "when")}
        >
          <RowLabel>Date</RowLabel>
          <View className="rounded-2xl p-2 mb-5 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
            <DateTimePicker
              value={startsAt}
              mode="date"
              display="inline"
              minimumDate={new Date()}
              themeVariant="dark"
              accentColor={colors.accent}
              onChange={(_e, date) => { if (date) setStartsAt(slotAt(date, startsAt.getHours(), startsAt.getMinutes())); }}
            />
          </View>
          <RowLabel>Time</RowLabel>
          <View className="rounded-2xl items-center border mb-5" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
            <DateTimePicker
              value={startsAt}
              mode="time"
              display="spinner"
              minuteInterval={5}
              themeVariant="dark"
              textColor={colors.text}
              onChange={(_e, date) => { if (date) setStartsAt(slotAt(startsAt, date.getHours(), date.getMinutes())); }}
            />
          </View>
          {startInPast && (
            <Text className="text-[13.5px] mb-3 text-center" style={{ color: colors.advanced }}>That slot has already passed. Pick a later time or another day.</Text>
          )}

          <RowLabel>Duration</RowLabel>
          <View className="flex-row items-center justify-center gap-5 rounded-2xl p-4 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
            <Stepper
              icon="remove"
              disabled={durationHours <= MIN_DURATION_HOURS}
              onPress={() => { const next = Math.max(MIN_DURATION_HOURS, Math.round((durationHours - DURATION_STEP_HOURS) * 100) / 100); setDurationHours(next); setCost((c) => Math.min(c, next * MAX_COST_PER_PLAYER_PER_HOUR)); }}
            />
            <Text className="font-display text-[24px]" style={{ color: colors.accent, minWidth: 90, textAlign: "center" }}>{formatDuration(durationHours)}</Text>
            <Stepper
              icon="add"
              disabled={durationHours >= MAX_DURATION_HOURS}
              onPress={() => { const next = Math.min(MAX_DURATION_HOURS, Math.round((durationHours + DURATION_STEP_HOURS) * 100) / 100); setDurationHours(next); setCost((c) => Math.min(c, next * MAX_COST_PER_PLAYER_PER_HOUR)); }}
            />
          </View>
          <View className="flex-row gap-2 mt-2.5 flex-wrap">
            {DURATION_CHIPS.map((h) => (
              <Pressable key={h} onPress={() => setDurationHours(h)} className="rounded-pill px-3.5 py-2" style={{ backgroundColor: durationHours === h ? colors.accent : colors.surface, borderWidth: 1, borderColor: durationHours === h ? colors.accent : colors.cardBorder }}>
                <Text className="font-body-bold text-[12.5px]" style={{ color: durationHours === h ? colors.base : colors.textDim }}>{formatDuration(h)}</Text>
              </Pressable>
            ))}
          </View>

          <RowLabel style={{ marginTop: 18 }}>Courts booked</RowLabel>
          {!courtsExpanded && courtsBooked <= 6 ? (
            <View className="flex-row gap-2 flex-wrap">
              {COURT_CHIPS.map((c) => (
                <Pressable key={c} onPress={() => setCourtsBooked(c)} className="rounded-pill px-4 py-2.5" style={{ backgroundColor: courtsBooked === c ? colors.accent : colors.surface, borderWidth: 1, borderColor: courtsBooked === c ? colors.accent : colors.cardBorder }}>
                  <Text className="font-body-extrabold text-[13px]" style={{ color: courtsBooked === c ? colors.base : colors.textDim }}>{c}</Text>
                </Pressable>
              ))}
              <Pressable onPress={() => { setCourtsExpanded(true); if (courtsBooked <= 6) setCourtsBooked(7); }} className="rounded-pill px-4 py-2.5" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.cardBorder }}>
                <Text className="font-body-extrabold text-[13px]" style={{ color: colors.textDim }}>7+</Text>
              </Pressable>
            </View>
          ) : (
            <View className="flex-row items-center justify-center gap-5 rounded-2xl p-4 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
              <Stepper onPress={() => setCourtsBooked(Math.max(MIN_COURTS_BOOKED, courtsBooked - 1))} icon="remove" disabled={courtsBooked <= MIN_COURTS_BOOKED} />
              <Text className="font-display text-[24px]" style={{ color: colors.accent, minWidth: 60, textAlign: "center" }}>{courtsBooked} courts</Text>
              <Stepper onPress={() => setCourtsBooked(Math.min(MAX_COURTS_BOOKED, courtsBooked + 1))} icon="add" disabled={courtsBooked >= MAX_COURTS_BOOKED} />
            </View>
          )}

          <RowLabel style={{ marginTop: 18 }}>Court number (optional)</RowLabel>
          <TextInput
            value={courtLabel}
            onChangeText={setCourtLabel}
            placeholder="e.g. Court 3"
            placeholderTextColor={colors.textMuted}
            maxLength={20}
            className="rounded-2xl p-4 border text-[15px]"
            style={{ backgroundColor: colors.card, borderColor: colors.cardBorder, color: colors.text }}
          />
        </AccordionRow>

        <AccordionRow
          label="WHO"
          value={lineupSummary(lineupSlots, cost)}
          placeholder=""
          expanded={expandedRow === "who"}
          onToggle={() => setExpandedRow(expandedRow === "who" ? null : "who")}
        >
          <LineupStrip slots={lineupSlots} courtsBooked={courtsBooked} />

          <RowLabel style={{ marginTop: 18 }}>Max players</RowLabel>
          <View className="flex-row items-center justify-center gap-6 rounded-2xl p-4 mb-1.5 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
            <Stepper
              icon="remove"
              disabled={maxPlayers <= minPlayers}
              onPress={() => { const next = Math.max(minPlayers, maxPlayers - 1); setMaxPlayers(next); setReservedSpots((r) => Math.min(r, Math.max(named.length, next - 1 - approvedCount))); }}
            />
            <Text className="font-display text-[26px]" style={{ color: colors.accent }}>{maxPlayers}</Text>
            <Stepper icon="add" disabled={maxPlayers >= MAX_PLAYERS} onPress={() => setMaxPlayers(Math.min(MAX_PLAYERS, maxPlayers + 1))} />
          </View>
          <Text className="text-[12px] mb-4" style={{ color: colors.textMuted }}>
            {minPlayers > MIN_PLAYERS
              ? `You plus ${approvedCount} approved${heldForFriends > 0 ? ` and ${heldForFriends} held` : ""}, so this can't go below ${minPlayers}.`
              : "No one's joined yet, so you can still change this freely."}
          </Text>

          <RowLabel>Skill range</RowLabel>
          <View className="flex-row gap-2 flex-wrap mb-4">
            {TIERS.map((t) => {
              const minOrd = TIERS.findIndex((x) => x.id === skill);
              const maxOrd = TIERS.findIndex((x) => x.id === skillMax);
              const ord = TIERS.findIndex((x) => x.id === t.id);
              const inRange = ord >= minOrd && ord <= maxOrd;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => {
                    if (ord < minOrd) setSkill(t.id);
                    else if (ord > maxOrd) setSkillMax(t.id);
                    else if (t.id === skill) setSkill(t.id);
                    else setSkillMax(t.id);
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

          <RowLabel>Manage held spots</RowLabel>
          <ReservedSpots gameId={gameId} isOrganizer reservedSpots={reservedSpots} cancelled={false} />
        </AccordionRow>

        {(() => {
          const showCost = expandedRow === "cost";
          return (
            <AccordionRow
              label="COST"
              value={`$${cost} per player`}
              placeholder="Set a price per player"
              expanded={showCost}
              onToggle={() => setExpandedRow(showCost ? null : "cost")}
            >
              <View className="items-center mb-4">
                <View className="flex-row items-baseline">
                  <Text className="font-display text-[26px]" style={{ color: colors.textTertiary }}>$</Text>
                  <TextInput
                    value={String(cost)}
                    onChangeText={(t) => { const digits = t.replace(/[^0-9]/g, ""); setCost(digits === "" ? 1 : Math.min(maxCost, Math.max(1, parseInt(digits, 10)))); }}
                    keyboardType="number-pad"
                    maxLength={3}
                    selectTextOnFocus
                    className="font-display text-[48px] text-center px-1"
                    style={{ color: colors.text, borderBottomWidth: 2, borderBottomColor: colors.accent, minWidth: 64 }}
                  />
                </View>
                <Text className="text-[12px] mt-1" style={{ color: colors.textSecondary }}>per player</Text>
                <View className="w-full mt-3 px-1">
                  <PriceSlider value={cost} min={1} max={maxCost} onChange={setCost} />
                </View>
              </View>
              <View className="rounded-2xl p-3.5 flex-row justify-between items-center border" style={{ backgroundColor: "rgba(214,255,63,0.1)", borderColor: "rgba(214,255,63,0.25)" }}>
                <Text className="text-[13.5px] font-body-bold" style={{ color: colors.accent }}>If full · {maxPlayers} players</Text>
                <Text className="font-display-bold text-[18px]" style={{ color: colors.accent }}>${cost * maxPlayers}</Text>
              </View>
              <Text className="text-[12px] mt-2.5" style={{ color: colors.textMuted }}>
                Capped at ${MAX_COST_PER_PLAYER_PER_HOUR}/hour · ${maxCost} max for this {formatDuration(durationHours)} booking.
              </Text>
            </AccordionRow>
          );
        })()}

        <Pressable onPress={() => setMoreOpen(true)} className="rounded-2xl px-3.5 py-3.5 mb-3 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
          <View className="flex-row justify-between items-center">
            <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>More options</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} />
          </View>
          <Text numberOfLines={1} className="text-[12px] mt-1" style={{ color: colors.textSecondary }}>{moreOptionsSummary}</Text>
        </Pressable>

        {rescheduled && (
          <View className="flex-row items-start gap-2.5 rounded-2xl p-3.5 mb-5 border" style={{ backgroundColor: "rgba(255,182,72,0.1)", borderColor: "rgba(255,182,72,0.25)" }}>
            <Ionicons name="notifications-outline" size={16} color={colors.advanced} style={{ marginTop: 1 }} />
            <Text className="flex-1 text-[13.5px]" style={{ color: colors.advanced }}>
              Everyone who joined gets notified of the new time: {formatDate(startsAt.toISOString())} · {formatTimeRange(startsAt.toISOString(), endsAt.toISOString())}
            </Text>
          </View>
        )}
        {/* Persistent notify line (create-game-plan.md §9.8) — not gated on rescheduled, so it's
            visible any time the host has this screen open, not just after a specific edit. */}
        <Text className="text-[12px] mb-5" style={{ color: colors.textMuted }}>
          Players already in this game will be notified if anything they'd notice changes.
        </Text>

        <Pressable onPress={confirmCancel} disabled={cancelGame.isPending} className="items-center py-3">
          <Text className="font-body-bold text-[14.5px]" style={{ color: colors.danger, opacity: cancelGame.isPending ? 0.5 : 1 }}>
            {cancelGame.isPending ? "Cancelling…" : "Cancel this game"}
          </Text>
        </Pressable>
      </ScrollView>

      <View className="px-5 pb-8 pt-3.5">
        <Button label="Save changes" loading={updateGame.isPending} disabled={startInPast} onPress={save} />
      </View>

      <Sheet visible={moreOpen} onClose={() => setMoreOpen(false)} title="More options">
        <RowLabel style={{ marginTop: 4 }}>Format</RowLabel>
        <View className="flex-row gap-2 flex-wrap mb-4">
          {[
            { slug: "social", label: "Social" },
            { slug: "competitive", label: "Competitive" },
            { slug: "drills", label: "Drills" },
            { slug: "doubles_rotation", label: "Doubles rotation" },
          ].map((f) => (
            <Pressable key={f.slug} onPress={() => setFormat(f.slug)} className="rounded-pill px-3.5 py-2" style={{ backgroundColor: format === f.slug ? colors.accent : colors.surface, borderWidth: 1, borderColor: format === f.slug ? colors.accent : colors.cardBorder }}>
              <Text className="font-body-bold text-[12.5px]" style={{ color: format === f.slug ? colors.base : colors.textDim }}>{f.label}</Text>
            </Pressable>
          ))}
        </View>

        <RowLabel>Visibility</RowLabel>
        <View className="flex-row gap-2 mb-4">
          {[
            { v: "public" as const, label: "Public", desc: "Shows on Discover" },
            { v: "link_only" as const, label: "Link only", desc: "Only people you share the link with" },
          ].map((o) => (
            <Pressable key={o.v} onPress={() => setVisibility(o.v)} className="flex-1 rounded-2xl p-3 border-[1.5px]" style={{ backgroundColor: visibility === o.v ? colors.surfaceAlt : colors.surface, borderColor: visibility === o.v ? colors.accent : "rgba(255,255,255,0.07)" }}>
              <Text className="font-body-bold text-[13.5px]" style={{ color: colors.text }}>{o.label}</Text>
              <Text className="text-[11px] mt-0.5" style={{ color: colors.textMuted }}>{o.desc}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable onPress={() => setAutoApprove(!autoApprove)} className="flex-row items-center justify-between rounded-2xl p-3.5 mb-4 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
          <View className="flex-1 pr-2">
            <Text className="font-body-bold text-[13.5px]" style={{ color: colors.text }}>Auto-approve joins</Text>
            <Text className="text-[11px] mt-0.5" style={{ color: colors.textMuted }}>Off means you'll review every request first</Text>
          </View>
          <View className="w-11 h-6 rounded-pill justify-center px-0.5" style={{ backgroundColor: autoApprove ? colors.accent : colors.surfaceAlt }}>
            <View className="w-5 h-5 rounded-full" style={{ backgroundColor: colors.base, alignSelf: autoApprove ? "flex-end" : "flex-start" }} />
          </View>
        </Pressable>

        <RowLabel>Shuttles</RowLabel>
        <TextInput
          value={shuttles}
          onChangeText={setShuttles}
          placeholder="e.g. I'll bring feather shuttles"
          placeholderTextColor={colors.textMuted}
          maxLength={80}
          className="rounded-2xl p-3.5 mb-4 border text-[14px]"
          style={{ backgroundColor: colors.card, borderColor: colors.cardBorder, color: colors.text }}
        />

        <RowLabel>Say something about this game</RowLabel>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Casual hit, first-timers welcome…"
          placeholderTextColor={colors.textMuted}
          maxLength={280}
          multiline
          className="rounded-2xl p-3.5 border text-[14px]"
          style={{ backgroundColor: colors.card, borderColor: colors.cardBorder, color: colors.text, minHeight: 80, textAlignVertical: "top" }}
        />
        <Text className="text-[11px] mt-1.5 text-right" style={{ color: colors.textMuted }}>{notes.length}/280</Text>

        <Pressable onPress={() => setMoreOpen(false)} className="rounded-pill py-3.5 items-center mt-4" style={{ backgroundColor: colors.accent }}>
          <Text className="font-body-extrabold text-[15px]" style={{ color: colors.base }}>Done</Text>
        </Pressable>
      </Sheet>
    </View>
  );
}
