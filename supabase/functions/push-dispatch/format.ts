// Pure formatting helpers for push-dispatch, split out from index.ts so they can be unit
// tested without a running Supabase client / Deno.serve (createClient in index.ts requires
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars at import time).
//
// Copy rules (docs/notifications-plan.md §3): every body carries sport, venue and Sydney-local
// time; social events lead with the person's name; never "You have an update". Sport is
// interpolated from sports.name — no badminton strings in here (AGENTS.md).

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

// Clock only — for strings that already say which day ("Tomorrow, 7:00 pm").
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    timeZone: SYDNEY_TZ,
    hour: "numeric",
    minute: "2-digit",
  });
}

function sydneyDayNumber(iso: string | Date): number {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  // en-CA gives YYYY-MM-DD, which subtracts cleanly as a day index.
  const [y, m, day] = d.toLocaleDateString("en-CA", { timeZone: SYDNEY_TZ }).split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, day) / 86_400_000);
}

// "Today" / "Tomorrow" / "Saturday" — relative to Sydney's calendar day, not UTC's. The 24h
// reminder sweep self-heals after an outage, so it can fire well outside a literal 24 hours;
// this keeps the copy honest whenever it does.
export function dayLabel(iso: string, now: Date = new Date()): string {
  const delta = sydneyDayNumber(iso) - sydneyDayNumber(now);
  if (delta <= 0) return "Today";
  if (delta === 1) return "Tomorrow";
  return new Date(iso).toLocaleDateString("en-AU", { timeZone: SYDNEY_TZ, weekday: "long" });
}

export function money(cents: number | null | undefined): string {
  if (!cents) return "free";
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

// Deterministic variant picker. Notification copy that repeats word for word reads like a robot;
// copy that is random reads like a different app every time. Seeding on the game id gives each
// game its own consistent voice while the inbox as a whole stays varied.
export function pick<T>(variants: T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return variants[h % variants.length];
}

export type PushTier = "critical" | "normal" | "low";

// Android channel per category, created client-side in ui/lib/notifications.ts with matching
// importance. Keep the ids in sync with that file.
export type PushChannel = "chat" | "requests" | "game-updates" | "reminders" | "discovery";

// iOS notification categories (P3) with action buttons. Map which types get which category.
// P3 implements two action types: join_actions (approve/decline for A1) and chat_actions (reply for E1).
export type NotificationCategory = "join_actions" | "chat_actions" | null;
export const CATEGORY_FOR_TYPE: Record<string, NotificationCategory> = {
  join_request: "join_actions",
  message: "chat_actions",
};

export type GameSummary = {
  game_id: string;
  sport_name: string;
  venue_name: string;
  venue_suburb: string | null;
  starts_at: string;
  ends_at: string;
  court_label: string | null;
  host_id: string;
  host_name: string;
  max_players: number;
  approved_count: number;
  reserved_spots: number;
  spots_left: number;
  per_player_cents: number;
  tier_name: string;
  verification_status: string;
};

export type PushBody = { title: string; body: string };

// "{sport} at {venue}" — the phrase almost every body needs.
function where(s: GameSummary): string {
  return `${s.sport_name} at ${s.venue_name}`;
}

function courtSuffix(s: GameSummary): string {
  return s.court_label ? ` · ${s.court_label}` : "";
}

function spotsPhrase(s: GameSummary): string {
  if (s.spots_left <= 0) return "full";
  if (s.spots_left === 1) return "1 spot left";
  return `${s.spots_left} spots left`;
}

// --- A. Roster -------------------------------------------------------------------------------

// A1. The headline gap: before this, a host learned about a request only by opening the game.
export function joinRequestBody(actor: string, s: GameSummary): PushBody {
  const title = pick(
    [`${actor} wants in`, `${actor} is asking for a spot`, `New request from ${actor}`],
    s.game_id,
  );
  const filled = s.approved_count + s.reserved_spots;
  return {
    title,
    body: `${where(s)}, ${shortTime(s.starts_at)} · ${filled} of ${s.max_players} filled. Approve or decline.`,
  };
}

// A2. §4A: 2+ pending join requests within 10 min collapse into one push instead of a burst.
export function joinRequestCoalescedBody(n: number, s: GameSummary): PushBody {
  return {
    title: `${n} players want to join`,
    body: `${where(s)}, ${shortTime(s.starts_at)} · tap to review`,
  };
}

// A3.
export function joinApprovedBody(s: GameSummary): PushBody {
  const title = pick(
    [`You're in — ${shortTime(s.starts_at)}`, `Spot confirmed — ${shortTime(s.starts_at)}`, `You made the roster`],
    s.game_id,
  );
  return {
    title,
    body: `${where(s)} with ${s.host_name}${courtSuffix(s)}. Chat's open — say hi.`,
  };
}

// A4. Lands on Discover rather than the game they just missed out on.
export function joinDeclinedBody(s: GameSummary): PushBody {
  return {
    title: "Not this time",
    body: `Your request for ${where(s)} wasn't accepted. There are other games near you — tap to look.`,
  };
}

// A5.
export function playerRemovedBody(s: GameSummary): PushBody {
  return {
    title: "Removed from a game",
    body: `${s.host_name} removed you from ${where(s)}, ${shortTime(s.starts_at)}.`,
  };
}

export function joinDecisionBody(
  status: "approved" | "rejected" | "removed",
  s: GameSummary,
): PushBody {
  if (status === "approved") return joinApprovedBody(s);
  if (status === "removed") return playerRemovedBody(s);
  return joinDeclinedBody(s);
}

// A6. The one thing a host can still act on: a spot reopened.
export function playerLeftBody(actor: string, s: GameSummary): PushBody {
  const title = pick([`${actor} dropped out`, `${actor} pulled out`], s.game_id);
  return {
    title,
    body: `A spot just reopened on ${where(s)}, ${shortTime(s.starts_at)} · ${spotsPhrase(s)}. Share it to refill.`,
  };
}

// A8.
export function gameFullBody(s: GameSummary): PushBody {
  const title = pick(["Your game is full", "Roster locked in", "That's a full house"], s.game_id);
  return {
    title,
    body: `${s.max_players} of ${s.max_players} in for ${where(s)}, ${shortTime(s.starts_at)}.`,
  };
}

// --- B. Game changes -------------------------------------------------------------------------

// B1. Now also reaches people with an open request (bug #1) — they'd otherwise turn up.
export function gameCancelledBody(s: GameSummary): PushBody {
  return {
    title: "Game cancelled",
    body: `${s.host_name} called off ${where(s)}, ${shortTime(s.starts_at)}. Your spot's released — nothing owed.`,
  };
}

// B2. Needs the time the game moved *from*, which the trigger passes in the payload.
export function gameRescheduledBody(s: GameSummary, oldStartsAt?: string | null): PushBody {
  const moved = oldStartsAt ? ` Moved from ${shortTime(oldStartsAt)}.` : "";
  return {
    title: `New time, ${shortTime(s.starts_at)}`,
    body: `${where(s)}${courtSuffix(s)}.${moved} Still in?`,
  };
}

// B3. Court, cost, or max_players changed. (Low tier, goes to inbox if user inside quiet hours.)
export function detailsChangedBody(s: GameSummary): PushBody {
  return {
    title: "Game details updated",
    body: `${s.court_label ? `${s.court_label} · ` : ""}${money(s.per_player_cents)} per player · ${where(s)}, ${shortTime(s.starts_at)}.`,
  };
}

// B4. Booking was verified — host uploaded proof. (Low tier.)
export function bookingVerifiedBody(s: GameSummary): PushBody {
  return {
    title: "Court booking confirmed",
    body: `${s.host_name} uploaded the booking for ${s.venue_name}, ${shortTime(s.starts_at)}.`,
  };
}

// --- C. Time-based ---------------------------------------------------------------------------

// C1.
export function reminder24hBody(s: GameSummary, now?: Date): PushBody {
  const others = Math.max(0, s.approved_count + s.reserved_spots - 1);
  const company = others === 0
    ? "No one else yet — share it around."
    : others === 1
    ? "1 other playing."
    : `${others} others playing.`;
  return {
    title: `${dayLabel(s.starts_at, now)}, ${clockTime(s.starts_at)}`,
    body: `${where(s)}${courtSuffix(s)}. ${company}`,
  };
}

// C2.
export function reminder2hBody(s: GameSummary): PushBody {
  const title = pick(["Starts in 2 hours", "Two hours out", "Nearly time"], s.game_id);
  // approved_count + reserved_spots left the host out of their own headcount (post-game-plan
  // D1) — max_players minus what's still open is the whole room, host included.
  const playing = s.max_players - s.spots_left;
  return {
    title,
    body: `${where(s)}, ${clockTime(s.starts_at)}${courtSuffix(s)} · ${playing} playing. Grab your gear.`,
  };
}

// C3. Feeds ratings, which feed reliability, which feed trust — the plan's highest-value
// addition after A1. n is the count of people this recipient can rate.
export function postGameRateBody(s: GameSummary, rateableCount: number): PushBody {
  const title = pick(["How was the game?", "Good hit?", "Rate your game"], s.game_id);
  const who = rateableCount === 1 ? "the player" : `the ${rateableCount} players`;
  return {
    title,
    body: `Rate ${who} from ${where(s)}. Ten seconds, and it's private.`,
  };
}

// post-game-plan.md D9. Fires at ends_at + 30min, host only. Everyone else's rate prompt waits
// on this, so the copy has to say why it matters rather than reading as admin.
export function postGameAttendanceBody(s: GameSummary, playerCount: number): PushBody {
  const title = pick(["Everyone turn up?", "Who made it?", "Quick one about the game"], s.game_id);
  const who = playerCount === 1 ? "your player" : `all ${playerCount} players`;
  return {
    title,
    body: `Confirm ${who} showed at ${where(s)}. Then everyone can rate each other.`,
  };
}

// post-game-plan.md D10. The host held a spot and put this person's name on it — they owe money
// for it, so the body leads with the cost, not the invitation.
export function gameInviteBody(actor: string, s: GameSummary): PushBody {
  return {
    title: `${actor} saved you a spot`,
    body: `${where(s)}, ${shortTime(s.starts_at)} · ${s.tier_name} · ${money(s.per_player_cents)}. Accept or decline.`,
  };
}

// D11's decline path — a link recipient who can't make it. No profile to name (they may not have
// signed up), so this leads with the spot's label instead of a person.
export function spotDeclinedBody(label: string | null, s: GameSummary): PushBody {
  return {
    title: "A held spot's back with you",
    body: `${label ?? "Whoever you held it for"} can't make ${where(s)}, ${shortTime(s.starts_at)}. Find someone else or leave it open.`,
  };
}

// band 12e — the hold is inside its last 2 hours and nobody's claimed it. One nudge, equal
// choices offered in the app, not a demand to act.
export function holdNudgeBody(label: string | null, s: GameSummary): PushBody {
  const who = label ?? "Your held spot";
  return {
    title: `${who} still hasn't been taken`,
    body: `${where(s)} starts ${shortTime(s.starts_at)}. Want to open it up so someone else can grab it, or give it longer?`,
  };
}

// band 12e's auto-release notice — "a quiet notice, not a request for action, since inaction was
// the whole point."
export function holdAutoReleasedBody(label: string | null, s: GameSummary): PushBody {
  return {
    title: `We opened ${label ? `${label}'s` : "a held"} spot back up`,
    body: `Nobody claimed it in time, so it's open to anyone now for ${where(s)}, ${shortTime(s.starts_at)}.`,
  };
}

// C4. Nudge host at T-24h if game still has open spots. (Low tier, goes to inbox if quiet hours.)
export function nudgeUnderfilledBody(s: GameSummary): PushBody {
  const open = s.spots_left;
  const plural = open === 1 ? "spot" : "spots";
  return {
    title: `${open} ${plural} still open`,
    body: `${where(s)} is tomorrow at ${clockTime(s.starts_at)}. Share it to fill up.`,
  };
}

// C5. Nudge host if join requests pending >12h and game <48h away. (Low tier.)
export function nudgePendingBody(s: GameSummary, pendingCount: number): PushBody {
  const plural = pendingCount === 1 ? "request" : "requests";
  const daysOut = Math.ceil((new Date(s.starts_at).getTime() - Date.now()) / (24 * 3600 * 1000));
  const when = daysOut === 1 ? "tomorrow" : daysOut > 1 ? `in ${daysOut} days` : "today";
  return {
    title: `${pendingCount} ${plural} waiting`,
    body: `${where(s)} is ${when} at ${clockTime(s.starts_at)} — approve or decline.`,
  };
}

// --- D. Discovery ----------------------------------------------------------------------------

export function alertMatchBody(s: GameSummary): PushBody {
  const area = s.venue_suburb ?? s.venue_name;
  return {
    title: `New ${s.sport_name} game in ${area}`,
    body: `${s.venue_name}, ${shortTime(s.starts_at)} · ${s.tier_name} · ${money(s.per_player_cents)} · ${spotsPhrase(s)}`,
  };
}

// --- E. Chat ---------------------------------------------------------------------------------

export type MessageSummary = {
  chat_mode: string;
  sender_name: string;
  venue_name: string;
  sport_name?: string;
  kind: string;
  body: string;
};

// E2. §4E: 3+ unread messages from one game within 5 min collapse the same way A2 does.
export function messageCoalescedBody(n: number, s: GameSummary): PushBody {
  return {
    title: where(s),
    body: `${n} new messages`,
  };
}

export function messageBody(summary: MessageSummary): PushBody {
  const announce = summary.chat_mode === "announce";
  // Game identity, not a bare venue: a venue hosts many games (§4E1).
  const game = summary.sport_name
    ? `${summary.sport_name} at ${summary.venue_name}`
    : summary.venue_name;
  const title = `${announce ? "📣 " : ""}${summary.sender_name} · ${game}`;
  const body = summary.kind === "image"
    ? summary.body ? `📷 Photo · ${summary.body}` : "📷 Photo"
    : summary.body.slice(0, 140);
  return { title, body };
}

// --- Expo payload ----------------------------------------------------------------------------

// §6.6. Tier drives Android channel importance (via channelId), iOS interruptionLevel, delivery
// priority and sound. Low-tier pushes are silent — they're worth seeing, not worth interrupting.
// P3: categoryId (iOS notification category for action buttons) is inferred from the notification
// type and passed in data; the server maps it when calling this function.
export function expoMessages(
  recipients: { profile_id: string; expo_token: string }[],
  opts: {
    title: string;
    body: string;
    data: Record<string, unknown>;
    tier: PushTier;
    channelId: PushChannel;
    categoryId?: NotificationCategory;
    // Unread inbox count (P2 §6.6), fetched per profile — same value for every recipient here
    // since P2 dispatches one profile at a time.
    badge?: number;
  },
) {
  const { title, body, data, tier, channelId, categoryId, badge } = opts;
  return recipients
    .filter((r) => r.expo_token.startsWith("ExponentPushToken"))
    .map((r) => ({
      to: r.expo_token,
      title,
      body,
      data,
      channelId,
      ...(categoryId ? { categoryId } : {}),
      priority: tier === "critical" ? "high" : "normal",
      sound: tier === "low" ? null : "default",
      interruptionLevel: tier === "critical" ? "time-sensitive" : tier === "low" ? "passive" : "active",
      ...(badge !== undefined ? { badge } : {}),
    }));
}
