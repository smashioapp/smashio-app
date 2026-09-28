import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { colors } from "../lib/theme";
import { Sheet } from "./Sheet";
import { Button } from "./Button";
import { friendlyWhen } from "../lib/schedule";
import { paymentLine } from "../lib/payment";
import { openDirections } from "../lib/directions";
import { addGameToCalendar } from "../lib/calendar";
import { haptics } from "../lib/haptics";
import { track } from "../lib/analytics";
import type { Game } from "../lib/mockData";

// fill-the-spot P2.3 (F6): the moment after a join. Says what happens next instead of leaving the
// player on a page that only changed its footer. Instant-join games get "You're in" with the
// three things a player does next; request-mode games get "Asked" and no false promises.
export function YoureInSheet({
  visible,
  onClose,
  game,
  hostName,
  instant,
}: {
  visible: boolean;
  onClose: () => void;
  game: Game;
  hostName: string;
  instant: boolean;
}) {
  const when = friendlyWhen(new Date(game.startsAt));
  const pay = paymentLine(game, hostName);
  const host = hostName === "The host" ? "The host" : hostName;
  const act = (action: string, fn: () => void) => () => {
    haptics.tap();
    track("youre_in_action", { game_id: game.id, action });
    fn();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={instant ? "You're in" : `Asked. ${host} will confirm`}>
      <View className="flex-row items-center gap-2.5 mb-1">
        <Ionicons name={instant ? "checkmark-circle" : "time-outline"} size={22} color={instant ? colors.intermediate : colors.advanced} />
        <Text className="flex-1 font-body-bold text-[15px]" style={{ color: colors.text }}>
          {game.venue}, {when}
        </Text>
      </View>
      {instant ? (
        <>
          {game.cost > 0 && (
            <Text className="text-[13.5px] mt-1" style={{ color: colors.textSecondary, lineHeight: 20 }}>
              ${game.cost} each. {pay ?? `You sort it with ${host === "The host" ? "the host" : host} on the day.`}
            </Text>
          )}
          <View className="mt-4 gap-2.5">
            <Button
              testID="youre-in-hi"
              label="Say hi in the chat"
              onPress={act("chat", () => {
                onClose();
                router.push(`/chat/${game.id}`);
              })}
            />
            <View className="flex-row gap-2.5">
              <View className="flex-1">
                <Button label="Add to calendar" variant="secondary" onPress={act("calendar", () => void addGameToCalendar(game, hostName))} />
              </View>
              <View className="flex-1">
                <Button label="Directions" variant="secondary" onPress={act("directions", () => openDirections(game))} />
              </View>
            </View>
          </View>
        </>
      ) : (
        <>
          <Text className="text-[13.5px] mt-1" style={{ color: colors.textSecondary, lineHeight: 20 }}>
            You'll get a notification the moment they reply. The chat opens once you're in.
          </Text>
          <View className="mt-4">
            <Button label="Sounds good" variant="secondary" onPress={onClose} />
          </View>
        </>
      )}
    </Sheet>
  );
}
