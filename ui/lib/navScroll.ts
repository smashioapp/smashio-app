import { makeMutable, withTiming } from "react-native-reanimated";
import { timing } from "./motion";

// 0 = bar fully expanded, 1 = minimised to a slim pill. TabBar reads this; screens write to it
// from their own onScroll. A module-level shared value (not a hook/context) is the only way to
// share one Reanimated value across the bar and every tab screen, since the bar lives outside
// each screen's React subtree.
export const navMinimize = makeMutable(0);

const HIDE_THRESHOLD = 12;
const DIRECTION_THRESHOLD = 4;

// Returns a plain (y: number) => void a screen's onScroll can call directly — no Animated
// wrapper needed, shared values accept assignment from the JS thread same as the UI thread.
export function makeScrollHideHandler() {
  let lastY = 0;
  return (y: number) => {
    const dy = y - lastY;
    lastY = y;
    if (y <= HIDE_THRESHOLD) {
      navMinimize.value = withTiming(0, timing(220));
      return;
    }
    if (dy > DIRECTION_THRESHOLD) navMinimize.value = withTiming(1, timing(220));
    else if (dy < -DIRECTION_THRESHOLD) navMinimize.value = withTiming(0, timing(220));
  };
}

// Re-pressing the already-active tab scrolls its list to top (standard iOS behaviour). Screens
// register an imperative scrollToTop callback under their route name; TabBar looks it up on press.
const scrollToTopRegistry: Record<string, () => void> = {};

export function registerScrollToTop(route: string, fn: () => void) {
  scrollToTopRegistry[route] = fn;
}

export function unregisterScrollToTop(route: string) {
  delete scrollToTopRegistry[route];
}

export function scrollRouteToTop(route: string) {
  scrollToTopRegistry[route]?.();
}
