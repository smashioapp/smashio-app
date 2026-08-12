// Slice 9: live venue search backing the create wizard's venue step. Uses the same
// client-side Google Maps key as the map screen (EXPO_PUBLIC_GOOGLE_MAPS_API_KEY),
// restricted by bundle ID/SHA-1 in Google Cloud Console — see docs/backend-plan.md.
// No badminton-court verification: any place the host picks is accepted.
const PLACES_BASE = "https://maps.googleapis.com/maps/api/place";
const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

export type PlacePrediction = {
  placeId: string;
  mainText: string;
  secondaryText: string;
};

export type PlaceDetails = {
  googlePlaceId: string;
  name: string;
  address: string;
  suburb: string;
  state: string;
  lat: number;
  lng: number;
};

export function newSessionToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function searchPlaces(query: string, sessionToken: string): Promise<PlacePrediction[]> {
  if (!API_KEY || query.trim().length < 3) return [];
  const url =
    `${PLACES_BASE}/autocomplete/json?input=${encodeURIComponent(query)}` +
    `&types=establishment&components=country:au&sessiontoken=${sessionToken}&key=${API_KEY}`;
  const res = await fetch(url, { headers: { "X-Ios-Bundle-Identifier": "com.smashio.app" } });
  const json = await res.json();
  if (json.status !== "OK" && json.status !== "ZERO_RESULTS") {
    throw new Error(json.error_message ?? `Places autocomplete failed: ${json.status}`);
  }
  return (json.predictions ?? []).map((p: any) => ({
    placeId: p.place_id,
    mainText: p.structured_formatting?.main_text ?? p.description,
    secondaryText: p.structured_formatting?.secondary_text ?? "",
  }));
}

export async function getPlaceDetails(placeId: string, sessionToken: string): Promise<PlaceDetails> {
  const url =
    `${PLACES_BASE}/details/json?place_id=${placeId}` +
    `&fields=name,formatted_address,geometry,address_component&sessiontoken=${sessionToken}&key=${API_KEY}`;
  const res = await fetch(url, { headers: { "X-Ios-Bundle-Identifier": "com.smashio.app" } });
  const json = await res.json();
  if (json.status !== "OK") {
    throw new Error(json.error_message ?? `Places details failed: ${json.status}`);
  }
  const result = json.result;
  const components: { long_name: string; short_name: string; types: string[] }[] = result.address_components ?? [];
  const suburb = components.find((c) => c.types.includes("locality"))?.long_name ?? "";
  const state = components.find((c) => c.types.includes("administrative_area_level_1"))?.short_name ?? "";
  return {
    googlePlaceId: placeId,
    name: result.name,
    address: result.formatted_address,
    suburb,
    state,
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
  };
}
