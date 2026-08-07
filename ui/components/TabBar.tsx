import { View, Pressable } from "react-native";
import { router } from "expo-router";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, gradients } from "../lib/theme";

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

function TabButton({ name, focused, onPress }: { name: string; focused: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="w-[42px] h-[42px] rounded-full items-center justify-center"
      style={{ backgroundColor: focused ? "rgba(214,255,63,0.12)" : "transparent" }}
    >
      <Ionicons name={ICONS[name]} size={19} color={focused ? colors.accent : colors.textSecondary} />
    </Pressable>
  );
}

export function TabBar({ state, navigation }: TabBarProps) {
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
            onPress={() => navigation.navigate(route.name)}
          />
        ))}
      </BlurView>
    </View>
  );
}
