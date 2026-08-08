import { useEffect, useState } from "react";
import * as Location from "expo-location";
import { DEFAULT_LAT, DEFAULT_LNG } from "./queries/games";

type UserLocation = { lat: number; lng: number; isDeviceLocation: boolean };

// One-shot coarse fetch on mount — good enough for centering the discover map/RPC radius.
// Falls back to the Melbourne CBD default on denial, timeout, or simulators without a fix.
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
