import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, Linking, Platform } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { useAppStore, WhenFilter, SortOption, DISCOVER_RADIUS_OPTIONS_KM, DEFAULT_DISCOVER_RADIUS_KM, PRICE_CAP_OPTIONS_CENTS } from "../../lib/store";
import { colors, TIERS } from "../../lib/theme";
import { useDiscoverGames, useWeekPulseGames, useMyPastGames } from "../../lib/queries/games";
import { useProfileSports } from "../../lib/queries/profile";
import { useSession } from "../../lib/session";
import { useUserLocation, useLocationLabel } from "../../lib/location";
import { dayLabel } from "../../lib/format";
import { Screen } from "../../components/Screen";
import { Chip } from "../../components/Chip";
import { GameCard } from "../../components/GameCard";
import { EmptyState } from "../../components/EmptyState";
import { GameMap } from "../../components/GameMap";
import { RefreshableList } from "../../components/RefreshableList";
import { GameCardSkeletonList } from "../../components/Skeleton";
import { Sheet } from "../../components/Sheet";
import { Rail } from "../../components/Rail";
import { Game, spotsLeft, levelFit } from "../../lib/mockData";

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

function DayHeader({ label }: { label: string }) {
  return (
    <View className="px-5 pt-3 pb-1.5" style={{ backgroundColor: colors.base }}>
      <Text className="font-display-bold text-[14px]" style={{ color: colors.textSecondary }}>
        {label}
      </Text>
    </View>
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

function openDirections(game: Game) {
  if (game.venueLat == null || game.venueLng == null) return;
  const label = encodeURIComponent(game.venue);
  const url = Platform.select({
    ios: `https://maps.apple.com/?ll=${game.venueLat},${game.venueLng}&q=${label}`,
    android: `geo:0,0?q=${game.venueLat},${game.venueLng}(${label})`,
    default: `https://www.google.com/maps/search/?api=1&query=${game.venueLat},${game.venueLng}`,
  });
  Linking.openURL(url!);
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
  const selectedGame = pinnedGames.find((g) => g.id === selectedGameId) ?? pinnedGames[0];

  const advancedFilterCount = [
    discoverRadiusKm !== DEFAULT_DISCOVER_RADIUS_KM,
    hasSpotsOnly,
    verifiedOnly,
    maxCostPerPlayerCents != null,
    sortBy !== "soonest",
  ].filter(Boolean).length;

  const isFiltered = levelFilters.length > 0 || whenFilter !== "all" || advancedFilterCount > 0;
  const filterSummary = [
    levelFilters.length === 1 ? LEVEL_FILTERS.find((l) => l.slug === levelFilters[0])?.label : levelFilters.length > 1 ? "your levels" : null,
    WHEN_FILTERS.find((w) => w.key === whenFilter)?.label,
  ]
    .filter(Boolean)
    .join(" · ");
  const showInitialLoading = discoverQuery.isLoading;
  const showError = discoverQuery.isError && !showInitialLoading;

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

      <View className="flex-row justify-between items-center px-5 pb-2.5 pt-1">
        <View className="flex-row gap-1.5">
          <Chip label="List" active={discoverView === "list"} onPress={() => setDiscoverView("list")} />
          <Chip label="Map" active={discoverView === "map"} onPress={() => setDiscoverView("map")} />
        </View>
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
      ) : discoverView === "list" && games.length === 0 ? (
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
            ) : isFiltered ? (
              <EmptyState
                title={`Nothing at ${filterSummary} right now`}
                subtitle="Try a different level, a wider time range, or check back later."
                ctaLabel="Clear filters"
                onCta={() => {
                  levelTouched.current = true;
                  clearDiscoverFilters();
                }}
              />
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
      ) : discoverView === "list" && chronological ? (
        <RefreshableList
          data={discoverRows}
          keyExtractor={(r: DiscoverRow) => r.id}
          stickyHeaderIndices={stickyHeaderIndices}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 110 }}
          refreshing={discoverQuery.isRefetching}
          onRefresh={() => discoverQuery.refetch()}
          renderItem={({ item }: { item: DiscoverRow }) => {
            if (item.kind === "pulse") return <WeekPulseStrip text={item.text} />;
            if (item.kind === "rail") return <Rail title={item.title} games={item.games} viewerTierOrdinal={viewerTierOrdinal} />;
            if (item.kind === "day") return <DayHeader label={item.label} />;
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
      ) : discoverView === "list" ? (
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
      ) : (
        <View className="flex-1 relative overflow-hidden mx-0" style={{ backgroundColor: "#111113" }}>
          <GameMap games={pinnedGames} center={userLocation} onSelectGame={setSelectedGameId} />
          {selectedGame && (
            <View
              className="absolute left-4 right-4 rounded-2xl p-3.5 border"
              style={{ bottom: 92, backgroundColor: colors.card, borderColor: colors.cardBorder }}
            >
              <Pressable onPress={() => router.push(`/game/${selectedGame.id}`)} className="flex-row justify-between items-center">
                <View className="flex-1 pr-2">
                  <Text className="font-body-bold text-[14.5px]" style={{ color: colors.text }} numberOfLines={1}>
                    {selectedGame.venue}
                  </Text>
                  <Text className="text-[13px] mt-0.5" style={{ color: colors.textTertiary }}>
                    {selectedGame.date} · {selectedGame.time}
                  </Text>
                </View>
                <View className="flex-row items-center gap-1">
                  <Text className="font-body-extrabold text-[14.5px]" style={{ color: colors.accent }}>
                    View
                  </Text>
                  <Ionicons name="arrow-forward" size={13} color={colors.accent} />
                </View>
              </Pressable>
              <Pressable onPress={() => openDirections(selectedGame)} className="flex-row items-center gap-1 mt-2.5">
                <Ionicons name="navigate-outline" size={13} color={colors.textSecondary} />
                <Text className="text-[13.5px] font-body-bold" style={{ color: colors.textSecondary }}>
                  Directions
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </Screen>
  );
}
