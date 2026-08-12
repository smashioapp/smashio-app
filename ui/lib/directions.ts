import { Alert, Linking, Platform } from "react-native";
import type { Game } from "./mockData";

type GameLocation = Pick<Game, "venue" | "venueLat" | "venueLng" | "venueAddress">;

function destinationUrls(game: GameLocation) {
  const label = encodeURIComponent(game.venue);
  const hasCoords = game.venueLat != null && game.venueLng != null;
  const dest = hasCoords ? `${game.venueLat},${game.venueLng}` : encodeURIComponent(game.venueAddress ?? game.venue);
  return {
    // https://maps.apple.com / https://www.google.com/maps/dir universal links — not the maps:/geo:
    // custom schemes, which prompt an App Store "Restore Maps?"/"no app found" dialog when the
    // stock app has been removed. No saddr/origin param means both default to current location.
    apple: `https://maps.apple.com/?daddr=${dest}&dirflg=d${hasCoords ? `&q=${label}` : ""}`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`,
    geo: hasCoords ? `geo:0,0?q=${dest}(${label})` : `geo:0,0?q=${dest}`,
  };
}

function launch(url: string) {
  Linking.openURL(url).catch(() => Alert.alert("Couldn't open maps", "No maps app is available on this device."));
}

export function openDirections(game: GameLocation) {
  const urls = destinationUrls(game);

  if (Platform.OS !== "ios") {
    // Android has no single default maps app, so the geo: intent lets the OS offer a chooser.
    launch(urls.geo);
    return;
  }

  Alert.alert("Get directions with", undefined, [
    { text: "Apple Maps", onPress: () => launch(urls.apple) },
    { text: "Google Maps", onPress: () => launch(urls.google) },
    { text: "Cancel", style: "cancel" },
  ]);
}
