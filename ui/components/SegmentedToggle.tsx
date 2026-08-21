import { View, Text, Pressable } from "react-native";
import { colors } from "../lib/theme";
import { haptics } from "../lib/haptics";

// Discover's List | Map switch (docs/v2-design-plan.md §4.1). Replaces the floating MapToggle
// that lived in BottomRail — map is a mode of this screen (rule 4), so the control belongs in
// the header next to the title, not hovering over the content it's about to replace.
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  fullWidth = false,
}: {
  options: { key: T; label: string; locked?: boolean }[];
  value: T;
  onChange: (key: T) => void;
  disabled?: boolean;
  /** Equal-width segments filling the row (Profile's Overview/History/Trophy) instead of the
   * default content-sized pills (Discover's compact List|Map switch). */
  fullWidth?: boolean;
}) {
  return (
    <View
      className="flex-row"
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        borderRadius: 100,
        padding: 3,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            disabled={disabled || o.locked}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: o.locked }}
            onPress={() => {
              if (active) return;
              haptics.tick();
              onChange(o.key);
            }}
            style={{
              flex: fullWidth ? 1 : undefined,
              alignItems: "center",
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderRadius: 100,
              backgroundColor: active ? colors.accent : "transparent",
              opacity: o.locked ? 0.4 : 1,
            }}
          >
            <Text
              className="font-body-bold text-[11.5px]"
              style={{ color: active ? colors.base : colors.textDim }}
            >
              {o.label}
              {o.locked ? " 🔒" : ""}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
