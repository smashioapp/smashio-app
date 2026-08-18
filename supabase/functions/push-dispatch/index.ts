// Slice 8: push. Invoked by pg_net from DB triggers (new message, join decision) and the
// dispatch-game-reminders cron function — never called by the client directly. Auth is a
// shared secret (PUSH_DISPATCH_KEY, matches the 'push_dispatch_key' Vault entry the DB reads),
// checked here since verify_jwt is off for this function (the caller has no Supabase JWT).
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  alertMatchBody,
  expoMessages,
  gameCancelledBody,
  type GameSummary,
  gameRescheduledBody,
  joinDecisionBody,
  type MessageSummary,
  messageBody,
  reminderBody,
} from "./format.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

type Payload =
  | { type: "message"; game_id: string; sender_id: string; message_id: string }
  | { type: "join_decision"; game_id: string; profile_id: string; status: "approved" | "rejected" | "removed" }
  | { type: "reminder"; game_id: string }
  | { type: "game_cancelled"; game_id: string; organizer_id: string }
  | { type: "game_rescheduled"; game_id: string; organizer_id: string }
  | { type: "alert_match"; game_id: string; profile_ids: string[] };

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function sendExpoPush(
  recipients: { profile_id: string; expo_token: string }[],
  title: string,
  body: string,
  data: Record<string, unknown>,
  channelId?: string,
) {
  const messages = expoMessages(recipients, title, body, data, channelId);

  if (messages.length === 0) return;

  // Expo caps batches at 100 messages per request.
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(chunk),
    });
  }
}

Deno.serve(async (req) => {
  const expectedKey = Deno.env.get("PUSH_DISPATCH_KEY");
  const auth = req.headers.get("Authorization");
  if (!expectedKey || auth !== `Bearer ${expectedKey}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = (await req.json()) as Payload;

  if (payload.type === "message") {
    const [{ data: recipients }, { data: summary }] = await Promise.all([
      supabase.rpc("chat_push_recipients", { p_message_id: payload.message_id }),
      supabase.rpc("push_message_summary", { p_message_id: payload.message_id }).single(),
    ]);
    if (recipients?.length && summary) {
      const { title, body } = messageBody(summary as MessageSummary);
      await sendExpoPush(recipients, title, body, { screen: "chat", game_id: payload.game_id }, "chat");
    }
  } else if (payload.type === "join_decision") {
    const { data: recipient } = await supabase
      .from("push_tokens")
      .select("profile_id, expo_token")
      .eq("profile_id", payload.profile_id);
    const { data: summary } = await supabase
      .rpc("push_game_summary", { p_game_id: payload.game_id })
      .single();
    if (recipient?.length && summary) {
      const { title, body } = joinDecisionBody(payload.status, summary as GameSummary);
      await sendExpoPush(recipient, title, body, { screen: "game", game_id: payload.game_id });
    }
  } else if (payload.type === "game_cancelled") {
    // Organiser excluded — they just cancelled it.
    const [{ data: recipients }, { data: summary }] = await Promise.all([
      supabase.rpc("push_recipients_for_game", {
        p_game_id: payload.game_id,
        p_exclude_profile: payload.organizer_id,
      }),
      supabase.rpc("push_game_summary", { p_game_id: payload.game_id }).single(),
    ]);
    if (recipients?.length && summary) {
      const { title, body } = gameCancelledBody(summary as GameSummary);
      await sendExpoPush(recipients, title, body, { screen: "game", game_id: payload.game_id });
    }
  } else if (payload.type === "game_rescheduled") {
    // Organiser excluded — they just made the change.
    const [{ data: recipients }, { data: summary }] = await Promise.all([
      supabase.rpc("push_recipients_for_game", {
        p_game_id: payload.game_id,
        p_exclude_profile: payload.organizer_id,
      }),
      supabase.rpc("push_game_summary", { p_game_id: payload.game_id }).single(),
    ]);
    if (recipients?.length && summary) {
      const { title, body } = gameRescheduledBody(summary as GameSummary);
      await sendExpoPush(recipients, title, body, { screen: "game", game_id: payload.game_id });
    }
  } else if (payload.type === "alert_match") {
    const [{ data: recipients }, { data: summary }] = await Promise.all([
      supabase
        .from("push_tokens")
        .select("profile_id, expo_token")
        .in("profile_id", payload.profile_ids),
      supabase.rpc("push_game_summary", { p_game_id: payload.game_id }).single(),
    ]);
    if (recipients?.length && summary) {
      const { title, body } = alertMatchBody(summary as GameSummary);
      await sendExpoPush(recipients, title, body, { screen: "game", game_id: payload.game_id });
    }
  } else if (payload.type === "reminder") {
    const [{ data: recipients }, { data: summary }] = await Promise.all([
      supabase.rpc("push_recipients_for_game", { p_game_id: payload.game_id }),
      supabase.rpc("push_game_summary", { p_game_id: payload.game_id }).single(),
    ]);
    if (recipients?.length && summary) {
      const { title, body } = reminderBody(summary as GameSummary);
      await sendExpoPush(recipients, title, body, { screen: "game", game_id: payload.game_id });
    }
  }

  return new Response("ok", { status: 200 });
});
