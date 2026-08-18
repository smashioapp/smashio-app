import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  alertMatchBody,
  expoMessages,
  gameCancelledBody,
  gameRescheduledBody,
  joinDecisionBody,
  messageBody,
  reminderBody,
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

// --- Payload body builders ---------------------------------------------------------------------

const summary = {
  venue_name: "Test Courts",
  sport_name: "Badminton",
  starts_at: "2026-06-15T04:00:00Z", // Mon 2:00 pm AEST
};

Deno.test("joinDecisionBody: approved", () => {
  const { title, body } = joinDecisionBody("approved", summary);
  assertEquals(title, "You're in!");
  assertEquals(body, "Badminton at Test Courts, Mon 2:00 pm");
});

Deno.test("joinDecisionBody: removed", () => {
  const { title } = joinDecisionBody("removed", summary);
  assertEquals(title, "Removed from a game");
});

Deno.test("joinDecisionBody: rejected", () => {
  const { title } = joinDecisionBody("rejected", summary);
  assertEquals(title, "Request declined");
});

Deno.test("gameCancelledBody includes Sydney-local time", () => {
  const { title, body } = gameCancelledBody(summary);
  assertEquals(title, "Game cancelled");
  assertMatch(body, /Mon 2:00 pm/);
});

Deno.test("gameRescheduledBody includes Sydney-local time", () => {
  const { body } = gameRescheduledBody(summary);
  assertMatch(body, /Mon 2:00 pm/);
});

Deno.test("alertMatchBody includes Sydney-local time", () => {
  const { body } = alertMatchBody(summary);
  assertMatch(body, /Mon 2:00 pm/);
});

Deno.test("reminderBody includes Sydney-local time", () => {
  const { body } = reminderBody(summary);
  assertMatch(body, /Mon 2:00 pm/);
});

Deno.test("messageBody: announce mode prefixes megaphone", () => {
  const { title } = messageBody({
    chat_mode: "announce",
    sender_name: "Alex",
    venue_name: "Test Courts",
    kind: "text",
    body: "hello",
  });
  assertEquals(title, "📣 Alex · Test Courts");
});

Deno.test("messageBody: non-announce mode has no prefix", () => {
  const { title } = messageBody({
    chat_mode: "normal",
    sender_name: "Alex",
    venue_name: "Test Courts",
    kind: "text",
    body: "hello",
  });
  assertEquals(title, "Alex · Test Courts");
});

Deno.test("messageBody: image with caption", () => {
  const { body } = messageBody({
    chat_mode: "normal",
    sender_name: "Alex",
    venue_name: "Test Courts",
    kind: "image",
    body: "nice one",
  });
  assertEquals(body, "📷 Photo · nice one");
});

Deno.test("messageBody: image without caption", () => {
  const { body } = messageBody({
    chat_mode: "normal",
    sender_name: "Alex",
    venue_name: "Test Courts",
    kind: "image",
    body: "",
  });
  assertEquals(body, "📷 Photo");
});

Deno.test("messageBody: text truncated to 140 chars", () => {
  const long = "x".repeat(200);
  const { body } = messageBody({
    chat_mode: "normal",
    sender_name: "Alex",
    venue_name: "Test Courts",
    kind: "text",
    body: long,
  });
  assertEquals(body.length, 140);
});

// --- expoMessages: token filtering + shape --------------------------------------------------

Deno.test("expoMessages filters out non-Expo tokens", () => {
  const recipients = [
    { profile_id: "1", expo_token: "ExponentPushToken[abc]" },
    { profile_id: "2", expo_token: "some-other-token" },
  ];
  const messages = expoMessages(recipients, "T", "B", {});
  assertEquals(messages.length, 1);
  assertEquals(messages[0].to, "ExponentPushToken[abc]");
});

Deno.test("expoMessages attaches channelId only when provided", () => {
  const recipients = [{ profile_id: "1", expo_token: "ExponentPushToken[abc]" }];
  const withChannel = expoMessages(recipients, "T", "B", {}, "chat");
  const withoutChannel = expoMessages(recipients, "T", "B", {});
  assertEquals(withChannel[0].channelId, "chat");
  assertEquals("channelId" in withoutChannel[0], false);
});
