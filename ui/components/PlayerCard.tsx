import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradients, tierColor, reliabilityLabel, reliabilityColor, avatarColor } from "../lib/theme";
import { Avatar } from "./Avatar";
import { RollingNumber } from "./RollingNumber";
import { ReliabilityGauge } from "./ReliabilityGauge";
import { BehaviourBadges } from "./BehaviourBadges";
import { usePlayerCard } from "../lib/queries/profile";
import { supabase } from "../lib/supabase";

function StatTile({ value, label, onPress }: { value: number; label: string; onPress?: () => void }) {
  const Wrap = onPress ? Pressable : View;
  return (
    <Wrap onPress={onPress} style={{ flex: 1 }}>
      <LinearGradient colors={gradients.card} className="rounded-2xl p-3.5 items-center border" style={{ borderColor: colors.cardBorder }}>
        <RollingNumber from={0} to={value} className="font-display-bold text-[22.5px]" style={{ color: colors.text }} />
        <Text className="text-[12.5px] font-body-bold mt-0.5 text-center" style={{ color: colors.textTertiary }}>
          {label}
        </Text>
      </LinearGradient>
    </Wrap>
  );
}

export function PlayerCardHeader({
  id,
  photoPath,
  displayName,
  homeSuburb,
  memberSince,
  tierLabel,
  onEditPress,
  verified,
}: {
  id: string;
  photoPath: string | null;
  displayName: string;
  homeSuburb: string | null;
  memberSince: string;
  tierLabel: string | null;
  onEditPress?: () => void;
  verified?: boolean;
}) {
  const photoUrl = photoPath ? supabase.storage.from("avatars").getPublicUrl(photoPath).data.publicUrl : null;
  const color = tierLabel ? tierColor(tierLabel) : colors.textSecondary;
  const memberSinceYear = new Date(memberSince).getFullYear();

  return (
    <View className="items-center gap-2 px-6 pt-2 pb-4">
      <View style={{ width: 84, height: 84 }}>
        <Avatar name={displayName} color={avatarColor(id)} size={84} photoUri={photoUrl} />
      </View>
      <View className="flex-row items-center gap-2">
        <Text className="font-display text-[20.5px]" style={{ color: colors.text }}>
          {displayName}
        </Text>
        {verified && <Ionicons name="checkmark-circle" size={16} color={colors.intermediate} />}
        {onEditPress && (
          <Pressable onPress={onEditPress} hitSlop={8} className="w-6 h-6 rounded-full items-center justify-center" style={{ backgroundColor: colors.surfaceAlt }}>
            <Ionicons name="pencil" size={12} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>
      {homeSuburb && (
        <Text className="text-[14px]" style={{ color: colors.textTertiary }}>
          {homeSuburb}
        </Text>
      )}
      <View className="flex-row items-center gap-2 mt-0.5">
        {tierLabel && (
          <View className="rounded-pill px-3.5 py-1.5" style={{ backgroundColor: color + "22" }}>
            <Text className="font-body-extrabold text-[13px] uppercase" style={{ color }}>
              {tierLabel}
            </Text>
          </View>
        )}
        <Text className="text-[12px] font-body-semibold" style={{ color: colors.textMuted }}>
          Member since {memberSinceYear}
        </Text>
      </View>
    </View>
  );
}

// The public player card (profile-plan.md P1) — same reputation surface for "me" (own tab,
// raw reliability, edit affordance) and "them" (a stranger's roster/join-request card, band
// only, games-together with the viewer). One RPC (usePlayerCard), one component.
export function PlayerCard({
  profileId,
  mode,
  onEditPress,
  verified,
}: {
  profileId: string;
  mode: "me" | "them";
  onEditPress?: () => void;
  verified?: boolean;
}) {
  const { data: card, isLoading, isError, refetch } = usePlayerCard(profileId);

  if (isLoading) {
    return (
      <View className="items-center justify-center py-16">
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (isError || !card) {
    return (
      <View className="items-center justify-center py-16 gap-3 px-6">
        <Text className="font-body-semibold text-[14.5px] text-center" style={{ color: colors.textSecondary }}>
          Couldn't load this profile.
        </Text>
        <Pressable onPress={() => refetch()} className="rounded-pill px-4 py-2" style={{ backgroundColor: colors.surfaceAlt }}>
          <Text className="font-body-bold text-[13px]" style={{ color: colors.accent }}>
            Retry
          </Text>
        </Pressable>
      </View>
    );
  }

  const primaryTier = card.sports.find((s) => s.sportSlug === "badminton")?.tierLabel ?? card.sports[0]?.tierLabel ?? null;
  const showRating = mode === "me" || card.ratingCount >= 5;

  return (
    <View>
      <PlayerCardHeader
        id={card.id}
        photoPath={card.photoPath}
        displayName={card.displayName}
        homeSuburb={card.homeSuburb}
        memberSince={card.memberSince}
        tierLabel={primaryTier}
        onEditPress={onEditPress}
        verified={mode === "me" ? verified : undefined}
      />

      {mode === "them" && card.gamesTogether != null && card.gamesTogether > 0 && (
        <View className="mx-5 mb-3 rounded-2xl px-3.5 py-2.5 flex-row items-center gap-2" style={{ backgroundColor: "rgba(214,255,63,0.08)" }}>
          <Ionicons name="people" size={15} color={colors.accent} />
          <Text className="font-body-bold text-[13px]" style={{ color: colors.accentSoft }}>
            You've played together {card.gamesTogether}×
          </Text>
        </View>
      )}

      <View className="flex-row gap-2.5 px-5">
        <StatTile value={card.gamesPlayed} label="Games played" />
        <StatTile value={card.gamesHosted} label="Games hosted" />
      </View>

      <View className="flex-row items-center gap-2.5 px-5 mt-2.5">
        {mode === "me" ? (
          <LinearGradient colors={gradients.card} className="rounded-2xl p-3.5 flex-1 items-center border" style={{ borderColor: colors.cardBorder }}>
            <ReliabilityGauge score={card.reliabilityScore} />
            <Text className="text-[12.5px] font-body-bold mt-1" style={{ color: colors.textTertiary }}>
              Reliability
            </Text>
          </LinearGradient>
        ) : (
          <View className="rounded-2xl p-3.5 flex-1 items-center border gap-1.5" style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder }}>
            <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: reliabilityColor(card.reliabilityScore) }} />
            <Text className="font-body-extrabold text-[14px]" style={{ color: colors.text }}>
              {reliabilityLabel(card.reliabilityScore)}
            </Text>
            <Text className="text-[11.5px] font-body-bold" style={{ color: colors.textTertiary }}>
              Reliability
            </Text>
          </View>
        )}

        <View className="rounded-2xl p-3.5 flex-1 items-center border gap-1" style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder }}>
          {showRating && card.ratingCount > 0 ? (
            <>
              <View className="flex-row items-center gap-1">
                <Ionicons name="star" size={15} color={colors.advanced} />
                <Text className="font-display-bold text-[18px]" style={{ color: colors.text }}>
                  {card.ratingAvg?.toFixed(1)}
                </Text>
              </View>
              <Text className="text-[11.5px] font-body-bold" style={{ color: colors.textTertiary }}>
                {card.ratingCount} rating{card.ratingCount === 1 ? "" : "s"}
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="star-outline" size={16} color={colors.textMuted} />
              <Text className="text-[11.5px] font-body-bold text-center" style={{ color: colors.textMuted }}>
                {mode === "me" ? "No ratings yet" : "New player"}
              </Text>
            </>
          )}
        </View>
      </View>

      {Object.keys(card.badgeCounts).length > 0 && (
        <View className="px-5 mt-3.5">
          <BehaviourBadges counts={card.badgeCounts} />
        </View>
      )}

      {/* Multi-sport ready (profile-plan.md P3): every sport this profile has a tier in, not
          just badminton — a no-op today since the roadmap hasn't shipped a second sport yet. */}
      {card.sports.length > 1 && (
        <View className="flex-row flex-wrap gap-2 px-5 mt-3.5">
          {card.sports.map((s) => {
            const c = tierColor(s.tierLabel);
            return (
              <View key={s.sportSlug} className="rounded-pill px-2.5 py-1.5" style={{ backgroundColor: c + "1a" }}>
                <Text className="font-body-bold text-[11.5px]" style={{ color: c }}>
                  {s.sportSlug} · {s.tierLabel}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
