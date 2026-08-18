// Pure formatting helpers for push-dispatch, split out from index.ts so they can be unit
// tested without a running Supabase client / Deno.serve (createClient in index.ts requires
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars at import time).

const SYDNEY_TZ = "Australia/Sydney";

// starts_at is stored as timestamptz (UTC on the wire). This runs in Supabase's Edge Runtime,
// which has no "device timezone" the way a phone does — toLocaleString without an explicit
// timeZone falls back to the server's runtime tz (UTC), not Sydney. Every caller here needs the
// Sydney wall-clock time users actually see on their phone, so it must be pinned explicitly.
export function shortTime(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    timeZone: SYDNEY_TZ,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export type GameSummary = {
  venue_name: string;
  sport_name: string;
  starts_at: string;
};

export type PushBody = { title: string; body: string };

export function joinDecisionBody(
  status: "approved" | "rejected" | "removed",
  summary: GameSummary,
): PushBody {
  const verb = status === "approved"
    ? "You're in!"
    : status === "removed"
    ? "Removed from a game"
    : "Request declined";
  return {
    title: verb,
    body: `${summary.sport_name} at ${summary.venue_name}, ${shortTime(summary.starts_at)}`,
  };
}

export function gameCancelledBody(summary: GameSummary): PushBody {
  return {
    title: "Game cancelled",
    body: `${summary.venue_name}, ${shortTime(summary.starts_at)} is off. Your spot has been released.`,
  };
}

export function gameRescheduledBody(summary: GameSummary): PushBody {
  return {
    title: "New time for your game",
    body: `${summary.venue_name} now starts ${shortTime(summary.starts_at)}.`,
  };
}

export function alertMatchBody(summary: GameSummary): PushBody {
  return {
    title: "A game just matched your alert",
    body: `${summary.sport_name} at ${summary.venue_name}, ${shortTime(summary.starts_at)}`,
  };
}

export function reminderBody(summary: GameSummary): PushBody {
  return {
    title: "Game starting soon",
    body: `${summary.sport_name} at ${summary.venue_name} at ${shortTime(summary.starts_at)}`,
  };
}

export type MessageSummary = {
  chat_mode: string;
  sender_name: string;
  venue_name: string;
  kind: string;
  body: string;
};

export function messageBody(summary: MessageSummary): PushBody {
  const announce = summary.chat_mode === "announce";
  const title = `${announce ? "📣 " : ""}${summary.sender_name} · ${summary.venue_name}`;
  const body = summary.kind === "image"
    ? summary.body ? `📷 Photo · ${summary.body}` : "📷 Photo"
    : summary.body.slice(0, 140);
  return { title, body };
}

export function expoMessages(
  recipients: { profile_id: string; expo_token: string }[],
  title: string,
  body: string,
  data: Record<string, unknown>,
  channelId?: string,
) {
  return recipients
    .filter((r) => r.expo_token.startsWith("ExponentPushToken"))
    .map((r) => ({ to: r.expo_token, title, body, data, sound: "default", ...(channelId ? { channelId } : {}) }));
}
