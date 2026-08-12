import { Alert, Linking, Platform } from "react-native";
import type { Game } from "./mockData";

// https://maps.apple.com / geo: universal links — not the maps:/geo: custom schemes, which prompt
// an App Store "Restore Maps?"/"no app found" dialog when the stock app has been removed.
export function openDirections(game: Pick<Game, "venue" | "venueLat" | "venueLng" | "venueAddress">) {
  const label = encodeURIComponent(game.venue);
  const hasCoords = game.venueLat != null && game.venueLng != null;
  const query = hasCoords ? `${game.venueLat},${game.venueLng}` : encodeURIComponent(game.venueAddress ?? game.venue);
  const url = Platform.select({
    ios: hasCoords ? `https://maps.apple.com/?ll=${query}&q=${label}` : `https://maps.apple.com/?q=${query}`,
    android: hasCoords ? `geo:0,0?q=${query}(${label})` : `geo:0,0?q=${query}`,
    default: `https://www.google.com/maps/search/?api=1&query=${query}`,
  });
  Linking.openURL(url!).catch(() => Alert.alert("Couldn't open maps", "No maps app is available on this device."));
}
