import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, Alert, TextInput } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { colors, TIERS, type TierId } from "../../../lib/theme";
import { formatDate, formatTimeRange } from "../../../lib/format";
import { MAX_DURATION_HOURS, MIN_DURATION_HOURS, durationMs, isSlotBookable, slotAt } from "../../../lib/schedule";
import { MAX_COST_PER_PLAYER_PER_HOUR, MAX_COURTS_BOOKED, MAX_PLAYERS, MIN_COURTS_BOOKED, MIN_PLAYERS } from "../../../lib/store";
import { useCancelGame, useGameDetail, useUpdateGame } from "../../../lib/queries/games";
import { useGameRoster } from "../../../lib/queries/gamePlayers";
import { useSkillTiers } from "../../../lib/queries/sports";
import { Button } from "../../../components/Button";
import { BackButton } from "../../../components/BackButton";
import { haptics } from "../../../lib/haptics";

const SPORT_SLUG = "badminton";

export default function EditGame() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const gameId = id ?? "";
  const gameQuery = useGameDetail(gameId);
  const game = gameQuery.data;
  const rosterQuery = useGameRoster(gameId);
  const { data: tiers = [] } = useSkillTiers(SPORT_SLUG);
  const updateGame = useUpdateGame(gameId);
  const cancelGame = useCancelGame(gameId);

  const [startsAt, setStartsAt] = useState<Date | null>(null);
  const [skill, setSkill] = useState<TierId>("Intermediate");
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [courtsBooked, setCourtsBooked] = useState(1);
  const [courtLabel, setCourtLabel] = useState("");
  const [durationHours, setDurationHours] = useState(2);
  const [cost, setCost] = useState(8);
  const [reservedSpots, setReservedSpots] = useState(0);

  // Seed the form from the loaded game exactly once — later refetches must not stomp edits
  // the organiser has already made.
  useEffect(() => {
    if (!game || startsAt) return;
    setStartsAt(new Date(game.startsAt));
    setSkill(game.skill);
    setMaxPlayers(game.maxPlayers);
    setCourtsBooked(game.courtsBooked);
    setCourtLabel(game.courts ?? "");
    setDurationHours(game.durationHours);
    setCost(game.cost);
    setReservedSpots(game.reservedSpots);
  }, [game, startsAt]);

  // max_players can't drop below the roster — the DB rejects it, so don't let the stepper
  // walk into an error in the first place.
  const approvedCount = rosterQuery.data?.length ?? 0;
  // Mirrors enforce_game_edit_rules: the floor is everything already committed — the host's own
  // slot, the approved roster, and any reserved spot nobody has claimed (post-game-plan.md D1).
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
  // The picker only offers 4 days; a game further out keeps its original day as a selection
  // that simply isn't in the list, which is fine — it only matters that we don't save a
  // start time that's already gone.
  const startInPast = startsAt.getTime() <= Date.now();

  const save = () => {
    const tier = tiers.find((t) => t.label === skill);
    if (!tier) {
      Alert.alert("Not ready yet", "Still loading skill levels, give it a moment.");
      return;
    }
    if (startInPast) {
      Alert.alert("Pick a future time", "That start time has already passed.");
      return;
    }
    updateGame.mutate(
      { startsAt, skillTierId: tier.id, maxPlayers, courtsBooked, courtLabel, durationHours, costPerPlayerCents: Math.round(cost * 100), reservedSpots },
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

  return (
    <View className="flex-1 pt-14" style={{ backgroundColor: colors.baseAlt }}>
      <View className="flex-row items-center gap-3 px-5 pb-3">
        <BackButton dark onPress={() => router.back()} />
        <Text className="font-display text-[20px]" style={{ color: colors.text }}>
          Edit match
        </Text>
      </View>

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 24 }}>
        <View className="rounded-2xl px-3.5 py-3.5 mb-5 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
          <Text className="font-body-bold text-[15.5px]" style={{ color: colors.text }}>
            {game.venue}
          </Text>
          <Text className="text-[13.5px] mt-0.5" style={{ color: colors.textSecondary }}>
            {game.venueAddress ?? game.suburb}
          </Text>
          <Text className="text-[13px] mt-2" style={{ color: colors.textMuted }}>
            Venue can't be changed, it's what your booking confirmation verifies.
          </Text>
        </View>

        <Label>Date</Label>
        <View className="rounded-2xl p-2 mb-5 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
          <DateTimePicker
            value={startsAt}
            mode="date"
            display="inline"
            minimumDate={new Date()}
            themeVariant="dark"
            accentColor={colors.accent}
            onChange={(_e, date) => {
              if (!date) return;
              setStartsAt(slotAt(date, startsAt.getHours(), startsAt.getMinutes()));
            }}
          />
        </View>

        <Label>Time</Label>
        <View className="rounded-2xl items-center mb-2 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
          <DateTimePicker
            value={startsAt}
            mode="time"
            display="spinner"
            minuteInterval={5}
            themeVariant="dark"
            textColor={colors.text}
            onChange={(_e, date) => {
              if (!date) return;
              setStartsAt(slotAt(startsAt, date.getHours(), date.getMinutes()));
            }}
          />
        </View>
        {startInPast && (
          <Text className="text-[13.5px] mb-5 text-center" style={{ color: colors.advanced }}>
            That slot has already passed. Pick a later time or another day.
          </Text>
        )}
        {!startInPast && <View className="mb-5" />}

        <Label>Skill level</Label>
        <View className="mb-5">
          {TIERS.map((t) => {
            const active = skill === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => setSkill(t.id)}
                className="flex-row items-center rounded-2xl px-3.5 py-3 mb-2 border-[1.5px]"
                style={{
                  backgroundColor: active ? colors.surfaceAlt : colors.surface,
                  borderColor: active ? t.color : "rgba(255,255,255,0.07)",
                }}
              >
                <View className="w-2.5 h-2.5 rounded-full mr-2.5" style={{ backgroundColor: t.color }} />
                <Text className="font-body-extrabold text-[15.5px]" style={{ color: colors.text }}>
                  {t.id}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Label>Max players</Label>
        <View
          className="flex-row items-center justify-center gap-6 rounded-2xl p-4.5 mb-1.5 border"
          style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}
        >
          <Stepper
            icon="remove"
            disabled={maxPlayers <= minPlayers}
            onPress={() => {
              const next = Math.max(minPlayers, maxPlayers - 1);
              setMaxPlayers(next);
              setReservedSpots((r) => Math.min(r, Math.max(reservedClaimed, next - 1 - approvedCount)));
            }}
          />
          <Text className="font-display text-[28px]" style={{ color: colors.accent }}>
            {maxPlayers}
          </Text>
          <Stepper
            icon="add"
            disabled={maxPlayers >= MAX_PLAYERS}
            onPress={() => setMaxPlayers(Math.min(MAX_PLAYERS, maxPlayers + 1))}
          />
        </View>
        <Text className="text-[13px] mb-5" style={{ color: colors.textMuted }}>
          {minPlayers > MIN_PLAYERS
            ? `You plus ${approvedCount} approved${heldForFriends > 0 ? ` and ${heldForFriends} held` : ""}, so this can't go below ${minPlayers}.`
            : "No one's joined yet, so you can still change this freely."}
        </Text>

        <Label>Reserved spots</Label>
        <View
          className="flex-row items-center justify-center gap-6 rounded-2xl p-4.5 mb-1.5 border"
          style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}
        >
          <Stepper
            icon="remove"
            disabled={reservedSpots <= reservedClaimed}
            onPress={() => setReservedSpots(Math.max(reservedClaimed, reservedSpots - 1))}
          />
          <Text className="font-display text-[28px]" style={{ color: colors.accent }}>
            {reservedSpots}
          </Text>
          <Stepper
            icon="add"
            disabled={reservedSpots >= maxPlayers - 1 - approvedCount}
            onPress={() => setReservedSpots(Math.min(maxPlayers - 1 - approvedCount, reservedSpots + 1))}
          />
        </View>
        <Text className="text-[13px] mb-5" style={{ color: colors.textMuted }}>
          Spots held for friends of yours, held back from the {maxPlayers} above, which includes you.
          {reservedClaimed > 0 ? ` ${reservedClaimed} already claimed, so it can't go below that.` : ""}
        </Text>

        <Label>Courts booked</Label>
        <View
          className="flex-row items-center justify-center gap-6 rounded-2xl p-4.5 mb-5 border"
          style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}
        >
          <Stepper icon="remove" disabled={courtsBooked <= MIN_COURTS_BOOKED} onPress={() => setCourtsBooked(Math.max(MIN_COURTS_BOOKED, courtsBooked - 1))} />
          <Text className="font-display text-[28px]" style={{ color: colors.accent }}>
            {courtsBooked}
          </Text>
          <Stepper icon="add" disabled={courtsBooked >= MAX_COURTS_BOOKED} onPress={() => setCourtsBooked(Math.min(MAX_COURTS_BOOKED, courtsBooked + 1))} />
        </View>

        <Label>Court number (optional)</Label>
        <TextInput
          value={courtLabel}
          onChangeText={setCourtLabel}
          placeholder="e.g. Court 3"
          placeholderTextColor={colors.textMuted}
          maxLength={20}
          className="rounded-2xl p-4.5 mb-5 border text-[15px]"
          style={{ backgroundColor: colors.card, borderColor: colors.cardBorder, color: colors.text }}
        />

        <Label>Duration (hours)</Label>
        <View
          className="flex-row items-center justify-center gap-6 rounded-2xl p-4.5 mb-5 border"
          style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}
        >
          <Stepper
            icon="remove"
            disabled={durationHours <= MIN_DURATION_HOURS}
            onPress={() => {
              const next = Math.max(MIN_DURATION_HOURS, durationHours - 1);
              setDurationHours(next);
              setCost((c) => Math.min(c, next * MAX_COST_PER_PLAYER_PER_HOUR));
            }}
          />
          <Text className="font-display text-[28px]" style={{ color: colors.accent }}>
            {durationHours}
          </Text>
          <Stepper
            icon="add"
            disabled={durationHours >= MAX_DURATION_HOURS}
            onPress={() => {
              const next = Math.min(MAX_DURATION_HOURS, durationHours + 1);
              setDurationHours(next);
              setCost((c) => Math.min(c, next * MAX_COST_PER_PLAYER_PER_HOUR));
            }}
          />
        </View>

        <Label>Price per player</Label>
        <View
          className="flex-row items-center justify-center gap-6 rounded-2xl p-5 mb-3 border"
          style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}
        >
          <Stepper icon="remove" disabled={cost <= 1} onPress={() => setCost(Math.max(1, cost - 1))} />
          <Text className="font-display text-[30px]" style={{ color: colors.accent }}>
            ${cost}
          </Text>
          <Stepper icon="add" disabled={cost >= maxCost} onPress={() => setCost(Math.min(maxCost, cost + 1))} />
        </View>
        <View
          className="rounded-2xl p-4 flex-row justify-between items-center mb-2 border"
          style={{ backgroundColor: "rgba(214,255,63,0.1)", borderColor: "rgba(214,255,63,0.25)" }}
        >
          <Text className="text-[14.5px] font-body-bold" style={{ color: colors.accent }}>
            If full · {maxPlayers} players
          </Text>
          <Text className="font-display-bold text-[20px]" style={{ color: colors.accent }}>
            ${cost * maxPlayers}
          </Text>
        </View>
        <Text className="text-[13px] mb-5" style={{ color: colors.textMuted }}>
          Capped at ${MAX_COST_PER_PLAYER_PER_HOUR}/hour · ${maxCost} max for this {durationHours}h booking.
        </Text>

        {rescheduled && (
          <View
            className="flex-row items-start gap-2.5 rounded-2xl p-3.5 mb-5 border"
            style={{ backgroundColor: "rgba(255,182,72,0.1)", borderColor: "rgba(255,182,72,0.25)" }}
          >
            <Ionicons name="notifications-outline" size={16} color={colors.advanced} style={{ marginTop: 1 }} />
            <Text className="flex-1 text-[13.5px]" style={{ color: colors.advanced }}>
              Everyone who joined gets notified of the new time: {formatDate(startsAt.toISOString())} ·{" "}
              {formatTimeRange(startsAt.toISOString(), endsAt.toISOString())}
            </Text>
          </View>
        )}

        <Pressable onPress={confirmCancel} disabled={cancelGame.isPending} className="items-center py-3">
          <Text className="font-body-bold text-[14.5px]" style={{ color: colors.danger, opacity: cancelGame.isPending ? 0.5 : 1 }}>
            {cancelGame.isPending ? "Cancelling…" : "Cancel this game"}
          </Text>
        </Pressable>
      </ScrollView>

      <View className="px-5 pb-8 pt-3.5">
        <Button label="Save changes" loading={updateGame.isPending} disabled={startInPast} onPress={save} />
      </View>
    </View>
  );
}

function Label({ children }: { children: string }) {
  return (
    <Text className="font-body-extrabold text-[13px] uppercase mb-2.5" style={{ color: colors.textTertiary }}>
      {children}
    </Text>
  );
}

function Stepper({
  onPress,
  icon,
  disabled = false,
}: {
  onPress: () => void;
  icon: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        haptics.tick();
        onPress();
      }}
      disabled={disabled}
      className="w-[38px] h-[38px] rounded-full items-center justify-center"
      style={{ backgroundColor: colors.surfaceAlt, opacity: disabled ? 0.4 : 1 }}
    >
      <Ionicons name={icon} size={16} color={colors.text} />
    </Pressable>
  );
}
