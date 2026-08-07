import { View, Text, Pressable, FlatList } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../../lib/store";
import { colors } from "../../lib/theme";
import { GAMES } from "../../lib/mockData";
import { Screen } from "../../components/Screen";

const THREAD_IDS = ["g1", "g2"];

export default function ChatList() {
  const chatMessages = useAppStore((s) => s.chatMessages);

  const threads = THREAD_IDS.map((gid) => {
    const g = GAMES.find((x) => x.id === gid)!;
    const msgs = chatMessages[gid] ?? [];
    const last = msgs[msgs.length - 1];
    return {
      id: gid,
      venue: g.venue,
      time: last?.time ?? "",
      preview: last ? `${last.me ? "You: " : ""}${last.text}` : "",
    };
  });

  return (
    <Screen>
      <Text className="font-display text-[26px] px-5 pt-3 pb-3.5" style={{ color: colors.text }}>
        Chat
      </Text>
      <FlatList
        style={{ flex: 1 }}
        data={threads}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 110 }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/chat/${item.id}`)}
            className="flex-row items-center gap-3 px-2 py-3 border-b"
            style={{ borderColor: "rgba(255,255,255,0.05)" }}
          >
            <View
              className="w-[46px] h-[46px] rounded-2xl items-center justify-center"
              style={{ backgroundColor: colors.surfaceAlt }}
            >
              <Ionicons name="tennisball-outline" size={20} color={colors.accent} />
            </View>
            <View className="flex-1">
              <View className="flex-row justify-between">
                <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
                  {item.venue}
                </Text>
                <Text className="text-[10.5px] font-body-bold" style={{ color: colors.textMuted }}>
                  {item.time}
                </Text>
              </View>
              <Text numberOfLines={1} className="text-[12.5px] mt-0.5" style={{ color: colors.textSecondary }}>
                {item.preview}
              </Text>
            </View>
            <View className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.accent }} />
          </Pressable>
        )}
      />
    </Screen>
  );
}
