import { useEffect, useState } from "react";
import { Text, TextStyle } from "react-native";
import { Easing, runOnJS, useDerivedValue, useSharedValue, withTiming } from "react-native-reanimated";

type RollingNumberProps = {
  from: number;
  to: number;
  duration?: number;
  style?: TextStyle;
  className?: string;
};

// Counts up on mount / whenever `to` changes — numbers that move get looked at twice.
export function RollingNumber({ from, to, duration = 900, style, className }: RollingNumberProps) {
  const [display, setDisplay] = useState(from);
  const progress = useSharedValue(from);

  useEffect(() => {
    progress.value = from;
    progress.value = withTiming(to, { duration, easing: Easing.out(Easing.cubic) });
  }, [to]);

  useDerivedValue(() => {
    runOnJS(setDisplay)(Math.round(progress.value));
  });

  return (
    <Text style={style} className={className}>
      {display}
    </Text>
  );
}
