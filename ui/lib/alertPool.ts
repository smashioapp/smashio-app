import { useCallback, useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { useSession } from "./session";
import { useHasHomePoint, useProfile, useProfileSports } from "./queries/profile";
import { useNotificationPrefs } from "./queries/notificationPrefs";
import { identify } from "./analytics";

// The alert pool (gtm-strategy §4, short-a-player-ux-plan.md §6): a player is in it when they
// have a home point, a level, the `alerts` pref on and push allowed. Each missing piece is its
// own state with its own one-tap fix, in the order a player can act on them.
export type AlertPoolState = "on" | "off" | "no_home" | "push_denied";

// Mirrors spot_open_recipients (20260924000000_spot_alerts.sql): the default ring is 10km, two
// spot alerts a day at most, and 10pm to 7am unless the player set their own quiet hours.
export const SPOT_ALERT_RADIUS_KM = 10;
export const SPOT_ALERTS_PER_DAY = 2;

function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
}

export function usePushPermission(): { status: Notifications.PermissionStatus | null; refresh: () => void } {
  const [status, setStatus] = useState<Notifications.PermissionStatus | null>(null);
  const refresh = useCallback(() => {
    if (Platform.OS === "web") return;
    Notifications.getPermissionsAsync()
      .then((r) => setStatus(r.status))
      .catch(() => {});
  }, []);
  useEffect(() => {
    refresh();
    // Coming back from system Settings is the usual way this changes.
    const sub = AppState.addEventListener("change", (s) => s === "active" && refresh());
    return () => sub.remove();
  }, [refresh]);
  return { status, refresh };
}

export function useAlertPool() {
  const { session } = useSession();
  const userId = session?.user.id;
  const profileQuery = useProfile(userId);
  const sportsQuery = useProfileSports(userId);
  const prefsQuery = useNotificationPrefs({ enabled: !!userId });
  const homeQuery = useHasHomePoint(userId);
  const { status: pushStatus } = usePushPermission();

  const profile = profileQuery.data;
  const tierLabel = (sportsQuery.data?.[0]?.skill_tiers as { label: string } | null)?.label ?? null;
  const prefs = prefsQuery.data;
  const loaded = !!profile && !!prefs && homeQuery.data !== undefined;
  const hasHome = homeQuery.data === true;
  // Web has no push at all; don't nag a web preview about it.
  const pushDenied = pushStatus === Notifications.PermissionStatus.DENIED;

  let state: AlertPoolState = "on";
  if (prefs && !prefs.alerts) state = "off";
  else if (!hasHome) state = "no_home";
  else if (pushDenied) state = "push_denied";

  const quiet = prefs?.quietHoursEnabled ? `${formatClock(prefs.quietStart)}-${formatClock(prefs.quietEnd)}` : "10pm-7am";

  return {
    loaded,
    state,
    suburb: profile?.home_suburb ?? null,
    tierLabel,
    quiet,
  };
}

// gtm-strategy §9 scorecard row 2 (alert pool size) readable in PostHog without SQL: a person
// property, not an event, refreshed whenever the state changes while the app's open.
export function useReportAlertPoolState() {
  const { session } = useSession();
  const pool = useAlertPool();
  useEffect(() => {
    if (!session?.user.id || !pool.loaded) return;
    identify(session.user.id, { alert_pool_state: pool.state });
  }, [session?.user.id, pool.loaded, pool.state]);
}
