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
export type PushChannel = "chat" | "requests" | "game-updates" | "reminders" | "discovery" | "social";

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

export type PushBody = { title: string; body: string; expand?: string };

// §4.2. Everything here is already visible on the player card to any authenticated user — this
// just moves it to where a decision (approve/decline, follow back) is actually made.
export type ActorSummary = {
  display_name: string;
  tier_label: string | null;
  games_played: number;
  reliability_label: string;
  suburb: string | null;
};

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
export function joinRequestBody(actor: string, s: GameSummary, actorSummary?: ActorSummary): PushBody {
  const title = pick(
    [`${actor} wants in`, `${actor} is asking for a spot`, `New request from ${actor}`],
    s.game_id,
  );
  const filled = s.approved_count + s.reserved_spots;
  const expand = actorSummary
    ? `${actorSummary.tier_label ?? "Unrated"} · ${actorSummary.games_played} games played · ${actorSummary.reliability_label} reliability. Approve or decline right here.`
    : undefined;
  return {
    title,
    body: `${where(s)}, ${shortTime(s.starts_at)} · ${filled} of ${s.max_players} filled. Approve or decline.`,
    ...(expand ? { expand } : {}),
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
    expand: "Requests are closed. You can still add a reserved spot for a mate.",
  };
}

// --- B. Game changes -------------------------------------------------------------------------

// B1. Now also reaches people with an open request (bug #1) — they'd otherwise turn up.
export function gameCancelledBody(s: GameSummary): PushBody {
  return {
    title: "Game cancelled",
    body: `${s.host_name} called off ${where(s)}, ${shortTime(s.starts_at)}. Your spot's released — nothing owed.`,
    expand: "You haven't been charged anything. There are other games on near you, have a look.",
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
    expand: "The court's locked in, so this one's not getting cancelled for a booking clash.",
  };
}

// H1. Waitlist promotion borrowed join_decision's "approved" copy before this — same trigger,
// different reason, and the reason is the whole point: the player needs to reply fast.
export function waitlistPromotedBody(s: GameSummary): PushBody {
  return {
    title: "A spot opened up, you're in",
    body: `${where(s)}, ${shortTime(s.starts_at)} · ${s.host_name} is hosting.`,
    expand: "You were next on the waitlist. Can't make it? Drop out now so the next person gets it.",
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
export function postGameRateBody(s: GameSummary, rateableCount: number, names?: string[]): PushBody {
  const title = pick(["How was the game?", "Good hit?", "Rate your game"], s.game_id);
  const who = rateableCount === 1 ? "the player" : `the ${rateableCount} players`;
  const expand = names && names.length > 0
    ? `${names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`}. Ratings stay private and take about 20 seconds.`
    : undefined;
  return {
    title,
    body: `Rate ${who} from ${where(s)}. Ten seconds, and it's private.`,
    ...(expand ? { expand } : {}),
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
    expand: `${s.max_players - open} of ${s.max_players} in. Games that fill up usually do it in the last day.`,
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

export function alertMatchBody(s: GameSummary, alertName?: string | null): PushBody {
  const area = s.venue_suburb ?? s.venue_name;
  return {
    title: `New ${s.sport_name} game in ${area}`,
    body: `${s.venue_name}, ${shortTime(s.starts_at)} · ${s.tier_name} · ${money(s.per_player_cents)} · ${spotsPhrase(s)}`,
    expand: alertName
      ? `Matches your '${alertName}' alert. Turn it off in Discover any time.`
      : "Matches one of your saved alerts. Turn alerts off in Discover any time.",
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
  starts_at?: string;
};

// G1. Ships as designed in notifications-plan.md §4E, three weeks late (notifications-v2-plan.md
// §1.2/§3G). A mentioned recipient gets this instead of the ordinary message push — same message,
// distinct copy, since being named by the host is the one thing in chat that's definitely for you.
export function chatMentionBody(summary: MessageSummary): PushBody {
  const game = summary.sport_name ? `${summary.sport_name} at ${summary.venue_name}` : summary.venue_name;
  const expand = summary.starts_at ? `In ${game}, ${shortTime(summary.starts_at)}.` : `In ${game}.`;
  return {
    title: `${summary.sender_name} mentioned you`,
    body: summary.body.slice(0, 140),
    expand,
  };
}

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

// --- F. Social (notifications-v2-plan.md §3F) -------------------------------------------------

export type PostSummary = {
  author_id: string | null;
  body: string | null;
  kind: string;
  sport_name: string | null;
  venue_name: string | null;
  game_id: string | null;
  starts_at: string | null;
  spots_left: number | null;
};

function postExcerpt(p: PostSummary): string {
  const text = (p.body ?? "").trim();
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

// F1.
export function postReplyBody(actor: string, replyText: string, post: PostSummary): PushBody {
  return {
    title: `${actor} replied`,
    body: replyText.slice(0, 140),
    expand: `On your post: '${postExcerpt(post)}'`,
  };
}

// F2. §3F: 3+ replies in 15 min collapse, same mechanism as A2/E2.
export function postReplyCoalescedBody(n: number, post: PostSummary): PushBody {
  return {
    title: `${n} replies on your post`,
    body: `'${postExcerpt(post)}'`,
  };
}

// F3. Coalesced-only by design (§3F note) — never sent per-reaction.
export function postReactionBody(actor: string, othersCount: number, post: PostSummary): PushBody {
  const title = othersCount > 0 ? `${actor} and ${othersCount} others backed your post` : `${actor} backed your post`;
  return { title, body: `'${postExcerpt(post)}'` };
}

// F4. Someone else joined a thread the recipient is also in.
export function replyToThreadBody(actor: string, replyText: string): PushBody {
  return {
    title: `${actor} joined a thread you're in`,
    body: replyText.slice(0, 140),
  };
}

// F5.
export function newFollowerBody(actor: string, s?: ActorSummary): PushBody {
  const bits = s ? [s.tier_label, `${s.games_played} games played`, s.suburb ? `plays around ${s.suburb}` : null].filter(Boolean) : [];
  return {
    title: `${actor} followed you`,
    body: bits.length > 0 ? bits.join(" · ") : "Check out their profile on Smashio.",
    expand: "Follow back to see their games in your feed.",
  };
}

// F6. Decided 2026-09-07: ship with a 2/day/user cap, looking_for_players only.
export function followedPostedBody(actor: string, post: PostSummary): PushBody {
  const where = post.venue_name ? `${post.sport_name ?? "A game"} at ${post.venue_name}` : (post.sport_name ?? "A game");
  const when = post.starts_at ? `, ${shortTime(post.starts_at)}` : "";
  const spots = post.spots_left != null ? ` · ${post.spots_left} spots` : "";
  return {
    title: `${actor} needs players`,
    body: `${where}${when}${spots}`,
  };
}

const ACHIEVEMENTS: Record<string, { name: string; blurb: string }> = {
  first_game: { name: "First game", blurb: "You played your first game on Smashio." },
  first_hosted: { name: "First hosted", blurb: "You hosted your first game." },
  played_10: { name: "10 games played", blurb: "Double digits — 10 games played." },
  played_25: { name: "25 games played", blurb: "25 games played. Getting serious." },
  played_50: { name: "50 games played", blurb: "50 games played. That's a lot of badminton." },
  streak_4: { name: "4-week streak", blurb: "A game every week for 4 weeks straight." },
  venues_5: { name: "5 different venues", blurb: "You've played at 5 different venues." },
  five_star: { name: "First 5-star", blurb: "Someone gave you a 5-star rating." },
};

// F7.
export function achievementEarnedBody(achievementId: string): PushBody {
  const a = ACHIEVEMENTS[achievementId] ?? { name: "New achievement", blurb: "You unlocked something new." };
  return {
    title: `${a.name} unlocked`,
    body: a.blurb,
    expand: "Tap to see it on your card, or share it.",
  };
}

// --- Expo payload ----------------------------------------------------------------------------

// §6.6. Tier drives Android channel importance (via channelId), iOS interruptionLevel, delivery
// priority and sound. Low-tier pushes are silent — they're worth seeing, not worth interrupting.
// P3: categoryId (iOS notification category for action buttons) is inferred from the notification
// type and passed in data; the server maps it when calling this function.
export function expoMessages(
  recipients: { profile_id: string; expo_token: string; platform?: string }[],
  opts: {
    title: string;
    body: string;
    data: Record<string, unknown>;
    tier: PushTier;
    channelId: PushChannel;
    categoryId?: NotificationCategory;
    // §4.1's third line. iOS renders it as `subtitle`, visible under the title when expanded.
    // Android has no subtitle equivalent in the Expo push API, so it's appended behind a line
    // break, which Android's own expand gesture reveals — never counted toward the 140-char body
    // budget either way.
    expand?: string;
    // Unread inbox count (P2 §6.6), fetched per profile — same value for every recipient here
    // since P2 dispatches one profile at a time.
    badge?: number;
  },
) {
  const { title, body, data, tier, channelId, categoryId, expand, badge } = opts;
  return recipients
    .filter((r) => r.expo_token.startsWith("ExponentPushToken"))
    .map((r) => ({
      to: r.expo_token,
      title,
      body: r.platform === "android" ? androidBody(body, expand) : body,
      ...(expand && r.platform !== "android" ? { subtitle: expand } : {}),
      data,
      channelId,
      ...(categoryId ? { categoryId } : {}),
      priority: tier === "critical" ? "high" : "normal",
      sound: tier === "low" ? null : "default",
      interruptionLevel: tier === "critical" ? "time-sensitive" : tier === "low" ? "passive" : "active",
      ...(badge !== undefined ? { badge } : {}),
    }));
}

// Expo doesn't tell this function which OS a given ExponentPushToken belongs to (that's resolved
// on Expo's side at send time), and `subtitle` is simply ignored by Android clients — so it's
// harmless to send both. Android's own notification-expand gesture reveals the line-break tail;
// iOS shows `subtitle` instead and never sees the appended text since it renders `body` verbatim
// and stops at the newline in the collapsed view.
function androidBody(body: string, expand?: string): string {
  return expand ? `${body}\n${expand}` : body;
}
