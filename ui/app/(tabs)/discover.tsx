import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, Dimensions, FlatList, BackHandler, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { useAppStore, WhenFilter, SortOption, DISCOVER_RADIUS_OPTIONS_KM, DEFAULT_DISCOVER_RADIUS_KM, PRICE_CAP_OPTIONS_CENTS } from "../../lib/store";
import { colors, TIERS } from "../../lib/theme";
import { NAV, tabBarBottom, useTabBarSpace } from "../../lib/nav";
import { useReduceMotion } from "../../lib/motion";
import { makeScrollHideHandler, registerScrollToTop, unregisterScrollToTop } from "../../lib/navScroll";
import { BottomRail } from "../../components/BottomRail";
import { HostFab } from "../../components/HostFab";
import { useDiscoverGames, useWeekPulseGames, useMyPastGames } from "../../lib/queries/games";
import { useVenuesForMap } from "../../lib/queries/venues";
import { useCreateAlert } from "../../lib/queries/alerts";
import { useProfileSports } from "../../lib/queries/profile";
import { useSession } from "../../lib/session";
import { useUserLocation, useLocationLabel } from "../../lib/location";
import { dayLabel } from "../../lib/format";
import { haptics } from "../../lib/haptics";
import { Screen } from "../../components/Screen";
import { Chip } from "../../components/Chip";
import { GameCard } from "../../components/GameCard";
import { EmptyState } from "../../components/EmptyState";
import { GameMap, GameMapHandle, venueKeyOf, venueKeyOfCoords, NoGameVenue } from "../../components/GameMap";
import { MapSheet, MapSheetHandle, sheetSnapHeights } from "../../components/MapSheet";
import { RefreshableList } from "../../components/RefreshableList";
import { GameCardSkeletonList } from "../../components/Skeleton";
import { Sheet } from "../../components/Sheet";
import { Rail } from "../../components/Rail";
import { DayHeader } from "../../components/DayHeader";
import { Game, spotsLeft, levelFit } from "../../lib/mockData";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CAROUSEL_GAP = 12;
const CAROUSEL_CARD_WIDTH = SCREEN_WIDTH - 88;
const CAROUSEL_STEP = CAROUSEL_CARD_WIDTH + CAROUSEL_GAP;

type DiscoverRow =
  | { kind: "pulse"; id: string; text: string }
  | { kind: "rail"; id: string; title: string; games: Game[] }
  | { kind: "day"; id: string; label: string }
  | { kind: "game"; id: string; game: Game; index: number };

function buildDiscoverRows(games: Game[], rails: { title: string; games: Game[] }[], pulseText: string | null): DiscoverRow[] {
  const rows: DiscoverRow[] = [];
  if (pulseText) rows.push({ kind: "pulse", id: "pulse", text: pulseText });
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

function WeekPulseStrip({ text }: { text: string }) {
  return (
    <View className="flex-row items-center gap-1.5 mx-5 mb-3 px-3.5 py-2.5 rounded-xl border" style={{ borderColor: colors.cardBorder, backgroundColor: colors.surfaceAlt }}>
      <Ionicons name="pulse-outline" size={13} color={colors.accent} />
      <Text className="text-[12.5px] font-body-semibold flex-1" style={{ color: colors.textSecondary }}>
        {text}
      </Text>
    </View>
  );
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

function FiltersSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const {
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
            onPress={clearDiscoverFilters}
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

// Persistent toggle (Airbnb pattern): same slot, same size, icon + label swap instead of an
// open/dismiss pair — kept enabled-but-disabled at zero pins so its position never moves.
function MapToggle({ visible, isMap, count, onToggle }: { visible: boolean; isMap: boolean; count: number; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={!visible}
      className="flex-row items-center gap-1.5 rounded-pill px-4 py-3 border"
      style={{ backgroundColor: "rgba(23,23,26,0.9)", borderColor: colors.cardBorder, opacity: visible ? 1 : 0.35 }}
    >
      <Ionicons name={isMap ? "list" : "map-outline"} size={15} color={colors.text} />
      <Text className="font-body-extrabold text-[13.5px]" style={{ color: colors.text }}>
        {isMap ? "List" : count > 0 ? `Map · ${count}` : "Map"}
      </Text>
    </Pressable>
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
  const tabBarSpace = useTabBarSpace(true);
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<GameMapHandle>(null);
  const mapSheetRef = useRef<MapSheetHandle>(null);
  const listRef = useRef<FlatList<any>>(null);
  const scrollHide = useRef(makeScrollHideHandler()).current;
  const carouselRef = useRef<FlatList<Game>>(null);
  const carouselScrollIsProgrammatic = useRef(false);

  // "Search this area" (map-plan.md §P3) frames a viewport the user panned to, independent of
  // the device-location + radius filter that drives the list. Null = map follows the filters
  // like everything else.
  const [mapAreaOverride, setMapAreaOverride] = useState<{ lat: number; lng: number; radiusKm: number } | null>(null);
  // Clears geometry above the tab bar's floating action rail (BottomRail's own bottom math,
  // see lib/nav.ts) — the sheet must never sit under the still-visible MapToggle/HostFab.
  const mapSheetBottomSpace = tabBarBottom(insets.bottom) + NAV.BAR_HEIGHT + NAV.RAIL_GAP + NAV.RAIL_HEIGHT + NAV.RAIL_GAP;
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

  // A "search this area" override is a temporary exploration of the map, not a filter change —
  // closing the map (either control) drops it so reopening starts back at the real filters.
  useEffect(() => {
    if (discoverView !== "map") setMapAreaOverride(null);
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
  const pinnedGames = games.filter((g) => g.venueLat != null && g.venueLng != null);

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
  const mapPinnedGames = (mapQuery.data ?? []).filter((g) => g.venueLat != null && g.venueLng != null);

  // Dim "no games here yet" pins (map-plan.md §5.10) — venues near the map viewport that have
  // none of the games already fetched above. Diffed client-side since venues aren't sport-scoped
  // and games don't carry a stable venue id (venueKeyOf's name+coordinate key is what nearby_games
  // already uses for venue identity — see its comment in GameMap.tsx).
  const venuesNearQuery = useVenuesForMap(mapCenter, mapRadiusKm, { enabled: discoverView === "map" });
  const noGameVenues = useMemo(() => {
    const gameVenueKeys = new Set(mapPinnedGames.map(venueKeyOf));
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
    const idx = mapPinnedGames.findIndex((g) => g.id === id);
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
    const g = mapPinnedGames[idx];
    if (g && g.venueLat != null && g.venueLng != null) {
      setSelectedGameId(g.id);
      mapRef.current?.focusOn(g.venueLat, g.venueLng);
    }
  };
  const handleMapSnapChange = (_snap: "peek" | "half" | "full", heightPx: number) => setSheetHeight(heightPx);

  const filterSummary = [
    levelFilters.length === 1 ? LEVEL_FILTERS.find((l) => l.slug === levelFilters[0])?.label : levelFilters.length > 1 ? "your levels" : null,
    WHEN_FILTERS.find((w) => w.key === whenFilter)?.label,
  ]
    .filter(Boolean)
    .join(" · ");

  const filterTokens = [
    sortBy !== "soonest" ? { label: SORT_OPTIONS.find((s) => s.key === sortBy)!.label, onRemove: () => setSortBy("soonest") } : null,
    discoverRadiusKm !== DEFAULT_DISCOVER_RADIUS_KM
      ? { label: `${discoverRadiusKm} km`, onRemove: () => setDiscoverRadiusKm(DEFAULT_DISCOVER_RADIUS_KM) }
      : null,
    maxCostPerPlayerCents != null
      ? { label: priceCapLabel(maxCostPerPlayerCents), onRemove: () => setMaxCostPerPlayerCents(null) }
      : null,
    hasSpotsOnly ? { label: "Has spots", onRemove: () => setHasSpotsOnly(false) } : null,
    verifiedOnly ? { label: "Verified", onRemove: () => setVerifiedOnly(false) } : null,
  ].filter((t): t is { label: string; onRemove: () => void } => t != null);

  // Rails, the pulse strip, and day-grouped sections only make sense when the list is in its
  // natural chronological order — a custom sort (cheapest, most spots…) falls back to a plain
  // flat list further down instead of fighting the shelves for a sense of order.
  const chronological = sortBy === "soonest";
  const viewerTierOrdinal = viewerTier?.ordinal ?? null;

  // Keying the list wrapper to the active filter set turns a filter change into a cross-fade
  // (D6) instead of a hard swap — React remounts the subtree, playing exit/enter on each change.
  const filterSignature = `${whenFilter}|${levelFilters.join(",")}|${sortBy}|${discoverRadiusKm}|${hasSpotsOnly}|${verifiedOnly}|${maxCostPerPlayerCents}`;

  const pulseQuery = useWeekPulseGames(userLocation);
  const pastGamesQuery = useMyPastGames();

  const pulseText = useMemo(() => {
    const pulseGames = pulseQuery.data;
    if (!pulseGames || pulseGames.length === 0) return null;
    const openSpots = pulseGames.reduce((sum, g) => sum + spotsLeft(g), 0);
    return `${pulseGames.length} game${pulseGames.length === 1 ? "" : "s"} nearby this week · ${openSpots} spot${openSpots === 1 ? "" : "s"} open`;
  }, [pulseQuery.data]);

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
    () => (chronological ? buildDiscoverRows(games, rails, pulseText) : []),
    [chronological, games, rails, pulseText]
  );
  const stickyHeaderIndices = useMemo(() => discoverRows.flatMap((r, i) => (r.kind === "day" ? [i] : [])), [discoverRows]);

  return (
    <Screen>
      <View className="px-5 pt-3 pb-2.5 flex-row justify-between items-start">
        <View>
          <View className="flex-row items-center gap-1">
            <Ionicons name="location-outline" size={12} color={colors.textTertiary} />
            <Text className="text-[13px] font-body-bold" style={{ color: colors.textTertiary }}>
              {locationLabel}
            </Text>
          </View>
          <Text className="font-display text-[26px] mt-0.5" style={{ color: colors.text }}>
            Discover
          </Text>
        </View>
        <NotificationBell />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingVertical: 4, alignItems: "center" }}
      >
        {WHEN_FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} active={whenFilter === f.key} onPress={() => setWhenFilter(f.key)} size="sm" />
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingVertical: 4, alignItems: "center" }}
      >
        <Chip
          label="Any level"
          active={levelFilters.length === 0}
          onPress={() => {
            levelTouched.current = true;
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
              levelTouched.current = true;
              toggleLevelFilter(l.slug);
            }}
            size="sm"
          />
        ))}
      </ScrollView>

      <View className="flex-row justify-end items-center px-5 pb-2.5 pt-1">
        <Pressable
          onPress={() => setFiltersOpen(true)}
          className="flex-row items-center gap-1.5 rounded-pill px-3.5 py-2.5 border"
          style={{ backgroundColor: colors.surfaceAlt, borderColor: colors.cardBorder }}
        >
          <Ionicons name="options-outline" size={14} color={colors.textDim} />
          <Text className="font-body-semibold text-[13px]" style={{ color: colors.textDim }}>
            Filters
          </Text>
          {advancedFilterCount > 0 && (
            <View className="rounded-full items-center justify-center" style={{ width: 16, height: 16, backgroundColor: colors.accent }}>
              <Text className="font-body-extrabold text-[10px]" style={{ color: colors.base }}>
                {advancedFilterCount}
              </Text>
            </View>
          )}
        </Pressable>
      </View>

      {filterTokens.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingBottom: 10 }}
        >
          {filterTokens.map((t) => (
            <Pressable
              key={t.label}
              onPress={t.onRemove}
              className="flex-row items-center gap-1 rounded-pill px-3 py-1.5 border"
              style={{ backgroundColor: "rgba(214,255,63,0.08)", borderColor: "rgba(214,255,63,0.25)" }}
            >
              <Text className="font-body-bold text-[12px]" style={{ color: colors.accent }}>
                {t.label}
              </Text>
              <Ionicons name="close" size={12} color={colors.accent} />
            </Pressable>
          ))}
        </ScrollView>
      )}

      <FiltersSheet visible={filtersOpen} onClose={() => setFiltersOpen(false)} />

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
              stickyHeaderIndices={stickyHeaderIndices}
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
                if (item.kind === "pulse") return <WeekPulseStrip text={item.text} />;
                if (item.kind === "rail") return <Rail title={item.title} games={item.games} viewerTierOrdinal={viewerTierOrdinal} />;
                if (item.kind === "day") return <DayHeader label={item.label} compact={headerCompact} />;
                return (
                  <View className="px-5 pb-3">
                    <GameCard
                      game={item.game}
                      index={item.index}
                      onPress={() => router.push(`/game/${item.game.id}`)}
                      viewerTierOrdinal={viewerTierOrdinal}
                      showJoinAction
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
                <GameCard
                  game={item}
                  index={index}
                  onPress={() => router.push(`/game/${item.id}`)}
                  viewerTierOrdinal={viewerTierOrdinal}
                  showJoinAction
                />
              )}
            />
          )}
        </Animated.View>
      )}

      {discoverView === "map" && (
        // Map is a floating-button layer, not a mode swap (Airbnb pattern) — results stay
        // intact underneath; this overlay covers the screen and a 3-snap sheet keeps the
        // pinned list reachable without leaving the map. The toggle back to list lives in
        // BottomRail's left slot below — same control, same spot, label flips (Airbnb).
        <Animated.View
          entering={reduceMotion ? undefined : FadeIn.duration(200)}
          exiting={reduceMotion ? undefined : FadeOut.duration(150)}
          className="absolute inset-0"
          style={{ backgroundColor: colors.base }}
        >
          <GameMap
            ref={mapRef}
            games={mapPinnedGames}
            center={mapAreaOverride ? { lat: mapAreaOverride.lat, lng: mapAreaOverride.lng, isDeviceLocation: false } : userLocation}
            onSelectGame={handleSelectFromMap}
            selectedGameId={selectedGameId}
            radiusKm={mapAreaOverride ? null : discoverRadiusKm}
            bottomInset={sheetHeight}
            onSearchThisArea={(region) => setMapAreaOverride(region)}
            noGameVenues={noGameVenues}
            onSelectNoGameVenue={handleSelectNoGameVenue}
          />

          <MapSheet
            ref={mapSheetRef}
            pinnedGames={mapPinnedGames}
            viewerTierOrdinal={viewerTierOrdinal}
            bottomSpace={mapSheetBottomSpace}
            onCardPress={(id) => router.push(`/game/${id}`)}
            onCarouselSettle={handleCarouselSettle}
            carouselRef={carouselRef}
            onSnapChange={handleMapSnapChange}
            carouselStep={CAROUSEL_STEP}
            carouselGap={CAROUSEL_GAP}
            cardWidth={CAROUSEL_CARD_WIDTH}
            emptyState={
              <View className="items-center gap-2 px-6 pb-4">
                <Ionicons name="search-outline" size={26} color={colors.textTertiary} />
                <Text className="font-display-bold text-[15px] text-center" style={{ color: colors.text }}>
                  {mapAreaOverride ? "Nothing here yet" : "No games pinned nearby"}
                </Text>
                <Text className="text-[13px] text-center max-w-[240px]" style={{ color: colors.textSecondary }}>
                  {mapAreaOverride ? "No upcoming games in this part of the map." : "Widen your filters or be the first to host here."}
                </Text>
                <View className="flex-row gap-2 mt-1">
                  {mapAreaOverride && (
                    <Pressable
                      onPress={() => setMapAreaOverride(null)}
                      className="rounded-pill px-4 py-2.5 border"
                      style={{ borderColor: colors.cardBorder }}
                    >
                      <Text className="font-body-bold text-[13px]" style={{ color: colors.textSecondary }}>
                        Back to my area
                      </Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => router.push("/wizard")} className="rounded-pill px-4 py-2.5" style={{ backgroundColor: colors.accent }}>
                    <Text className="font-body-extrabold text-[13px]" style={{ color: colors.base }}>
                      Host a game
                    </Text>
                  </Pressable>
                </View>
              </View>
            }
          />
        </Animated.View>
      )}

      <BottomRail
        left={
          !showInitialLoading && (
            <MapToggle
              visible={pinnedGames.length > 0}
              isMap={discoverView === "map"}
              count={pinnedGames.length}
              onToggle={() => setDiscoverView(discoverView === "map" ? "list" : "map")}
            />
          )
        }
        right={!showInitialLoading && <HostFab />}
      />
    </Screen>
  );
}
