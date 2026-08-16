import { forwardRef, useImperativeHandle, useState } from "react";
import { View, Text, FlatList, Dimensions, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { colors, gradients } from "../lib/theme";
import { LinearGradient } from "expo-linear-gradient";
import { SPRING } from "../lib/motion";
import { GameCard } from "./GameCard";
import { MapCarouselCard } from "./MapCarouselCard";
import { Game } from "../lib/mockData";

const SCREEN_HEIGHT = Dimensions.get("window").height;

export type SheetSnap = "peek" | "half" | "full";

// 3 fixed heights (map-plan.md §5.8/P4) — "full" deliberately stops short of the screen so a
// slice of map (and its pins) is always visible; there's no "closed" snap, only these three.
// Measured from the sheet's own bottom edge, which itself sits `bottomSpace` above the real
// screen bottom (clearing the floating tab bar) — see MapSheetProps.bottomSpace.
export function sheetSnapHeights() {
  return {
    peek: 168,
    half: Math.round(SCREEN_HEIGHT * 0.48),
    full: Math.round(SCREEN_HEIGHT * 0.82),
  };
}

export type MapSheetHandle = {
  snapTo: (snap: SheetSnap) => void;
};

type MapSheetProps = {
  pinnedGames: Game[];
  venueGroups: Game[][];
  bottomSpace: number;
  onCardPress: (id: string) => void;
  onCarouselSettle: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  carouselRef: React.RefObject<FlatList<Game[]> | null>;
  onSnapChange: (snap: SheetSnap, heightPx: number) => void;
  emptyState: React.ReactNode;
  carouselStep: number;
  carouselGap: number;
  cardWidth: number;
};

// Custom sheet, not a library — the app has no bottom-sheet dependency yet and this only
// needs 3 discrete snap points, not arbitrary/free-scroll sheet behaviour. Height (not
// translateY) is animated directly so the drag handle always sits at the visible top edge
// regardless of which snap is active.
export const MapSheet = forwardRef<MapSheetHandle, MapSheetProps>(function MapSheet(
  {
    pinnedGames,
    venueGroups,
    bottomSpace,
    onCardPress,
    onCarouselSettle,
    carouselRef,
    onSnapChange,
    emptyState,
    carouselStep,
    carouselGap,
    cardWidth,
  },
  ref
) {
  const snaps = sheetSnapHeights();
  const [snap, setSnap] = useState<SheetSnap>("peek");
  const height = useSharedValue(snaps.peek);
  const startHeight = useSharedValue(snaps.peek);

  const commitSnap = (next: SheetSnap) => {
    setSnap(next);
    // Reported in the same coordinate space as the real screen bottom, since that's what
    // GameMap's mapPadding/fitToCoordinates edgePadding need.
    onSnapChange(next, snaps[next] + bottomSpace);
  };

  useImperativeHandle(ref, () => ({
    snapTo: (next: SheetSnap) => {
      height.value = withSpring(snaps[next], SPRING.settle);
      commitSnap(next);
    },
  }));

  const pan = Gesture.Pan()
    .onStart(() => {
      startHeight.value = height.value;
    })
    .onUpdate((e) => {
      const next = startHeight.value - e.translationY;
      height.value = Math.min(snaps.full, Math.max(snaps.peek, next));
    })
    .onEnd((e) => {
      const order: SheetSnap[] = ["peek", "half", "full"];
      let nearest = order.reduce((a, b) => (Math.abs(snaps[b] - height.value) < Math.abs(snaps[a] - height.value) ? b : a));
      const idx = order.indexOf(nearest);
      if (e.velocityY < -600 && idx < order.length - 1) nearest = order[idx + 1];
      else if (e.velocityY > 600 && idx > 0) nearest = order[idx - 1];
      height.value = withSpring(snaps[nearest], SPRING.settle);
      runOnJS(commitSnap)(nearest);
    });

  const sheetStyle = useAnimatedStyle(() => ({ height: height.value }));

  return (
    <Animated.View style={[{ position: "absolute", left: 0, right: 0, bottom: bottomSpace, overflow: "hidden" }, sheetStyle]}>
      <LinearGradient colors={gradients.card} className="flex-1 rounded-t-[24px] border-t border-x" style={{ borderColor: colors.cardBorder }}>
        <GestureDetector gesture={pan}>
          <View className="items-center pt-2.5 pb-2">
            <View className="w-9 h-1 rounded-pill" style={{ backgroundColor: "rgba(255,255,255,0.2)" }} />
            {pinnedGames.length > 0 && (
              <View className="flex-row justify-between items-center w-full px-5 mt-2">
                <Text className="font-display-bold text-[15px]" style={{ color: colors.text }}>
                  {pinnedGames.length} game{pinnedGames.length === 1 ? "" : "s"}
                </Text>
                <Ionicons name={snap === "full" ? "chevron-down" : "chevron-up"} size={16} color={colors.textTertiary} />
              </View>
            )}
          </View>
        </GestureDetector>

        {pinnedGames.length === 0 ? (
          <View style={{ paddingTop: 8 }}>{emptyState}</View>
        ) : (
          <>
            <FlatList
              ref={carouselRef}
              data={venueGroups}
              keyExtractor={(grp) => grp[0].id}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={carouselStep}
              decelerationRate="fast"
              contentContainerStyle={{ gap: carouselGap, paddingHorizontal: 20, paddingTop: 10 }}
              onMomentumScrollEnd={onCarouselSettle}
              renderItem={({ item }) => <MapCarouselCard venueGames={item} cardWidth={cardWidth} onSelectGame={onCardPress} />}
            />
            {snap !== "peek" && (
              <FlatList
                style={{ flex: 1 }}
                data={pinnedGames}
                keyExtractor={(g) => g.id}
                contentContainerStyle={{ padding: 20, paddingTop: 14, gap: 12 }}
                renderItem={({ item, index }) => (
                  <GameCard game={item} onPress={() => onCardPress(item.id)} />
                )}
              />
            )}
          </>
        )}
      </LinearGradient>
    </Animated.View>
  );
});
