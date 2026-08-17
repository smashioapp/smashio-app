import { useEffect, useState } from "react";
import { Pressable, View, Text } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { colors, gradients } from "../lib/theme";
import { AvatarStack } from "./Avatar";
import { formatCountdown } from "../lib/format";
import { openDirections } from "../lib/directions";
import { haptics } from "../lib/haptics";
import type { Game, Player } from "../lib/mockData";
import type { MyRole } from "./UpcomingGameCard";

const ROLE_LABEL: Record<MyRole, string> = { hosting: "Hosting", playing: "Playing", requested: "Requested" };
const URGENT_MS = 2 * 60 * 60 * 1000;

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true }).replace(" ", "");
}

// The day-of surface (my-games-plan.md §M2): the next game inside 24h — or live right now —
// gets full screen treatment, not a row. It's excluded from the agenda list below it.
export function NextUpHero({
  game,
  role,
  roster,
  unread,
  onPress,
}: {
  game: Game;
  role: MyRole;
  roster: Player[];
  unread: boolean;
  onPress: () => void;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const startMs = new Date(game.startsAt).getTime();
  const endMs = new Date(game.endsAt).getTime();
  const nowMs = now.getTime();
  const live = nowMs >= startMs && nowMs < endMs;
  const urgent = !live && startMs - nowMs <= URGENT_MS;
  const headline = live ? `On now · ends ${formatClock(game.endsAt)}` : formatCountdown(game.startsAt, now) ?? game.time;
  const accentColor = live ? colors.intermediate : urgent ? colors.danger : colors.accent;

  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!live && !urgent) {
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(withSequence(withTiming(1, { duration: 560 }), withTiming(0, { duration: 560 })), -1, false);
  }, [live, urgent]);
  const dotStyle = useAnimatedStyle(() => ({ opacity: 0.6 + pulse.value * 0.4, transform: [{ scale: 1 + pulse.value * 0.5 }] }));

  const perPlayer = game.cost;

  return (
    <Animated.View entering={FadeInDown.duration(320)} className="px-5 pb-3">
      <Pressable onPress={onPress}>
        <LinearGradient
          colors={gradients.card}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          className="rounded-[22px] px-4.5 pt-4 pb-4.5 border-[1.5px] gap-3.5"
          style={{
            borderColor: live ? "rgba(139,255,158,0.35)" : urgent ? "rgba(255,103,103,0.35)" : "rgba(214,255,63,0.3)",
          }}
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-1.5">
              {(live || urgent) && <Animated.View className="w-2 h-2 rounded-full" style={[{ backgroundColor: accentColor }, dotStyle]} />}
              <Text className="font-body-extrabold text-[11px] uppercase tracking-wide" style={{ color: colors.textTertiary }}>
                {live ? "Happening now" : "Next up"}
              </Text>
            </View>
            <View className="rounded-pill px-2 py-0.5" style={{ backgroundColor: "rgba(214,255,63,0.12)" }}>
              <Text className="text-[11px] font-body-extrabold" style={{ color: colors.accent }}>
                {ROLE_LABEL[role]}
              </Text>
            </View>
          </View>

          <Text className="font-display text-[22px] leading-[30px]" style={{ color: accentColor }}>
            {headline}
          </Text>

          <View className="pr-1">
            <Text className="font-display-bold text-[17px]" style={{ color: colors.text }} numberOfLines={1}>
              {game.venue}
            </Text>
            <View className="flex-row items-center gap-1 mt-0.5">
              <Ionicons name="location-outline" size={12} color={colors.textTertiary} />
              <Text className="text-[13.5px] flex-1" style={{ color: colors.textTertiary }} numberOfLines={1}>
                {game.venueAddress ?? game.suburb}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center justify-between">
            {roster.length > 0 ? <AvatarStack people={roster} max={5} /> : <View />}
            <Text className="text-[13px] font-body-bold" style={{ color: colors.textMuted }}>
              Bring ${perPlayer}
            </Text>
          </View>

          {/* Two buttons (docs/v2-design-plan.md §4.4) — Directions neutral, Open chat lime.
              Calendar was a third button here; it's dropped (backlog B11), the silent
              add-on-join still runs from Game Detail's hold-to-join. */}
          <View className="flex-row items-center gap-2 pt-1 mt-0.5 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <HeroAction icon="navigate" label="Directions" onPress={() => openDirections(game)} />
            <HeroAction icon="chatbubble" label="Open chat" unread={unread} accent onPress={() => router.push(`/chat/${game.id}`)} />
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

function HeroAction({
  icon,
  label,
  unread = false,
  accent = false,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  unread?: boolean;
  /** Lime fill — rule 5 (lime once per screen): the hero's own CTA, not the neutral action beside it. */
  accent?: boolean;
  onPress: () => void;
}) {
  const iconColor = accent ? colors.base : colors.text;
  return (
    <Pressable
      onPress={(e) => {
        e.stopPropagation();
        onPress();
      }}
      className="flex-1 flex-row items-center justify-center gap-1.5 rounded-pill py-2.5"
      style={{ backgroundColor: accent ? colors.accent : colors.surfaceAlt }}
    >
      <View>
        <Ionicons name={icon} size={14} color={iconColor} />
        {unread && (
          <View
            className="absolute rounded-full"
            style={{ width: 6, height: 6, top: -2, right: -2, backgroundColor: accent ? colors.base : colors.accent }}
          />
        )}
      </View>
      <Text className="text-[12.5px] font-body-bold" style={{ color: accent ? colors.base : colors.text }}>
        {label}
      </Text>
    </Pressable>
  );
}
