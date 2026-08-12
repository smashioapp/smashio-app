// Slice 8: push. Invoked by pg_net from DB triggers (new message, join decision) and the
// dispatch-game-reminders cron function — never called by the client directly. Auth is a
// shared secret (PUSH_DISPATCH_KEY, matches the 'push_dispatch_key' Vault entry the DB reads),
// checked here since verify_jwt is off for this function (the caller has no Supabase JWT).
import { createClient } from "jsr:@supabase/supabase-js@2";

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

function shortTime(iso: string) {
  return new Date(iso).toLocaleString("en-AU", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function sendExpoPush(
  recipients: { profile_id: string; expo_token: string }[],
  title: string,
  body: string,
  data: Record<string, unknown>,
) {
  const messages = recipients
    .filter((r) => r.expo_token.startsWith("ExponentPushToken"))
    .map((r) => ({ to: r.expo_token, title, body, data, sound: "default" }));

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
      supabase.rpc("push_recipients_for_game", {
        p_game_id: payload.game_id,
        p_exclude_profile: payload.sender_id,
      }),
      supabase.rpc("push_game_summary", { p_game_id: payload.game_id }).single(),
    ]);
    if (recipients?.length && summary) {
      await sendExpoPush(
        recipients,
        `New message · ${summary.venue_name}`,
        "Someone posted in your game chat.",
        { screen: "chat", game_id: payload.game_id },
      );
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
      const verb = payload.status === "approved"
        ? "You're in!"
        : payload.status === "removed"
        ? "Removed from a game"
        : "Request declined";
      await sendExpoPush(
        recipient,
        verb,
        `${summary.sport_name} at ${summary.venue_name}, ${shortTime(summary.starts_at)}`,
        { screen: "game", game_id: payload.game_id },
      );
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
      await sendExpoPush(
        recipients,
        "Game cancelled",
        `${summary.venue_name}, ${shortTime(summary.starts_at)} is off. Your spot has been released.`,
        { screen: "game", game_id: payload.game_id },
      );
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
      await sendExpoPush(
        recipients,
        "New time for your game",
        `${summary.venue_name} now starts ${shortTime(summary.starts_at)}.`,
        { screen: "game", game_id: payload.game_id },
      );
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
      await sendExpoPush(
        recipients,
        "A game just matched your alert",
        `${summary.sport_name} at ${summary.venue_name}, ${shortTime(summary.starts_at)}`,
        { screen: "game", game_id: payload.game_id },
      );
    }
  } else if (payload.type === "reminder") {
    const [{ data: recipients }, { data: summary }] = await Promise.all([
      supabase.rpc("push_recipients_for_game", { p_game_id: payload.game_id }),
      supabase.rpc("push_game_summary", { p_game_id: payload.game_id }).single(),
    ]);
    if (recipients?.length && summary) {
      await sendExpoPush(
        recipients,
        "Game starting soon",
        `${summary.sport_name} at ${summary.venue_name} at ${shortTime(summary.starts_at)}`,
        { screen: "game", game_id: payload.game_id },
      );
    }
  }

  return new Response("ok", { status: 200 });
});
