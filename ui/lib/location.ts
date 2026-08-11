import { useEffect, useState } from "react";
import * as Location from "expo-location";
import { DEFAULT_LAT, DEFAULT_LNG } from "./queries/games";

type UserLocation = { lat: number; lng: number; isDeviceLocation: boolean };

// One-shot coarse fetch on mount — good enough for centering the discover map/RPC radius.
// Falls back to the Sydney CBD default on denial, timeout, or simulators without a fix.
export function useUserLocation(): UserLocation {
  const [location, setLocation] = useState<UserLocation>({ lat: DEFAULT_LAT, lng: DEFAULT_LNG, isDeviceLocation: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      try {
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) {
          setLocation({ lat: position.coords.latitude, lng: position.coords.longitude, isDeviceLocation: true });
        }
      } catch {
        // Keep the fallback center — no location fix available.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return location;
}

// Reverse-geocodes a device fix to a suburb name for the Discover header. Never resolves to
// the hardcoded-city lie this replaced — a denied/unavailable fix (isDeviceLocation false) or
// a failed lookup both fall back to "Near you", which is honest either way.
export function useLocationLabel(location: UserLocation): string {
  const [label, setLabel] = useState("Near you");

  useEffect(() => {
    if (!location.isDeviceLocation) {
      setLabel("Near you");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [place] = await Location.reverseGeocodeAsync({ latitude: location.lat, longitude: location.lng });
        const suburb = place?.district || place?.city || place?.subregion;
        if (!cancelled && suburb) setLabel(suburb);
      } catch {
        // Keep "Near you" — a failed lookup shouldn't block the rest of the screen.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.isDeviceLocation, location.lat, location.lng]);

  return label;
}
