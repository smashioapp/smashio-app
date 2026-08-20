// Slice 8: push. Invoked by pg_net from DB triggers (join request, join decision, roster
// change, game change, new message) and the reminder / post-game cron sweeps — never called by
// the client directly. Auth is a shared secret (PUSH_DISPATCH_KEY, matches the
// 'push_dispatch_key' Vault entry the DB reads), checked here since verify_jwt is off for this
// function (the caller has no Supabase JWT).
//
// Recipients are SQL (transactional, cheap); copy is TypeScript (unit-tested in format.test.ts).
// Event matrix and tiers: docs/notifications-plan.md §4.
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  alertMatchBody,
  expoMessages,
  gameCancelledBody,
  gameFullBody,
  type GameSummary,
  gameRescheduledBody,
  joinDecisionBody,
  joinRequestBody,
  type MessageSummary,
  messageBody,
  playerLeftBody,
  postGameRateBody,
  type PushChannel,
  type PushTier,
  reminder24hBody,
  reminder2hBody,
} from "./format.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

type Recipient = { profile_id: string; expo_token: string };

type Payload =
  | { type: "message"; game_id: string; sender_id: string; message_id: string }
  | { type: "join_request"; game_id: string; actor_id: string; host_id: string }
  | { type: "player_left"; game_id: string; actor_id: string; host_id: string }
  | { type: "game_full"; game_id: string; host_id: string }
  | { type: "join_decision"; game_id: string; profile_id: string; status: "approved" | "rejected" | "removed" }
  // 'reminder' is the pre-P0 name; kept so requests already queued in pg_net at deploy time
  // still render instead of falling through as unknown.
  | { type: "reminder" | "reminder_2h" | "reminder_24h"; game_id: string }
  | { type: "post_game_rate"; game_id: string }
  | { type: "game_cancelled"; game_id: string; organizer_id: string }
  | { type: "game_rescheduled"; game_id: string; organizer_id: string; old_starts_at?: string }
  | { type: "alert_match"; game_id: string; profile_ids: string[] };

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function sendExpoPush(
  recipients: Recipient[],
  opts: {
    title: string;
    body: string;
    data: Record<string, unknown>;
    tier: PushTier;
    channelId: PushChannel;
  },
) {
  const messages = expoMessages(recipients, opts);

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

function gameSummary(gameId: string) {
  return supabase.rpc("push_game_summary", { p_game_id: gameId }).single();
}

async function actorName(profileId: string): Promise<string> {
  const { data } = await supabase.rpc("push_actor_name", { p_profile_id: profileId });
  return (data as string | null) ?? "A player";
}

function hostRecipients(gameId: string) {
  return supabase.rpc("push_recipients_for_host", { p_game_id: gameId });
}

function tokensFor(profileIds: string[]) {
  return supabase.from("push_tokens").select("profile_id, expo_token").in("profile_id", profileIds);
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
      await sendExpoPush(recipients, {
        title,
        body,
        data: { type: "message", screen: "chat", game_id: payload.game_id },
        tier: "normal",
        channelId: "chat",
      });
    }
  } else if (payload.type === "join_request") {
    // A1. Host only — nobody else can approve it.
    const [{ data: recipients }, { data: summary }, actor] = await Promise.all([
      hostRecipients(payload.game_id),
      gameSummary(payload.game_id),
      actorName(payload.actor_id),
    ]);
    if (recipients?.length && summary) {
      const { title, body } = joinRequestBody(actor, summary as GameSummary);
      await sendExpoPush(recipients, {
        title,
        body,
        data: { type: "join_request", screen: "game_requests", game_id: payload.game_id },
        tier: "critical",
        channelId: "requests",
      });
    }
  } else if (payload.type === "player_left") {
    // A6. A reopened spot is the last thing a host can still act on.
    const [{ data: recipients }, { data: summary }, actor] = await Promise.all([
      hostRecipients(payload.game_id),
      gameSummary(payload.game_id),
      actorName(payload.actor_id),
    ]);
    if (recipients?.length && summary) {
      const { title, body } = playerLeftBody(actor, summary as GameSummary);
      await sendExpoPush(recipients, {
        title,
        body,
        data: { type: "player_left", screen: "game", game_id: payload.game_id },
        tier: "normal",
        channelId: "requests",
      });
    }
  } else if (payload.type === "game_full") {
    const [{ data: recipients }, { data: summary }] = await Promise.all([
      hostRecipients(payload.game_id),
      gameSummary(payload.game_id),
    ]);
    if (recipients?.length && summary) {
      const { title, body } = gameFullBody(summary as GameSummary);
      await sendExpoPush(recipients, {
        title,
        body,
        data: { type: "game_full", screen: "game", game_id: payload.game_id },
        tier: "low",
        channelId: "requests",
      });
    }
  } else if (payload.type === "join_decision") {
    const [{ data: recipient }, { data: summary }] = await Promise.all([
      tokensFor([payload.profile_id]),
      gameSummary(payload.game_id),
    ]);
    if (recipient?.length && summary) {
      const { title, body } = joinDecisionBody(payload.status, summary as GameSummary);
      // A declined player is sent looking for another game, not back to the one that said no.
      const screen = payload.status === "rejected" ? "discover" : "game";
      await sendExpoPush(recipient, {
        title,
        body,
        data: { type: `join_${payload.status}`, screen, game_id: payload.game_id },
        tier: payload.status === "approved" ? "critical" : "normal",
        channelId: "requests",
      });
    }
  } else if (payload.type === "game_cancelled") {
    // Organiser excluded — they just cancelled it. Pending requesters included (bug #1): their
    // request is now against a game that no longer exists.
    const [{ data: recipients }, { data: summary }] = await Promise.all([
      supabase.rpc("push_recipients_for_game", {
        p_game_id: payload.game_id,
        p_exclude_profile: payload.organizer_id,
        p_include_requested: true,
      }),
      gameSummary(payload.game_id),
    ]);
    if (recipients?.length && summary) {
      const { title, body } = gameCancelledBody(summary as GameSummary);
      await sendExpoPush(recipients, {
        title,
        body,
        data: { type: "game_cancelled", screen: "game", game_id: payload.game_id },
        tier: "critical",
        channelId: "game-updates",
      });
    }
  } else if (payload.type === "game_rescheduled") {
    // Organiser excluded — they just made the change. Pending requesters included (bug #1).
    const [{ data: recipients }, { data: summary }] = await Promise.all([
      supabase.rpc("push_recipients_for_game", {
        p_game_id: payload.game_id,
        p_exclude_profile: payload.organizer_id,
        p_include_requested: true,
      }),
      gameSummary(payload.game_id),
    ]);
    if (recipients?.length && summary) {
      const { title, body } = gameRescheduledBody(summary as GameSummary, payload.old_starts_at);
      await sendExpoPush(recipients, {
        title,
        body,
        data: { type: "game_rescheduled", screen: "game", game_id: payload.game_id },
        tier: "critical",
        channelId: "game-updates",
      });
    }
  } else if (payload.type === "alert_match") {
    const [{ data: recipients }, { data: summary }] = await Promise.all([
      tokensFor(payload.profile_ids),
      gameSummary(payload.game_id),
    ]);
    if (recipients?.length && summary) {
      const { title, body } = alertMatchBody(summary as GameSummary);
      await sendExpoPush(recipients, {
        title,
        body,
        data: { type: "alert_match", screen: "game", game_id: payload.game_id },
        tier: "low",
        channelId: "discovery",
      });
    }
  } else if (payload.type === "reminder_24h") {
    const [{ data: recipients }, { data: summary }] = await Promise.all([
      supabase.rpc("push_recipients_for_game", { p_game_id: payload.game_id }),
      gameSummary(payload.game_id),
    ]);
    if (recipients?.length && summary) {
      const { title, body } = reminder24hBody(summary as GameSummary);
      await sendExpoPush(recipients, {
        title,
        body,
        data: { type: "reminder_24h", screen: "game", game_id: payload.game_id },
        tier: "normal",
        channelId: "reminders",
      });
    }
  } else if (payload.type === "reminder_2h" || payload.type === "reminder") {
    const [{ data: recipients }, { data: summary }] = await Promise.all([
      supabase.rpc("push_recipients_for_game", { p_game_id: payload.game_id }),
      gameSummary(payload.game_id),
    ]);
    if (recipients?.length && summary) {
      const { title, body } = reminder2hBody(summary as GameSummary);
      await sendExpoPush(recipients, {
        title,
        body,
        data: { type: "reminder_2h", screen: "game", game_id: payload.game_id },
        tier: "critical",
        channelId: "reminders",
      });
    }
  } else if (payload.type === "post_game_rate") {
    // C3. The host can rate every approved player; an approved player's rate list excludes
    // themselves (and the host, who has no game_players row), so their count is one lower.
    // Different copy per group, so this fans out as two batches.
    const [{ data: recipients }, { data: summary }] = await Promise.all([
      supabase.rpc("push_post_game_recipients", { p_game_id: payload.game_id }),
      gameSummary(payload.game_id),
    ]);
    const s = summary as GameSummary | null;
    if (recipients?.length && s) {
      const groups: [Recipient[], number][] = [
        [(recipients as Recipient[]).filter((r) => r.profile_id === s.host_id), s.approved_count],
        [(recipients as Recipient[]).filter((r) => r.profile_id !== s.host_id), s.approved_count - 1],
      ];
      for (const [group, rateable] of groups) {
        if (group.length === 0 || rateable < 1) continue;
        const { title, body } = postGameRateBody(s, rateable);
        await sendExpoPush(group, {
          title,
          body,
          data: { type: "post_game_rate", screen: "post_game", game_id: payload.game_id },
          tier: "low",
          channelId: "reminders",
        });
      }
    }
  }

  return new Response("ok", { status: 200 });
});
