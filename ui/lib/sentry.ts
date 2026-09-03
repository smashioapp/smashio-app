import * as Sentry from "@sentry/react-native";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    debug: __DEV__,
  });
}

// Mutation errors are caught by react-query and handed to onError/Alert.alert — they never
// become an unhandled rejection, so the ErrorBoundary's captureException never sees them. Call
// this from a mutation's onError to get them into Sentry anyway. `op` tags which mutation failed
// (e.g. "game.create") so failures in a given flow can be filtered/alerted on.
export function captureMutationError(op: string, error: unknown, extra?: Record<string, unknown>) {
  if (!dsn) return;
  Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
    tags: { mutation: op },
    extra,
  });
}
