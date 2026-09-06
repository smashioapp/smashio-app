import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../lib/theme";

// Shared full-bleed interstitial for a settings subscreen that can't show its real content —
// offline, an expired session, or a failed fetch. Mirrors the circle-icon + title + subtitle +
// pill pattern app/(tabs)/profile.tsx already uses for its "couldn't load your reputation" state,
// so all three read as one family instead of three one-off screens (design-brief.md Prompt 8a
// group D1).
export function SubscreenStatus({
  icon,
  title,
  subtitle,
  ctaLabel,
  onCta,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  ctaLabel: string;
  onCta: () => void;
}) {
  return (
    <View className="flex-1 items-center justify-center gap-3" style={{ paddingVertical: 60, paddingHorizontal: 32 }}>
      <View className="rounded-full items-center justify-center border" style={{ width: 52, height: 52, backgroundColor: colors.surface, borderColor: colors.cardBorder }}>
        <Ionicons name={icon} size={20} color={colors.textSecondary} />
      </View>
      <Text className="font-body-bold text-[14.5px] text-center" style={{ color: colors.text }}>
        {title}
      </Text>
      <Text className="text-[12.5px] text-center" style={{ color: colors.textSecondary }}>
        {subtitle}
      </Text>
      <Pressable onPress={onCta} className="rounded-pill px-5 py-2.5 mt-1" style={{ backgroundColor: colors.accent }}>
        <Text className="font-body-extrabold text-[13px]" style={{ color: colors.base }}>
          {ctaLabel}
        </Text>
      </Pressable>
    </View>
  );
}

export function OfflineStatus({ onRetry }: { onRetry: () => void }) {
  return (
    <SubscreenStatus
      icon="cloud-offline-outline"
      title="You're offline"
      subtitle="Can't reach SMASHIO right now, check your connection and give it another go."
      ctaLabel="Try again"
      onCta={onRetry}
    />
  );
}

export function SessionExpiredStatus({ onSignIn }: { onSignIn: () => void }) {
  return (
    <SubscreenStatus
      icon="lock-closed-outline"
      title="Your session expired"
      subtitle="Sign back in to pick up where you left off."
      ctaLabel="Sign back in"
      onCta={onSignIn}
    />
  );
}
