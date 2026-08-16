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
  RAIL_HEIGHT: 56,
  RAIL_GAP: 12,
  CONTENT_GAP: 34,
  // v2 (docs/v2-design-plan.md §5) — the centre host button in TabBar. It's a 52px circle that
  // overhangs the bar's top edge by 30px, same silhouette as the design's tab-fab.
  FAB_SIZE: 52,
  FAB_RISE: 30,
} as const;

export function tabBarBottom(insetBottom: number): number {
  return Math.max(insetBottom, NAV.MIN_BOTTOM_INSET);
}

// Exact clearance a scrollable screen needs so its last row never sits under the floating bar.
// Used to take a `withRail` flag for the old BottomRail floating above it — that's gone (v2 §5),
// so every screen just clears the bar itself now.
export function useTabBarSpace(): number {
  const insets = useSafeAreaInsets();
  return tabBarBottom(insets.bottom) + NAV.BAR_HEIGHT + NAV.CONTENT_GAP;
}
