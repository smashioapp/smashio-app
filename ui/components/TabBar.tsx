import { useEffect, type ReactElement } from "react";
import { View, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Rect, Path, Line } from "react-native-svg";
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
import { useAppStore } from "../lib/store";
import { NAV, tabBarBottom } from "../lib/nav";
import { navMinimize, scrollRouteToTop } from "../lib/navScroll";
import { useChatThreads } from "../lib/queries/messages";
import { useMyPendingRequestsCount } from "../lib/queries/gamePlayers";
import { useSession } from "../lib/session";
import { haptics } from "../lib/haptics";
import { sound } from "../lib/sound";
import { SPRING } from "../lib/motion";

type TabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
};

// Custom glyphs (SMASHIO v3 design, claude.ai/design 23bc2cae…, "Discover" doc's tabbar) —
// hand-drawn shapes matching the mock's .ti/.circ/.feed/.cal/.prof CSS, redrawn as SVG since
// RN has no border-pseudo-element trick. Person glyph is a rounded arc, not the mock's boxy one.
function DiscoverGlyph({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 26 26">
      <Circle cx={13} cy={13} r={11} stroke={color} strokeWidth={2.2} fill="none" />
      <Circle cx={13} cy={13} r={5.5} fill={color} />
    </Svg>
  );
}
function FeedGlyph({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 26 26">
      <Rect x={0} y={5} width={26} height={2.4} rx={1.2} fill={color} />
      <Rect x={0} y={12} width={18} height={2.4} rx={1.2} fill={color} />
      <Rect x={0} y={19} width={22} height={2.4} rx={1.2} fill={color} />
    </Svg>
  );
}
function MyGamesGlyph({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 26 26">
      <Rect x={2} y={5} width={22} height={19} rx={6} stroke={color} strokeWidth={2.2} fill="none" />
      <Line x1={8} y1={1.5} x2={8} y2={8.5} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      <Line x1={18} y1={1.5} x2={18} y2={8.5} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}
function ProfileGlyph({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 26 26">
      <Circle cx={13} cy={8} r={4.5} stroke={color} strokeWidth={2.2} fill="none" />
      <Path
        d="M4 24 C4 17.5 8.2 14 13 14 C17.8 14 22 17.5 22 24"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

const GLYPHS: Record<string, (props: { color: string; size: number }) => ReactElement> = {
  discover: DiscoverGlyph,
  "my-games": MyGamesGlyph,
  feed: FeedGlyph,
  profile: ProfileGlyph,
};

// Labels are no longer rendered (docs/v2-design-plan.md §5 — the design's bar is icon-only),
// so these exist purely as the accessible name for each tab.
const LABELS: Record<string, string> = {
  discover: "Discover",
  "my-games": "My Games",
  feed: "Feed",
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
  const Glyph = GLYPHS[name];

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
      testID={`tab-${name}`}
      className="items-center justify-center"
      style={{ width: NAV.ITEM_WIDTH, height: NAV.ITEM_HEIGHT }}
    >
      <Animated.View style={iconStyle}>
        <Glyph color={focused ? colors.accent : colors.textTertiary} size={NAV.ICON} />
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
  const { session } = useSession();
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
        // G5 (gtm-plan.md §3.2): host is walled for a session-less viewer, same as join.
        if (!session) {
          router.push("/onboarding");
          return;
        }
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
        {/* Ionicons' "add" glyph sits off-centre in its own box on RN Web (font metrics, not
            layout) — two bars positioned by hand match the design's .fab::before/::after
            exactly and centre correctly on every platform. */}
        <View style={{ position: "absolute", left: "50%", top: "50%", width: 20, height: 3.4, marginLeft: -10, marginTop: -1.7, borderRadius: 2, backgroundColor: colors.base }} />
        <View style={{ position: "absolute", left: "50%", top: "50%", width: 3.4, height: 20, marginLeft: -1.7, marginTop: -10, borderRadius: 2, backgroundColor: colors.base }} />
      </Animated.View>
    </Pressable>
  );
}

export function TabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  // Discover map already carries its own primary CTA in the sheet (discover-map-ux-plan.md
  // D4) — showing the global host FAB on top of it is two competing primary actions.
  const discoverView = useAppStore((s) => s.discoverView);
  const { session } = useSession();
  const { data: threads = [] } = useChatThreads({ enabled: !!session });
  const unreadChatCount = threads.filter((t) => t.unread).length;
  const { data: pendingRequests = 0 } = useMyPendingRequestsCount({ enabled: !!session });
  const hasPendingRequests = pendingRequests > 0;

  // My Games owns this dot — Profile pointed at pending requests but rendered nothing about
  // them, a dead end for anyone who tapped it (profile-plan.md P0).
  const dotFor = (name: string) => (name === "my-games" ? hasPendingRequests : false);
  // Chat's own tab badge moved here on the merge (social-plan.md N1) — a per-row badge on each
  // My Games thread plus this tab-level rollup, since Chat no longer has a tab of its own.
  const badgeFor = (name: string) => (name === "my-games" ? unreadChatCount : undefined);

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
          // G5: My Games/Chat/Profile all need a session (they're a viewer's own data) — wall
          // to onboarding instead of navigating into a tab that would just error on its queries.
          if (!session && route.name !== "discover") {
            router.push("/onboarding");
            return;
          }
          if (state.index === i) scrollRouteToTop(route.name);
          else navigation.navigate(route.name);
        }}
      />
    );
  };

  // v3 design (claude.ai/design 23bc2cae…, .tabbar rule): no floating blur pill — the bar is
  // just icons sitting directly on a bottom-anchored dark gradient scrim, edge to edge.
  const scrimHeight = NAV.BAR_HEIGHT + tabBarBottom(insets.bottom) + NAV.FAB_RISE + 12;

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(8,8,10,0)", "rgba(8,8,10,0.55)", "rgba(8,8,10,0.92)", "rgba(8,8,10,0.99)"]}
        locations={[0, 0.22, 0.48, 1]}
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: scrimHeight }}
      />

      <Animated.View
        style={[
          barStyle,
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-around",
            paddingHorizontal: 24,
            paddingBottom: tabBarBottom(insets.bottom),
          },
        ]}
      >
        {left.map(renderTab)}
        {/* Reserves the FAB's slot in the row so its overhang above doesn't overlap a tab. */}
        <View style={{ width: NAV.FAB_SIZE }} />
        {right.map(renderTab)}
      </Animated.View>

      {/* Centred on the bar, then lifted so it overhangs the top edge — same silhouette as the
          design's tab-fab (a 52px circle riding 30px above the row it sits in). */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: tabBarBottom(insets.bottom) + (NAV.BAR_HEIGHT - NAV.FAB_SIZE) / 2 + NAV.FAB_RISE,
          alignItems: "center",
        }}
      >
        {discoverView !== "map" && <HostButton />}
      </View>
    </View>
  );
}
