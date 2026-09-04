import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { colors } from "../lib/theme";
import { haptics } from "../lib/haptics";

// Game detail redesign artboard 03 — the host's own voice. Full when `notes` is set, degrades to
// chips-only (no dead quote block) when it's empty, and the host sees an inline prompt to add one
// instead of a blank card. Format/skill-range/shuttles/court all already exist on `games` — no
// schema gap, this is purely a new place to show data that was already being fetched.
function PitchChip({ icon, label }: { icon?: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5 rounded-pill px-3 py-1.5 border" style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder }}>
      {icon && <Ionicons name={icon} size={13} color={colors.textDim} />}
      <Text className="font-body-bold text-[11.5px]" style={{ color: colors.textDim }}>
        {label}
      </Text>
    </View>
  );
}

export function GamePitch({
  notes,
  hostName,
  format,
  skill,
  skillMax,
  shuttles,
  courts,
  isOrganizer,
  gameId,
}: {
  notes: string | null | undefined;
  hostName: string;
  format?: string | null;
  skill: string;
  skillMax?: string | null;
  shuttles?: string | null;
  courts: string;
  isOrganizer: boolean;
  gameId: string;
}) {
  const skillLabel = skillMax && skillMax !== skill ? `${skill}–${skillMax}` : skill;
  type PitchChipDef = { icon?: keyof typeof Ionicons.glyphMap; label: string };
  const chips: PitchChipDef[] = (
    [
      format ? { icon: "people-outline", label: format } : null,
      { label: skillLabel },
      shuttles ? { label: `${shuttles} · host brings` } : null,
      courts ? { label: courts } : null,
    ] as (PitchChipDef | null)[]
  ).filter((c): c is PitchChipDef => !!c);

  if (!notes && isOrganizer) {
    return (
      <View
        className="rounded-2xl p-4 border"
        style={{ backgroundColor: colors.card, borderColor: "rgba(214,255,63,0.3)", borderStyle: "dashed" }}
      >
        <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
          Tell players what this game's about
        </Text>
        <Text className="text-[12.5px] mt-1" style={{ color: colors.textSecondary }}>
          One line goes a long way, "keen hitters welcome" beats no note at all. Only you see this prompt.
        </Text>
        <View className="flex-row flex-wrap gap-1.5 mt-3">
          {chips.map((c, i) => (
            <PitchChip key={i} {...c} />
          ))}
        </View>
        <Pressable
          className="mt-3"
          onPress={() => {
            haptics.tap();
            router.push(`/game/edit-more/${gameId}`);
          }}
        >
          <Text className="font-body-extrabold text-[12.5px]" style={{ color: colors.accent3 }}>
            + Add a note
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="rounded-2xl p-4 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
      {notes && (
        <>
          <Text className="text-[14px] italic" style={{ color: colors.textDim, lineHeight: 20 }}>
            "{notes}"
          </Text>
          <Text className="font-body-bold text-[11px] mt-1.5" style={{ color: colors.textTertiary }}>
            — {hostName}, the host
          </Text>
        </>
      )}
      <View className="flex-row flex-wrap gap-1.5" style={{ marginTop: notes ? 12 : 0 }}>
        {chips.map((c, i) => (
          <PitchChip key={i} {...c} />
        ))}
      </View>
    </View>
  );
}
