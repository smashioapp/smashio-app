import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import { colors } from "../lib/theme";
import { useKeyboardVisible } from "../lib/useKeyboardVisible";
import { Avatar } from "./Avatar";
import { ChatQuickReplies } from "./ChatQuickReplies";
import type { ChatMember, ChatMessage } from "../lib/queries/messages";

export type ComposerState = "can_post" | "locked_announce" | "locked_muted" | "locked_closed" | "locked_paused" | "announce_host" | "locked_not_member";

const LOCKED_COPY: Partial<Record<ComposerState, string>> = {
  locked_announce: "🔒 Only the host can post here",
  locked_muted: "The host has turned off your messages for this game",
  locked_closed: "This chat is closed",
  locked_paused: "🔒 Chat opens closer to the game — the host can still post",
  locked_not_member: "You're not part of this game",
};

const MENTION_RE = /(?:^|\s)@([a-zA-Z0-9_]{0,24})$/;

function replyLabel(replyTo: ChatMessage, members: ChatMember[]): string {
  if (replyTo.me) return "You";
  return members.find((m) => m.id === replyTo.senderId)?.name ?? "Player";
}

// The composer is the honest signal of what you're allowed to do — it never renders as a
// greyed-out input, always a plain explanation (chat-plan.md §Composer states).
export function ChatComposer({
  state,
  members,
  memberCount,
  onSendText,
  onOpenAttachTray,
  attachTrayOpen,
  replyTo,
  onCancelReply,
}: {
  state: ComposerState;
  members: ChatMember[];
  memberCount: number;
  onSendText: (text: string, mentions: string[]) => void;
  onOpenAttachTray: () => void;
  attachTrayOpen: boolean;
  replyTo: ChatMessage | null;
  onCancelReply: () => void;
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
    onCancelReply();
  };

  const plusStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: withTiming(attachTrayOpen ? "45deg" : "0deg", { duration: 160 }) }],
  }));

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
              <Avatar id={m.id} name={m.name} color={m.color} photoUri={m.photoUri} avatarKey={m.avatarKey} size={22} />
              <Text className="text-[12.5px] font-body-bold" style={{ color: colors.text }}>
                {m.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {keyboardVisible && !input.trim() && !replyTo && (
        <ChatQuickReplies onPick={(text) => onSendText(text, [])} />
      )}

      {replyTo && (
        <View
          className="flex-row items-center gap-2 mx-4 mb-2 pl-2.5 pr-2 py-1.5 rounded-xl border-l-2"
          style={{ backgroundColor: colors.surfaceAlt, borderLeftColor: colors.accent }}
        >
          <View className="flex-1 min-w-0">
            <Text className="text-[10.5px] font-body-bold" style={{ color: colors.accent }}>
              Replying to {replyLabel(replyTo, members)}
            </Text>
            <Text numberOfLines={1} className="text-[11.5px]" style={{ color: colors.textSecondary }}>
              {replyTo.kind === "image" ? "📷 Photo" : replyTo.kind === "game_share" ? "Shared game" : replyTo.body}
            </Text>
          </View>
          <Pressable onPress={onCancelReply} hitSlop={8}>
            <Ionicons name="close" size={16} color={colors.textTertiary} />
          </Pressable>
        </View>
      )}

      <View
        className="flex-row gap-2 px-4 pt-2.5 items-center"
        style={[
          { paddingBottom: bottomPad },
          announceHost ? { borderLeftWidth: 3, borderLeftColor: colors.accent } : undefined,
        ]}
      >
        <Pressable onPress={onOpenAttachTray} className="w-9 h-9 items-center justify-center">
          <Animated.View style={plusStyle}>
            <Ionicons name="add-circle-outline" size={24} color={colors.textSecondary} />
          </Animated.View>
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
