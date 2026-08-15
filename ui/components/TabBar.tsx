import { useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { colors } from "../lib/theme";
import { NAV, tabBarBottom } from "../lib/nav";
import { navMinimize, scrollRouteToTop } from "../lib/navScroll";
import { useChatThreads } from "../lib/queries/messages";
import { useMyPendingRequestsCount } from "../lib/queries/gamePlayers";
import { haptics } from "../lib/haptics";
import { SPRING } from "../lib/motion";

type TabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
};

const ICONS: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  discover: { active: "search", inactive: "search-outline" },
  "my-games": { active: "calendar", inactive: "calendar-outline" },
  chat: { active: "chatbubble-ellipses", inactive: "chatbubble-ellipses-outline" },
  profile: { active: "person", inactive: "person-outline" },
};

const LABELS: Record<string, string> = {
  discover: "Discover",
  "my-games": "My Games",
  chat: "Chat",
  profile: "Profile",
};

function UnreadDot() {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0, { duration: 700 })), -1, false);
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: 0.6 + pulse.value * 0.4,
    transform: [{ scale: 1 + pulse.value * 0.35 }],
  }));

  return (
    <Animated.View
      className="absolute w-[7px] h-[7px] rounded-full"
      style={[{ top: -1, right: -3, backgroundColor: colors.accent, borderWidth: 1.5, borderColor: colors.base }, style]}
    />
  );
}

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View
      className="absolute items-center justify-center rounded-full px-[3px]"
      style={{ top: -4, right: -8, minWidth: 16, height: 16, backgroundColor: colors.accent, borderWidth: 1.5, borderColor: colors.base }}
    >
      <Text className="font-body-extrabold" style={{ fontSize: 9, color: colors.base }}>
        {count > 9 ? "9+" : count}
      </Text>
    </View>
  );
}

function TabButton({
  name,
  focused,
  onPress,
  showDot,
  badgeCount,
}: {
  name: string;
  focused: boolean;
  onPress: () => void;
  showDot?: boolean;
  badgeCount?: number;
}) {
  const scale = useSharedValue(1);
  const pillScale = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    if (focused) scale.value = withSequence(withSpring(1.22, SPRING.pop), withSpring(1, SPRING.settle));
    pillScale.value = withSpring(focused ? 1 : 0, SPRING.settle);
  }, [focused]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const pillStyle = useAnimatedStyle(() => ({
    opacity: pillScale.value,
    transform: [{ scale: 0.6 + pillScale.value * 0.4 }],
  }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: 1 - navMinimize.value }));

  return (
    <Pressable
      onPress={() => {
        haptics.tick();
        onPress();
      }}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={LABELS[name]}
      className="items-center justify-center"
      style={{ width: NAV.ITEM_WIDTH, height: NAV.ITEM_HEIGHT }}
    >
      <Animated.View
        className="absolute rounded-full"
        style={[{ width: 52, height: 30, top: 0, backgroundColor: "rgba(214,255,63,0.14)" }, pillStyle]}
      />
      <Animated.View style={iconStyle}>
        <Ionicons name={focused ? ICONS[name].active : ICONS[name].inactive} size={NAV.ICON} color={focused ? colors.accent : colors.textDim} />
        {showDot && <UnreadDot />}
        {!!badgeCount && <CountBadge count={badgeCount} />}
      </Animated.View>
      <Animated.Text
        numberOfLines={1}
        className="font-body-bold mt-0.5"
        style={[{ fontSize: 11, color: focused ? colors.accent : colors.textDim }, labelStyle]}
      >
        {LABELS[name]}
      </Animated.Text>
    </Pressable>
  );
}

export function TabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { data: threads = [] } = useChatThreads();
  const unreadChatCount = threads.filter((t) => t.unread).length;
  const { data: pendingRequests = 0 } = useMyPendingRequestsCount();
  const hasPendingRequests = pendingRequests > 0;

  // My Games owns this dot — Profile pointed at pending requests but rendered nothing about
  // them, a dead end for anyone who tapped it (profile-plan.md P0).
  const dotFor = (name: string) => (name === "my-games" ? hasPendingRequests : false);
  const badgeFor = (name: string) => (name === "chat" ? unreadChatCount : undefined);

  const barStyle = useAnimatedStyle(() => ({
    height: NAV.BAR_HEIGHT - navMinimize.value * (NAV.BAR_HEIGHT - NAV.MINI_BAR_HEIGHT),
  }));

  return (
    <View style={{ position: "absolute", left: NAV.BAR_MARGIN, right: NAV.BAR_MARGIN, bottom: tabBarBottom(insets.bottom) }}>
      <Animated.View style={barStyle}>
        <BlurView
          intensity={60}
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
            backgroundColor: "rgba(23,23,26,0.85)",
          }}
        >
          {state.routes.map((route, i) => (
            <TabButton
              key={route.key}
              name={route.name}
              focused={state.index === i}
              showDot={dotFor(route.name)}
              badgeCount={badgeFor(route.name)}
              onPress={() => {
                if (state.index === i) scrollRouteToTop(route.name);
                else navigation.navigate(route.name);
              }}
            />
          ))}
        </BlurView>
      </Animated.View>
    </View>
  );
}
