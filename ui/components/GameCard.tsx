import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, tierColor } from "../lib/theme";
import { AvatarStack } from "./Avatar";
import { CountdownChip } from "./CountdownChip";
import { Hero } from "./Hero";
import { ListRow } from "./ListRow";
import { RailCard } from "./RailCard";
import { formatTimeShort } from "../lib/format";
import { Game, spotsLeft } from "../lib/mockData";
import { haptics } from "../lib/haptics";

/**
 * The v2 density system (docs/v2-design-plan.md §3.3, rule 2). One game, three weights:
 *
 *  - `featured` — the single card a screen is built around. Never render two.
 *  - `standard` — a single-line list row. This is what a list is made of now.
 *  - `rail`     — a 132px scroll chip for a named shelf.
 *
 * v1 had one card and repeated it, which is exactly why nothing on Discover won the eye.
 */
export function GameCard({
  game,
  variant = "standard",
  kicker,
  ctaLabel,
  onPress,
  testID,
}: {
  game: Game;
  variant?: "featured" | "standard" | "rail";
  /** Featured only — the reason this game earned the anchor ("BEST MATCH FOR YOU"). */
  kicker?: string;
  ctaLabel?: string;
  onPress: () => void;
  testID?: string;
}) {
  if (variant === "rail") return <RailCard game={game} onPress={onPress} />;
  if (variant === "featured") return <FeaturedGameCard game={game} kicker={kicker} ctaLabel={ctaLabel} onPress={onPress} />;
  return <GameRow game={game} onPress={onPress} testID={testID} />;
}

// Standard weight. Everything v1 crammed onto a card — court graphic, organizer line, scarcity
// bar, verified badge, inline join button — is gone from this row on purpose (backlog B3-B6):
// a list is for scanning, and the decision surface is the detail screen.
export function GameRow({
  game,
  onPress,
  divider = true,
  testID,
}: {
  game: Game;
  onPress: () => void;
  divider?: boolean;
  testID?: string;
}) {
  const open = spotsLeft(game);
  return (
    <ListRow
      dotColor={tierColor(game.skill)}
      title={`${game.venue}, ${formatTimeShort(game.startsAt)}`}
      subtitle={[game.skill, game.distance, game.verified ? "Verified" : null, open === 0 ? "Full" : null]
        .filter(Boolean)
        .join(" · ")}
      leading={game.joined.length > 0 ? <AvatarStack people={game.joined} max={2} /> : undefined}
      trailing={`$${game.cost}`}
      divider={divider}
      onPress={onPress}
      testID={testID}
    />
  );
}

// Featured weight — the anchor. Lime lives here and nowhere else on the screen (rule 5).
function FeaturedGameCard({
  game,
  kicker,
  ctaLabel = "View game",
  onPress,
}: {
  game: Game;
  kicker?: string;
  ctaLabel?: string;
  onPress: () => void;
}) {
  const open = spotsLeft(game);

  return (
    <Hero tone="accent" coverKey={game.coverKey}>
      <View className="flex-row items-center justify-between">
        <CountdownChip startsAt={game.startsAt} />
        {game.verified && (
          <View className="rounded-pill" style={{ backgroundColor: "rgba(53,214,166,0.15)", paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text className="font-body-extrabold text-[11px] uppercase" style={{ color: colors.intermediate, letterSpacing: 0.4 }}>
              Verified venue
            </Text>
          </View>
        )}
      </View>

      {!!kicker && (
        <Text className="font-body-bold text-[11.5px] uppercase mt-3.5" style={{ color: colors.textSecondary, letterSpacing: 0.6 }}>
          {kicker}
        </Text>
      )}
      <Text numberOfLines={1} className="font-display-bold text-[21px] mt-1" style={{ color: colors.text }}>
        {game.venue}
      </Text>
      <Text numberOfLines={1} className="text-[13px] mt-0.5" style={{ color: colors.textDim }}>
        {[game.suburb, game.distance, game.courts].filter(Boolean).join(" · ")}
      </Text>

      <View className="flex-row items-center justify-between mt-4">
        {game.joined.length > 0 ? <AvatarStack people={game.joined} max={4} /> : <View />}
        <View className="items-end">
          <Text className="font-display-bold text-[22px]" style={{ color: colors.text }}>
            ${game.cost}
            <Text className="font-body text-[12px]" style={{ color: colors.textTertiary }}>
              /player
            </Text>
          </Text>
          <Text className="text-[11.5px]" style={{ color: colors.textSecondary }}>
            {game.joinedCount + 1}/{game.maxPlayers} joined · {game.skill}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={() => {
          haptics.tap();
          onPress();
        }}
        className="flex-row items-center justify-center gap-1.5 rounded-pill mt-4"
        style={{ height: 48, backgroundColor: open === 0 ? colors.surfaceAlt : colors.accent }}
      >
        <Text
          className="font-body-extrabold text-[14.5px] uppercase"
          style={{ color: open === 0 ? colors.textMuted : colors.base, letterSpacing: 0.3 }}
        >
          {open === 0 ? "Game full" : ctaLabel}
        </Text>
        {open > 0 && <Ionicons name="arrow-forward" size={15} color={colors.base} />}
      </Pressable>
    </Hero>
  );
}
