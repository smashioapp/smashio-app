import { useEffect, useState } from "react";
import { Text } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { colors } from "../lib/theme";
import { formatCountdown } from "../lib/format";

const HOUR_MS = 60 * 60 * 1000;

// Ticks once a minute — countdown text only needs minute resolution, and starts_at is
// always >0 mins out by the time a chip renders (formatCountdown hides past-start games).
export function CountdownChip({ startsAt }: { startsAt: string }) {
  const [label, setLabel] = useState(() => formatCountdown(startsAt));
  const urgent = new Date(startsAt).getTime() - Date.now() <= HOUR_MS;

  useEffect(() => {
    const id = setInterval(() => setLabel(formatCountdown(startsAt)), 60_000);
    return () => clearInterval(id);
  }, [startsAt]);

  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!urgent) {
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(withSequence(withTiming(1, { duration: 560 }), withTiming(0, { duration: 560 })), -1, false);
  }, [urgent]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.85 + pulse.value * 0.15,
    transform: [{ scale: 1 + pulse.value * 0.06 }],
  }));

  if (!label) return null;

  return (
    <Animated.View
      className="rounded-pill px-2.5 py-1"
      style={[
        { backgroundColor: urgent ? "rgba(255,103,103,0.16)" : "rgba(214,255,63,0.14)" },
        style,
      ]}
    >
      <Text
        className="font-body-extrabold text-[10px] uppercase tracking-wide"
        style={{ color: urgent ? colors.danger : colors.accent }}
      >
        {label}
      </Text>
    </Animated.View>
  );
}
