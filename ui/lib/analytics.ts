import PostHog from "posthog-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Same gate pattern as lib/sentry.ts — blank key locally, real key from EAS/CI secrets in
// prod builds (docs/gtm-plan.md G1). Never blocks app boot if init fails.
const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

let client: PostHog | null = null;
if (apiKey) {
  client = new PostHog(apiKey, { host, disabled: __DEV__ && !process.env.EXPO_PUBLIC_POSTHOG_DEBUG });
}

// Ten events only (docs/gtm-plan.md §6) — resist adding more, the funnel becomes unreadable.
export type AnalyticsEvent =
  | "app_open_first"
  | "onboarding_step_completed"
  | "discover_viewed"
  | "game_viewed"
  | "join_requested"
  | "join_approved"
  | "game_played"
  | "game_published"
  | "share_sent"
  | "rating_submitted"
  | "push_opened"
  // social-plan.md §14 — feed release's own funnel, tracked separately from the ten above.
  // club_joined / club_game_published have no call site yet: C0 clubs are seed-only directory
  // pages with no membership feature (§13.3), add the tracking when a full club entity ships.
  | "feed_viewed"
  | "post_created"
  | "reply_created"
  | "post_to_game_converted"
  | "follow_added"
  | "club_joined"
  | "club_game_published";

type EventProperties = Record<string, string | number | boolean | undefined>;

function stripUndefined(properties?: EventProperties): Record<string, string | number | boolean> | undefined {
  if (!properties) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export function track(event: AnalyticsEvent, properties?: EventProperties) {
  client?.capture(event, stripUndefined(properties));
}

export function identify(userId: string, properties?: EventProperties) {
  client?.identify(userId, stripUndefined(properties));
}

export function resetAnalytics() {
  client?.reset();
}

const FIRST_OPEN_KEY = "smashio.analytics_opened_before";

// Fires once per install, not once per cold start — the ten-event list treats this as the
// per-channel attribution event, which is meaningless if it fires every launch.
export async function trackAppOpenFirst(initialUrl: string | null) {
  const seen = await AsyncStorage.getItem(FIRST_OPEN_KEY);
  if (seen) return;
  await AsyncStorage.setItem(FIRST_OPEN_KEY, "1");
  const params = initialUrl ? new URLSearchParams(initialUrl.split("?")[1] || "") : null;
  track("app_open_first", {
    source: initialUrl ? "deeplink" : "direct",
    ref: params?.get("ref") || undefined,
  });
}
