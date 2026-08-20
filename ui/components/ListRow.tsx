import { ReactNode } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, LAYOUT } from "../lib/theme";
import { haptics } from "../lib/haptics";

// The v2 "Standard" weight (docs/v2-design-plan.md §3.3): a single-line, hairline-separated row.
// This is what most of the app is made of now — cards are reserved for the one thing per screen
// that earns the height. Deliberately has no lime anywhere: rule 5 rations the accent to the
// hero/CTA, so a list of these stays quiet no matter how long it gets.
export function ListRow({
  dotColor,
  title,
  subtitle,
  trailing,
  accessory = "none",
  leading,
  divider = true,
  danger = false,
  onPress,
  testID,
}: {
  dotColor?: string;
  title: string;
  subtitle?: string;
  /** Right-hand value (price, count) — rendered in the display face. */
  trailing?: string;
  /** What sits at the far right after `trailing`. */
  accessory?: "none" | "chevron";
  /** Anything between the dot and the text — an avatar stack, usually. */
  leading?: ReactNode;
  divider?: boolean;
  danger?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  const body = (
    <View className="flex-row items-center gap-2.5" style={{ paddingVertical: 11 }}>
      {dotColor && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dotColor }} />}
      {leading}
      <View className="flex-1 min-w-0">
        <Text
          numberOfLines={1}
          className="font-body-semibold text-[13.5px]"
          style={{ color: danger ? colors.danger : colors.text }}
        >
          {title}
        </Text>
        {!!subtitle && (
          <Text numberOfLines={1} className="text-[11.5px] mt-0.5" style={{ color: colors.textSecondary }}>
            {subtitle}
          </Text>
        )}
      </View>
      {!!trailing && (
        <Text className="font-display-bold text-[12.5px]" style={{ color: colors.textDim }}>
          {trailing}
        </Text>
      )}
      {accessory === "chevron" && <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} />}
    </View>
  );

  const wrapped = (
    <View style={divider ? { borderBottomWidth: 1, borderBottomColor: LAYOUT.HAIRLINE } : undefined}>{body}</View>
  );

  if (!onPress) return wrapped;
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        haptics.tick();
        onPress();
      }}
    >
      {wrapped}
    </Pressable>
  );
}

// The uppercase micro-label above a group of rows ("TOMORROW, SAT 17", "NEAR YOU · 11 GAMES").
export function RowSectionLabel({ label, action }: { label: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View className="flex-row items-baseline justify-between" style={{ paddingBottom: 6 }}>
      <Text className="font-body-bold text-[12px] uppercase" style={{ color: colors.textTertiary, letterSpacing: 0.6 }}>
        {label}
      </Text>
      {action && (
        <Pressable onPress={action.onPress} hitSlop={8}>
          <Text className="text-[12px] font-body-semibold" style={{ color: colors.textTertiary }}>
            {action.label}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
