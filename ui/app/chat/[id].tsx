import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, FlatList, KeyboardAvoidingView, Platform } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, initial } from "../../lib/theme";
import { useGameDetail } from "../../lib/queries/games";
import { useMarkThreadRead, useMessages, useSendMessage } from "../../lib/queries/messages";
import { Screen } from "../../components/Screen";
import { BackButton } from "../../components/BackButton";

export default function ChatThread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const gameId = id ?? "";
  const gameQuery = useGameDetail(gameId);
  const game = gameQuery.data;
  const messagesQuery = useMessages(gameId);
  const messages = messagesQuery.data ?? [];
  const sendMessage = useSendMessage(gameId);
  const markRead = useMarkThreadRead(gameId);
  const [input, setInput] = useState("");

  useEffect(() => {
    if (gameId) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  const send = () => {
    if (!input.trim() || !gameId) return;
    sendMessage.mutate(input);
    setInput("");
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View className="flex-row items-center gap-3 px-5 pt-1.5 pb-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <BackButton onPress={() => router.back()} />
          <View>
            <Text className="font-body-bold text-[16.5px]" style={{ color: colors.text }}>
              {game?.venue ?? "Chat"}
            </Text>
            <Text className="text-[13px]" style={{ color: colors.textTertiary }}>
              {game?.joinedCount ?? 0} players
            </Text>
          </View>
        </View>

        <FlatList
          style={{ flex: 1 }}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          renderItem={({ item: m }) => (
            <View className={`flex-row gap-2 items-end ${m.me ? "flex-row-reverse" : ""}`}>
              {!m.me && (
                <Pressable onPress={() => router.push(`/player/${m.senderId}`)}>
                  <View
                    className="w-7 h-7 rounded-full items-center justify-center"
                    style={{ backgroundColor: m.color ?? colors.textSecondary }}
                  >
                    <Text style={{ color: colors.base, fontSize: 11, fontWeight: "800" }}>{initial(m.from)}</Text>
                  </View>
                </Pressable>
              )}
              <View style={{ maxWidth: 220, alignItems: m.me ? "flex-end" : "flex-start" }}>
                {!m.me && (
                  <Text className="text-[12px] font-body-bold mb-0.5" style={{ color: colors.textMuted }}>
                    {m.from}
                  </Text>
                )}
                <View
                  className="px-3.5 py-2.5"
                  style={{
                    backgroundColor: m.me ? "rgba(214,255,63,0.16)" : colors.surfaceAlt,
                    borderRadius: 16,
                    borderBottomRightRadius: m.me ? 3 : 16,
                    borderBottomLeftRadius: m.me ? 16 : 3,
                  }}
                >
                  <Text className="text-[15px]" style={{ color: m.me ? "#EFFFC0" : colors.text }}>
                    {m.text}
                  </Text>
                </View>
                <Text className="text-[11.5px] mt-0.5" style={{ color: colors.textMuted }}>
                  {m.time}
                </Text>
              </View>
            </View>
          )}
        />

        <View className="flex-row gap-2 px-4 pt-2.5 pb-7 items-center">
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Message the group…"
            placeholderTextColor={colors.textMuted}
            className="flex-1 rounded-pill px-4 py-3 border"
            style={{ backgroundColor: "#141416", borderColor: "rgba(255,255,255,0.1)", color: colors.text, fontSize: 13.5 }}
            onSubmitEditing={send}
          />
          <Pressable onPress={send} className="w-[42px] h-[42px] rounded-full items-center justify-center" style={{ backgroundColor: colors.accent }}>
            <Ionicons name="arrow-up" size={16} color={colors.base} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
