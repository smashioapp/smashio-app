import { useEffect } from "react";
import { View, Pressable } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
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
import { sound } from "../lib/sound";
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

// Labels are no longer rendered (docs/v2-design-plan.md §5 — the design's bar is icon-only),
// so these exist purely as the accessible name for each tab.
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
      style={[{ top: -2, right: -3, backgroundColor: colors.danger, borderWidth: 1.5, borderColor: colors.base }, style]}
    />
  );
}

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View
      className="absolute items-center justify-center rounded-full px-[3px]"
      style={{ top: -5, right: -9, minWidth: 15, height: 15, backgroundColor: colors.danger, borderWidth: 1.5, borderColor: colors.base }}
    >
      <Animated.Text className="font-body-extrabold" style={{ fontSize: 9, color: colors.base }}>
        {count > 9 ? "9+" : count}
      </Animated.Text>
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

  useEffect(() => {
    if (focused) scale.value = withSequence(withSpring(1.22, SPRING.pop), withSpring(1, SPRING.settle));
  }, [focused]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPress={() => {
        haptics.tick();
        onPress();
      }}
      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={LABELS[name]}
      className="items-center justify-center"
      style={{ width: NAV.ITEM_WIDTH, height: NAV.ITEM_HEIGHT }}
    >
      <Animated.View style={iconStyle}>
        <Ionicons
          name={focused ? ICONS[name].active : ICONS[name].inactive}
          size={NAV.ICON}
          color={focused ? colors.accent : colors.textTertiary}
        />
        {showDot && <UnreadDot />}
        {!!badgeCount && <CountBadge count={badgeCount} />}
      </Animated.View>
    </Pressable>
  );
}

// The centre slot (docs/v2-design-plan.md §5). Hosting used to be a floating pill in BottomRail
// on two screens only; in v2 it's the middle of the bar and reachable from every tab. It is a
// button, not a tab route — nothing in (tabs)/ backs it.
function HostButton() {
  const scale = useSharedValue(1);
  const rotate = useSharedValue(0);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Host a game"
      onPress={() => {
        haptics.tap();
        sound.play("whoosh");
        router.push("/wizard");
      }}
      onPressIn={() => {
        scale.value = withSpring(0.9, SPRING.press);
        rotate.value = withSpring(-12, SPRING.press);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, SPRING.pop);
        rotate.value = withSpring(0, SPRING.pop);
      }}
      hitSlop={8}
    >
      <Animated.View
        className="items-center justify-center"
        style={[
          {
            width: NAV.FAB_SIZE,
            height: NAV.FAB_SIZE,
            borderRadius: NAV.FAB_SIZE / 2,
            backgroundColor: colors.accent,
            borderWidth: 3,
            borderColor: colors.base,
            shadowColor: colors.accent,
            shadowOpacity: 0.35,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 8 },
            elevation: 8,
          },
          pressStyle,
        ]}
      >
        <Ionicons name="add" size={26} color={colors.base} />
      </Animated.View>
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

  // The host button sits between My Games and Chat, so the routes split either side of it.
  const left = state.routes.slice(0, 2);
  const right = state.routes.slice(2);
  const renderTab = (route: { key: string; name: string }) => {
    const i = state.routes.findIndex((r) => r.key === route.key);
    return (
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
    );
  };

  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: NAV.BAR_MARGIN, right: NAV.BAR_MARGIN, bottom: tabBarBottom(insets.bottom) }}
    >
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
            backgroundColor: "rgba(24,24,28,0.82)",
          }}
        >
          {left.map(renderTab)}
          {/* The host button overhangs the bar's top edge, so it can't live inside a
              BlurView that has to clip its own blur — this reserves its slot instead. */}
          <View style={{ width: NAV.FAB_SIZE }} />
          {right.map(renderTab)}
        </BlurView>
      </Animated.View>

      {/* Centred on the bar, then lifted so it overhangs the top edge — same silhouette as the
          design's tab-fab (a 52px circle riding 30px above the row it sits in). */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: (NAV.BAR_HEIGHT - NAV.FAB_SIZE) / 2 + NAV.FAB_RISE,
          alignItems: "center",
        }}
      >
        <HostButton />
      </View>
    </View>
  );
}
