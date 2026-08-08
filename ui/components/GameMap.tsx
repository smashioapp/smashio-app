import MapView, { Marker } from "react-native-maps";
import { tierColor } from "../lib/theme";
import type { Game } from "../lib/mockData";

export type GameMapProps = {
  games: Game[];
  center: { lat: number; lng: number; isDeviceLocation: boolean };
  onSelectGame: (gameId: string) => void;
};

// Native only — see GameMap.web.tsx. react-native-maps pulls in Fabric codegen specs
// (Marker, Callout, ...) that react-native-web can't evaluate, so this file must never
// load on web; Metro's .web.tsx platform split keeps the import out of that bundle.
export function GameMap({ games, center, onSelectGame }: GameMapProps) {
  return (
    <MapView
      style={{ flex: 1 }}
      initialRegion={{
        latitude: center.lat,
        longitude: center.lng,
        latitudeDelta: center.isDeviceLocation ? 0.08 : 0.3,
        longitudeDelta: center.isDeviceLocation ? 0.08 : 0.3,
      }}
      showsUserLocation={center.isDeviceLocation}
    >
      {games.map((g) => (
        <Marker
          key={g.id}
          coordinate={{ latitude: g.venueLat!, longitude: g.venueLng! }}
          pinColor={tierColor(g.skill)}
          onPress={() => onSelectGame(g.id)}
        />
      ))}
    </MapView>
  );
}
