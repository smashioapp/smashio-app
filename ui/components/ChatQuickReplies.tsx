import { ScrollView, Pressable, Text } from "react-native";
import { colors } from "../lib/theme";

const QUICK_REPLIES = ["On my way", "Running 5 late", "I'll bring shuttles"];

// The three messages that actually get sent in a badminton group chat (SMASHIO Chat Redesign
// mock, §2) — one tap while the keyboard is up and the input is empty, gone once you type.
export function ChatQuickReplies({ onPick }: { onPick: (text: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4 pb-2" contentContainerStyle={{ gap: 7 }}>
      {QUICK_REPLIES.map((text) => (
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
