import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  alertMatchBody,
  clockTime,
  dayLabel,
  expoMessages,
  gameCancelledBody,
  gameFullBody,
  type GameSummary,
  gameRescheduledBody,
  joinDecisionBody,
  joinRequestBody,
  messageBody,
  money,
  pick,
  playerLeftBody,
  postGameRateBody,
  reminder24hBody,
  reminder2hBody,
  shortTime,
} from "./format.ts";

// --- shortTime: the timezone bug -------------------------------------------------------------
// starts_at round-trips as UTC ISO (timestamptz). shortTime must render Sydney wall-clock time,
// not the Edge Runtime's own (UTC) tz. AEST = UTC+10, AEDT = UTC+11.

Deno.test("shortTime renders AEST (winter, UTC+10) wall-clock time, not UTC", () => {
  // 2026-06-15 04:00 UTC = 2026-06-15 14:00 AEST
  const result = shortTime("2026-06-15T04:00:00Z");
  assertEquals(result, "Mon 2:00 pm");
});

Deno.test("shortTime renders AEDT (summer, UTC+11) wall-clock time, not UTC", () => {
  // 2026-01-10 03:30 UTC = 2026-01-10 14:30 AEDT
  const result = shortTime("2026-01-10T03:30:00Z");
  assertEquals(result, "Sat 2:30 pm");
});

Deno.test("shortTime crosses midnight in Sydney relative to the UTC date", () => {
  // 2026-06-15 20:00 UTC = 2026-06-16 06:00 AEST — next day locally.
  const result = shortTime("2026-06-15T20:00:00Z");
  assertEquals(result, "Tue 6:00 am");
});

Deno.test("shortTime around the AEDT->AEST fall-back boundary (2026-04-05 03:00 local)", () => {
  // Clocks in Sydney wind back from AEDT to AEST at 2026-04-05 03:00 local (2026-04-04 16:00 UTC).
  // Just before the flip: still AEDT (UTC+11).
  const before = shortTime("2026-04-04T15:59:00Z"); // 2026-04-05 02:59 AEDT
  assertEquals(before, "Sun 2:59 am");
  // Just after the flip: AEST (UTC+10) — clock repeats 2am-3am, so UTC+1hr later is 02:00 again.
  const after = shortTime("2026-04-04T16:01:00Z"); // 2026-04-05 02:01 AEST
  assertEquals(after, "Sun 2:01 am");
});

Deno.test("shortTime around the AEST->AEDT spring-forward boundary (2026-10-04 02:00 local)", () => {
  // Clocks in Sydney jump forward from AEST to AEDT at 2026-10-04 02:00 local (2026-10-03 16:00 UTC).
  // Just before: AEST (UTC+10), 01:59 local.
  const before = shortTime("2026-10-03T15:59:00Z");
  assertEquals(before, "Sun 1:59 am");
  // Just after: AEDT (UTC+11) — local clock jumps straight to 03:00.
  const after = shortTime("2026-10-03T16:00:00Z");
  assertEquals(after, "Sun 3:00 am");
});

// --- Regression guard: catch a future reintroduction of the bug ------------------------------

Deno.test("shortTime never equals the raw UTC hour when Sydney offset differs from 0", () => {
  const iso = "2026-06-15T04:00:00Z";
  const utcNaive = new Date(iso).toLocaleString("en-AU", {
    timeZone: "UTC",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  const sydney = shortTime(iso);
  assertEquals(utcNaive, "Mon 4:00 am");
  assertEquals(sydney, "Mon 2:00 pm");
  assertMatch(sydney, /pm$/);
});


// --- clockTime / dayLabel: the new time strings -----------------------------------------------

Deno.test("clockTime drops the weekday shortTime carries", () => {
  assertEquals(clockTime("2026-06-15T04:00:00Z"), "2:00 pm");
});

Deno.test("dayLabel: same Sydney day is Today", () => {
  // Both 2026-06-15 in Sydney (12:00 pm and 2:00 pm AEST).
  assertEquals(dayLabel("2026-06-15T04:00:00Z", new Date("2026-06-15T02:00:00Z")), "Today");
});

Deno.test("dayLabel: next Sydney day is Tomorrow", () => {
  assertEquals(dayLabel("2026-06-16T04:00:00Z", new Date("2026-06-15T02:00:00Z")), "Tomorrow");
});

Deno.test("dayLabel: further out names the weekday", () => {
  assertEquals(dayLabel("2026-06-19T04:00:00Z", new Date("2026-06-15T02:00:00Z")), "Friday");
});

Deno.test("dayLabel compares Sydney days, not UTC days", () => {
  // now = 2026-06-15 20:00 UTC = Tue 06:00 Sydney; game = 2026-06-15 22:00 UTC = Tue 08:00
  // Sydney. Same UTC date and same Sydney date, but the Sydney date is the day after the UTC one.
  assertEquals(dayLabel("2026-06-15T22:00:00Z", new Date("2026-06-15T20:00:00Z")), "Today");
});

Deno.test("dayLabel across the AEST->AEDT spring-forward boundary", () => {
  // now = 2026-10-03 10:00 UTC = Sat 20:00 AEST (pre-flip, UTC+10).
  // game = 2026-10-03 16:00 UTC = Sun 03:00 AEDT (post-flip, UTC+11) — the next Sydney day,
  // only 6 hours away. A fixed-offset or UTC-day comparison gets this wrong.
  assertEquals(dayLabel("2026-10-03T16:00:00Z", new Date("2026-10-03T10:00:00Z")), "Tomorrow");
});

// --- money -------------------------------------------------------------------------------------

Deno.test("money renders whole dollars, cents, and free", () => {
  assertEquals(money(1200), "$12");
  assertEquals(money(1250), "$12.50");
  assertEquals(money(0), "free");
  assertEquals(money(null), "free");
});

// --- pick: deterministic variety ---------------------------------------------------------------

Deno.test("pick returns the same variant for the same seed", () => {
  const variants = ["a", "b", "c"];
  assertEquals(pick(variants, "game-1"), pick(variants, "game-1"));
});

Deno.test("pick spreads different seeds across the whole variant set", () => {
  const variants = ["a", "b", "c"];
  const seen = new Set(Array.from({ length: 60 }, (_, i) => pick(variants, `game-${i}`)));
  assertEquals(seen.size, 3);
});

// --- Payload body builders ---------------------------------------------------------------------

// 8-player game, 3 approved, 1 reserved, starting Mon 2:00 pm AEST.
const summary: GameSummary = {
  game_id: "aaaaaaaa-0000-0000-0000-000000000001",
  sport_name: "Badminton",
  venue_name: "Test Courts",
  venue_suburb: "Homebush",
  starts_at: "2026-06-15T04:00:00Z",
  ends_at: "2026-06-15T06:00:00Z",
  court_label: "Court 3",
  host_id: "bbbbbbbb-0000-0000-0000-000000000001",
  host_name: "Riya",
  max_players: 8,
  approved_count: 3,
  reserved_spots: 1,
  spots_left: 4,
  per_player_cents: 1200,
  tier_name: "Intermediate",
  verification_status: "verified",
};

const withSummary = (over: Partial<GameSummary>): GameSummary => ({ ...summary, ...over });

Deno.test("joinRequestBody names the actor and the exact spot count", () => {
  const { title, body } = joinRequestBody("Sam", summary);
  assertMatch(title, /Sam/);
  // approved (3) + reserved (1) of max (8).
  assertMatch(body, /4 of 8 filled/);
  assertMatch(body, /Badminton at Test Courts, Mon 2:00 pm/);
  assertMatch(body, /Approve or decline/);
});

Deno.test("joinDecisionBody approved: carries time, host and the chat nudge", () => {
  const { title, body } = joinDecisionBody("approved", summary);
  assertMatch(title, /Mon 2:00 pm|You made the roster/);
  assertMatch(body, /Badminton at Test Courts with Riya/);
  assertMatch(body, /Court 3/);
});

Deno.test("joinDecisionBody rejected: points at other games, not this one", () => {
  const { title, body } = joinDecisionBody("rejected", summary);
  assertEquals(title, "Not this time");
  assertMatch(body, /other games near you/);
});

Deno.test("joinDecisionBody removed: names the host who did it", () => {
  const { title, body } = joinDecisionBody("removed", summary);
  assertEquals(title, "Removed from a game");
  assertMatch(body, /Riya removed you from Badminton at Test Courts, Mon 2:00 pm/);
});

Deno.test("playerLeftBody tells the host how many spots are open now", () => {
  const { title, body } = playerLeftBody("Sam", withSummary({ approved_count: 2, spots_left: 5 }));
  assertMatch(title, /Sam/);
  assertMatch(body, /5 spots left/);
  assertMatch(body, /Mon 2:00 pm/);
});

Deno.test("playerLeftBody uses the singular for one spot", () => {
  const { body } = playerLeftBody("Sam", withSummary({ spots_left: 1 }));
  assertMatch(body, /1 spot left/);
});

Deno.test("gameFullBody states the roster as n of n", () => {
  const { body } = gameFullBody(withSummary({ approved_count: 7, spots_left: 0 }));
  assertMatch(body, /8 of 8 in for Badminton at Test Courts/);
});

Deno.test("gameCancelledBody names the host and the released spot", () => {
  const { title, body } = gameCancelledBody(summary);
  assertEquals(title, "Game cancelled");
  assertMatch(body, /Riya called off Badminton at Test Courts, Mon 2:00 pm/);
  assertMatch(body, /spot's released/);
});

Deno.test("gameRescheduledBody carries both the new time and the old one", () => {
  const { title, body } = gameRescheduledBody(summary, "2026-06-14T04:00:00Z");
  assertEquals(title, "New time — Mon 2:00 pm");
  assertMatch(body, /Moved from Sun 2:00 pm/);
});

Deno.test("gameRescheduledBody omits the old time when the payload predates it", () => {
  const { title, body } = gameRescheduledBody(summary);
  assertEquals(title, "New time — Mon 2:00 pm");
  assertMatch(body, /Still in\?/);
  assertEquals(body.includes("Moved from"), false);
});

Deno.test("reminder24hBody leads with the day and counts the others playing", () => {
  const { title, body } = reminder24hBody(summary, new Date("2026-06-14T04:00:00Z"));
  assertEquals(title, "Tomorrow, 2:00 pm");
  // 3 approved + 1 reserved, minus the recipient = 3 others.
  assertMatch(body, /3 others playing/);
  assertMatch(body, /Court 3/);
});

Deno.test("reminder24hBody nudges sharing when nobody else is in yet", () => {
  const { body } = reminder24hBody(
    withSummary({ approved_count: 1, reserved_spots: 0, spots_left: 7 }),
    new Date("2026-06-14T04:00:00Z"),
  );
  assertMatch(body, /share it around/i);
});

Deno.test("reminder2hBody carries venue, clock time, court and headcount", () => {
  const { body } = reminder2hBody(summary);
  assertMatch(body, /Badminton at Test Courts, 2:00 pm · Court 3/);
  assertMatch(body, /4 playing/);
});

Deno.test("reminder bodies drop the court segment when the game has no court label", () => {
  // "Test Courts" is the venue, so the assertion has to be about the court label itself.
  const noCourt = withSummary({ court_label: null });
  assertEquals(reminder2hBody(noCourt).body.includes("Court 3"), false);
  assertEquals(reminder24hBody(noCourt).body.includes("Court 3"), false);
  assertEquals(reminder2hBody(summary).body.includes("Court 3"), true);
});

Deno.test("postGameRateBody pluralises the rateable count and promises privacy", () => {
  assertMatch(postGameRateBody(summary, 1).body, /Rate the player from Badminton at Test Courts/);
  assertMatch(postGameRateBody(summary, 3).body, /Rate the 3 players/);
  assertMatch(postGameRateBody(summary, 3).body, /private/);
});

Deno.test("alertMatchBody leads with sport and suburb, and prices the game", () => {
  const { title, body } = alertMatchBody(summary);
  assertEquals(title, "New Badminton game in Homebush");
  assertMatch(body, /Test Courts, Mon 2:00 pm · Intermediate · \$12 · 4 spots left/);
});

Deno.test("alertMatchBody falls back to the venue when a suburb is missing", () => {
  const { title } = alertMatchBody(withSummary({ venue_suburb: null }));
  assertEquals(title, "New Badminton game in Test Courts");
});

// --- messageBody --------------------------------------------------------------------------------

const message = {
  chat_mode: "normal",
  sender_name: "Alex",
  venue_name: "Test Courts",
  sport_name: "Badminton",
  kind: "text",
  body: "hello",
};

Deno.test("messageBody titles with the game, not the bare venue", () => {
  assertEquals(messageBody(message).title, "Alex · Badminton at Test Courts");
});

Deno.test("messageBody falls back to the venue when sport is absent", () => {
  const { sport_name: _drop, ...noSport } = message;
  assertEquals(messageBody(noSport).title, "Alex · Test Courts");
});

Deno.test("messageBody: announce mode prefixes megaphone", () => {
  assertEquals(
    messageBody({ ...message, chat_mode: "announce" }).title,
    "📣 Alex · Badminton at Test Courts",
  );
});

Deno.test("messageBody: image with caption", () => {
  assertEquals(messageBody({ ...message, kind: "image", body: "nice one" }).body, "📷 Photo · nice one");
});

Deno.test("messageBody: image without caption", () => {
  assertEquals(messageBody({ ...message, kind: "image", body: "" }).body, "📷 Photo");
});

Deno.test("messageBody: text truncated to 140 chars", () => {
  assertEquals(messageBody({ ...message, body: "x".repeat(200) }).body.length, 140);
});

Deno.test("messageBody: text of exactly 140 chars is untouched", () => {
  const exact = "x".repeat(140);
  assertEquals(messageBody({ ...message, body: exact }).body, exact);
});

// --- expoMessages: token filtering + tier shape ------------------------------------------------

const opts = (tier: "critical" | "normal" | "low") =>
  ({ title: "T", body: "B", data: {}, tier, channelId: "requests" }) as const;

Deno.test("expoMessages filters out non-Expo tokens", () => {
  const recipients = [
    { profile_id: "1", expo_token: "ExponentPushToken[abc]" },
    { profile_id: "2", expo_token: "some-other-token" },
  ];
  const messages = expoMessages(recipients, opts("normal"));
  assertEquals(messages.length, 1);
  assertEquals(messages[0].to, "ExponentPushToken[abc]");
});

Deno.test("expoMessages maps tier to priority, sound and interruptionLevel", () => {
  const recipients = [{ profile_id: "1", expo_token: "ExponentPushToken[abc]" }];

  const critical = expoMessages(recipients, opts("critical"))[0];
  assertEquals(critical.priority, "high");
  assertEquals(critical.sound, "default");
  assertEquals(critical.interruptionLevel, "time-sensitive");

  const normal = expoMessages(recipients, opts("normal"))[0];
  assertEquals(normal.priority, "normal");
  assertEquals(normal.sound, "default");
  assertEquals(normal.interruptionLevel, "active");

  // Low tier is silent: worth seeing, not worth interrupting.
  const low = expoMessages(recipients, opts("low"))[0];
  assertEquals(low.priority, "normal");
  assertEquals(low.sound, null);
  assertEquals(low.interruptionLevel, "passive");
});

Deno.test("expoMessages always carries a channelId", () => {
  const recipients = [{ profile_id: "1", expo_token: "ExponentPushToken[abc]" }];
  assertEquals(expoMessages(recipients, opts("low"))[0].channelId, "requests");
});
