import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { View, Text, Pressable, FlatList, ScrollView, Dimensions, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { colors, gradients, TIERS } from "../lib/theme";
import { LinearGradient } from "expo-linear-gradient";
import { SPRING, useReduceMotion } from "../lib/motion";
import { haptics } from "../lib/haptics";
import { GameCard } from "./GameCard";
import { MapCarouselCard } from "./MapCarouselCard";
import { Game } from "../lib/mockData";

const SCREEN_HEIGHT = Dimensions.get("window").height;

export type SheetSnap = "peek" | "half" | "full";

// 3 fixed heights (map-plan.md §5.8/P4) — "full" deliberately stops short of the screen so a
// slice of map (and its pins) is always visible; there's no "closed" snap, only these three.
// Measured from the sheet's own bottom edge, which itself sits `bottomSpace` above the real
// screen bottom (clearing the floating tab bar) — see MapSheetProps.bottomSpace.
// The peek height depends on what the peek has to show, because it is the one snap that can't
// scroll its way out of trouble: a carousel card is ~124px, but the empty ladder (heading +
// two-line subtitle + a 48px CTA) is ~190px and clipped its own heading at 168.
export type SheetPeekVariant = "carousel" | "stack";

export function sheetSnapHeights(peekVariant: SheetPeekVariant = "carousel") {
  return {
    // +20 accounts for the tier-color legend line under the title row (Games mode only).
    peek: peekVariant === "stack" ? 236 : 188,
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
  // The sheet's state line. Always rendered, in every mode — it's what anchors the top edge and
  // what guarantees the sheet and the pins agree about how much is here.
  title: string;
  // "Search this area" lives here, not in the screen header: it describes the viewport, and the
  // header describes the query. Null when the map is following the filters.
  areaOverrideLabel?: string | null;
  onClearArea?: () => void;
  onExitMap: () => void;
  // Tier-color legend line under the title row (Games mode only) — pins are colored by skill
  // level with no key on the map itself; this is the always-visible key rather than making the
  // viewer open Filters to learn what each dot means.
  showTierLegend?: boolean;
  peekVariant?: SheetPeekVariant;
  // Identity of whatever `emptyState` currently renders — changing it resets the scroll offset.
  bodyKey?: string;
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
    title,
    areaOverrideLabel = null,
    onClearArea,
    onExitMap,
    showTierLegend = false,
    peekVariant = "carousel",
    bodyKey = "",
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
  const snaps = sheetSnapHeights(peekVariant);
  const [snap, setSnap] = useState<SheetSnap>("peek");
  const height = useSharedValue(snaps.peek);
  const startHeight = useSharedValue(snaps.peek);
  const scrollRef = useRef<ScrollView>(null);
  const reduceMotion = useReduceMotion();
  // Resizing the sheet is motion the viewer didn't ask for; with reduce motion on it lands
  // directly on the snap instead of springing there.
  const settle = (to: number) => (reduceMotion ? to : withSpring(to, SPRING.settle));

  const commitSnap = (next: SheetSnap) => {
    // Same tick the filter chips use — the snap is a discrete state change, not a scroll.
    if (next !== snap) haptics.tick();
    setSnap(next);
    // A snap change re-frames the content; keeping a stale offset is how the empty ladder's
    // heading ended up scrolled off the top edge at peek.
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    // Reported in the same coordinate space as the real screen bottom, since that's what
    // GameMap's mapPadding/fitToCoordinates edgePadding need.
    onSnapChange(next, snaps[next] + bottomSpace);
  };

  // Peek height is variant-dependent, so it can change under a resting sheet (games → courts,
  // results → empty). Only applied at rest: mid-drag it would fight the gesture and jump
  // the map's padding.
  useEffect(() => {
    if (snap !== "peek") return;
    height.value = settle(snaps.peek);
    onSnapChange("peek", snaps.peek + bottomSpace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snaps.peek]);

  // The empty/courts body is a different list each time the mode or the result set changes.
  // Keyed by identity string, not by the `emptyState` element — that's a fresh object every
  // render, which would reset the scroll offset mid-scroll.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [bodyKey]);

  useImperativeHandle(ref, () => ({
    snapTo: (next: SheetSnap) => {
      height.value = settle(snaps[next]);
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
      height.value = reduceMotion ? snaps[nearest] : withSpring(snaps[nearest], SPRING.settle);
      runOnJS(commitSnap)(nearest);
    });

  const sheetStyle = useAnimatedStyle(() => ({ height: height.value }));

  return (
    <Animated.View style={[{ position: "absolute", left: 0, right: 0, bottom: bottomSpace, overflow: "hidden" }, sheetStyle]}>
      <LinearGradient colors={gradients.card} className="flex-1 rounded-t-[24px] border-t border-x" style={{ borderColor: colors.cardBorder }}>
        <GestureDetector gesture={pan}>
          <View
            testID="discover-map-sheet"
            className="items-center pt-2.5 pb-2"
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={`Results sheet, ${title}`}
            accessibilityValue={{ text: snap === "peek" ? "collapsed" : snap === "half" ? "half open" : "expanded" }}
            accessibilityHint="Swipe up or down to resize"
          >
            <View className="w-9 h-1 rounded-pill" style={{ backgroundColor: "rgba(255,255,255,0.2)" }} />
            {/* Unconditional: in the empty and Courts states this row is the only thing anchoring
                the sheet's top edge, and it's where the map's exit lives — a floating pill
                outside the sheet painted over this content at every snap. */}
            <View className="flex-row justify-between items-center w-full px-5 mt-2 gap-3">
              <View className="flex-1 min-w-0">
                <Text testID="discover-sheet-count" numberOfLines={1} className="font-display-bold text-[15px]" style={{ color: colors.text }}>
                  {title}
                </Text>
                {areaOverrideLabel && (
                  <Pressable
                    onPress={onClearArea}
                    hitSlop={6}
                    className="mt-0.5"
                    accessibilityRole="button"
                    accessibilityLabel={areaOverrideLabel}
                  >
                    <Text className="text-[11.5px] font-body-extrabold uppercase" style={{ color: colors.accent, letterSpacing: 0.5 }}>
                      {areaOverrideLabel}
                    </Text>
                  </Pressable>
                )}
              </View>
              <View className="flex-row items-center gap-2">
                <Pressable
                  testID="discover-map-exit"
                  accessibilityRole="button"
                  accessibilityLabel="Back to the list"
                  onPress={onExitMap}
                  className="flex-row items-center gap-1.5 rounded-pill px-3 py-1.5"
                  style={{ backgroundColor: colors.text }}
                >
                  <Ionicons name="list-outline" size={14} color={colors.base} />
                  <Text className="font-body-extrabold text-[12.5px]" style={{ color: colors.base }}>
                    List
                  </Text>
                </Pressable>
                <Ionicons name={snap === "full" ? "chevron-down" : "chevron-up"} size={16} color={colors.textTertiary} />
              </View>
            </View>

            {showTierLegend && (
              <View className="flex-row items-center gap-3 w-full px-5 mt-2">
                {TIERS.map((t) => (
                  <View key={t.id} className="flex-row items-center gap-1">
                    <View className="rounded-full" style={{ width: 7, height: 7, backgroundColor: t.color }} />
                    <Text className="font-body-bold text-[10.5px]" style={{ color: colors.textSecondary }}>
                      {t.id.slice(0, 3)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </GestureDetector>

        {pinnedGames.length === 0 ? (
          // The sheet's outer edge clips (overflow:hidden, animated height) — the empty ladder
          // and the Courts-mode card list (up to a few dozen rows) both need to scroll within
          // whatever snap the sheet is currently at, not spill past it silently.
          <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
            {emptyState}
          </ScrollView>
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
