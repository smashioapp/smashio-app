import { Text } from "react-native";
import { colors, reliabilityLabel } from "../lib/theme";
import { usePlayerCard } from "../lib/queries/profile";
import { levelLine } from "../lib/trust";

// The payoff of profile-plan.md P1: hosts deciding a join request see tier, games played,
// reliability band and games-together inline instead of an initial in a coloured circle.
export function VettingStrip({ profileId }: { profileId: string }) {
  const { data: card, isLoading } = usePlayerCard(profileId);

  if (isLoading) {
    return (
      <Text className="text-[12px] font-body-semibold" style={{ color: colors.textMuted }}>
        Loading…
      </Text>
    );
  }

  if (!card) {
    return (
      <Text className="text-[12px] font-body-semibold" style={{ color: colors.textMuted }}>
        Profile unavailable
      </Text>
    );
  }

  const selfTier = card.sports.find((s) => s.sportSlug === "badminton")?.tierLabel ?? card.sports[0]?.tierLabel;
  // Voted level once 3+ co-players have voted, else their own pick, labelled as such (S5).
  const level = levelLine(card.peerSkillLabel, card.peerSkillVotes, selfTier);
  const parts = [
    level?.text,
    `${card.gamesPlayed} played`,
    card.reliabilityScore != null ? `${reliabilityLabel(card.reliabilityScore)} reliability` : null,
    card.gamesTogether && card.gamesTogether > 0 ? `Played together ${card.gamesTogether}×` : null,
  ].filter(Boolean);

  return (
    <Text className="text-[12px] font-body-semibold" style={{ color: colors.textTertiary }} numberOfLines={1}>
      {parts.join(" · ")}
    </Text>
  );
}
