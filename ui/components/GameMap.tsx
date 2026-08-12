import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { View, Text } from "react-native";
import MapView, { Marker, Region } from "react-native-maps";
import { colors, tierColor } from "../lib/theme";
import { formatTimeShort } from "../lib/format";
import type { Game } from "../lib/mockData";

export type GameMapProps = {
  games: Game[];
  center: { lat: number; lng: number; isDeviceLocation: boolean };
  onSelectGame: (gameId: string) => void;
  selectedGameId?: string | null;
};

export type GameMapHandle = {
  focusOn: (lat: number, lng: number) => void;
};

type Cluster = { key: string; lat: number; lng: number; games: Game[] };

// Grid-bucket clustering: cell size scales with the current zoom (latitudeDelta) so pins
// merge into a count bubble when zoomed out and split apart as the user zooms in — no
// extra clustering dependency needed for the pin counts this app deals with.
function clusterGames(games: Game[], latitudeDelta: number): Cluster[] {
  const cell = Math.max(latitudeDelta * 0.15, 0.0005);
  const buckets = new Map<string, Game[]>();
  for (const g of games) {
    if (g.venueLat == null || g.venueLng == null) continue;
    const key = `${Math.round(g.venueLat / cell)}:${Math.round(g.venueLng / cell)}`;
    const list = buckets.get(key);
    if (list) list.push(g);
    else buckets.set(key, [g]);
  }
  return Array.from(buckets.entries()).map(([key, list]) => ({
    key,
    lat: list.reduce((s, g) => s + g.venueLat!, 0) / list.length,
    lng: list.reduce((s, g) => s + g.venueLng!, 0) / list.length,
    games: list,
  }));
}

function PinPill({ game, active }: { game: Game; active: boolean }) {
  const color = tierColor(game.skill);
  return (
    <View
      className="rounded-full px-2.5 py-1 border"
      style={{
        backgroundColor: active ? color : colors.card,
        borderColor: color,
        borderWidth: active ? 0 : 1.5,
        transform: [{ scale: active ? 1.15 : 1 }],
      }}
    >
      <Text className="font-body-extrabold text-[11px]" style={{ color: active ? colors.base : color }}>
        {formatTimeShort(game.startsAt)}
      </Text>
    </View>
  );
}

function ClusterBubble({ count }: { count: number }) {
  return (
    <View
      className="rounded-full items-center justify-center border"
      style={{ width: 32, height: 32, backgroundColor: colors.accent, borderColor: colors.base, borderWidth: 2 }}
    >
      <Text className="font-body-extrabold text-[12.5px]" style={{ color: colors.base }}>
        {count}
      </Text>
    </View>
  );
}

// Native only — see GameMap.web.tsx. react-native-maps pulls in Fabric codegen specs
// (Marker, Callout, ...) that react-native-web can't evaluate, so this file must never
// load on web; Metro's .web.tsx platform split keeps the import out of that bundle.
export const GameMap = forwardRef<GameMapHandle, GameMapProps>(function GameMap(
  { games, center, onSelectGame, selectedGameId = null },
  ref
) {
  const mapRef = useRef<MapView>(null);
  const initialDelta = center.isDeviceLocation ? 0.08 : 0.3;
  const [delta, setDelta] = useState(initialDelta);

  useImperativeHandle(ref, () => ({
    focusOn: (lat: number, lng: number) => {
      mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: delta, longitudeDelta: delta }, 260);
    },
  }));

  const clusters = useMemo(() => clusterGames(games, delta), [games, delta]);

  return (
    <MapView
      ref={mapRef}
      style={{ flex: 1 }}
      initialRegion={{
        latitude: center.lat,
        longitude: center.lng,
        latitudeDelta: initialDelta,
        longitudeDelta: initialDelta,
      }}
      showsUserLocation={center.isDeviceLocation}
      onRegionChangeComplete={(r: Region) => setDelta(r.latitudeDelta)}
    >
      {clusters.map((c) =>
        c.games.length === 1 ? (
          <Marker
            key={c.key}
            coordinate={{ latitude: c.lat, longitude: c.lng }}
            onPress={() => onSelectGame(c.games[0].id)}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={c.games[0].id === selectedGameId ? 10 : 1}
          >
            <PinPill game={c.games[0]} active={c.games[0].id === selectedGameId} />
          </Marker>
        ) : (
          <Marker
            key={c.key}
            coordinate={{ latitude: c.lat, longitude: c.lng }}
            onPress={() =>
              mapRef.current?.animateToRegion(
                { latitude: c.lat, longitude: c.lng, latitudeDelta: delta / 2.2, longitudeDelta: delta / 2.2 },
                300
              )
            }
          >
            <ClusterBubble count={c.games.length} />
          </Marker>
        )
      )}
    </MapView>
  );
});
