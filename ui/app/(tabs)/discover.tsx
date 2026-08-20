import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, TextInput, Dimensions, FlatList, BackHandler, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
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
import { useVenuesForMap } from "../../lib/queries/venues";
import { useCreateAlert } from "../../lib/queries/alerts";
import { useProfileSports } from "../../lib/queries/profile";
import { useSession } from "../../lib/session";
import { useUserLocation, useLocationLabel } from "../../lib/location";
import { dayLabel, haversineMeters, formatDistance } from "../../lib/format";
import { haptics } from "../../lib/haptics";
import { Screen } from "../../components/Screen";
import { Chip } from "../../components/Chip";
import { GameCard } from "../../components/GameCard";
import { EmptyState } from "../../components/EmptyState";
import { GameMap, GameMapHandle, venueKeyOf, venueKeyOfCoords, NoGameVenue } from "../../components/GameMap";
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
  const [granted, setGranted] = useState<boolean | null>(null);

  useFocusEffect(
    useCallback(() => {
      Notifications.getPermissionsAsync().then((r) => setGranted(r.status === Notifications.PermissionStatus.GRANTED));
    }, [])
  );

  return (
    <Pressable
      onPress={() => router.push("/notification-settings")}
      className="w-[38px] h-[38px] rounded-full items-center justify-center border"
      style={{ backgroundColor: "#17171A", borderColor: "rgba(255,255,255,0.08)" }}
    >
      <Ionicons name="notifications-outline" size={16} color={colors.textSecondary} />
      {granted === false && (
        <View
          className="absolute rounded-full"
          style={{ width: 8, height: 8, top: 7, right: 8, backgroundColor: colors.danger, borderWidth: 1.5, borderColor: "#17171A" }}
        />
      )}
    </Pressable>
  );
}

// v2 single filter row (docs/v2-design-plan.md §4.1) — collapses the old two chip rows +
// Filters button + removable-token row into one line. Every chip opens the same FiltersSheet;
// its label always reflects the live value so there's nothing to remove separately (backlog B2).
function FilterChipsRow({
  whenLabel,
  whenActive,
  levelLabel,
  levelActive,
  radiusLabel,
  radiusActive,
  moreCount,
  onPress,
}: {
  whenLabel: string;
  whenActive: boolean;
  levelLabel: string;
  levelActive: boolean;
  radiusLabel: string;
  radiusActive: boolean;
  moreCount: number;
  onPress: () => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ gap: 8, paddingHorizontal: LAYOUT.SCREEN_PAD, paddingBottom: 12, alignItems: "center" }}
    >
      <Chip label="Badminton" active size="sm" />
      <Chip label={whenLabel} active={whenActive} onPress={onPress} size="sm" />
      <Chip label={levelLabel} active={levelActive} onPress={onPress} size="sm" />
      <Chip label={radiusLabel} active={radiusActive} onPress={onPress} size="sm" />
      <Chip label={moreCount > 0 ? `Filters · ${moreCount}` : "Filters"} active={moreCount > 0} onPress={onPress} size="sm" />
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
  // Client-side name/suburb filter over the pins already fetched (docs/v2-design-plan.md §4.2) —
  // no geocoded search in this pass, see backlog B8.
  const [mapSearch, setMapSearch] = useState("");
  // Games | Courts mode (P2, discover-map-ux-plan.md §4.1) — auto-selected by liquidity
  // (games if any are in radius, courts otherwise) until the viewer touches the control
  // themselves, same "personalise until touched" pattern as the level filter above.
  const [mapMode, setMapMode] = useState<"games" | "courts">("games");
  const mapModeTouched = useRef(false);
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
    userLocation
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
    { enabled: discoverView === "map" }
  );
  const mapPinnedGamesAll = (mapQuery.data ?? []).filter((g) => g.venueLat != null && g.venueLng != null);

  // Mode auto-select (§4.1) — games if any are in radius, courts otherwise. Waits for the
  // query so a mid-fetch empty array can't flash Courts mode and then snap back to Games.
  useEffect(() => {
    if (discoverView !== "map" || mapQuery.isLoading || mapModeTouched.current) return;
    setMapMode(mapPinnedGamesAll.length > 0 ? "games" : "courts");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discoverView, mapQuery.isLoading, mapPinnedGamesAll.length]);
  const handleSetMapMode = (m: "games" | "courts") => {
    mapModeTouched.current = true;
    setMapMode(m);
  };

  // Client-side name/suburb filter over the pins already fetched (docs/v2-design-plan.md §4.2,
  // backlog B8 — no geocoded search yet). Only narrows what's shown, never re-fetches.
  const mapPinnedGames = useMemo(() => {
    const q = mapSearch.trim().toLowerCase();
    if (!q) return mapPinnedGamesAll;
    return mapPinnedGamesAll.filter((g) => g.venue.toLowerCase().includes(q) || g.suburb.toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapPinnedGamesAll, mapSearch]);

  // D7 (discover-map-ux-plan.md) — the viewer's own upcoming games, excluded from mapPinnedGames
  // by nearby_games' p_exclude_mine but still worth showing on the map they're looking at.
  // Unfiltered by radius/level/when: "yours" isn't a search result, it's just where you're going.
  const myJoinedQuery = useMyJoinedGames();
  const myHostingQuery = useMyHostingGames();
  const ownMapGames = useMemo(() => {
    if (discoverView !== "map") return [];
    return [...(myJoinedQuery.data ?? []), ...(myHostingQuery.data ?? [])].filter((g) => g.venueLat != null && g.venueLng != null);
  }, [discoverView, myJoinedQuery.data, myHostingQuery.data]);

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

  // Fallback ladder (D5): only fires a second query once we know the primary one came back
  // empty under active filters — a relaxed pool (any level, any time, max radius) we diff
  // against the current filters to build honest, counted "try this instead" rungs.
  const fallbackEnabled = !showInitialLoading && !showError && games.length === 0 && isFiltered;
  const fallbackQuery = useDiscoverGames(
    { tierSlugs: [], when: "all", radiusKm: DEFAULT_DISCOVER_RADIUS_KM, hasSpotsOnly, verifiedOnly, maxCostPerPlayerCents, sortBy: "soonest" },
    userLocation,
    { enabled: fallbackEnabled }
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
          {/* D5 (discover-map-ux-plan.md §4.5) — once the camera has actually diverged from the
              filter-driven center (a pan + "search this area"), the header stops claiming to
              describe a location it isn't showing anymore. */}
          {discoverView === "map" && mapAreaOverride ? (
            <View className="flex-row items-center gap-1.5 mt-0.5">
              <Text className="text-[12.5px] font-body-bold uppercase" style={{ color: colors.textSecondary, letterSpacing: 0.6 }}>
                SHOWING THIS AREA · {Math.round(mapRadiusKm)}KM
              </Text>
              <Pressable onPress={() => setMapAreaOverride(null)} hitSlop={6}>
                <Text className="text-[12.5px] font-body-extrabold uppercase" style={{ color: colors.accent, letterSpacing: 0.6 }}>
                  · Back to {locationLabel.toUpperCase()}
                </Text>
              </Pressable>
            </View>
          ) : (
            <Text className="text-[12.5px] font-body-bold mt-0.5 uppercase" style={{ color: colors.textSecondary, letterSpacing: 0.6 }}>
              {locationLabel.toUpperCase()} · {discoverRadiusKm}KM RADIUS
            </Text>
          )}
        </View>
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => router.push("/venues")}
            className="w-9 h-9 rounded-full items-center justify-center border"
            style={{ backgroundColor: colors.surfaceAlt, borderColor: colors.cardBorder }}
          >
            <Ionicons name="business-outline" size={16} color={colors.textDim} />
          </Pressable>
          <NotificationBell />
          <SegmentedToggle
            options={[
              { key: "list", label: "List" },
              { key: "map", label: "Map" },
            ]}
            value={discoverView}
            onChange={setDiscoverView}
          />
        </View>
      </View>

      <FilterChipsRow
        whenLabel={WHEN_FILTERS.find((w) => w.key === whenFilter)?.label ?? "Any time"}
        whenActive={whenFilter !== "all"}
        levelLabel={
          levelFilters.length === 1
            ? LEVEL_FILTERS.find((l) => l.slug === levelFilters[0])?.label ?? "Any level"
            : levelFilters.length > 1
            ? `${levelFilters.length} levels`
            : "Any level"
        }
        levelActive={levelFilters.length > 0}
        radiusLabel={`${discoverRadiusKm}km`}
        radiusActive={discoverRadiusKm !== DEFAULT_DISCOVER_RADIUS_KM}
        moreCount={[sortBy !== "soonest", maxCostPerPlayerCents != null, hasSpotsOnly, verifiedOnly].filter(Boolean).length}
        onPress={() => setFiltersOpen(true)}
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
            noGameVenues={mapMode === "games" ? noGameVenues : courtsModeVenues}
            onSelectNoGameVenue={handleSelectNoGameVenue}
            ownGames={mapMode === "games" ? ownMapGames : []}
          />

          {/* Floating search + Tonight chip (docs/v2-design-plan.md §4.2) — glass-backed, sits
              where the list's filter chip row would be. Search is a client-side name/suburb
              filter over the pins already fetched (backlog B8: no geocoded search yet). */}
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
                  <Pressable onPress={() => setMapSearch("")} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
                  </Pressable>
                )}
              </View>
              <Pressable
                onPress={() => setFiltersOpen(true)}
                className="items-center justify-center rounded-full border"
                style={{ width: 44, height: 44, backgroundColor: "rgba(23,23,26,0.9)", borderColor: colors.cardBorder }}
              >
                <Ionicons name="options-outline" size={17} color={colors.textDim} />
              </Pressable>
            </View>
            {/* Games | Courts (P2, §4.1) replaces the lone Tonight chip's position — Tonight
                only makes sense once you're looking at games, so it moves inside that mode. */}
            <View className="flex-row items-center gap-2">
              <SegmentedToggle
                options={[
                  { key: "games", label: "Games" },
                  { key: "courts", label: "Courts" },
                ]}
                value={mapMode}
                onChange={handleSetMapMode}
              />
              {mapMode === "games" && (
                <Chip
                  label="Tonight"
                  active={whenFilter === "tonight"}
                  onPress={() => setWhenFilter(whenFilter === "tonight" ? "all" : "tonight")}
                  size="sm"
                />
              )}
            </View>

            {/* Pin legend (P1, D3 of the plan's "what that means for us" table) — every pin
                type gets a labelled swatch so none of them depend on an icon reading correctly
                out of context. */}
            <View className="flex-row items-center gap-3 rounded-pill px-3 py-1.5 self-start" style={{ backgroundColor: "rgba(23,23,26,0.9)" }}>
              <View className="flex-row items-center gap-1.5">
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
                <Text className="text-[10.5px] font-body-bold" style={{ color: colors.textSecondary }}>
                  Game
                </Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: colors.accent, backgroundColor: "transparent" }} />
                <Text className="text-[10.5px] font-body-bold" style={{ color: colors.textSecondary }}>
                  Yours
                </Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: colors.textMuted, backgroundColor: colors.surfaceAlt }} />
                <Text className="text-[10.5px] font-body-bold" style={{ color: colors.textSecondary }}>
                  Court
                </Text>
              </View>
            </View>
          </View>

          <MapSheet
            ref={mapSheetRef}
            pinnedGames={mapMode === "games" ? mapPinnedGames : []}
            venueGroups={mapMode === "games" ? mapVenueGroups : []}
            bottomSpace={mapSheetBottomSpace}
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
                  <Text className="text-[12px] font-body-bold uppercase mb-1" style={{ color: colors.textTertiary, letterSpacing: 0.5 }}>
                    {courtsModeVenues.length} court{courtsModeVenues.length === 1 ? "" : "s"} near you
                  </Text>
                  {courtsModeVenues.length === 0 ? (
                    <Text className="text-[13px]" style={{ color: colors.textSecondary }}>
                      No badminton courts on file for this area yet.
                    </Text>
                  ) : (
                    courtsModeVenues.map((v) => <MapCourtCard key={v.id} venue={v} onPress={handleSelectNoGameVenue} />)
                  )}
                </View>
              ) : (
              <View className="gap-3 px-5 pb-4">
                <View className="items-center gap-1.5 px-1">
                  <Ionicons name="search-outline" size={24} color={colors.textTertiary} />
                  <Text className="font-display-bold text-[15px] text-center" style={{ color: colors.text }}>
                    {mapAreaOverride ? "Nothing here yet" : "No games here yet"}
                  </Text>
                  <Text className="text-[13px] text-center max-w-[260px]" style={{ color: colors.textSecondary }}>
                    {nearestVenue
                      ? `${nearestVenues.length} badminton court${nearestVenues.length === 1 ? "" : "s"} within ${mapRadiusKm} km. Nearest: ${nearestVenue.name}, ${formatDistance(nearestVenue.distanceM)}.`
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
                          {formatDistance(v.distanceM)}
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
    </Screen>
  );
}
