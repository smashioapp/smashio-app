import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, Dimensions, FlatList, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { useAppStore, WhenFilter, SortOption, DISCOVER_RADIUS_OPTIONS_KM, DEFAULT_DISCOVER_RADIUS_KM, PRICE_CAP_OPTIONS_CENTS } from "../../lib/store";
import { colors, TIERS } from "../../lib/theme";
import { useDiscoverGames, useWeekPulseGames, useMyPastGames } from "../../lib/queries/games";
import { useCreateAlert } from "../../lib/queries/alerts";
import { useProfileSports } from "../../lib/queries/profile";
import { useSession } from "../../lib/session";
import { useUserLocation, useLocationLabel } from "../../lib/location";
import { dayLabel } from "../../lib/format";
import { haptics } from "../../lib/haptics";
import { Screen } from "../../components/Screen";
import { Chip } from "../../components/Chip";
import { GameCard } from "../../components/GameCard";
import { SkillPill } from "../../components/SkillPill";
import { EmptyState } from "../../components/EmptyState";
import { GameMap, GameMapHandle } from "../../components/GameMap";
import { RefreshableList } from "../../components/RefreshableList";
import { GameCardSkeletonList } from "../../components/Skeleton";
import { Sheet } from "../../components/Sheet";
import { Rail } from "../../components/Rail";
import { Game, spotsLeft, levelFit, perPlayerCost } from "../../lib/mockData";

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

// Shrinks once the list has scrolled a little — a sticky header that stays full-size forever
// eats space the cards should have (D6).
function DayHeader({ label, compact }: { label: string; compact: boolean }) {
  const progress = useSharedValue(compact ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(compact ? 1 : 0, { duration: 180 });
  }, [compact]);
  const style = useAnimatedStyle(() => ({
    paddingTop: 12 - progress.value * 6,
    paddingBottom: 6 - progress.value * 2,
    transform: [{ scale: 1 - progress.value * 0.12 }],
  }));

  return (
    <Animated.View className="px-5" style={[{ backgroundColor: colors.base }, style]}>
      <Text className="font-display-bold text-[14px]" style={{ color: colors.textSecondary }}>
        {label}
      </Text>
    </Animated.View>
  );
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

// Compact card for the full-screen map's bottom carousel — a lighter footprint than
// GameCard so the map itself stays the star (Airbnb pattern: results and map coexist).
function MapCarouselCard({ game, viewerTierOrdinal, onPress }: { game: Game; viewerTierOrdinal: number | null; onPress: () => void }) {
  const open = spotsLeft(game);
  const full = open === 0;
  return (
    <Pressable
      onPress={onPress}
      className="rounded-2xl p-3.5 border"
      style={{ width: CAROUSEL_CARD_WIDTH, backgroundColor: colors.card, borderColor: colors.cardBorder }}
    >
      <View className="flex-row justify-between items-start">
        <View className="flex-1 pr-2">
          <Text className="font-display-bold text-[15px]" style={{ color: colors.text }} numberOfLines={1}>
            {game.venue}
          </Text>
          <Text className="text-[12.5px] mt-0.5" style={{ color: colors.textTertiary }} numberOfLines={1}>
            {game.date} · {game.time} · {game.suburb}
          </Text>
        </View>
        <SkillPill skill={game.skill} fit={levelFit(viewerTierOrdinal, game.skillTierOrdinal)} />
      </View>
      <View className="flex-row justify-between items-center mt-2">
        <Text className="font-display-bold text-[15px]" style={{ color: colors.accent }}>
          ${perPlayerCost(game.cost, game.maxPlayers)}
          <Text className="font-body-semibold text-[12px]" style={{ color: colors.textTertiary }}>
            {" "}
            / player
          </Text>
        </Text>
        <Text className="text-[12.5px] font-body-bold" style={{ color: full ? colors.danger : colors.textMuted }}>
          {full ? "Full" : `${open} spot${open === 1 ? "" : "s"} left`}
        </Text>
      </View>
    </Pressable>
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
  const mapRef = useRef<GameMapHandle>(null);
  const carouselRef = useRef<FlatList<Game>>(null);
  const carouselScrollIsProgrammatic = useRef(false);

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
    const idx = pinnedGames.findIndex((g) => g.id === id);
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
    const g = pinnedGames[idx];
    if (g && g.venueLat != null && g.venueLng != null) {
      setSelectedGameId(g.id);
      mapRef.current?.focusOn(g.venueLat, g.venueLng);
    }
  };

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
              data={games}
              keyExtractor={(g: Game) => g.id}
              contentContainerStyle={{ padding: 20, paddingTop: 4, paddingBottom: 110, gap: 12, flexGrow: 1 }}
              refreshing={discoverQuery.isRefetching}
              onRefresh={() => discoverQuery.refetch()}
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
              data={discoverRows}
              keyExtractor={(r: DiscoverRow) => r.id}
              stickyHeaderIndices={stickyHeaderIndices}
              contentContainerStyle={{ paddingTop: 4, paddingBottom: 110 }}
              refreshing={discoverQuery.isRefetching}
              onRefresh={() => discoverQuery.refetch()}
              onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
                const compact = e.nativeEvent.contentOffset.y > 24;
                setHeaderCompact((prev) => (prev === compact ? prev : compact));
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
              data={games}
              keyExtractor={(g: Game) => g.id}
              contentContainerStyle={{ padding: 20, paddingTop: 4, paddingBottom: 110, gap: 12 }}
              refreshing={discoverQuery.isRefetching}
              onRefresh={() => discoverQuery.refetch()}
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

      {!showInitialLoading && discoverView !== "map" && pinnedGames.length > 0 && (
        <Pressable
          onPress={() => setDiscoverView("map")}
          className="absolute flex-row items-center gap-1.5 rounded-pill px-4 py-3 border"
          style={{ bottom: 96, alignSelf: "center", backgroundColor: colors.text, borderColor: colors.text }}
        >
          <Ionicons name="map-outline" size={15} color={colors.base} />
          <Text className="font-body-extrabold text-[13.5px]" style={{ color: colors.base }}>
            Map
          </Text>
        </Pressable>
      )}

      {discoverView === "map" && (
        // Map is a floating-button layer, not a mode swap (Airbnb pattern) — results stay
        // intact underneath; this overlay covers the screen and a snap carousel keeps the
        // pinned list reachable without leaving the map.
        <View className="absolute inset-0" style={{ backgroundColor: colors.base }}>
          <GameMap ref={mapRef} games={pinnedGames} center={userLocation} onSelectGame={handleSelectFromMap} selectedGameId={selectedGameId} />

          <Pressable
            onPress={() => setDiscoverView("list")}
            className="absolute rounded-full items-center justify-center border"
            style={{ top: 14, left: 16, width: 38, height: 38, backgroundColor: colors.card, borderColor: colors.cardBorder }}
          >
            <Ionicons name="close" size={18} color={colors.text} />
          </Pressable>
          <View
            className="absolute rounded-pill px-3 py-1.5 border"
            style={{ top: 20, right: 16, backgroundColor: colors.card, borderColor: colors.cardBorder }}
          >
            <Text className="font-body-bold text-[12.5px]" style={{ color: colors.textSecondary }}>
              {pinnedGames.length} game{pinnedGames.length === 1 ? "" : "s"}
            </Text>
          </View>

          {pinnedGames.length > 0 && (
            <FlatList
              ref={carouselRef}
              data={pinnedGames}
              keyExtractor={(g: Game) => g.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={CAROUSEL_STEP}
              decelerationRate="fast"
              contentContainerStyle={{ gap: CAROUSEL_GAP, paddingHorizontal: 20 }}
              style={{ position: "absolute", left: 0, right: 0, bottom: 24 }}
              onMomentumScrollEnd={handleCarouselSettle}
              renderItem={({ item }: { item: Game }) => (
                <MapCarouselCard game={item} viewerTierOrdinal={viewerTierOrdinal} onPress={() => router.push(`/game/${item.id}`)} />
              )}
            />
          )}
        </View>
      )}
    </Screen>
  );
}
