import { View, Pressable } from "react-native";
import { router } from "expo-router";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, gradients } from "../lib/theme";
import { useChatThreads } from "../lib/queries/messages";
import { useMyPendingRequestsCount } from "../lib/queries/gamePlayers";

type TabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
};

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  discover: "search",
  "my-games": "calendar-outline",
  chat: "chatbubble-ellipses-outline",
  profile: "person-outline",
};

function TabButton({ name, focused, onPress, showDot }: { name: string; focused: boolean; onPress: () => void; showDot?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      className="w-[42px] h-[42px] rounded-full items-center justify-center"
      style={{ backgroundColor: focused ? "rgba(214,255,63,0.12)" : "transparent" }}
    >
      <View>
        <Ionicons name={ICONS[name]} size={19} color={focused ? colors.accent : colors.textSecondary} />
        {showDot && (
          <View
            className="absolute w-[7px] h-[7px] rounded-full"
            style={{ top: -1, right: -3, backgroundColor: colors.accent, borderWidth: 1.5, borderColor: colors.base }}
          />
        )}
      </View>
    </Pressable>
  );
}

export function TabBar({ state, navigation }: TabBarProps) {
  const { data: threads = [] } = useChatThreads();
  const hasUnreadChat = threads.some((t) => t.unread);
  const { data: pendingRequests = 0 } = useMyPendingRequestsCount();
  const hasPendingRequests = pendingRequests > 0;

  const dotFor = (name: string) => (name === "chat" ? hasUnreadChat : name === "my-games" || name === "profile" ? hasPendingRequests : false);

  return (
    <View style={{ position: "absolute", left: 16, right: 16, bottom: 14, height: 64 }}>
      <BlurView
        intensity={40}
        tint="dark"
        style={{
          flex: 1,
          borderRadius: 100,
          overflow: "hidden",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-around",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
          backgroundColor: "rgba(23,23,26,0.75)",
        }}
      >
        {state.routes.slice(0, 2).map((route, i) => (
          <TabButton
            key={route.key}
            name={route.name}
            focused={state.index === i}
            showDot={dotFor(route.name)}
            onPress={() => navigation.navigate(route.name)}
          />
        ))}

        <Pressable onPress={() => router.push("/wizard")} style={{ marginTop: -32 }}>
          <LinearGradient
            colors={gradients.accentDiagonal}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 3,
              borderColor: colors.base,
            }}
          >
            <Ionicons name="add" size={24} color={colors.base} />
          </LinearGradient>
        </Pressable>

        {state.routes.slice(2, 4).map((route, i) => (
          <TabButton
            key={route.key}
            name={route.name}
            focused={state.index === i + 2}
            showDot={dotFor(route.name)}
            onPress={() => navigation.navigate(route.name)}
          />
        ))}
      </BlurView>
    </View>
  );
}
