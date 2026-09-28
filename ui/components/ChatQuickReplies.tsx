import { ScrollView, Pressable, Text } from "react-native";
import { colors } from "../lib/theme";

const QUICK_REPLIES = ["On my way", "Running 5 late", "I'll bring shuttles"];
// fill-the-spot P5.2: from 3h before the game until an hour after, the messages that matter are
// about getting there.
const GAME_DAY_REPLIES = ["On my way", "Running 10 late", "Here, at reception"];

// The three messages that actually get sent in a badminton group chat (SMASHIO Chat Redesign
// mock, §2) — one tap while the keyboard is up and the input is empty, gone once you type.
export function ChatQuickReplies({ onPick, gameDay = false }: { onPick: (text: string) => void; gameDay?: boolean }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4 pb-2" contentContainerStyle={{ gap: 7 }}>
      {(gameDay ? GAME_DAY_REPLIES : QUICK_REPLIES).map((text) => (
        <Pressable
          key={text}
          onPress={() => onPick(text)}
          className="rounded-pill px-3 py-1.5 border"
          style={{ backgroundColor: colors.surface, borderColor: colors.cardBorder }}
        >
          <Text className="text-[11.5px] font-body-semibold" style={{ color: colors.textDim }}>
            {text}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
