import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, TextInput, Dimensions, FlatList, BackHandler, Alert, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { useAppStore, WhenFilter, SortOption, DISCOVER_RADIUS_OPTIONS_KM, DEFAULT_DISCOVER_RADIUS_KM, PRICE_CAP_OPTIONS_CENTS } from "../../lib/store";
import { colors, LAYOUT, TIERS } from "../../lib/theme";
import { NAV, tabBarBottom, useTabBarSpace } from "../../lib/nav";
import { useReduceMotion } from "../../lib/motion";
import { makeScrollHideHandler, registerScrollToTop, unregisterScrollToTop } from "../../lib/navScroll";
import { useDiscoverGames, useMyPastGames, useMyJoinedGames, useMyHostingGames } from "../../lib/queries/games";
import { useDistanceUnits } from "../../lib/queries/settings";
import { useVenuesForMap } from "../../lib/queries/venues";
import { useCreateAlert } from "../../lib/queries/alerts";
import { useUnreadNotificationCount } from "../../lib/queries/notifications";
import { useProfileSports } from "../../lib/queries/profile";
import { useSession } from "../../lib/session";
import { useUserLocation, useLocationLabel } from "../../lib/location";
import { dayLabel, haversineMeters, formatDistance } from "../../lib/format";
import { newSessionToken, searchPlaces, getPlaceDetails, type PlacePrediction } from "../../lib/places";
import { haptics } from "../../lib/haptics";
import { Screen } from "../../components/Screen";
import { Chip } from "../../components/Chip";
import { GameCard } from "../../components/GameCard";
import { EmptyState } from "../../components/EmptyState";
import { GameMap, GameMapHandle, venueKeyOf, venueKeyOfCoords, visibleCourtsFor, NoGameVenue, CourtZoom } from "../../components/GameMap";
import { MapSheet, MapSheetHandle, sheetSnapHeights } from "../../components/MapSheet";
import { MapCourtCard } from "../../components/MapCourtCard";
import { RefreshableList } from "../../components/RefreshableList";
import { GameCardSkeletonList } from "../../components/Skeleton";
import { Sheet } from "../../components/Sheet";
import { Rail } from "../../components/RailCard";
import { DayHeader } from "../../components/DayHeader";
import { SegmentedToggle } from "../../components/SegmentedToggle";
import { Game, spotsLeft, levelFit } from "../../lib/mockData";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CAROUSEL_GAP = 12;
const CAROUSEL_CARD_WIDTH = SCREEN_WIDTH - 88;
const CAROUSEL_STEP = CAROUSEL_CARD_WIDTH + CAROUSEL_GAP;

type DiscoverRow =
  | { kind: "rail"; id: string; title: string; games: Game[] }
  | { kind: "day"; id: string; label: string }
  | { kind: "game"; id: string; game: Game; index: number };

function buildDiscoverRows(games: Game[], rails: { title: string; games: Game[] }[]): DiscoverRow[] {
  const rows: DiscoverRow[] = [];
  rails.forEach((r, i) => {
    if (r.games.length > 0) rows.push({ kind: "rail", id: `rail-${i}`, title: r.title, games: r.games });
  });
  let lastLabel: string | null = null;
  games.forEach((g, index) => {
    const label = dayLabel(g.startsAt);
    if (label !== lastLabel) {
      rows.push({ kind: "day", id: `day-${label}-${index}`, label });
      lastLabel = label;
    }
    rows.push({ kind: "game", id: g.id, game: g, index });
  });
  return rows;
}

const WHEN_FILTERS: { key: WhenFilter; label: string }[] = [
  { key: "tonight", label: "Tonight" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "week", label: "This week" },
  { key: "all", label: "Any time" },
];

const LEVEL_FILTERS = TIERS.map((t) => ({ slug: t.id.toLowerCase(), label: t.id }));

const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: "soonest", label: "Soonest" },
  { key: "closest", label: "Closest" },
  { key: "cheapest", label: "Cheapest" },
  { key: "most_spots", label: "Most spots" },
];

function priceCapLabel(cents: number): string {
  return `Under $${cents / 100}`;
}

function FiltersSheet({
  visible,
  onClose,
  markLevelTouched,
}: {
  visible: boolean;
  onClose: () => void;
  markLevelTouched: () => void;
}) {
  const {
    whenFilter,
    setWhenFilter,
    levelFilters,
    toggleLevelFilter,
    setLevelFilters,
    sortBy,
    setSortBy,
    discoverRadiusKm,
    setDiscoverRadiusKm,
    hasSpotsOnly,
    setHasSpotsOnly,
    verifiedOnly,
    setVerifiedOnly,
    maxCostPerPlayerCents,
    setMaxCostPerPlayerCents,
    clearDiscoverFilters,
  } = useAppStore();

  return (
    <Sheet visible={visible} onClose={onClose} title="Filters & sort">
      <View className="gap-4 mt-1">
        <View className="gap-2">
          <Text className="text-[12.5px] font-body-bold" style={{ color: colors.textTertiary }}>
            WHEN
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {WHEN_FILTERS.map((f) => (
              <Chip key={f.key} label={f.label} active={whenFilter === f.key} onPress={() => setWhenFilter(f.key)} size="sm" />
            ))}
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-[12.5px] font-body-bold" style={{ color: colors.textTertiary }}>
            LEVEL
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <Chip
              label="Any level"
              active={levelFilters.length === 0}
              onPress={() => {
                markLevelTouched();
                setLevelFilters([]);
              }}
              size="sm"
            />
            {LEVEL_FILTERS.map((l) => (
              <Chip
                key={l.slug}
                label={l.label}
                active={levelFilters.includes(l.slug)}
                onPress={() => {
                  markLevelTouched();
                  toggleLevelFilter(l.slug);
                }}
                size="sm"
              />
            ))}
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-[12.5px] font-body-bold" style={{ color: colors.textTertiary }}>
            SORT BY
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {SORT_OPTIONS.map((s) => (
              <Chip key={s.key} label={s.label} active={sortBy === s.key} onPress={() => setSortBy(s.key)} size="sm" />
            ))}
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-[12.5px] font-body-bold" style={{ color: colors.textTertiary }}>
            DISTANCE
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {DISCOVER_RADIUS_OPTIONS_KM.map((km) => (
              <Chip key={km} label={`${km} km`} active={discoverRadiusKm === km} onPress={() => setDiscoverRadiusKm(km)} size="sm" />
            ))}
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-[12.5px] font-body-bold" style={{ color: colors.textTertiary }}>
            PRICE PER PLAYER
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <Chip label="Any price" active={maxCostPerPlayerCents == null} onPress={() => setMaxCostPerPlayerCents(null)} size="sm" />
            {PRICE_CAP_OPTIONS_CENTS.map((cents) => (
              <Chip
                key={cents}
                label={priceCapLabel(cents)}
                active={maxCostPerPlayerCents === cents}
                onPress={() => setMaxCostPerPlayerCents(cents)}
                size="sm"
              />
            ))}
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-[12.5px] font-body-bold" style={{ color: colors.textTertiary }}>
            SHOW ONLY
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <Chip label="Has spots open" active={hasSpotsOnly} onPress={() => setHasSpotsOnly(!hasSpotsOnly)} size="sm" />
            <Chip label="Verified" active={verifiedOnly} onPress={() => setVerifiedOnly(!verifiedOnly)} size="sm" />
          </View>
        </View>

        <Pressable
          onPress={() => {
            onClose();
            router.push("/venues");
          }}
          className="flex-row items-center gap-2 py-1"
        >
          <Ionicons name="business-outline" size={15} color={colors.textTertiary} />
          <Text className="font-body-bold text-[13px]" style={{ color: colors.textTertiary }}>
            Browse venues
          </Text>
        </Pressable>

        <View className="flex-row gap-2.5 mt-1">
          <Pressable
            onPress={() => {
              markLevelTouched();
              clearDiscoverFilters();
            }}
            className="flex-1 rounded-pill py-3 items-center border"
            style={{ borderColor: colors.cardBorder }}
          >
            <Text className="font-body-bold text-[14px]" style={{ color: colors.textSecondary }}>
              Reset all
            </Text>
          </Pressable>
          <Pressable onPress={onClose} className="flex-1 rounded-pill py-3 items-center" style={{ backgroundColor: colors.accent }}>
            <Text className="font-body-extrabold text-[14px]" style={{ color: colors.base }}>
              Done
            </Text>
          </Pressable>
        </View>
      </View>
    </Sheet>
  );
}

// D5 fallback ladder — a thin-results screen is a dead end everywhere else in the app; here it's
// a ladder of labelled, honest next steps (Resy/GoodRec pattern), each computed from a relaxed
// query so counts are never fabricated. "Host it" is always the last rung.
type AlertState = "idle" | "saving" | "saved";

// The retention primitive (D5): turns a failed search into a scheduled return visit by watching
// the current level + radius and pushing when a matching game is posted. Deliberately its own
// row style (bell, no count) — it isn't a ladder rung since it has nothing to count yet.
function AlertMeRow({ state, onPress }: { state: AlertState; onPress: () => void }) {
  if (state === "saved") {
    return (
      <View
        className="flex-row items-center justify-center gap-2 rounded-xl px-4 py-3.5 border"
        style={{ borderColor: "rgba(53,214,166,0.3)", backgroundColor: "rgba(53,214,166,0.08)" }}
      >
        <Ionicons name="checkmark-circle" size={16} color={colors.intermediate} />
        <Text className="font-body-bold text-[14px]" style={{ color: colors.intermediate }}>
          Alert set — we'll ping you
        </Text>
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      disabled={state === "saving"}
      className="flex-row items-center justify-center gap-2 rounded-xl px-4 py-3.5 border"
      style={{ borderColor: colors.cardBorder, backgroundColor: colors.surfaceAlt, opacity: state === "saving" ? 0.6 : 1 }}
    >
      <Ionicons name="notifications-outline" size={16} color={colors.textSecondary} />
      <Text className="font-body-bold text-[14px]" style={{ color: colors.textSecondary }}>
        {state === "saving" ? "Saving…" : "Alert me when a game matches"}
      </Text>
    </Pressable>
  );
}

function FallbackLadder({
  rungs,
  onHost,
  alertState,
  onAlert,
}: {
  rungs: { key: string; label: string; onPress: () => void }[];
  onHost: () => void;
  alertState: AlertState;
  onAlert: () => void;
}) {
  return (
    <View className="items-center gap-3 pt-8 px-6">
      <Ionicons name="search-outline" size={38} color={colors.textTertiary} />
      <Text className="font-display-bold text-[19px] text-center" style={{ color: colors.text }}>
        Nothing matches right now
      </Text>
      <Text className="text-[14.5px] text-center max-w-[260px] leading-5" style={{ color: colors.textSecondary }}>
        Try one of these instead.
      </Text>
      <View className="w-full gap-2 mt-2">
        {rungs.map((r) => (
          <Pressable
            key={r.key}
            onPress={r.onPress}
            className="flex-row items-center justify-between rounded-xl px-4 py-3.5 border"
            style={{ backgroundColor: colors.surfaceAlt, borderColor: colors.cardBorder }}
          >
            <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
              {r.label}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Pressable>
        ))}
        <AlertMeRow state={alertState} onPress={onAlert} />
        <Pressable
          onPress={onHost}
          className="flex-row items-center justify-between rounded-xl px-4 py-3.5"
          style={{ backgroundColor: colors.accent }}
        >
          <Text className="font-body-extrabold text-[14px]" style={{ color: colors.base }}>
            Host your own game
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.base} />
        </Pressable>
      </View>
    </View>
  );
}

function NotificationBell() {
  const { data: unreadCount } = useUnreadNotificationCount();
  const [permissionDenied, setPermissionDenied] = useState(false);

  useFocusEffect(
    useCallback(() => {
      Notifications.getPermissionsAsync().then((r) => setPermissionDenied(r.status !== Notifications.PermissionStatus.GRANTED));
    }, [])
  );

  return (
    <Pressable
      onPress={() => router.push("/notifications")}
      className="w-[38px] h-[38px] rounded-full items-center justify-center border"
      style={{ backgroundColor: "#17171A", borderColor: "rgba(255,255,255,0.08)" }}
    >
      <Ionicons
        name={permissionDenied ? "notifications-off-outline" : "notifications-outline"}
        size={16}
        color={permissionDenied ? colors.textTertiary : colors.textSecondary}
      />
      {!!unreadCount && (
        <View
          className="absolute rounded-full"
          style={{ width: 8, height: 8, top: 7, right: 8, backgroundColor: colors.danger, borderWidth: 1.5, borderColor: "#17171A" }}
        />
      )}
    </Pressable>
  );
}

// Filters button (badged with the active-filter count) + up to 2 active filters as removable
// chips — matches the Discover redesign mock (claude.ai/design 23bc2cae…, "Filters" sheet
// pattern). Badminton has no chip here anymore: the app is badminton-only, nothing to select.
// The map is entered from here, not from a floating pill: the list is the primary surface, and a
// pinned row has no content to overlap (the pill was positioned off tab-bar clearance, so it
// painted over the map sheet's peek content at every snap). Exit lives inside the sheet.
function FilterChipsRow({
  activeCount,
  chips,
  onPressFilters,
  onPressMap,
}: {
  activeCount: number;
  chips: { key: string; label: string; onClear: () => void }[];
  onPressFilters: () => void;
  onPressMap: () => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ gap: 8, paddingHorizontal: LAYOUT.SCREEN_PAD, paddingBottom: 12, alignItems: "center" }}
    >
      <Pressable
        testID="discover-map-open"
        accessibilityRole="button"
        accessibilityLabel="Show these games on a map"
        onPress={onPressMap}
        className="flex-row items-center gap-1.5 rounded-pill pl-3 pr-3.5 py-2 border"
        style={{ backgroundColor: colors.surfaceAlt, borderColor: colors.cardBorder }}
      >
        <Ionicons name="map-outline" size={14} color={colors.text} />
        <Text className="font-body-bold text-[12.5px]" style={{ color: colors.text }}>
          Map
        </Text>
      </Pressable>
      <Pressable
        onPress={onPressFilters}
        className="flex-row items-center gap-1.5 rounded-pill pl-3 pr-3.5 py-2 border"
        style={{ backgroundColor: colors.surfaceAlt, borderColor: colors.cardBorder }}
      >
        <Ionicons name="options-outline" size={14} color={colors.text} />
        <Text className="font-body-bold text-[12.5px]" style={{ color: colors.text }}>
          Filters
        </Text>
        {activeCount > 0 && (
          <View className="rounded-full items-center justify-center" style={{ width: 17, height: 17, backgroundColor: colors.accent }}>
            <Text className="font-body-extrabold" style={{ fontSize: 10.5, color: colors.base }}>
              {activeCount}
            </Text>
          </View>
        )}
      </Pressable>
      {chips.slice(0, 2).map((c) => (
        <Pressable
          key={c.key}
          onPress={c.onClear}
          className="flex-row items-center gap-1.5 rounded-pill px-3 py-2"
          style={{ backgroundColor: colors.accent }}
        >
          <Text className="font-body-bold text-[12.5px]" style={{ color: colors.base }}>
            {c.label}
          </Text>
          <Ionicons name="close" size={13} color={colors.base} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

export default function Discover() {
  const {
    whenFilter,
    setWhenFilter,
    levelFilters,
    toggleLevelFilter,
    setLevelFilters,
    clearDiscoverFilters,
    discoverView,
    setDiscoverView,
    discoverRadiusKm,
    setDiscoverRadiusKm,
    hasSpotsOnly,
    setHasSpotsOnly,
    verifiedOnly,
    setVerifiedOnly,
    maxCostPerPlayerCents,
    setMaxCostPerPlayerCents,
    sortBy,
    setSortBy,
  } = useAppStore();
  const { session } = useSession();
  const userLocation = useUserLocation();
  const locationLabel = useLocationLabel(userLocation);
  const distanceUnits = useDistanceUnits();
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [headerCompact, setHeaderCompact] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const tabBarSpace = useTabBarSpace();
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<GameMapHandle>(null);
  const mapSheetRef = useRef<MapSheetHandle>(null);
  const listRef = useRef<FlatList<any>>(null);
  const scrollHide = useRef(makeScrollHideHandler()).current;
  const carouselRef = useRef<FlatList<Game[]>>(null);
  const carouselScrollIsProgrammatic = useRef(false);

  // "Search this area" (map-plan.md §P3) frames a viewport the user panned to, independent of
  // the device-location + radius filter that drives the list. Null = map follows the filters
  // like everything else.
  const [mapAreaOverride, setMapAreaOverride] = useState<{ lat: number; lng: number; radiusKm: number } | null>(null);
  // Client-side name/suburb filter over the pins already fetched (docs/v2-design-plan.md §4.2),
  // plus geocoded search (P3, discover-map-ux-plan.md backlog B8) — typing narrows the pins
  // already on screen instantly, and Places predictions let the viewer jump the map to a place
  // that isn't in the current viewport at all.
  const [mapSearch, setMapSearch] = useState("");
  const [mapSearchPredictions, setMapSearchPredictions] = useState<PlacePrediction[]>([]);
  const [mapSearchResolving, setMapSearchResolving] = useState(false);
  const mapSearchSelectedRef = useRef(false);
  const mapSearchTokenRef = useRef(newSessionToken());
  // Games | Courts mode (P2, discover-map-ux-plan.md §4.1) — auto-selected by liquidity
  // (games if any are in radius, courts otherwise) until the viewer touches the control
  // themselves, same "personalise until touched" pattern as the level filter above.
  const [mapMode, setMapMode] = useState<"games" | "courts">("games");
  const mapModeTouched = useRef(false);
  // Zoom bucket reported by the map (§4.3's progressive court disclosure). It lives here, not in
  // GameMap, so the court array the pins render and the array the sheet counts are the same one.
  const [mapZoom, setMapZoom] = useState<CourtZoom>("wide");
  // Clears geometry above the floating tab bar (lib/nav.ts) — the sheet must never sit under
  // the centre host FAB the bar itself renders.
  const mapSheetBottomSpace = tabBarBottom(insets.bottom) + NAV.BAR_HEIGHT + NAV.RAIL_GAP;
  const [sheetHeight, setSheetHeight] = useState(() => sheetSnapHeights().peek + mapSheetBottomSpace);

  useEffect(() => {
    registerScrollToTop("discover", () => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
    return () => unregisterScrollToTop("discover");
  }, []);

  // Map is zustand state, not a route (nav-plan defect #13) — hardware back must close it
  // instead of leaving the tab, and it must never persist after the tab loses focus.
  useEffect(() => {
    if (discoverView !== "map") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setDiscoverView("list");
      return true;
    });
    return () => sub.remove();
  }, [discoverView]);

  // A "search this area" override (and the map's own name/suburb search box) are temporary
  // exploration of the map, not a filter change — closing the map (either control) drops both
  // so reopening starts back at the real filters.
  useEffect(() => {
    if (discoverView !== "map") {
      setMapAreaOverride(null);
      setMapSearch("");
      setMapSearchPredictions([]);
      // Un-touch the mode too, so the next time the map opens it re-picks by liquidity
      // instead of sticking on whatever the viewer last chose in a different area.
      mapModeTouched.current = false;
      setMapMode("games");
    }
  }, [discoverView]);

  useFocusEffect(
    useCallback(() => {
      return () => setDiscoverView("list");
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const { data: profileSports } = useProfileSports(session?.user.id);
  const viewerTier = profileSports?.[0]?.skill_tiers as { slug: string; ordinal: number } | null;

  // Personalise the default view once the viewer's tier is known — but only until they touch
  // the level filter themselves, otherwise every screen focus would stomp their choice back to
  // "just my tier".
  const levelTouched = useRef(false);
  const markLevelTouched = useCallback(() => {
    levelTouched.current = true;
  }, []);
  useEffect(() => {
    if (!levelTouched.current && viewerTier?.slug && levelFilters.length === 0) {
      toggleLevelFilter(viewerTier.slug);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerTier?.slug]);

  const discoverQuery = useDiscoverGames(
    { tierSlugs: levelFilters, when: whenFilter, radiusKm: discoverRadiusKm, hasSpotsOnly, verifiedOnly, maxCostPerPlayerCents, sortBy },
    userLocation,
    { units: distanceUnits }
  );
  const games = discoverQuery.data ?? [];

  // Same queryKey as discoverQuery when there's no area override, so react-query dedupes them
  // into one fetch — a "search this area" pan only costs an extra request once it actually
  // diverges from the filter-driven center, and never mutates what the list tab shows.
  const mapCenter = mapAreaOverride ? { lat: mapAreaOverride.lat, lng: mapAreaOverride.lng } : userLocation;
  const mapRadiusKm = mapAreaOverride ? mapAreaOverride.radiusKm : discoverRadiusKm;
  const mapQuery = useDiscoverGames(
    { tierSlugs: levelFilters, when: whenFilter, radiusKm: mapRadiusKm, hasSpotsOnly, verifiedOnly, maxCostPerPlayerCents, sortBy },
    mapCenter,
    { enabled: discoverView === "map", units: distanceUnits }
  );
  const mapPinnedGamesAll = (mapQuery.data ?? []).filter((g) => g.venueLat != null && g.venueLng != null);

  const handleSetMapMode = (m: "games" | "courts") => {
    mapModeTouched.current = true;
    setMapMode(m);
  };

  // Client-side name/suburb filter over the pins already fetched. Narrows what's shown while
  // the viewer types; a Places prediction picked below jumps the map instead of filtering it.
  const mapPinnedGames = useMemo(() => {
    const q = mapSearch.trim().toLowerCase();
    if (!q) return mapPinnedGamesAll;
    return mapPinnedGamesAll.filter((g) => g.venue.toLowerCase().includes(q) || g.suburb.toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapPinnedGamesAll, mapSearch]);

  // Geocoded search (P3, discover-map-ux-plan.md backlog B8) — debounced Places autocomplete
  // alongside the instant local filter above, so "Newtown" both narrows currently-loaded pins
  // and offers to jump the map there even if nothing near the current viewport matches.
  useEffect(() => {
    if (mapSearchSelectedRef.current) {
      mapSearchSelectedRef.current = false;
      return;
    }
    const handle = setTimeout(async () => {
      if (mapSearch.trim().length < 3) {
        setMapSearchPredictions([]);
        return;
      }
      try {
        const results = await searchPlaces(mapSearch, mapSearchTokenRef.current);
        setMapSearchPredictions(results);
      } catch {
        // Search errors surface as no predictions — the local filter above still works.
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [mapSearch]);

  const handlePickMapSearchPrediction = async (prediction: PlacePrediction) => {
    haptics.tap();
    setMapSearchResolving(true);
    try {
      const details = await getPlaceDetails(prediction.placeId, mapSearchTokenRef.current);
      mapSearchSelectedRef.current = true;
      setMapSearch(details.name);
      setMapSearchPredictions([]);
      setMapAreaOverride({ lat: details.lat, lng: details.lng, radiusKm: mapRadiusKm });
      mapRef.current?.focusOn(details.lat, details.lng);
      mapSearchTokenRef.current = newSessionToken();
    } catch (e) {
      Alert.alert("Couldn't find that place", e instanceof Error ? e.message : "Try again.");
    } finally {
      setMapSearchResolving(false);
    }
  };

  // D7 (discover-map-ux-plan.md) — the viewer's own upcoming games, excluded from mapPinnedGames
  // by nearby_games' p_exclude_mine but still worth showing on the map they're looking at.
  // Exempt from when/level ("yours" isn't a search result), but NOT from geography: the map
  // claims to show one area, so a "You" pin from 40km away is the map lying — and it's what made
  // two "You · $8" pins sit next to a sheet saying "No games here yet". Client-side, no RPC.
  const myJoinedQuery = useMyJoinedGames();
  const myHostingQuery = useMyHostingGames();
  const ownMapGames = useMemo(() => {
    if (discoverView !== "map") return [];
    return [...(myJoinedQuery.data ?? []), ...(myHostingQuery.data ?? [])].filter(
      (g) =>
        g.status !== "cancelled" &&
        g.venueLat != null &&
        g.venueLng != null &&
        haversineMeters(mapCenter.lat, mapCenter.lng, g.venueLat, g.venueLng) <= mapRadiusKm * 1000
    );
  }, [discoverView, myJoinedQuery.data, myHostingQuery.data, mapCenter.lat, mapCenter.lng, mapRadiusKm]);

  // Venue-anchored carousel groups (§4.2) — one card per venue, court rows for each game there.
  const mapVenueGroups = useMemo(() => {
    const map = new Map<string, Game[]>();
    for (const g of mapPinnedGames) {
      const key = venueKeyOf(g);
      const list = map.get(key);
      if (list) list.push(g);
      else map.set(key, [g]);
    }
    return Array.from(map.values());
  }, [mapPinnedGames]);

  // A filter change, a mode switch or a "search this area" replaces the carousel's data, but the
  // FlatList keeps its scroll offset — leaving it parked past the end of a now-shorter set, with
  // the selected pin pointing at a game that isn't in it any more.
  const venueGroupsKey = mapVenueGroups.map((grp) => grp[0].id).join(",");
  useEffect(() => {
    carouselScrollIsProgrammatic.current = true;
    carouselRef.current?.scrollToOffset({ offset: 0, animated: false });
    // Cleared, not re-pointed at index 0: highlighting a pin the viewer never tapped is the map
    // making a choice for them.
    setSelectedGameId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueGroupsKey]);

  // Dim "no games here yet" pins (map-plan.md §5.10) — venues near the map viewport that have
  // none of the games already fetched above. Diffed against the unfiltered pin set so the
  // map search box never mislabels a real game venue as empty. Diffed client-side since venues
  // aren't sport-scoped and games don't carry a stable venue id (venueKeyOf's name+coordinate
  // key is what nearby_games already uses for venue identity — see its comment in GameMap.tsx).
  const venuesNearQuery = useVenuesForMap(mapCenter, mapRadiusKm, { enabled: discoverView === "map" });
  const noGameVenues = useMemo(() => {
    const gameVenueKeys = new Set(mapPinnedGamesAll.map(venueKeyOf));
    return (venuesNearQuery.data ?? [])
      .filter((v) => v.lat != null && v.lng != null && !gameVenueKeys.has(venueKeyOfCoords(v.name, v.lat, v.lng)))
      .map((v) => ({
        id: v.id,
        name: v.name,
        lat: v.lat,
        lng: v.lng,
        hasProfile: v.has_profile,
        bookability: v.bookability,
        dedicated: v.dedicated,
        courtsBadminton: v.courts_badminton,
        openingHours: v.opening_hours as Record<string, [string, string][]> | null,
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venuesNearQuery.data, mapQuery.data]);

  // Directory venues (has_profile) open the facility screen; club_only/members_only never gets
  // the "host a game here" funnel (§4.2's bookability guard), same as unknown/no-profile venues
  // still fall back to it since we simply don't know yet whether they're bookable.
  const handleSelectNoGameVenue = (venue: NoGameVenue) => {
    haptics.tap();
    if (venue.hasProfile) {
      router.push(`/venue/${venue.id}`);
      return;
    }
    const full = venuesNearQuery.data?.find((v) => v.id === venue.id);
    useAppStore.getState().setHostHereSeed({
      venueId: venue.id,
      venueName: venue.name,
      venueSuburb: full?.suburb ?? "",
      venueAddress: full?.address ?? `${full?.suburb ?? ""}, ${full?.state ?? ""}`,
    });
    router.push("/wizard");
  };

  const showInitialLoading = discoverQuery.isLoading;
  const showError = discoverQuery.isError && !showInitialLoading;
  const advancedFilterCount = [
    discoverRadiusKm !== DEFAULT_DISCOVER_RADIUS_KM,
    hasSpotsOnly,
    verifiedOnly,
    maxCostPerPlayerCents != null,
    sortBy !== "soonest",
  ].filter(Boolean).length;
  const isFiltered = levelFilters.length > 0 || whenFilter !== "all" || advancedFilterCount > 0;

  // Ordered so the two most-recognisable filters (when/level) surface first as removable chips
  // in the header row — matches the Discover redesign mock's "top 2 active filters" pattern.
  const activeFilterChips = [
    whenFilter !== "all"
      ? { key: "when", label: WHEN_FILTERS.find((w) => w.key === whenFilter)?.label ?? "When", onClear: () => setWhenFilter("all") }
      : null,
    levelFilters.length > 0
      ? {
          key: "level",
          label: levelFilters.length === 1 ? LEVEL_FILTERS.find((l) => l.slug === levelFilters[0])?.label ?? "Level" : `${levelFilters.length} levels`,
          onClear: () => {
            levelTouched.current = true;
            setLevelFilters([]);
          },
        }
      : null,
    discoverRadiusKm !== DEFAULT_DISCOVER_RADIUS_KM
      ? { key: "radius", label: `${discoverRadiusKm}km`, onClear: () => setDiscoverRadiusKm(DEFAULT_DISCOVER_RADIUS_KM) }
      : null,
    sortBy !== "soonest" ? { key: "sort", label: SORT_OPTIONS.find((s) => s.key === sortBy)?.label ?? "Sort", onClear: () => setSortBy("soonest") } : null,
    maxCostPerPlayerCents != null
      ? { key: "price", label: priceCapLabel(maxCostPerPlayerCents), onClear: () => setMaxCostPerPlayerCents(null) }
      : null,
    hasSpotsOnly ? { key: "spots", label: "Has spots", onClear: () => setHasSpotsOnly(false) } : null,
    verifiedOnly ? { key: "verified", label: "Verified", onClear: () => setVerifiedOnly(false) } : null,
  ].filter((c): c is { key: string; label: string; onClear: () => void } => c !== null);

  // Fallback ladder (D5): only fires a second query once we know the primary one came back
  // empty under active filters — a relaxed pool (any level, any time, max radius) we diff
  // against the current filters to build honest, counted "try this instead" rungs.
  const fallbackEnabled = !showInitialLoading && !showError && games.length === 0 && isFiltered;
  const fallbackQuery = useDiscoverGames(
    { tierSlugs: [], when: "all", radiusKm: DEFAULT_DISCOVER_RADIUS_KM, hasSpotsOnly, verifiedOnly, maxCostPerPlayerCents, sortBy: "soonest" },
    userLocation,
    { enabled: fallbackEnabled, units: distanceUnits }
  );
  const ladderRungs = useMemo(() => {
    if (!fallbackEnabled || !fallbackQuery.data) return [];
    const pool = fallbackQuery.data;
    const rungs: { key: string; label: string; onPress: () => void }[] = [];
    if (whenFilter !== "tonight") {
      const n = pool.filter((g) => dayLabel(g.startsAt) === "Tonight").length;
      if (n > 0) rungs.push({ key: "tonight", label: `${n} game${n === 1 ? "" : "s"} tonight`, onPress: () => setWhenFilter("tonight") });
    }
    if (whenFilter !== "tomorrow") {
      const n = pool.filter((g) => dayLabel(g.startsAt) === "Tomorrow").length;
      if (n > 0) rungs.push({ key: "tomorrow", label: `${n} game${n === 1 ? "" : "s"} tomorrow`, onPress: () => setWhenFilter("tomorrow") });
    }
    if (levelFilters.length > 0) {
      const n = pool.filter((g) => !levelFilters.includes(g.skill.toLowerCase())).length;
      if (n > 0)
        rungs.push({
          key: "levels",
          label: `${n} game${n === 1 ? "" : "s"} at other levels`,
          onPress: () => {
            levelTouched.current = true;
            setLevelFilters([]);
          },
        });
    }
    if (discoverRadiusKm < DEFAULT_DISCOVER_RADIUS_KM) {
      const n = pool.filter((g) => (g.distanceM ?? 0) > discoverRadiusKm * 1000).length;
      if (n > 0)
        rungs.push({ key: "radius", label: `${n} game${n === 1 ? "" : "s"} further away`, onPress: () => setDiscoverRadiusKm(DEFAULT_DISCOVER_RADIUS_KM) });
    }
    return rungs.slice(0, 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallbackEnabled, fallbackQuery.data, whenFilter, levelFilters, discoverRadiusKm]);

  const [alertState, setAlertState] = useState<AlertState>("idle");
  const createAlert = useCreateAlert();
  // The saved alert describes a specific filter set — if the user changes level/radius, "saved"
  // no longer reflects what's on screen, so drop back to offering it again.
  useEffect(() => {
    setAlertState("idle");
  }, [levelFilters, discoverRadiusKm]);
  const handleSetAlert = () => {
    setAlertState("saving");
    createAlert.mutate(
      { tierSlugs: levelFilters, radiusKm: discoverRadiusKm, center: userLocation },
      {
        onSuccess: () => {
          setAlertState("saved");
          haptics.success();
        },
        onError: () => setAlertState("idle"),
      }
    );
  };

  // Pin tap and carousel settle both drive `selectedGameId` + the map's focus — guard with
  // a ref so a carousel scroll triggered programmatically (by a pin tap) doesn't loop back
  // and re-drive the map, fighting the animation that's already in flight.
  const handleSelectFromMap = (id: string) => {
    setSelectedGameId(id);
    // Dragging never hides pins (map-plan.md §P4): a pin tap drops the sheet back to peek so
    // the map around the newly selected pin is visible, even if the sheet was at half/full.
    mapSheetRef.current?.snapTo("peek");
    const idx = mapVenueGroups.findIndex((grp) => grp.some((g) => g.id === id));
    if (idx >= 0) {
      carouselScrollIsProgrammatic.current = true;
      carouselRef.current?.scrollToOffset({ offset: idx * CAROUSEL_STEP, animated: true });
    }
  };
  const handleCarouselSettle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (carouselScrollIsProgrammatic.current) {
      carouselScrollIsProgrammatic.current = false;
      return;
    }
    const idx = Math.round(e.nativeEvent.contentOffset.x / CAROUSEL_STEP);
    const g = mapVenueGroups[idx]?.[0];
    if (g && g.venueLat != null && g.venueLng != null) {
      setSelectedGameId(g.id);
      mapRef.current?.focusOn(g.venueLat, g.venueLng);
    }
  };
  const handleMapSnapChange = (_snap: "peek" | "half" | "full", heightPx: number) => setSheetHeight(heightPx);

  // §4.4's ladder ranks nearest-first — venues_near carries no distance_m (viewport-bound, not
  // distance-sorted server-side), so this is the same client-side haversine used for the "N km"
  // label everywhere else on the pin.
  const nearestVenues = useMemo(
    () =>
      [...noGameVenues]
        .map((v) => ({ ...v, distanceM: haversineMeters(mapCenter.lat, mapCenter.lng, v.lat, v.lng) }))
        .sort((a, b) => a.distanceM - b.distanceM),
    [noGameVenues, mapCenter.lat, mapCenter.lng]
  );
  const nearestVenue = nearestVenues[0];

  // Sport scoping (D9, §4.7) — Courts mode only shows venues that can actually host the
  // active sport (badminton is the only one that ships, so this is courts_badminton). A venue
  // with no court count on file stays visible but sorts last: unknown isn't evidence of absence.
  const courtsModeVenues = useMemo(
    () =>
      nearestVenues
        .filter((v) => v.courtsBadminton == null || v.courtsBadminton > 0)
        .sort((a, b) => {
          const aKnown = a.courtsBadminton != null ? 0 : 1;
          const bKnown = b.courtsBadminton != null ? 0 : 1;
          return aKnown - bKnown;
        }),
    [nearestVenues]
  );

  // Single source of truth for court pins: the same array goes to the map and to the sheet, so
  // "20 courts near you" can never sit above a map showing one dot. When the rule drops courts,
  // the sheet says so (below) instead of counting what isn't drawn.
  // nearestVenues, not noGameVenues: same venues, already carrying the haversine distance the
  // sheet rows render, so both modes feed the same shape through the same rule.
  const courtPinPool = mapMode === "games" ? nearestVenues : courtsModeVenues;
  const visibleCourts = useMemo(
    () => visibleCourtsFor(courtPinPool, mapCenter, mapZoom),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [courtPinPool, mapCenter.lat, mapCenter.lng, mapZoom]
  );
  const hiddenCourtCount = courtPinPool.length - visibleCourts.length;

  // The sheet's state line is a pure function of the arrays the map is given — that's the whole
  // guarantee. Own games are counted separately: they're on the map but not joinable, so folding
  // them into the game count would be a different lie from the one this replaces.
  const mapSheetTitle =
    mapMode === "courts"
      ? visibleCourts.length > 0
        ? `${visibleCourts.length} court${visibleCourts.length === 1 ? "" : "s"} in view`
        : courtPinPool.length > 0
          ? "Zoom in to see courts"
          : "No courts on file here"
      : mapQuery.isError
        ? "Couldn't load"
        : mapQuery.isLoading
          ? "Finding games…"
          : [
          mapPinnedGames.length > 0 ? `${mapPinnedGames.length} game${mapPinnedGames.length === 1 ? "" : "s"}` : "No open games here",
          ownMapGames.length > 0 ? `${ownMapGames.length} yours` : null,
        ]
          .filter(Boolean)
          .join(" · ");
  // The carousel peek fits one card; the empty ladder and the courts list are taller stacks.
  const mapSheetPeekVariant = mapMode === "courts" || mapPinnedGames.length === 0 ? "stack" : "carousel";

  const handleHostAtNearest = () => {
    if (!nearestVenue) {
      router.push("/wizard");
      return;
    }
    haptics.tap();
    const full = venuesNearQuery.data?.find((v) => v.id === nearestVenue.id);
    useAppStore.getState().setHostHereSeed({
      venueId: nearestVenue.id,
      venueName: nearestVenue.name,
      venueSuburb: full?.suburb ?? "",
      venueAddress: full?.address ?? `${full?.suburb ?? ""}, ${full?.state ?? ""}`,
    });
    router.push("/wizard");
  };

  const filterSummary = [
    levelFilters.length === 1 ? LEVEL_FILTERS.find((l) => l.slug === levelFilters[0])?.label : levelFilters.length > 1 ? "your levels" : null,
    WHEN_FILTERS.find((w) => w.key === whenFilter)?.label,
  ]
    .filter(Boolean)
    .join(" · ");

  // Rails and day-grouped sections only make sense when the list is in its natural
  // chronological order — a custom sort (cheapest, most spots…) falls back to a plain flat
  // list further down instead of fighting the shelves for a sense of order.
  const chronological = sortBy === "soonest";
  const viewerTierOrdinal = viewerTier?.ordinal ?? null;

  // Keying the list wrapper to the active filter set turns a filter change into a cross-fade
  // (D6) instead of a hard swap — React remounts the subtree, playing exit/enter on each change.
  const filterSignature = `${whenFilter}|${levelFilters.join(",")}|${sortBy}|${discoverRadiusKm}|${hasSpotsOnly}|${verifiedOnly}|${maxCostPerPlayerCents}`;

  const pastGamesQuery = useMyPastGames();

  // Best-match hero selection (docs/v2-design-plan.md §4.1) — honest, not fabricated: the
  // first game in the current sorted set that (a) still has spots, (b) starts within 24h, and
  // (c) is an exact level match for the viewer's tier. Falls back to (a)+(b) alone, then to no
  // hero at all. Same "excluded from the list below it" pattern as My Games' NextUpHero.
  const heroGame = useMemo(() => {
    if (!chronological) return null;
    const now = Date.now();
    const soon = games.filter((g) => spotsLeft(g) > 0 && new Date(g.startsAt).getTime() - now < 24 * 60 * 60 * 1000);
    const match = viewerTierOrdinal != null ? soon.find((g) => levelFit(viewerTierOrdinal, g.skillTierOrdinal) === "match") : undefined;
    return match ?? soon[0] ?? null;
  }, [chronological, games, viewerTierOrdinal]);

  const rails = useMemo(() => {
    if (!chronological) return [];
    const now = Date.now();
    const closingSoon = games
      .filter((g) => spotsLeft(g) > 0 && new Date(g.startsAt).getTime() - now < 24 * 60 * 60 * 1000)
      .slice(0, 10);
    const atYourLevel =
      viewerTierOrdinal != null ? games.filter((g) => levelFit(viewerTierOrdinal, g.skillTierOrdinal) === "match").slice(0, 10) : [];
    const lastVenue = pastGamesQuery.data?.[0]?.venue;
    const backAtVenue = lastVenue ? games.filter((g) => g.venue === lastVenue).slice(0, 10) : [];
    return [
      { title: "Closing soon", games: closingSoon },
      { title: "At your level, near you", games: atYourLevel },
      ...(lastVenue ? [{ title: `Back at ${lastVenue}`, games: backAtVenue }] : []),
    ];
  }, [chronological, games, viewerTierOrdinal, pastGamesQuery.data]);

  const discoverRows = useMemo(
    () => (chronological ? buildDiscoverRows(heroGame ? games.filter((g) => g.id !== heroGame.id) : games, rails) : []),
    [chronological, games, rails, heroGame]
  );
  const stickyHeaderIndices = useMemo(() => discoverRows.flatMap((r, i) => (r.kind === "day" ? [i] : [])), [discoverRows]);

  return (
    <Screen>
      <View
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        className="pt-3 pb-2.5 flex-row justify-between items-start"
        style={{ paddingHorizontal: LAYOUT.SCREEN_PAD }}
      >
        <View>
          <Text className="font-display text-[30px]" style={{ color: colors.text }}>
            Discover
          </Text>
          {/* The kicker describes the query, never the viewport (D5, discover-map-ux-plan.md
              §4.5). "Showing this area" now lives in the map sheet's title row instead: it used
              to render a second KM figure here — a viewport half-span, not the filter radius —
              so two numbers labelled KM meant different things, and the header's height changed
              underneath the map overlay that anchors to it. */}
          <Text className="text-[12.5px] font-body-bold mt-0.5 uppercase" style={{ color: colors.textSecondary, letterSpacing: 0.6 }}>
            {locationLabel.toUpperCase()} · {discoverRadiusKm}KM RADIUS
          </Text>
        </View>
        <NotificationBell />
      </View>

      <FilterChipsRow
        activeCount={activeFilterChips.length}
        chips={activeFilterChips}
        onPressFilters={() => setFiltersOpen(true)}
        onPressMap={() => setDiscoverView("map")}
      />

      <FiltersSheet visible={filtersOpen} onClose={() => setFiltersOpen(false)} markLevelTouched={markLevelTouched} />

      {showInitialLoading ? (
        <GameCardSkeletonList />
      ) : (
        <Animated.View key={filterSignature} entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={{ flex: 1 }}>
          {games.length === 0 ? (
            <RefreshableList
              ref={listRef}
              data={games}
              keyExtractor={(g: Game) => g.id}
              contentContainerStyle={{ padding: 20, paddingTop: 4, paddingBottom: tabBarSpace, gap: 12, flexGrow: 1 }}
              refreshing={discoverQuery.isRefetching}
              onRefresh={() => discoverQuery.refetch()}
              onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => scrollHide(e.nativeEvent.contentOffset.y)}
              scrollEventThrottle={32}
              renderItem={() => null}
              ListEmptyComponent={
                showError ? (
                  <EmptyState
                    title="Couldn't load games"
                    subtitle="Check your connection and try again."
                    ctaLabel="Retry"
                    onCta={() => discoverQuery.refetch()}
                  />
                ) : isFiltered && ladderRungs.length > 0 ? (
                  <FallbackLadder rungs={ladderRungs} onHost={() => router.push("/wizard")} alertState={alertState} onAlert={handleSetAlert} />
                ) : isFiltered ? (
                  <View className="items-center gap-3">
                    <EmptyState
                      title={`Nothing at ${filterSummary} right now`}
                      subtitle="Try a different level, a wider time range, or check back later."
                      ctaLabel="Clear filters"
                      onCta={() => {
                        levelTouched.current = true;
                        clearDiscoverFilters();
                      }}
                    />
                    <View className="w-full px-6">
                      <AlertMeRow state={alertState} onPress={handleSetAlert} />
                    </View>
                  </View>
                ) : (
                  <EmptyState
                    title="Court's quiet right now"
                    subtitle="Be the first to call a game this week — takes under a minute to set up."
                    ctaLabel="Host a game"
                    onCta={() => router.push("/wizard")}
                  />
                )
              }
            />
          ) : chronological ? (
            <RefreshableList
              ref={listRef}
              data={discoverRows}
              keyExtractor={(r: DiscoverRow) => r.id}
              stickyHeaderIndices={stickyHeaderIndices.map((i) => i + (heroGame ? 1 : 0))}
              ListHeaderComponent={
                heroGame ? (
                  <View className="pb-4">
                    <GameCard game={heroGame} variant="featured" kicker="BEST MATCH FOR YOU" onPress={() => router.push(`/game/${heroGame.id}`)} />
                  </View>
                ) : null
              }
              contentContainerStyle={{ paddingTop: 4, paddingBottom: tabBarSpace }}
              refreshing={discoverQuery.isRefetching}
              onRefresh={() => discoverQuery.refetch()}
              onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
                const compact = e.nativeEvent.contentOffset.y > 24;
                setHeaderCompact((prev) => (prev === compact ? prev : compact));
                scrollHide(e.nativeEvent.contentOffset.y);
              }}
              scrollEventThrottle={32}
              renderItem={({ item }: { item: DiscoverRow }) => {
                if (item.kind === "rail") return <Rail title={item.title} games={item.games} />;
                if (item.kind === "day") return <DayHeader label={item.label} compact={headerCompact} />;
                return (
                  <View className="px-5 pb-3">
                    <GameCard
                      game={item.game}
                      onPress={() => router.push(`/game/${item.game.id}`)}
                      testID={`discover-card-${item.game.id}`}
                    />
                  </View>
                );
              }}
            />
          ) : (
            <RefreshableList
              ref={listRef}
              data={games}
              keyExtractor={(g: Game) => g.id}
              contentContainerStyle={{ padding: 20, paddingTop: 4, paddingBottom: tabBarSpace, gap: 12 }}
              refreshing={discoverQuery.isRefetching}
              onRefresh={() => discoverQuery.refetch()}
              onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => scrollHide(e.nativeEvent.contentOffset.y)}
              scrollEventThrottle={32}
              renderItem={({ item, index }: { item: Game; index: number }) => (
                <GameCard game={item} onPress={() => router.push(`/game/${item.id}`)} testID={`discover-card-${item.id}`} />
              )}
            />
          )}
        </Animated.View>
      )}

      {discoverView === "map" && (
        // Map is a mode, not a route (docs/v2-design-plan.md §2 rule 4) — results stay intact
        // underneath; this overlay covers the screen and a 3-snap sheet keeps the pinned list
        // reachable without leaving the map. The List | Map switch lives in the header now.
        <Animated.View
          entering={reduceMotion ? undefined : FadeIn.duration(200)}
          exiting={reduceMotion ? undefined : FadeOut.duration(150)}
          className="absolute left-0 right-0 bottom-0"
          style={{ top: headerHeight, backgroundColor: colors.base }}
        >
          <GameMap
            ref={mapRef}
            games={mapMode === "games" ? mapPinnedGames : []}
            center={mapAreaOverride ? { lat: mapAreaOverride.lat, lng: mapAreaOverride.lng, isDeviceLocation: false } : userLocation}
            onSelectGame={handleSelectFromMap}
            selectedGameId={selectedGameId}
            // Radius ring is a Games-mode-only affordance (§4.1's per-mode table) — Courts mode
            // has no query radius to visualise, the directory just is what it is.
            radiusKm={mapMode === "games" && !mapAreaOverride ? discoverRadiusKm : null}
            bottomInset={sheetHeight}
            onSearchThisArea={(region) => setMapAreaOverride(region)}
            noGameVenues={visibleCourts}
            onSelectNoGameVenue={handleSelectNoGameVenue}
            ownGames={mapMode === "games" ? ownMapGames : []}
            onZoomChange={setMapZoom}
          />

          {/* Floating search + Tonight chip (docs/v2-design-plan.md §4.2) — glass-backed, sits
              where the list's filter chip row would be. Instant local filter over the pins
              already fetched, plus geocoded Places predictions to jump the map to a place
              outside the current viewport (P3, discover-map-ux-plan.md backlog B8). */}
          <View pointerEvents="box-none" className="absolute left-0 right-0" style={{ top: 12, paddingHorizontal: LAYOUT.SCREEN_PAD, gap: 8 }}>
            <View className="flex-row items-center gap-2.5">
              <View
                className="flex-1 flex-row items-center gap-2 rounded-pill px-4"
                style={{ height: 44, backgroundColor: "rgba(23,23,26,0.9)", borderWidth: 1, borderColor: colors.cardBorder }}
              >
                <Ionicons name="search" size={15} color={colors.textTertiary} />
                <TextInput
                  value={mapSearch}
                  onChangeText={setMapSearch}
                  placeholder="Search venues, suburbs…"
                  placeholderTextColor={colors.textTertiary}
                  className="flex-1 font-body-semibold text-[13.5px]"
                  style={{ color: colors.text }}
                />
                {mapSearch.length > 0 && (
                  <Pressable
                    onPress={() => {
                      setMapSearch("");
                      setMapSearchPredictions([]);
                    }}
                    hitSlop={8}
                  >
                    <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
                  </Pressable>
                )}
              </View>
              {/* Same FiltersSheet the list opens — one filter model, two doors. The badge is
                  what replaces the map's own Tonight chip: the map no longer mutates filters
                  directly, so the count is the only thing it needs to say about them. */}
              <Pressable
                onPress={() => setFiltersOpen(true)}
                className="items-center justify-center rounded-full border"
                style={{ width: 44, height: 44, backgroundColor: "rgba(23,23,26,0.9)", borderColor: colors.cardBorder }}
              >
                <Ionicons name="options-outline" size={17} color={colors.textDim} />
                {activeFilterChips.length > 0 && (
                  <View
                    className="absolute rounded-full items-center justify-center"
                    style={{ width: 17, height: 17, top: -2, right: -2, backgroundColor: colors.accent }}
                  >
                    <Text className="font-body-extrabold" style={{ fontSize: 10.5, color: colors.base }}>
                      {activeFilterChips.length}
                    </Text>
                  </View>
                )}
              </Pressable>
            </View>

            {mapSearchPredictions.length > 0 && (
              <View
                className="rounded-xl border overflow-hidden"
                style={{ backgroundColor: "rgba(23,23,26,0.96)", borderColor: colors.cardBorder }}
              >
                {mapSearchPredictions.map((p, i) => (
                  <Pressable
                    key={p.placeId}
                    onPress={() => handlePickMapSearchPrediction(p)}
                    disabled={mapSearchResolving}
                    className="flex-row items-center gap-2.5 px-4 py-3"
                    style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.cardBorder, opacity: mapSearchResolving ? 0.5 : 1 }}
                  >
                    <Ionicons name="location-outline" size={15} color={colors.textTertiary} />
                    <View className="flex-1 min-w-0">
                      <Text numberOfLines={1} className="font-body-semibold text-[13px]" style={{ color: colors.text }}>
                        {p.mainText}
                      </Text>
                      {p.secondaryText.length > 0 && (
                        <Text numberOfLines={1} className="text-[11.5px] mt-0.5" style={{ color: colors.textTertiary }}>
                          {p.secondaryText}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
            {/* Two floating rows over the map, not four. The Tonight chip is gone (the list's
                chip row is the only place filters change now) and so is the pin legend — pins
                already say what they are: "You ·" prefix, dim ring for a court, tier colour for
                a game. A legend that explains three shapes costs more map than the shapes do. */}
            <View className="flex-row items-center gap-2">
              <SegmentedToggle
                options={[
                  { key: "games", label: "Games" },
                  { key: "courts", label: "Courts" },
                ]}
                value={mapMode}
                onChange={handleSetMapMode}
              />
            </View>
          </View>

          <MapSheet
            ref={mapSheetRef}
            pinnedGames={mapMode === "games" ? mapPinnedGames : []}
            venueGroups={mapMode === "games" ? mapVenueGroups : []}
            bottomSpace={mapSheetBottomSpace}
            title={mapSheetTitle}
            areaOverrideLabel={mapAreaOverride ? `Showing this area · Back to ${locationLabel}` : null}
            onClearArea={() => setMapAreaOverride(null)}
            onExitMap={() => setDiscoverView("list")}
            peekVariant={mapSheetPeekVariant}
            bodyKey={`${mapMode}|${mapSheetTitle}|${mapAreaOverride ? "area" : "filters"}`}
            onCardPress={(id) => router.push(`/game/${id}`)}
            onCarouselSettle={handleCarouselSettle}
            carouselRef={carouselRef}
            onSnapChange={handleMapSnapChange}
            carouselStep={CAROUSEL_STEP}
            carouselGap={CAROUSEL_GAP}
            cardWidth={CAROUSEL_CARD_WIDTH}
            // D1/D10 (discover-map-ux-plan.md §4.4) — the sheet's empty state ranks concrete next
            // steps instead of a shrug: nearest real court, an alert for when one appears, and
            // "clear Tonight" only when that chip is actually what emptied the screen. The
            // nearest-courts list below it is the "sheet reflects the pins" fix for D1 — every
            // pin on the map now has a matching row here, even at zero game liquidity.
            emptyState={
              mapMode === "courts" ? (
                // Courts mode's own sheet body (§4.1) — never empty, the directory always has
                // rows. Reuses MapSheet's emptyState slot rather than adding a second sheet
                // implementation, since Courts mode always sets pinnedGames=[] above.
                <View className="gap-2 px-5 pb-4">
                  {hiddenCourtCount > 0 && (
                    // Says why the list is short instead of counting pins the map didn't draw.
                    <Text className="text-[12px] font-body-bold uppercase mb-1" style={{ color: colors.textTertiary, letterSpacing: 0.5 }}>
                      Zoom in to see all {courtPinPool.length}
                    </Text>
                  )}
                  {visibleCourts.length === 0 ? (
                    <Text className="text-[13px]" style={{ color: colors.textSecondary }}>
                      {courtPinPool.length > 0
                        ? "Zoom in to see the courts around here."
                        : "No badminton courts on file for this area yet."}
                    </Text>
                  ) : (
                    visibleCourts.map((v) => <MapCourtCard key={v.id} venue={v} onPress={handleSelectNoGameVenue} />)
                  )}
                </View>
              ) : mapQuery.isError ? (
                // Distinct from empty on purpose: a failed fetch rendering "no games here" is a
                // lie about supply (discover-plan.md §3, same defect the list already fixed).
                <View className="gap-3 px-5 pb-4 items-center">
                  <Ionicons name="cloud-offline-outline" size={24} color={colors.textTertiary} />
                  <Text className="font-display-bold text-[15px] text-center" style={{ color: colors.text }}>
                    Couldn't load games
                  </Text>
                  <Pressable
                    onPress={() => mapQuery.refetch()}
                    className="rounded-xl px-5 py-3"
                    style={{ backgroundColor: colors.accent }}
                  >
                    <Text className="font-body-extrabold text-[14px]" style={{ color: colors.base }}>
                      Try again
                    </Text>
                  </Pressable>
                </View>
              ) : mapQuery.isLoading ? (
                <View className="px-5 pb-4">
                  <GameCardSkeletonList count={2} />
                </View>
              ) : (
              <View className="gap-3 px-5 pb-4">
                {ownMapGames.length > 0 && (
                  // Every pin the map can show has a row here — including yours, which is why the
                  // heading below says "no open games" rather than "nothing here".
                  <View className="gap-2">
                    <Text className="text-[12px] font-body-bold uppercase" style={{ color: colors.textTertiary, letterSpacing: 0.5 }}>
                      Yours nearby
                    </Text>
                    {ownMapGames.map((g) => (
                      <GameCard key={g.id} game={g} onPress={() => router.push(`/game/${g.id}`)} />
                    ))}
                  </View>
                )}
                <View className="items-center gap-1.5 px-1">
                  <Ionicons name="search-outline" size={24} color={colors.textTertiary} />
                  <Text className="font-display-bold text-[15px] text-center" style={{ color: colors.text }}>
                    No open games here
                  </Text>
                  <Text className="text-[13px] text-center max-w-[260px]" style={{ color: colors.textSecondary }}>
                    {nearestVenue
                      ? `${nearestVenues.length} badminton court${nearestVenues.length === 1 ? "" : "s"} within ${mapRadiusKm} km. Nearest: ${nearestVenue.name}, ${formatDistance(nearestVenue.distanceM, distanceUnits)}.`
                      : "No courts on file for this area yet."}
                  </Text>
                </View>

                <View className="gap-2">
                  <Pressable
                    onPress={handleHostAtNearest}
                    className="flex-row items-center justify-between rounded-xl px-4 py-3.5"
                    style={{ backgroundColor: colors.accent }}
                  >
                    <Text className="font-body-extrabold text-[14px]" style={{ color: colors.base }}>
                      {nearestVenue ? `Host at ${nearestVenue.name}` : "Host a game"}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.base} />
                  </Pressable>
                  <AlertMeRow state={alertState} onPress={handleSetAlert} />
                  {whenFilter === "tonight" && (
                    <Pressable
                      onPress={() => setWhenFilter("all")}
                      className="flex-row items-center justify-between rounded-xl px-4 py-3.5 border"
                      style={{ backgroundColor: colors.surfaceAlt, borderColor: colors.cardBorder }}
                    >
                      <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
                        Clear "Tonight"
                      </Text>
                      <Ionicons name="close" size={16} color={colors.textTertiary} />
                    </Pressable>
                  )}
                  {mapAreaOverride && (
                    <Pressable
                      onPress={() => setMapAreaOverride(null)}
                      className="flex-row items-center justify-between rounded-xl px-4 py-3.5 border"
                      style={{ backgroundColor: colors.surfaceAlt, borderColor: colors.cardBorder }}
                    >
                      <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
                        Back to my area
                      </Text>
                      <Ionicons name="close" size={16} color={colors.textTertiary} />
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => router.push("/venues")}
                    className="flex-row items-center justify-between rounded-xl px-4 py-3.5 border"
                    style={{ borderColor: colors.cardBorder }}
                  >
                    <Text className="font-body-bold text-[14px]" style={{ color: colors.textSecondary }}>
                      Browse courts
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                  </Pressable>
                </View>

                {nearestVenues.length > 0 && (
                  <View className="gap-2 mt-1">
                    <Text className="text-[12px] font-body-bold uppercase" style={{ color: colors.textTertiary, letterSpacing: 0.5 }}>
                      {nearestVenues.length} court{nearestVenues.length === 1 ? "" : "s"} near you
                    </Text>
                    {nearestVenues.slice(0, 5).map((v) => (
                      <Pressable
                        key={v.id}
                        onPress={() => handleSelectNoGameVenue(v)}
                        className="flex-row items-center justify-between rounded-xl px-4 py-3 border"
                        style={{ backgroundColor: colors.surfaceAlt, borderColor: colors.cardBorder }}
                      >
                        <Text className="font-body-bold text-[13.5px] flex-1" style={{ color: colors.text }} numberOfLines={1}>
                          {v.name}
                        </Text>
                        <Text className="font-body-semibold text-[12.5px] ml-2" style={{ color: colors.textTertiary }}>
                          {formatDistance(v.distanceM, distanceUnits)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
              )
            }
          />
        </Animated.View>
      )}

      {/* No floating view switch: entering the map is a FilterChipsRow button, leaving it is a
          chip inside MapSheet's handle row. A pill anchored to tab-bar clearance sat on top of
          the sheet's peek content at every snap. */}
    </Screen>
  );
}
