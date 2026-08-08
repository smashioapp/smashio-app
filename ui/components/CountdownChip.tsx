import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { colors } from "../lib/theme";
import { formatCountdown } from "../lib/format";

// Ticks once a minute — countdown text only needs minute resolution, and starts_at is
// always >0 mins out by the time a chip renders (formatCountdown hides past-start games).
export function CountdownChip({ startsAt }: { startsAt: string }) {
  const [label, setLabel] = useState(() => formatCountdown(startsAt));

  useEffect(() => {
    const id = setInterval(() => setLabel(formatCountdown(startsAt)), 60_000);
    return () => clearInterval(id);
  }, [startsAt]);

  if (!label) return null;

  return (
    <View className="rounded-pill px-2.5 py-1" style={{ backgroundColor: "rgba(214,255,63,0.14)" }}>
      <Text className="font-body-extrabold text-[10px] uppercase tracking-wide" style={{ color: colors.accent }}>
        {label}
      </Text>
    </View>
  );
}
