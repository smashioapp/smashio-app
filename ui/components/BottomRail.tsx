import { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NAV, tabBarBottom } from "../lib/nav";

// Single owner of the y-coordinate for every floating control above the tab bar. Nothing else
// is allowed to hand-position against the screen bottom (nav-plan Phase 2b) — that's what let
// the map pill and the old FAB collide in the first place.
export function BottomRail({ left, centre, right }: { left?: ReactNode; centre?: ReactNode; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const bottom = tabBarBottom(insets.bottom) + NAV.BAR_HEIGHT + NAV.RAIL_GAP;

  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: NAV.BAR_MARGIN, right: NAV.BAR_MARGIN, bottom, height: NAV.RAIL_HEIGHT }}
    >
      <View pointerEvents="box-none" style={{ flex: 1, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View pointerEvents="box-none">{left}</View>
        <View pointerEvents="box-none">{right}</View>
      </View>
      <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
        {centre}
      </View>
    </View>
  );
}
