import { useEffect, useState } from "react";
import * as Location from "expo-location";
import { DEFAULT_LAT, DEFAULT_LNG } from "./queries/games";

type UserLocation = { lat: number; lng: number; isDeviceLocation: boolean };

// The permission request + one coarse fix, as an explicit call. Pulled out of the hook so the
// onboarding pre-prompt (app/onboarding/nearby.tsx) owns the moment the OS dialog appears —
// a cold system prompt is a one-shot, and an explainer first is what earns the grant.
// Returns null when denied or when no fix is available.
export async function requestLocation(): Promise<{ lat: number; lng: number } | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") return null;
  try {
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  } catch {
    return null;
  }
}

// Reverse-geocodes a fix to a suburb name, using the same field precedence as the Discover
// header. Null when the lookup fails — callers must treat the suburb as optional.
export async function suburbForFix(lat: number, lng: number): Promise<string | null> {
  try {
    const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    return place?.district || place?.city || place?.subregion || null;
  } catch {
    return null;
  }
}

// One-shot coarse fetch on mount — good enough for centering the discover map/RPC radius.
// Falls back to the Sydney CBD default on denial, timeout, or simulators without a fix.
export function useUserLocation(): UserLocation {
  const [location, setLocation] = useState<UserLocation>({ lat: DEFAULT_LAT, lng: DEFAULT_LNG, isDeviceLocation: false });

  useEffect(() => {
    let cancelled = false;
    requestLocation().then((fix) => {
      if (fix && !cancelled) setLocation({ ...fix, isDeviceLocation: true });
    });
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
    // Keep "Near you" on a failed lookup — it shouldn't block the rest of the screen.
    suburbForFix(location.lat, location.lng).then((suburb) => {
      if (!cancelled && suburb) setLabel(suburb);
    });
    return () => {
      cancelled = true;
    };
  }, [location.isDeviceLocation, location.lat, location.lng]);

  return label;
}
