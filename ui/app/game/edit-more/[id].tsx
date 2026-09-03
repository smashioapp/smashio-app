import { useEffect } from "react";
import { View, Text, Pressable, ScrollView, TextInput } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { colors } from "../../../lib/theme";
import { useAppStore } from "../../../lib/store";
import { EditorHeader, RowLabel } from "../../../components/DraftCardParts";

// Full-screen More options editor (create-game-plan.md band 08a). Unchanged fields and defaults
// from create's sheet — every field here is quiet, saving it never notifies anyone already in.
export default function EditMore() {
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

  return (
    <View className="flex-1" style={{ backgroundColor: colors.baseAlt }}>
      <EditorHeader title="More options" onBack={() => router.back()} onDone={() => router.back()} />
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 30 }}>
        <RowLabel>Host note</RowLabel>
        <TextInput
          value={d.notes}
          onChangeText={(v) => patch({ notes: v })}
          placeholder="Casual hit, first-timers welcome…"
          placeholderTextColor={colors.textMuted}
          maxLength={280}
          multiline
          className="rounded-2xl p-3.5 border text-[14px]"
          style={{ backgroundColor: colors.card, borderColor: colors.cardBorder, color: colors.text, minHeight: 80, textAlignVertical: "top" }}
        />
        <Text className="text-[11px] mt-1.5 text-right" style={{ color: colors.textMuted }}>{d.notes.length}/280</Text>

        <RowLabel style={{ marginTop: 18 }}>Format</RowLabel>
        <View className="flex-row gap-2 flex-wrap mb-4">
          {[
            { slug: "social", label: "Social" },
            { slug: "competitive", label: "Competitive" },
            { slug: "drills", label: "Drills" },
            { slug: "doubles_rotation", label: "Doubles rotation" },
          ].map((f) => (
            <Pressable key={f.slug} onPress={() => patch({ format: f.slug })} className="rounded-pill px-3.5 py-2" style={{ backgroundColor: d.format === f.slug ? colors.accent : colors.surface, borderWidth: 1, borderColor: d.format === f.slug ? colors.accent : colors.cardBorder }}>
              <Text className="font-body-bold text-[12.5px]" style={{ color: d.format === f.slug ? colors.base : colors.textDim }}>{f.label}</Text>
            </Pressable>
          ))}
        </View>

        <RowLabel>Visibility</RowLabel>
        <View className="flex-row gap-2 mb-4">
          {[
            { v: "public" as const, label: "Public", desc: "Shows on Discover" },
            { v: "link_only" as const, label: "Link only", desc: "Only people you share the link with" },
          ].map((o) => (
            <Pressable key={o.v} onPress={() => patch({ visibility: o.v })} className="flex-1 rounded-2xl p-3 border-[1.5px]" style={{ backgroundColor: d.visibility === o.v ? colors.surfaceAlt : colors.surface, borderColor: d.visibility === o.v ? colors.accent : "rgba(255,255,255,0.07)" }}>
              <Text className="font-body-bold text-[13.5px]" style={{ color: colors.text }}>{o.label}</Text>
              <Text className="text-[11px] mt-0.5" style={{ color: colors.textMuted }}>{o.desc}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable onPress={() => patch({ autoApprove: !d.autoApprove })} className="flex-row items-center justify-between rounded-2xl p-3.5 mb-4 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
          <View className="flex-1 pr-2">
            <Text className="font-body-bold text-[13.5px]" style={{ color: colors.text }}>Auto-approve join requests</Text>
            <Text className="text-[11px] mt-0.5" style={{ color: colors.textMuted }}>Off means you'll review every request first</Text>
          </View>
          <View className="w-11 h-6 rounded-pill justify-center px-0.5" style={{ backgroundColor: d.autoApprove ? colors.accent : colors.surfaceAlt }}>
            <View className="w-5 h-5 rounded-full" style={{ backgroundColor: colors.base, alignSelf: d.autoApprove ? "flex-end" : "flex-start" }} />
          </View>
        </Pressable>

        <RowLabel>Shuttles</RowLabel>
        <TextInput
          value={d.shuttles}
          onChangeText={(v) => patch({ shuttles: v })}
          placeholder="e.g. I'll bring feather shuttles"
          placeholderTextColor={colors.textMuted}
          maxLength={80}
          className="rounded-2xl p-3.5 mb-2 border text-[14px]"
          style={{ backgroundColor: colors.card, borderColor: colors.cardBorder, color: colors.text }}
        />

        <Text className="text-[12px] mt-3.5" style={{ color: colors.textMuted }}>
          Every field on this screen is quiet, saving it never notifies anyone already in.
        </Text>
      </ScrollView>
    </View>
  );
}
