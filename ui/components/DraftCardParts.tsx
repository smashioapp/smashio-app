import { useRef, useState } from "react";
import { View, Text, Pressable, PanResponder } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../lib/theme";

// Shared pieces of the Host a Game v3 draft card (create-game-plan.md §9.8: "Edit reuses the
// draft card" — one component, two modes). Split out of wizard.tsx so game/edit/[id].tsx can
// build the same accordion rows instead of drifting back into its own bespoke stepper form.

export function RowLabel({ children, style }: { children: string; style?: object }) {
  return (
    <Text className="font-body-extrabold text-[12px] uppercase mb-2" style={{ color: colors.textTertiary, ...(style ?? {}) }}>
      {children}
    </Text>
  );
}

export function Stepper({ onPress, icon, disabled = false }: { onPress: () => void; icon: keyof typeof Ionicons.glyphMap; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} className="w-[38px] h-[38px] rounded-full items-center justify-center" style={{ backgroundColor: colors.surfaceAlt, opacity: disabled ? 0.4 : 1 }}>
      <Ionicons name={icon} size={16} color={colors.text} />
    </Pressable>
  );
}

export function PriceSlider({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  const [width, setWidth] = useState(0);
  const setFromX = (x: number) => {
    if (width <= 0) return;
    const pct = Math.min(1, Math.max(0, x / width));
    onChange(Math.round(min + pct * (max - min)));
  };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => setFromX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => setFromX(e.nativeEvent.locationX),
    }),
  ).current;
  const pct = max > min ? (value - min) / (max - min) : 0;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} {...pan.panHandlers} style={{ paddingVertical: 14 }}>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt }}>
        <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct * 100}%`, borderRadius: 4, backgroundColor: colors.accent }} />
        <View
          style={{
            position: "absolute",
            left: `${pct * 100}%`,
            top: "50%",
            width: 22,
            height: 22,
            marginLeft: -11,
            marginTop: -11,
            borderRadius: 11,
            backgroundColor: colors.accent,
            shadowColor: colors.accent,
            shadowOpacity: 0.4,
            shadowRadius: 8,
          }}
        />
      </View>
    </View>
  );
}

// The draft card's tap-to-expand-in-place accordion. Three confidence treatments live here:
// locked (green tint, lock glyph, read-only), provenance-tagged-editable (neutral, tag stays),
// plain (no tag). "Doesn't match?" only shows on a locked row.
export function AccordionRow({
  label,
  value,
  placeholder,
  locked = false,
  provenance = null,
  onViewSource,
  onMismatch,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  locked?: boolean;
  provenance?: string | null;
  onViewSource?: () => void;
  onMismatch?: () => void;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View
      className="rounded-2xl px-3.5 py-3.5 mb-3 border-[1.5px]"
      style={{
        backgroundColor: colors.card,
        borderColor: locked ? "rgba(53,214,166,.22)" : value ? "rgba(255,255,255,0.07)" : colors.advanced,
        borderStyle: value ? "solid" : "dashed",
      }}
    >
      <Pressable onPress={locked ? undefined : onToggle} className="flex-row items-center justify-between">
        <View className="flex-1 pr-2">
          <Text className="font-body-extrabold text-[10.5px] uppercase" style={{ color: colors.textTertiary, letterSpacing: 0.5 }}>{label}</Text>
          {value ? (
            <Text className="font-body-bold text-[15px] mt-1" style={{ color: colors.text }}>{value}</Text>
          ) : (
            <Text className="text-[14px] mt-1" style={{ color: colors.textMuted }}>{placeholder}</Text>
          )}
        </View>
        {locked ? (
          <Ionicons name="lock-closed" size={14} color={colors.intermediate} />
        ) : (
          <Ionicons name={expanded ? "chevron-up" : "chevron-forward"} size={15} color={colors.textTertiary} />
        )}
      </Pressable>

      {provenance && (
        <View className="flex-row items-center justify-between mt-2.5">
          <Pressable onPress={onViewSource} className="flex-row items-center gap-1 rounded-pill px-2 py-1" style={{ backgroundColor: "rgba(53,214,166,.12)", borderWidth: 1, borderColor: "rgba(53,214,166,.28)" }}>
            <Text className="font-body-extrabold text-[9px]" style={{ color: colors.intermediate }}>{provenance}{onViewSource ? " · VIEW" : ""}</Text>
          </Pressable>
          {onMismatch && (
            <Pressable onPress={onMismatch}>
              <Text className="font-body-bold text-[12px]" style={{ color: colors.textSecondary }}>Doesn't match?</Text>
            </Pressable>
          )}
        </View>
      )}

      {expanded && !locked && (
        <View className="mt-3.5 pt-3.5 border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          {children}
        </View>
      )}
    </View>
  );
}
