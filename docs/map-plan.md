# Map plan — from "a map with our pins on it" to a SMASHIO map

Written 2026-08-12.

**Status:** Google Cloud setup **done** (§4). App code **not started** — §6 is the build order.

Scope: the Discover map overlay ([discover.tsx:754](../ui/app/(tabs)/discover.tsx)) and
[GameMap.tsx](../ui/components/GameMap.tsx). iOS only for now — Android isn't on the Play Store yet.

---

## 1. What's wrong today

Verified from the current build + code, not vibes:

| # | Problem | Cause | Fixed in |
|---|---------|-------|----------|
| 1 | Base map is loud: SCG stadium icon, "Malabar Headland National Park" tree, suburb names everywhere, teal/green land, blue water | iOS falls through to **Apple Maps** (no `provider` prop → MKMapView). Apple POIs on by default | P1 |
| 2 | Map palette fights the brand | Apple Maps dark = blue-grey + green. Brand base `#0A0A0B` / accent `#D6FF3F`. Apple Maps **cannot be restyled at all** | P1 |
| 3 | Our own pins can be off-screen | No fit-to-results on open; camera opens at the user's location with a fixed `initialDelta` | P2 |
| 4 | Carousel covers the map's bottom third and collides with the tab bar | `bottom: 24` absolute FlatList over a full-bleed tab bar; cards clipped | P2 |
| 5 | Filters/radius invisible on the map | Radius/level/time live only in list chrome; on the map "2 games" has no visible cause | P3 |
| 6 | Panning is dead | `onRegionChangeComplete` only tracks zoom for clustering — no "search this area" | P3 |
| 7 | Perf landmine | Custom `<View>` markers without `tracksViewChanges={false}` re-rasterize every frame | P2 |
| 8 | Low liquidity makes the map feel broken | 2 games across eastern Sydney = an empty map, nothing else on it is ours | P4 |
| 9 | Android will look different again | Stock Google Maps, unstyled, no key | deferred |

Points 1–2 are what the screenshot is about: **the map shows Apple's world, not ours.**

---

## 2. What Uber actually does

Uber owns its whole map stack (renderer + tile pipeline) — irrelevant at our scale. The
reproducible part is a design rule, not tech:

> Suppress the basemap to near-monochrome. Delete every label and icon that isn't
> orientation (roads, water, place names). Spend 100% of the colour budget on your own
> objects (car, route, pickup pin).

Our version: **roads + water + suburb names in greys, and the only colour on screen is a court.**

---

## 3. Provider decision

| | Control | Verdict |
|---|---|---|
| Apple Maps (today) | POIs can be hidden; palette locked to Apple's | ❌ can't be branded, ever |
| **Google Maps + Cloud Map ID** | ~100 feature types, brand palette, style edited server-side post-release | ✅ **chosen** |
| MapLibre + vector tiles | total control, no vendor branding | escape hatch if we outgrow Google |
| Mapbox | same as MapLibre, 25k MAU free then paid | not needed |

Supporting facts (verified in the installed package, not just docs):

- `react-native-maps@1.27.2` supports `googleMapId` on iOS **and** Android —
  `ios/AirGoogleMaps/AIRGoogleMap.mm:86`, `android/.../MapManager.java:136`.
- The Expo config plugin accepts `iosGoogleMapsApiKey` (`plugin/build/ios.js:50`), which is what
  flips the iOS build onto the GoogleMaps pod and writes `GMSApiKey` into Info.plist.
- Mobile map display is free and unlimited ("All mobile usage of the Maps SDK for iOS is
  unlimited"). Billing account must still be attached or the SDK 403s.
- `googleMapId` is read from initialProps at native view construction
  (`AIRGoogleMapManager.mm:51`) — it must be set on first render and cannot be swapped later.

Everything map-related stays behind `GameMap` / `GameMapHandle`, so swapping providers later is
one file, not a screen rewrite.

---

## 4. Cloud setup — DONE

| Item | Value |
|---|---|
| Project | `smashio-app` |
| Key | "Maps Platform API Key", restricted to **iOS apps** → bundle `com.smashio.app` |
| Key API restrictions | Maps SDK for iOS + Places API |
| Map ID (iOS) | **`65180cd85350fca689a8eb06`** (`smashio-ios`) |
| Dark slot | `SMASHIO Dark` — [map-style-dark.json](map-style-dark.json) |
| Light slot | `SMASHIO Light` — [map-style-light.json](map-style-light.json), same black palette |

Both slots carry the same dark palette on purpose: `app.config.js` sets
`userInterfaceStyle: "automatic"` and the app is dark-only, so a light-mode device must still
get the black map. No code picks the variant — the SDK does, from the interface style.

Palette the styles encode:

| Feature | Colour |
|---|---|
| Land | `#0E0E10` |
| Natural land / landcover | `#101013` |
| Water | `#08080A` |
| Parks | `#121417` |
| Local road | `#1B1B20` |
| Arterial | `#26262D` |
| Highway | `#2A2A31` |
| Road stroke | `#0A0A0B` |
| Road labels | `#6B6B73` |
| Suburb / city labels | `#5C5C64` |
| **Accent `#D6FF3F`** | **markers only, never the basemap** |

Hidden: all POI geometry + labels, buildings, transit stations, railway, highway shields, road
signs, parking aisles, borders, reservations, land parcels, water labels.

Caveats to remember:
- Style edits are **live to production instantly**. Before real volume, clone to a second
  map ID + style pair for staging.
- Propagation to devices can take a few hours.
- Killing `pointOfInterest` also killed `recreation.sportsComplex`. If real courts turn out to be
  useful landmarks, re-enable that one leaf with `label.visible: true`.

Deferred: Android key + Android map ID when the Play Store build happens. Do **not** loosen the
iOS key to cover Android — make a second key.

---

## 5. What we put on the map

Removing Apple's clutter is half of it; our layer is currently one pin type.

1. **Venue pins, not game pins.** Group by venue id first, then cluster geographically. A venue
   with 3 games is one pin reading `3 games`, never three overlapping time pills. Today's grid
   clustering merges by lat/lng cell, which is wrong at the same-address level.
2. **Pin states carry the decision:** tier colour ring (Beginner→Pro), solid = spots left,
   hollow/dimmed = full, accent ring = you're in it, subtle pulse = starts within 2h.
3. **Pin label = the deciding number.** Time for today's games, `$x` for later ones — matching
   what `MapCarouselCard` leads with.
4. **Radius ring** (`<Circle>`) from the discover filter, so "12 km" is visible not abstract.
5. **Branded user dot** instead of the OS blue dot.
6. **Fit to results on open** — `fitToCoordinates` with `edgePadding` clearing the sheet.
7. **"Search this area"** pill on pan → re-query by viewport. Makes the map a query surface
   instead of a read-only render of the list.
8. **Bottom sheet, not a floating carousel** — 3 snaps (peek / half / full), map camera padded
   to the sheet top. Pin tap raises the peek; dragging never hides pins.
9. **Empty-viewport state** reusing the existing fallback ladder (widen radius / alert me / host).
10. **Low-liquidity answer:** also pin known venues with *no* upcoming game, dimmed → tap gives
    "No games here yet — host one". An empty map becomes a hosting funnel.

---

## 6. Build order

### P1 — Google + brand style on iOS (half a day, needs a native rebuild)

`app.config.js` — the `react-native-maps` plugin block:
```js
[
  "react-native-maps",
  {
    // Android has no Play Store build yet and the key is iOS-restricted — Android map tiles
    // stay blank grey until a second, Android-restricted key exists.
    androidGoogleMapsApiKey: "",
    iosGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
  },
],
```

[GameMap.tsx](../ui/components/GameMap.tsx):
```tsx
import MapView, { Marker, PROVIDER_GOOGLE, Region } from "react-native-maps";

// Cloud-styled map ID (see docs/map-plan.md §4). Not a secret — it's a public identifier bound
// to the iOS-restricted key, and it must be literal because react-native-maps reads it from
// initialProps when the native view is constructed; it cannot be changed after mount.
const GOOGLE_MAP_ID = "65180cd85350fca689a8eb06";

<MapView
  provider={PROVIDER_GOOGLE}
  googleMapId={Platform.OS === "ios" ? GOOGLE_MAP_ID : undefined}
  mapPadding={{ top: 0, right: 0, bottom: CAROUSEL_CLEARANCE, left: 0 }}
  ...
/>
```
`PROVIDER_GOOGLE` is a no-op on Android (Google is the only provider there), so no branch needed
on the provider itself — only on the map ID, which is iOS-platform-bound.

[places.ts](../ui/lib/places.ts) — both `fetch` calls, or the key 403s now that it's app-restricted:
```ts
const res = await fetch(url, { headers: { "X-Ios-Bundle-Identifier": "com.smashio.app" } });
```

Also: `.env.example` comment is stale ("iOS uses Apple Maps, no key needed") — the key is now
iOS-only and Android is the one that's blank. Fix the wording.

Then `expo run:ios` (or an EAS dev build). Not OTA-able.

Verify: black map, no POI icons, no highway shields, street names present, Google logo
bottom-left **not covered** (licence requirement — that's what `mapPadding` is for).

### P2 — pins that don't hide or stutter (half a day, JS only)

- `tracksViewChanges={false}` on every custom marker after first render (state flag flipped in
  `onLayout`). Mandatory, not a nice-to-have.
- Group by venue before the geographic cluster pass in `clusterGames`.
- `fitToCoordinates(pinnedGames, { edgePadding })` on open and whenever the result set changes;
  fall back to the current `initialRegion` when there are no pins.
- Lift the carousel above the tab bar; keep `mapPadding` in sync with its height.

### P3 — the map as a query surface (1–2 days)

- Radius `<Circle>` + branded user dot.
- Pin states from §5.2 / §5.3.
- "Search this area" pill on `onRegionChangeComplete` → viewport query, wired to the existing
  discover query with a bbox instead of a radius.

### P4 — feel and liquidity (1–2 days)

- Bottom sheet with 3 snaps, camera padding follows the sheet.
- Marker press animation + haptics; selected-pin transition.
- Dimmed no-game venues → "host one here".

### Later / not now

- Android key + Android map ID at Play Store time.
- `places-proxy` edge function next to `ai-proxy`; the `X-Ios-Bundle-Identifier` header is
  spoofable and only stops casual bundle-scraping, not a determined attacker.
- Staging map ID + style clone once there's production traffic to protect.

---

## 7. Risks

- iOS switching to the GoogleMaps pod: larger binary (~10 MB), new native build, one more SDK
  disclosed in review.
- A bad cloud-style edit hits production instantly (see §4 caveats).
- Custom marker views are the usual Android perf cliff; `tracksViewChanges={false}` is required.
- Map-first discovery still looks empty until liquidity arrives — §5.10 is the mitigation.
- Google logo/attribution must stay visible, or the map licence is breached.

---

## 8. Sources

- Cloud styling, Maps SDK for iOS — https://developers.google.com/maps/documentation/ios-sdk/cloud-customization
- New-format style JSON reference — https://developers.google.com/maps/documentation/ios-sdk/cloud-customization/json-reference
- Maps SDK for iOS usage and billing — https://developers.google.com/maps/documentation/ios-sdk/usage-and-billing
- MapLibre React Native — https://maplibre.org/maplibre-react-native/docs/setup/expo/
- Mapbox pricing — https://www.mapbox.com/pricing
