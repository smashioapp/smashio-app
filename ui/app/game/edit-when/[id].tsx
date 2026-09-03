import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, TextInput } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { colors } from "../../../lib/theme";
import { DURATION_STEP_HOURS, MAX_DURATION_HOURS, MIN_DURATION_HOURS, slotAt, formatDuration } from "../../../lib/schedule";
import { MAX_COST_PER_PLAYER_PER_HOUR, MAX_COURTS_BOOKED, MIN_COURTS_BOOKED } from "../../../lib/store";
import { useAppStore } from "../../../lib/store";
import { EditorHeader, RowLabel, Stepper } from "../../../components/DraftCardParts";

const COURT_CHIPS = [1, 2, 3, 4, 5, 6];
const DURATION_CHIPS = [1, 1.5, 2, 2.5];

// Full-screen WHEN row editor (create-game-plan.md band 08a). Identical controls to create's
// inline WHEN block, just given the whole screen instead of squeezed under an accordion heading.
export default function EditWhen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const editDraft = useAppStore((s) => s.editDraft);
  const patch = useAppStore((s) => s.patchEditDraft);
  const [courtsExpanded, setCourtsExpanded] = useState(false);

  const missingDraft = !editDraft || editDraft.gameId !== id;
  useEffect(() => {
    if (missingDraft) router.replace(`/game/edit/${id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingDraft]);
  if (missingDraft) return null;
  const d = editDraft.current;
  const startInPast = d.startsAt.getTime() <= Date.now();

  return (
    <View className="flex-1" style={{ backgroundColor: colors.baseAlt }}>
      <EditorHeader title="When" onBack={() => router.back()} onDone={() => router.back()} />
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 30 }}>
        <RowLabel>Date</RowLabel>
        <View className="rounded-2xl p-2 mb-5 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
          <DateTimePicker
            value={d.startsAt}
            mode="date"
            display="inline"
            minimumDate={new Date()}
            themeVariant="dark"
            accentColor={colors.accent}
            onChange={(_e, date) => { if (date) patch({ startsAt: slotAt(date, d.startsAt.getHours(), d.startsAt.getMinutes()) }); }}
          />
        </View>
        <RowLabel>Time</RowLabel>
        <View className="rounded-2xl items-center border mb-5" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
          <DateTimePicker
            value={d.startsAt}
            mode="time"
            display="spinner"
            minuteInterval={5}
            themeVariant="dark"
            textColor={colors.text}
            onChange={(_e, date) => { if (date) patch({ startsAt: slotAt(d.startsAt, date.getHours(), date.getMinutes()) }); }}
          />
        </View>
        {startInPast && (
          <View className="rounded-2xl px-3.5 py-3 mb-4 border" style={{ backgroundColor: colors.card, borderColor: "rgba(255,103,103,.32)" }}>
            <Text className="font-body-bold text-[12.5px]" style={{ color: colors.danger }}>That time's already passed, pick another.</Text>
          </View>
        )}

        <RowLabel>Duration</RowLabel>
        <View className="flex-row items-center justify-center gap-5 rounded-2xl p-4 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
          <Stepper
            icon="remove"
            disabled={d.durationHours <= MIN_DURATION_HOURS}
            onPress={() => { const next = Math.max(MIN_DURATION_HOURS, Math.round((d.durationHours - DURATION_STEP_HOURS) * 100) / 100); patch({ durationHours: next, cost: Math.min(d.cost, next * MAX_COST_PER_PLAYER_PER_HOUR) }); }}
          />
          <Text className="font-display text-[24px]" style={{ color: colors.accent, minWidth: 90, textAlign: "center" }}>{formatDuration(d.durationHours)}</Text>
          <Stepper
            icon="add"
            disabled={d.durationHours >= MAX_DURATION_HOURS}
            onPress={() => { const next = Math.min(MAX_DURATION_HOURS, Math.round((d.durationHours + DURATION_STEP_HOURS) * 100) / 100); patch({ durationHours: next, cost: Math.min(d.cost, next * MAX_COST_PER_PLAYER_PER_HOUR) }); }}
          />
        </View>
        <View className="flex-row gap-2 mt-2.5 flex-wrap">
          {DURATION_CHIPS.map((h) => (
            <Pressable key={h} onPress={() => patch({ durationHours: h })} className="rounded-pill px-3.5 py-2" style={{ backgroundColor: d.durationHours === h ? colors.accent : colors.surface, borderWidth: 1, borderColor: d.durationHours === h ? colors.accent : colors.cardBorder }}>
              <Text className="font-body-bold text-[12.5px]" style={{ color: d.durationHours === h ? colors.base : colors.textDim }}>{formatDuration(h)}</Text>
            </Pressable>
          ))}
        </View>

        <RowLabel style={{ marginTop: 18 }}>Courts booked</RowLabel>
        {!courtsExpanded && d.courtsBooked <= 6 ? (
          <View className="flex-row gap-2 flex-wrap">
            {COURT_CHIPS.map((c) => (
              <Pressable key={c} onPress={() => patch({ courtsBooked: c })} className="rounded-pill px-4 py-2.5" style={{ backgroundColor: d.courtsBooked === c ? colors.accent : colors.surface, borderWidth: 1, borderColor: d.courtsBooked === c ? colors.accent : colors.cardBorder }}>
                <Text className="font-body-extrabold text-[13px]" style={{ color: d.courtsBooked === c ? colors.base : colors.textDim }}>{c}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => { setCourtsExpanded(true); if (d.courtsBooked <= 6) patch({ courtsBooked: 7 }); }} className="rounded-pill px-4 py-2.5" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.cardBorder }}>
              <Text className="font-body-extrabold text-[13px]" style={{ color: colors.textDim }}>7+</Text>
            </Pressable>
          </View>
        ) : (
          <View className="flex-row items-center justify-center gap-5 rounded-2xl p-4 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
            <Stepper onPress={() => patch({ courtsBooked: Math.max(MIN_COURTS_BOOKED, d.courtsBooked - 1) })} icon="remove" disabled={d.courtsBooked <= MIN_COURTS_BOOKED} />
            <Text className="font-display text-[24px]" style={{ color: colors.accent, minWidth: 60, textAlign: "center" }}>{d.courtsBooked} courts</Text>
            <Stepper onPress={() => patch({ courtsBooked: Math.min(MAX_COURTS_BOOKED, d.courtsBooked + 1) })} icon="add" disabled={d.courtsBooked >= MAX_COURTS_BOOKED} />
          </View>
        )}

        <RowLabel style={{ marginTop: 18 }}>Court number · optional</RowLabel>
        <TextInput
          value={d.courtLabel}
          onChangeText={(v) => patch({ courtLabel: v })}
          placeholder="e.g. Court 3"
          placeholderTextColor={colors.textMuted}
          maxLength={20}
          className="rounded-2xl p-4 border text-[15px]"
          style={{ backgroundColor: colors.card, borderColor: colors.cardBorder, color: colors.text }}
        />

        <Text className="text-[12.5px] font-body-bold mt-4" style={{ color: colors.advanced }}>
          Moving this changes what players agreed to, they'll get a heads-up when you save.
        </Text>
      </ScrollView>
    </View>
  );
}
