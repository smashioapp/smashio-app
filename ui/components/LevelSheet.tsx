import { Text } from "react-native";
import { Sheet } from "./Sheet";
import { colors } from "../lib/theme";
import { PEER_LEVEL_MIN_VOTES, type LevelLine } from "../lib/trust";

// What "voted by 7" means (short-a-player-plan S5). Players pick their own level once; after
// each game the people they played with say what level they actually played at. Once enough
// have voted, that's the level everyone sees.
export function LevelSheet({
  visible,
  onClose,
  name,
  level,
}: {
  visible: boolean;
  onClose: () => void;
  name: string;
  level: LevelLine | null;
}) {
  const body = level?.earned
    ? `${name} plays ${level.label}. That's what the people who've played with them voted after their games, not a level they picked for themselves.`
    : level
      ? `${name} picked ${level.label} themselves. Once ${PEER_LEVEL_MIN_VOTES} people have played with them and voted, you'll see their voted level here instead.`
      : `${name} hasn't picked a level yet.`;

  return (
    <Sheet visible={visible} onClose={onClose} title={level?.earned ? "Level voted by players" : "Level"}>
      <Text className="text-[13.5px]" style={{ color: colors.textSecondary, lineHeight: 20 }}>
        {body}
      </Text>
    </Sheet>
  );
}
