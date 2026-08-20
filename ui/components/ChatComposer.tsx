import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Keyboard } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../lib/theme";
import { Avatar } from "./Avatar";
import type { ChatMember } from "../lib/queries/messages";

function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

export type ComposerState = "can_post" | "locked_announce" | "locked_muted" | "locked_closed" | "announce_host" | "locked_not_member";

const LOCKED_COPY: Partial<Record<ComposerState, string>> = {
  locked_announce: "🔒 Only the host can post here",
  locked_muted: "The host has turned off your messages for this game",
  locked_closed: "This chat is closed",
  locked_not_member: "You're not part of this game",
};

const MENTION_RE = /(?:^|\s)@([a-zA-Z0-9_]{0,24})$/;

// The composer is the honest signal of what you're allowed to do — it never renders as a
// greyed-out input, always a plain explanation (chat-plan.md §Composer states).
export function ChatComposer({
  state,
  members,
  memberCount,
  onSendText,
  onPickImage,
}: {
  state: ComposerState;
  members: ChatMember[];
  memberCount: number;
  onSendText: (text: string, mentions: string[]) => void;
  onPickImage: () => void;
}) {
  const [input, setInput] = useState("");
  const [mentionIds, setMentionIds] = useState<Set<string>>(new Set());
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const bottomPad = keyboardVisible ? 10 : Math.max(insets.bottom, 10);

  const mentionQuery = useMemo(() => MENTION_RE.exec(input)?.[1] ?? null, [input]);
  const suggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return members.filter((m) => m.name.toLowerCase().startsWith(q)).slice(0, 5);
  }, [mentionQuery, members]);

  const pickMention = (member: ChatMember) => {
    setInput((t) => t.replace(MENTION_RE, ` @${member.name} `).trimStart());
    setMentionIds((s) => new Set(s).add(member.id));
  };

  const send = () => {
    const text = input.trim();
    if (!text) return;
    onSendText(text, [...mentionIds]);
    setInput("");
    setMentionIds(new Set());
  };

  if (state !== "can_post" && state !== "announce_host") {
    return (
      <View className="px-6 py-4 items-center">
        <Text className="text-[13px] text-center" style={{ color: colors.textMuted }}>
          {LOCKED_COPY[state]}
        </Text>
      </View>
    );
  }

  const announceHost = state === "announce_host";

  return (
    <View>
      {suggestions.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="px-4 pb-2"
          contentContainerStyle={{ gap: 8 }}
        >
          {suggestions.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => pickMention(m)}
              className="flex-row items-center gap-1.5 rounded-pill pl-1 pr-3 py-1"
              style={{ backgroundColor: colors.surfaceAlt }}
            >
              <Avatar name={m.name} color={m.color} photoUri={m.photoUri} size={22} />
              <Text className="text-[12.5px] font-body-bold" style={{ color: colors.text }}>
                {m.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      <View
        className="flex-row gap-2 px-4 pt-2.5 items-center"
        style={[
          { paddingBottom: bottomPad },
          announceHost ? { borderLeftWidth: 3, borderLeftColor: colors.accent } : undefined,
        ]}
      >
        <Pressable onPress={onPickImage} className="w-9 h-9 items-center justify-center">
          <Ionicons name="add-circle-outline" size={24} color={colors.textSecondary} />
        </Pressable>
        <TextInput
          testID="chat-composer-input"
          value={input}
          onChangeText={setInput}
          placeholder={announceHost ? `Announce to ${memberCount} players…` : "Message the group…"}
          placeholderTextColor={colors.textMuted}
          multiline
          className="flex-1 rounded-[20px] px-4 py-2.5 border"
          style={{ backgroundColor: "#141416", borderColor: "rgba(255,255,255,0.1)", color: colors.text, fontSize: 13.5, maxHeight: 110 }}
        />
        <Pressable
          testID="chat-composer-send"
          onPress={send}
          disabled={!input.trim()}
          className="w-[42px] h-[42px] rounded-full items-center justify-center"
          style={{ backgroundColor: input.trim() ? colors.accent : colors.surfaceAlt }}
        >
          <Ionicons name="arrow-up" size={16} color={input.trim() ? colors.base : colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}
