import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import MapView, { Marker, Circle, PROVIDER_GOOGLE, Region } from "react-native-maps";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { colors, tierColor } from "../lib/theme";
import { formatTimeShort, dayLabel } from "../lib/format";
import { spotsLeft } from "../lib/mockData";
import { haptics } from "../lib/haptics";
import type { Game } from "../lib/mockData";

// Cloud-styled map ID (docs/map-plan.md §4). Not a secret — a public identifier bound to the
// iOS-restricted key. Must be literal: react-native-maps reads it from initialProps at native
// view construction (AIRGoogleMapManager.mm:51) and it can't change after mount.
const GOOGLE_MAP_ID = "65180cd85350fca689a8eb06";

export type NoGameVenue = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  hasProfile?: boolean;
  bookability?: string | null;
  dedicated?: boolean | null;
  courtsBadminton?: number | null;
  openingHours?: Record<string, [string, string][]> | null;
};

export type GameMapProps = {
  games: Game[];
  center: { lat: number; lng: number; isDeviceLocation: boolean };
  onSelectGame: (gameId: string) => void;
  selectedGameId?: string | null;
  radiusKm?: number | null;
  bottomInset?: number;
  noGameVenues?: NoGameVenue[];
  onSelectNoGameVenue?: (venue: NoGameVenue) => void;
  onSearchThisArea?: (region: { lat: number; lng: number; radiusKm: number }) => void;
  // Zoom bucket, not the raw latitudeDelta: the owner of `noGameVenues` decides which courts
  // are visible (visibleCourtsFor below) so the sheet can never count courts the map dropped.
  // Bucketed because raw delta in the route's state would re-render Discover on every pan.
  onZoomChange?: (zoom: CourtZoom) => void;
  // The viewer's own upcoming games (D7, discover-map-ux-plan.md) — excluded from `games` by
  // nearby_games' p_exclude_mine, but erasing them from the map entirely is disorienting, not
  // correct. Rendered as a visually distinct "Yours" pin, never folded into games/clustering.
  ownGames?: Game[];
};

export type GameMapHandle = {
  focusOn: (lat: number, lng: number) => void;
};

type VenueGroup = { key: string; lat: number; lng: number; games: Game[] };
type Cluster = { key: string; lat: number; lng: number; venues: VenueGroup[] };

// Same venue, same coordinate — nearby_games doesn't project a stable venue id (only
// games_public/my-games does), so venue identity here is name+coordinate. Good enough: two
// different venues never share a rounded lat/lng.
export function venueKeyOf(g: Game): string {
  return `${g.venue}@${g.venueLat!.toFixed(4)},${g.venueLng!.toFixed(4)}`;
}

export function venueKeyOfCoords(name: string, lat: number, lng: number): string {
  return `${name}@${lat.toFixed(4)},${lng.toFixed(4)}`;
}

function groupByVenue(games: Game[]): VenueGroup[] {
  const map = new Map<string, VenueGroup>();
  for (const g of games) {
    if (g.venueLat == null || g.venueLng == null) continue;
    const key = venueKeyOf(g);
    const existing = map.get(key);
    if (existing) existing.games.push(g);
    else map.set(key, { key, lat: g.venueLat, lng: g.venueLng, games: [g] });
  }
  return Array.from(map.values());
}

// Grid-bucket clustering over venue groups (not raw games) — a venue with 3 games is one
// pin, and only distinct venues merge into a count bubble when zoomed out.
function clusterVenues(venues: VenueGroup[], latitudeDelta: number): Cluster[] {
  const cell = Math.max(latitudeDelta * 0.15, 0.0005);
  const buckets = new Map<string, VenueGroup[]>();
  for (const v of venues) {
    const key = `${Math.round(v.lat / cell)}:${Math.round(v.lng / cell)}`;
    const list = buckets.get(key);
    if (list) list.push(v);
    else buckets.set(key, [v]);
  }
  return Array.from(buckets.entries()).map(([key, list]) => ({
    key,
    lat: list.reduce((s, v) => s + v.lat, 0) / list.length,
    lng: list.reduce((s, v) => s + v.lng, 0) / list.length,
    venues: list,
  }));
}

function gameLabel(game: Game): string {
  const isToday = dayLabel(game.startsAt, new Date(), { todayLabel: "Today" }) === "Today";
  return isToday ? formatTimeShort(game.startsAt) : `$${game.cost}`;
}

function startsWithinMs(game: Game, windowMs: number): boolean {
  const diff = new Date(game.startsAt).getTime() - Date.now();
  return diff > 0 && diff < windowMs;
}

// Marker content re-rasterizes every frame while tracksViewChanges is true — the perf
// landmine map-plan.md flags. Default off; flip on briefly (long enough for one native
// layout pass, or the full pulse window) whenever content actually changes.
function useTracksViewChanges(deps: unknown[], settleMs: number): boolean {
  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    setTracks(true);
    const t = setTimeout(() => setTracks(false), settleMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return tracks;
}

function PinPill({ game, active }: { game: Game; active: boolean }) {
  const color = tierColor(game.skill);
  const open = spotsLeft(game) > 0;
  return (
    <View
      className="rounded-full px-2.5 py-1 border"
      style={{
        backgroundColor: active ? color : colors.card,
        borderColor: color,
        borderWidth: active ? 0 : 1.5,
        opacity: open || active ? 1 : 0.45,
        transform: [{ scale: active ? 1.15 : 1 }],
        shadowColor: "#000",
        shadowOffset: { width: 0, height: active ? 6 : 2 },
        shadowOpacity: active ? 0.4 : 0.2,
        shadowRadius: active ? 14 : 4,
        elevation: active ? 6 : 2,
      }}
    >
      <Text className="font-body-extrabold text-[11px]" style={{ color: active ? colors.base : color }}>
        {gameLabel(game)}
      </Text>
    </View>
  );
}

// Single game at a venue — pulses a few cycles on mount if it starts within 2h, then settles
// (tracksViewChanges must go false eventually or the perf landmine comes right back).
function GamePin({ game, active, onPress }: { game: Game; active: boolean; onPress: () => void }) {
  const soon = startsWithinMs(game, 2 * 60 * 60 * 1000);
  const scale = useSharedValue(1);
  const tracks = useTracksViewChanges([active, soon, game.id], soon ? 1700 : 60);

  useEffect(() => {
    if (!soon) return;
    scale.value = withSequence(
      withTiming(1.12, { duration: 380 }),
      withTiming(1, { duration: 380 }),
      withTiming(1.12, { duration: 380 }),
      withTiming(1, { duration: 380 })
    );
  }, [soon, game.id]);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Marker
      coordinate={{ latitude: game.venueLat!, longitude: game.venueLng! }}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      anchor={{ x: 0.5, y: 1 }}
      zIndex={active ? 10 : 1}
      tracksViewChanges={tracks}
    >
      <Animated.View style={pulseStyle}>
        <PinPill game={game} active={active} />
      </Animated.View>
    </Marker>
  );
}

// Venue with more than one upcoming game — one pin reading "N games" instead of stacked pills.
function VenuePin({ venue, active, onPress }: { venue: VenueGroup; active: boolean; onPress: () => void }) {
  const anyOpen = venue.games.some((g) => spotsLeft(g) > 0);
  const tracks = useTracksViewChanges([active, venue.games.length], 60);
  return (
    <Marker
      coordinate={{ latitude: venue.lat, longitude: venue.lng }}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      anchor={{ x: 0.5, y: 1 }}
      zIndex={active ? 10 : 1}
      tracksViewChanges={tracks}
    >
      <View
        className="rounded-full px-2.5 py-1.5 border"
        style={{
          backgroundColor: active ? colors.accent : colors.card,
          borderColor: colors.accent,
          borderWidth: active ? 0 : 1.5,
          opacity: anyOpen || active ? 1 : 0.45,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: active ? 6 : 2 },
          shadowOpacity: active ? 0.4 : 0.2,
          shadowRadius: active ? 14 : 4,
          elevation: active ? 6 : 2,
        }}
      >
        <Text className="font-body-extrabold text-[11px]" style={{ color: active ? colors.base : colors.accent }}>
          {venue.games.length} games
        </Text>
      </View>
    </Marker>
  );
}

// Cluster copy names the noun (§4.3) — "12 games" reads as a fact, a bare "12" reads as a
// badge count with no referent. Bubble widens for the two-digit-plus-label case rather than
// truncating; there's no ambiguity about what's being counted at any cluster size we hit.
function ClusterBubble({ cluster, onPress }: { cluster: Cluster; onPress: () => void }) {
  const count = cluster.venues.reduce((s, v) => s + v.games.length, 0);
  const tracks = useTracksViewChanges([count], 60);
  return (
    <Marker coordinate={{ latitude: cluster.lat, longitude: cluster.lng }} onPress={onPress} tracksViewChanges={tracks}>
      <View
        className="rounded-full items-center justify-center border px-2"
        style={{ minWidth: 32, height: 32, backgroundColor: colors.accent, borderColor: colors.base, borderWidth: 2 }}
      >
        <Text className="font-body-extrabold text-[12.5px]" style={{ color: colors.base }}>
          {count} {count === 1 ? "game" : "games"}
        </Text>
      </View>
    </Marker>
  );
}

// Court pin (P1, discover-map-ux-plan.md §4.2) — one size, one colour, no glyph. The medal
// (dedicated), lock (club/members-only) and hollow-ring (non-directory) variants this used to
// branch on are "properties of the place", not the pin shape — they now live on the court card
// in the sheet, where there's room for the word "Members only" instead of a 9px icon that fails
// the out-of-context icon test (NN/g) before it's even run.
function NoGameVenuePin({ venue, onPress, showLabel }: { venue: NoGameVenue; onPress: () => void; showLabel: boolean }) {
  const tracks = useTracksViewChanges([showLabel], 60);
  return (
    <Marker
      coordinate={{ latitude: venue.lat, longitude: venue.lng }}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracks}
    >
      {/* D8: visual dot is 20px, but the tap target is the full 44x44pt Apple minimum — padding
          on a transparent wrapper, not a bigger dot. */}
      <View style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
        {/* Rounded-square marker (v3 design 3b) — distinguishes a court pin from a circular
            game pin at a glance, since there's no game here to colour-code. */}
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 6,
            backgroundColor: colors.surfaceAlt,
            borderColor: colors.text,
            borderWidth: 2,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.3,
            shadowRadius: 6,
            elevation: 3,
          }}
        />
        {showLabel && (
          <View
            className="absolute rounded-md px-1.5 py-0.5"
            style={{ top: 30, backgroundColor: "rgba(23,23,26,0.9)", maxWidth: 120 }}
          >
            <Text numberOfLines={1} className="font-body-bold text-[10px]" style={{ color: colors.textSecondary }}>
              {venue.name}
            </Text>
          </View>
        )}
      </View>
    </Marker>
  );
}

// z>=14 threshold for venue name labels (§4.3) — latitudeDelta shrinks as zoom increases;
// 0.006 is roughly city-block scale on a phone screen, empirically where "which court is that"
// becomes a real question.
const LABEL_ZOOM_DELTA = 0.006;

// Progressive disclosure of court pins by zoom (§4.3). Above COURT_HIDE_DELTA (roughly z<10,
// wider than a metro area in frame) individual court dots are noise — Airbnb's finding that
// showing every listing makes browsing harder, not easier. Between that and LABEL_ZOOM_DELTA
// (roughly z10-13) courts are capped to the nearest COURT_CAP, ranked dedicated-badminton
// venues first then distance. At LABEL_ZOOM_DELTA and below, every court in viewport renders
// (existing behaviour, unchanged).
// 0.1 (not 0.05): the device-location landing zoom is 0.08 (below) — must clear this threshold
// so courts mode shows its capped top-15 on first paint instead of an empty "zoom in" state.
export const COURT_HIDE_DELTA = 0.1;
export const COURT_CAP = 15;

export type CourtZoom = "wide" | "mid" | "close";

export function courtZoomBucket(delta: number): CourtZoom {
  if (delta > COURT_HIDE_DELTA) return "wide";
  if (delta >= LABEL_ZOOM_DELTA) return "mid";
  return "close";
}

function rankedCourts<T extends NoGameVenue>(venues: T[], center: { lat: number; lng: number }): T[] {
  return [...venues].sort((a, b) => {
    if (!!a.dedicated !== !!b.dedicated) return a.dedicated ? -1 : 1;
    const da = (a.lat - center.lat) ** 2 + (a.lng - center.lng) ** 2;
    const db = (b.lat - center.lat) ** 2 + (b.lng - center.lng) ** 2;
    return da - db;
  });
}

// The zoom rule lives here (it's a map concern) but is applied by the caller, so the same array
// feeds the pins and the sheet's count. GameMap itself filters nothing — a map that silently
// drops pins the sheet still counts is what made "20 courts near you" render as one dot.
export function visibleCourtsFor<T extends NoGameVenue>(venues: T[], center: { lat: number; lng: number }, zoom: CourtZoom): T[] {
  if (zoom === "wide") return [];
  if (zoom === "mid") return rankedCourts(venues, center).slice(0, COURT_CAP);
  return venues;
}

// "Yours" pin (D7) — the game pill's shape so it still reads as "a game", plus an accent ring
// and a "You" label prefix so it's unmistakably not one you could join. Never clusters, never
// dims when full, never counted in the sheet's game total.
function OwnGamePin({ game, active, onPress }: { game: Game; active: boolean; onPress: () => void }) {
  const color = tierColor(game.skill);
  const tracks = useTracksViewChanges([active, game.id], 60);
  return (
    <Marker
      coordinate={{ latitude: game.venueLat!, longitude: game.venueLng! }}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      anchor={{ x: 0.5, y: 1 }}
      zIndex={active ? 11 : 6}
      tracksViewChanges={tracks}
    >
      <View
        className="rounded-full px-2.5 py-1 border-2"
        style={{ backgroundColor: active ? color : colors.card, borderColor: colors.accent, transform: [{ scale: active ? 1.15 : 1 }] }}
      >
        <Text className="font-body-extrabold text-[11px]" style={{ color: active ? colors.base : color }}>
          You · {gameLabel(game)}
        </Text>
      </View>
    </Marker>
  );
}

function UserDot() {
  return (
    <View
      style={{
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: colors.accent,
        borderWidth: 3,
        borderColor: colors.base,
      }}
    />
  );
}

// Native only — see GameMap.web.tsx. react-native-maps pulls in Fabric codegen specs
// (Marker, Callout, ...) that react-native-web can't evaluate, so this file must never
// load on web; Metro's .web.tsx platform split keeps the import out of that bundle.
export const GameMap = forwardRef<GameMapHandle, GameMapProps>(function GameMap(
  {
    games,
    center,
    onSelectGame,
    selectedGameId = null,
    radiusKm = null,
    bottomInset = 24,
    noGameVenues = [],
    onSelectNoGameVenue,
    onSearchThisArea,
    ownGames = [],
    onZoomChange,
  },
  ref
) {
  const mapRef = useRef<MapView>(null);
  const initialDelta = center.isDeviceLocation ? 0.08 : 0.3;
  const [delta, setDelta] = useState(initialDelta);
  const [userPanned, setUserPanned] = useState(false);
  const [pendingRegion, setPendingRegion] = useState<Region | null>(null);
  const suppressNextFitRef = useRef(false);

  useImperativeHandle(ref, () => ({
    focusOn: (lat: number, lng: number) => {
      mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: delta, longitudeDelta: delta }, 260);
    },
  }));

  const venueGroups = useMemo(() => groupByVenue(games), [games]);
  const clusters = useMemo(() => clusterVenues(venueGroups, delta), [venueGroups, delta]);

  // Only the bucket crosses the component boundary, and only when it actually changes — a pan
  // that stays within one bucket must not re-render the Discover route.
  const zoom = courtZoomBucket(delta);
  useEffect(() => {
    onZoomChange?.(zoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  // Fit to results on open and whenever the result set actually changes (filters, refetch) —
  // not on every render, and not right after a "search this area" query the user just framed.
  const gamesKey = games.map((g) => g.id).join(",");
  useEffect(() => {
    if (suppressNextFitRef.current) {
      suppressNextFitRef.current = false;
      return;
    }
    const coords = games
      .filter((g) => g.venueLat != null && g.venueLng != null)
      .map((g) => ({ latitude: g.venueLat!, longitude: g.venueLng! }));
    if (coords.length === 0) return;
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: 100, right: 50, bottom: bottomInset + 60, left: 50 },
      animated: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gamesKey]);

  const handleSearchThisArea = () => {
    if (!pendingRegion || !onSearchThisArea) return;
    haptics.tap();
    // Half the viewport's vertical span, in km — close enough to "does this cover the area
    // the user just framed" without a bbox-capable RPC (nearby_games is radius-only).
    const radiusKm = Math.max(1, (pendingRegion.latitudeDelta * 111) / 2);
    onSearchThisArea({ lat: pendingRegion.latitude, lng: pendingRegion.longitude, radiusKm });
    suppressNextFitRef.current = true;
    setUserPanned(false);
    setPendingRegion(null);
  };

  return (
    <View style={{ flex: 1 }}>
      <MapView
      ref={mapRef}
      style={{ flex: 1 }}
      provider={PROVIDER_GOOGLE}
      googleMapId={Platform.OS === "ios" ? GOOGLE_MAP_ID : undefined}
      mapPadding={{ top: 0, right: 0, bottom: bottomInset, left: 0 }}
      initialRegion={{
        latitude: center.lat,
        longitude: center.lng,
        latitudeDelta: initialDelta,
        longitudeDelta: initialDelta,
      }}
      showsUserLocation={false}
      onPanDrag={() => setUserPanned(true)}
      onRegionChangeComplete={(r: Region) => {
        setDelta(r.latitudeDelta);
        if (userPanned) setPendingRegion(r);
      }}
    >
      {radiusKm != null && (
        <Circle
          center={{ latitude: center.lat, longitude: center.lng }}
          radius={radiusKm * 1000}
          strokeColor="rgba(214,255,63,0.35)"
          strokeWidth={1.5}
          fillColor="rgba(214,255,63,0.05)"
        />
      )}

      {center.isDeviceLocation && (
        <Marker
          coordinate={{ latitude: center.lat, longitude: center.lng }}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
          zIndex={5}
        >
          <UserDot />
        </Marker>
      )}

      {noGameVenues.map((v) => (
        <NoGameVenuePin key={v.id} venue={v} onPress={() => onSelectNoGameVenue?.(v)} showLabel={delta < LABEL_ZOOM_DELTA} />
      ))}

      {ownGames
        .filter((g) => g.venueLat != null && g.venueLng != null)
        .map((g) => (
          <OwnGamePin key={`own-${g.id}`} game={g} active={g.id === selectedGameId} onPress={() => onSelectGame(g.id)} />
        ))}

      {clusters.map((c) => {
        if (c.venues.length === 1) {
          const venue = c.venues[0];
          if (venue.games.length === 1) {
            const game = venue.games[0];
            return <GamePin key={c.key} game={game} active={game.id === selectedGameId} onPress={() => onSelectGame(game.id)} />;
          }
          const activeInVenue = venue.games.some((g) => g.id === selectedGameId);
          return (
            <VenuePin
              key={c.key}
              venue={venue}
              active={activeInVenue}
              onPress={() => onSelectGame(venue.games[0].id)}
            />
          );
        }
        return (
          <ClusterBubble
            key={c.key}
            cluster={c}
            onPress={() =>
              mapRef.current?.animateToRegion(
                { latitude: c.lat, longitude: c.lng, latitudeDelta: delta / 2.2, longitudeDelta: delta / 2.2 },
                300
              )
            }
          />
        );
      })}

      </MapView>

      {onSearchThisArea && userPanned && pendingRegion && (
        // D3 (discover-map-ux-plan.md): docked above the sheet's peek edge, not top:16 where it
        // collided with the floating search bar sharing that same coordinate space.
        <Pressable
          onPress={handleSearchThisArea}
          className="absolute self-center flex-row items-center gap-1.5 rounded-pill px-4 py-2.5 border"
          style={{ bottom: bottomInset + 16, backgroundColor: colors.text, borderColor: colors.text }}
        >
          <Ionicons name="refresh-outline" size={14} color={colors.base} />
          <Text className="font-body-extrabold text-[13px]" style={{ color: colors.base }}>
            Search this area
          </Text>
        </Pressable>
      )}
    </View>
  );
});
