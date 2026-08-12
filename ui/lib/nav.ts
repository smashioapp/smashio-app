import { useSafeAreaInsets } from "react-native-safe-area-context";

// Single source of truth for the bottom tab bar + action rail geometry — was previously a mix
// of magic numbers in TabBar.tsx and a `paddingBottom: 110` literal copy-pasted into 8 screens.
export const NAV = {
  BAR_HEIGHT: 64,
  MINI_BAR_HEIGHT: 44,
  BAR_MARGIN: 16,
  MIN_BOTTOM_INSET: 12,
  ITEM_WIDTH: 56,
  ITEM_HEIGHT: 52,
  ICON: 24,
  RAIL_HEIGHT: 48,
  RAIL_GAP: 12,
  CONTENT_GAP: 34,
} as const;

export function tabBarBottom(insetBottom: number): number {
  return Math.max(insetBottom, NAV.MIN_BOTTOM_INSET);
}

// Exact clearance a scrollable screen needs so its last row never sits under the floating bar
// (and, on Discover/My Games, the action rail floating above it too).
export function useTabBarSpace(withRail = false): number {
  const insets = useSafeAreaInsets();
  const base = tabBarBottom(insets.bottom) + NAV.BAR_HEIGHT + NAV.CONTENT_GAP;
  return withRail ? base + NAV.RAIL_HEIGHT + NAV.RAIL_GAP : base;
}
