import { useEffect } from "react";
import { View, Text, TextInput } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { colors } from "../../../lib/theme";
import { MAX_COST_PER_PLAYER_PER_HOUR, useAppStore } from "../../../lib/store";
import { EditorHeader, PriceSlider, RowLabel } from "../../../components/DraftCardParts";

// Full-screen COST row editor (create-game-plan.md band 08a) — same field, slider and break-even
// tile as create. The cap line becomes a warning once the host is actually at the ceiling
// (band 08b "Price at the cap").
export default function EditCost() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const editDraft = useAppStore((s) => s.editDraft);
  const patch = useAppStore((s) => s.patchEditDraft);

  const missingDraft = !editDraft || editDraft.gameId !== id;
  useEffect(() => {
    if (missingDraft) router.replace(`/game/edit/${id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingDraft]);
  if (missingDraft) return null;
  const d = editDraft.current;
  const maxCost = d.durationHours * MAX_COST_PER_PLAYER_PER_HOUR;
  const atCap = d.cost >= maxCost;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.baseAlt }}>
      <EditorHeader title="Cost" onBack={() => router.back()} onDone={() => router.back()} />
      <View className="px-5">
        <RowLabel>Per player</RowLabel>
        <View className="items-start mb-1">
          <View className="flex-row items-baseline">
            <Text className="font-display text-[26px]" style={{ color: colors.textTertiary }}>$</Text>
            <TextInput
              value={String(d.cost)}
              onChangeText={(t) => { const digits = t.replace(/[^0-9]/g, ""); patch({ cost: digits === "" ? 1 : Math.min(maxCost, Math.max(1, parseInt(digits, 10))) }); }}
              keyboardType="number-pad"
              maxLength={3}
              selectTextOnFocus
              className="font-display text-[30px] px-1"
              style={{ color: colors.text, minWidth: 48 }}
            />
            <Text className="text-[13px] ml-1" style={{ color: colors.textSecondary }}>per player</Text>
          </View>
        </View>
        <PriceSlider value={d.cost} min={1} max={maxCost} onChange={(v) => patch({ cost: v })} />
        <Text className="text-[12px]" style={{ color: atCap ? colors.advanced : colors.textMuted }}>
          {atCap ? `That's the most we let hosts charge, $${MAX_COST_PER_PLAYER_PER_HOUR} a player per hour. You're at the ceiling.` : `$${MAX_COST_PER_PLAYER_PER_HOUR} cap per player, per hour`}
        </Text>

        <View className="rounded-2xl p-3 mt-3.5 border" style={{ backgroundColor: "rgba(53,214,166,.08)", borderColor: "rgba(53,214,166,.24)" }}>
          <Text className="font-body-bold text-[12px]" style={{ color: colors.intermediate }}>Your break-even</Text>
          <Text className="text-[12.5px] mt-0.5" style={{ color: colors.textDim }}>
            At {d.maxPlayers} players and ${d.cost} each, you take in ${d.cost * d.maxPlayers}.
          </Text>
        </View>

        <Text className="text-[12.5px] font-body-bold mt-3.5" style={{ color: colors.advanced }}>
          Changing this notifies the players already in.
        </Text>
      </View>
    </View>
  );
}
