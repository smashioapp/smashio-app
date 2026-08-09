import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming, Easing } from "react-native-reanimated";
import { colors } from "../lib/theme";

type Particle = {
  angle: number; // degrees
  distance: number;
  delay: number;
  duration: number;
  size: number;
  color: string;
};

type BurstProps = {
  origin: { x: number; y: number };
  count?: number;
  colors?: string[];
  onDone?: () => void;
};

const DEFAULT_COLORS = [colors.accent, colors.accentSoft, colors.accent2, colors.accent3];

function ParticleView({ p }: { p: Particle }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      p.delay,
      withTiming(1, { duration: p.duration, easing: Easing.out(Easing.cubic) }),
    );
  }, []);

  const style = useAnimatedStyle(() => {
    const rad = (p.angle * Math.PI) / 180;
    const travel = progress.value * p.distance;
    const gravity = progress.value * progress.value * (p.distance * 0.35);
    return {
      opacity: 1 - progress.value,
      transform: [
        { translateX: Math.cos(rad) * travel },
        { translateY: Math.sin(rad) * travel + gravity },
        { scale: 1 - progress.value * 0.7 },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: p.size,
          height: p.size,
          borderRadius: p.size / 2,
          backgroundColor: p.color,
        },
        style,
      ]}
    />
  );
}

// Reusable radial particle burst — fires ~16 particles outward, self-unmounts when done.
export function Burst({ origin, count = 16, colors: palette = DEFAULT_COLORS, onDone }: BurstProps) {
  const [alive, setAlive] = useState(true);

  const particles = useMemo<Particle[]>(() => {
    const step = 360 / count;
    return Array.from({ length: count }, (_, i) => ({
      angle: i * step + (Math.random() * step - step / 2),
      distance: 36 + Math.random() * 40,
      delay: Math.random() * 30,
      duration: 480 + Math.random() * 220,
      size: 4 + Math.random() * 5,
      color: palette[i % palette.length],
    }));
  }, [count, palette]);

  useEffect(() => {
    const maxLife = Math.max(...particles.map((p) => p.delay + p.duration));
    const t = setTimeout(() => {
      setAlive(false);
      onDone?.();
    }, maxLife + 40);
    return () => clearTimeout(t);
  }, []);

  if (!alive) return null;

  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", left: origin.x, top: origin.y, width: 0, height: 0 }}
    >
      {particles.map((p, i) => (
        <ParticleView key={i} p={p} />
      ))}
    </View>
  );
}
