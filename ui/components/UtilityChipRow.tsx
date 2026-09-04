import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../lib/theme";

// Prompt 7a's blocking fix: calendar/share/duplicate are shipped features the redesign had
// nowhere to put. One low-contrast row between GOOD TO KNOW and HOST, not five grey ListRows and
// not folded into the pinned CTA (which stays a quiet confirmation, not a toggle).
function UtilChip({ icon, label, tone, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; tone?: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-1.5 rounded-pill px-3 py-2 border"
      style={{ backgroundColor: colors.surface, borderColor: tone ? `${tone}4D` : colors.cardBorder }}
    >
      <Ionicons name={icon} size={13} color={tone ?? colors.textSecondary} />
      <Text className="font-body-bold text-[11.5px]" style={{ color: tone ?? colors.textSecondary }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function UtilityChipRow({
  onCalendar,
  onToggleCalendar,
  onShare,
  onDuplicate,
}: {
  onCalendar: boolean;
  onToggleCalendar: () => void;
  onShare: () => void;
  onDuplicate?: () => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      <UtilChip
        icon="calendar-outline"
        label={onCalendar ? "On your calendar" : "Add to calendar"}
        tone={onCalendar ? colors.intermediate : undefined}
        onPress={onToggleCalendar}
      />
      <UtilChip icon="share-outline" label="Share" onPress={onShare} />
      {onDuplicate && <UtilChip icon="copy-outline" label="Duplicate this game" onPress={onDuplicate} />}
    </View>
  );
}
