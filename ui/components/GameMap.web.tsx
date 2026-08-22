import { forwardRef } from "react";
import { View, Text } from "react-native";
import { colors } from "../lib/theme";
import type { GameMapProps, GameMapHandle, CourtZoom, NoGameVenue } from "./GameMap";
import type { Game } from "../lib/mockData";

// Same venue, same coordinate — kept in sync with GameMap.tsx's venueKeyOf/venueKeyOfCoords
// since Discover imports these from this platform-resolved module too.
export function venueKeyOf(g: Game): string {
  return `${g.venue}@${g.venueLat!.toFixed(4)},${g.venueLng!.toFixed(4)}`;
}

export function venueKeyOfCoords(name: string, lat: number, lng: number): string {
  return `${name}@${lat.toFixed(4)},${lng.toFixed(4)}`;
}

// Discover imports the court-visibility rule from this platform-resolved module too. There is no
// map (and so no zoom) on web, so every court is "visible" — the sheet's list is all there is.
export function visibleCourtsFor<T extends NoGameVenue>(venues: T[], _center: { lat: number; lng: number }, _zoom: CourtZoom): T[] {
  return venues;
}

// react-native-maps has no web-safe build (native codegen components crash react-native-web).
// Map view is native-only for now; web preview gets a plain notice instead of a crash.
export const GameMap = forwardRef<GameMapHandle, GameMapProps>(function GameMap(_props, _ref) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text className="font-body-bold text-[14.5px] text-center" style={{ color: colors.textSecondary }}>
        Map view is available in the mobile app.
      </Text>
    </View>
  );
});
