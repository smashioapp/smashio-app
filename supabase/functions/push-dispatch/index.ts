// Slice 8, reworked in P2 (docs/notifications-plan.md §6.2). Invoked by pg_net — never called by
// the client directly. Auth is a shared secret (PUSH_DISPATCH_KEY, matches the
// 'push_dispatch_key' Vault entry the DB reads), checked here since verify_jwt is off for this
// function (the caller has no Supabase JWT).
//
// P0/P1 had every DB trigger call notify_push with a raw event payload, and this function did
// the recipient lookup + rendering + send in one shot, with nothing persisted. P2 flips that:
// each trigger now resolves recipients itself and writes one `notifications` row per recipient
// *in the same transaction as the event* (public.enqueue_notifications), then calls notify_push
// with just the new row ids. This function reads those rows, renders copy via format.ts, sends,
// and stamps title/body/sent_at back onto them — which is what makes the retry sweep, the unread
// badge, and the inbox screen possible; none of them have anything to read from under the old
// fire-and-forget shape. Recipients are still SQL (transactional, cheap); copy is still
// TypeScript (unit-tested in format.test.ts). Event matrix and tiers: docs/notifications-plan.md §4.
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  alertMatchBody,
  bookingVerifiedBody,
  CATEGORY_FOR_TYPE,
  detailsChangedBody,
  expoMessages,
  gameCancelledBody,
  gameFullBody,
  gameInviteBody,
  type GameSummary,
  gameRescheduledBody,
  joinDecisionBody,
  joinRequestBody,
  joinRequestCoalescedBody,
  type MessageSummary,
  messageBody,
  messageCoalescedBody,
  nudgePendingBody,
  nudgeUnderfilledBody,
  playerLeftBody,
  postGameAttendanceBody,
  postGameRateBody,
  type PushBody,
  type PushChannel,
  type PushTier,
  holdAutoReleasedBody,
  holdNudgeBody,
  reminder24hBody,
  reminder2hBody,
  spotDeclinedBody,
} from "./format.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

type Recipient = { profile_id: string; expo_token: string };

type NotificationRow = {
  id: string;
  profile_id: string;
  type: string;
  game_id: string | null;
  actor_id: string | null;
  params: Record<string, unknown>;
  priority: string;
  collapse_key: string | null;
  created_at: string;
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// §4E's channel map, keyed by notification type instead of by call site now that every send goes
// through one dispatch loop. Keep in sync with ui/lib/notifications.ts's ANDROID_CHANNELS.
const CHANNEL_FOR_TYPE: Record<string, PushChannel> = {
  join_request: "requests",
  player_left: "requests",
  game_full: "requests",
  join_decision: "requests",
  game_cancelled: "game-updates",
  game_rescheduled: "game-updates",
  details_changed: "game-updates",
  booking_verified: "game-updates",
  reminder_24h: "reminders",
  reminder_2h: "reminders",
  post_game_rate: "reminders",
  post_game_attendance: "reminders",
  game_invite: "requests",
  spot_declined: "game-updates",
  hold_nudge: "reminders",
  hold_auto_released: "game-updates",
  nudge_underfilled: "reminders",
  nudge_pending: "reminders",
  alert_match: "discovery",
  message: "chat",
};

// §4A/§4E: A2 and E2 are the only two coalescing rules the plan defines. Window in minutes,
// threshold = how many pending (sent_at is null) rows sharing a recipient + collapse_key inside
// that window trigger the coalesced copy instead of N individual pushes.
const COALESCE_WINDOW_MIN: Record<string, number> = { join_request: 10, message: 5 };
const COALESCE_THRESHOLD: Record<string, number> = { join_request: 2, message: 3 };

// §6.5. Low tier is "silent, respects quiet hours" — the only tier that ever drops. Evaluated per
// recipient, in their own timezone (profiles.timezone, bug #9), right before send.
async function filterQuietHours(recipients: Recipient[]): Promise<Recipient[]> {
  if (recipients.length === 0) return recipients;
  const { data } = await supabase.rpc("filter_quiet_recipients", {
    p_profile_ids: recipients.map((r) => r.profile_id),
  });
  const allowed = new Set((data as string[] | null) ?? []);
  return recipients.filter((r) => allowed.has(r.profile_id));
}

async function sendExpoPush(
  recipients: Recipient[],
  opts: {
    title: string;
    body: string;
    data: Record<string, unknown>;
    tier: PushTier;
    channelId: PushChannel;
    badge?: number;
  },
) {
  const filtered = opts.tier === "low" ? await filterQuietHours(recipients) : recipients;
  const messages = expoMessages(filtered, opts);

  if (messages.length === 0) return;

  // Expo caps batches at 100 messages per request.
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(chunk),
    });
    await recordReceiptHandoff(res, chunk);
  }
}

// Bug #5 setup half. A dead-token error (DeviceNotRegistered) surfaces on the *receipt*, which
// Expo only makes available a while after send — not on this immediate ticket. Stash the
// ticket-id/token pairs so the prune sweep (below) can check receipts later and know which token
// to delete. A ticket with status "error" here (malformed request, not a dead device) has no id
// and nothing to check later, so it's skipped rather than stored.
async function recordReceiptHandoff(
  res: Response,
  chunk: { to: string }[],
): Promise<void> {
  let tickets: { id?: string; status: string }[];
  try {
    const json = await res.json();
    tickets = json?.data ?? [];
  } catch {
    return;
  }
  const rows = tickets
    .map((t, i) => ({ ticket_id: t.id, expo_token: chunk[i]?.to }))
    .filter((r): r is { ticket_id: string; expo_token: string } => !!r.ticket_id && !!r.expo_token);
  if (rows.length > 0) {
    await supabase.from("push_receipts").insert(rows);
  }
}

// Bug #5 sweep half. Triggered every 20 min by the prune-dead-push-tokens cron via notify_push,
// same fan-out path as every other notification type. Expo batches getReceipts at up to 1000 ids.
async function pruneDeadTokens(): Promise<void> {
  const { data } = await supabase.rpc("prune_ready_receipt_batch", { p_limit: 1000 });
  const batch = (data as { ticket_id: string; expo_token: string }[] | null) ?? [];
  if (batch.length === 0) return;

  const res = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ ids: batch.map((b) => b.ticket_id) }),
  });
  const json = await res.json().catch(() => null);
  const receipts = json?.data ?? {};

  for (const { ticket_id, expo_token } of batch) {
    const receipt = receipts[ticket_id];
    if (receipt?.status === "error" && receipt?.details?.error === "DeviceNotRegistered") {
      await supabase.rpc("delete_push_token", { p_expo_token: expo_token });
    }
  }
  // Handled either way — an unrecognized/not-yet-ready receipt isn't retried, since the next send
  // to that token will queue a fresh ticket.
  await supabase.rpc("delete_push_receipts", { p_ticket_ids: batch.map((b) => b.ticket_id) });
}

// Memoized per-invocation — a burst of rows for the same game (a coalesced group, or several
// unrelated event types firing off one edit) shouldn't re-fetch the summary per row.
function makeCache<T>(fetch: (key: string) => Promise<T>) {
  const cache = new Map<string, Promise<T>>();
  return (key: string) => {
    if (!cache.has(key)) cache.set(key, fetch(key));
    return cache.get(key)!;
  };
}

const getGameSummary = makeCache(async (gameId: string) => {
  const { data, error } = await supabase.rpc("push_game_summary", { p_game_id: gameId }).single();
  // PGRST116 = zero rows from .single() — the game is genuinely gone, not an RPC hiccup. Any other
  // error (network blip, timeout) must propagate so the row is left unsent for the retry sweep
  // instead of getting permanently stamped with a null title (bug: 2026-08-22 nudge_underfilled row).
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as GameSummary | null;
});

const getActorName = makeCache(async (profileId: string) => {
  const { data, error } = await supabase.rpc("push_actor_name", { p_profile_id: profileId });
  if (error) throw error;
  return (data as string | null) ?? "A player";
});

const getUnreadCount = makeCache(async (profileId: string) => {
  const { data, error } = await supabase.rpc("notification_unread_count", { p_profile_id: profileId });
  if (error) throw error;
  return (data as number | null) ?? 0;
});

type Rendered = { body: PushBody; screen: string };

// One row, one recipient — every notification type's individual (non-coalesced) copy.
async function renderIndividual(row: NotificationRow): Promise<Rendered | null> {
  if (row.type === "message") {
    const { data: msgSummary, error } = await supabase
      .rpc("push_message_summary", { p_message_id: row.params.message_id })
      .single();
    if (error) {
      if (error.code === "PGRST116") return null;
      throw error;
    }
    if (!msgSummary) return null;
    return { body: messageBody(msgSummary as MessageSummary), screen: "chat" };
  }

  if (!row.game_id) return null;
  const summary = await getGameSummary(row.game_id);
  if (!summary) return null;

  switch (row.type) {
    case "join_request": {
      const actor = row.actor_id ? await getActorName(row.actor_id) : "A player";
      return { body: joinRequestBody(actor, summary), screen: "game_requests" };
    }
    case "player_left": {
      const actor = row.actor_id ? await getActorName(row.actor_id) : "A player";
      return { body: playerLeftBody(actor, summary), screen: "game" };
    }
    case "game_full":
      return { body: gameFullBody(summary), screen: "game" };
    case "game_cancelled":
      return { body: gameCancelledBody(summary), screen: "game" };
    case "game_rescheduled":
      return { body: gameRescheduledBody(summary, row.params.old_starts_at as string | undefined), screen: "game" };
    case "details_changed":
      return { body: detailsChangedBody(summary), screen: "game" };
    case "booking_verified":
      return { body: bookingVerifiedBody(summary), screen: "game" };
    case "join_decision": {
      const status = row.params.status as "approved" | "rejected" | "removed";
      // A declined player is sent looking for another game, not back to the one that said no.
      return { body: joinDecisionBody(status, summary), screen: status === "rejected" ? "discover" : "game" };
    }
    case "nudge_underfilled":
      return { body: nudgeUnderfilledBody(summary), screen: "game" };
    case "nudge_pending":
      return { body: nudgePendingBody(summary, row.params.pending_count as number), screen: "game_requests" };
    case "reminder_24h":
      return { body: reminder24hBody(summary), screen: "game" };
    case "reminder_2h":
      return { body: reminder2hBody(summary), screen: "game" };
    case "post_game_rate":
      return { body: postGameRateBody(summary, row.params.rateable_count as number), screen: "post_game" };
    case "post_game_attendance":
      return { body: postGameAttendanceBody(summary, row.params.player_count as number), screen: "post_game" };
    case "game_invite": {
      const actor = row.actor_id ? await getActorName(row.actor_id) : "A host";
      return { body: gameInviteBody(actor, summary), screen: "game" };
    }
    case "alert_match":
      return { body: alertMatchBody(summary), screen: "game" };
    case "spot_declined":
      return { body: spotDeclinedBody(row.params.label as string | null, summary), screen: "game" };
    case "hold_nudge":
      return { body: holdNudgeBody(row.params.label as string | null, summary), screen: "game" };
    case "hold_auto_released":
      return { body: holdAutoReleasedBody(row.params.label as string | null, summary), screen: "game" };
    default:
      return null;
  }
}

async function renderCoalesced(type: string, count: number, gameId: string): Promise<Rendered | null> {
  const summary = await getGameSummary(gameId);
  if (!summary) return null;
  if (type === "join_request") return { body: joinRequestCoalescedBody(count, summary), screen: "game_requests" };
  if (type === "message") return { body: messageCoalescedBody(count, summary), screen: "chat" };
  return null;
}

async function fetchTokens(profileIds: string[]): Promise<Map<string, string>> {
  if (profileIds.length === 0) return new Map();
  const { data } = await supabase.from("push_tokens").select("profile_id, expo_token").in("profile_id", profileIds);
  const map = new Map<string, string>();
  for (const row of (data ?? []) as Recipient[]) map.set(row.profile_id, row.expo_token);
  return map;
}

async function markSent(ids: string[], title?: string, body?: string): Promise<void> {
  await supabase
    .from("notifications")
    .update({ sent_at: new Date().toISOString(), ...(title !== undefined ? { title, body } : {}) })
    .in("id", ids);
}

async function dispatchNotifications(ids: string[]): Promise<void> {
  const { data } = await supabase
    .from("notifications")
    .select("id, profile_id, type, game_id, actor_id, params, priority, collapse_key, created_at")
    .in("id", ids)
    .is("sent_at", null);
  const rows = (data ?? []) as NotificationRow[];
  if (rows.length === 0) return;

  const tokens = await fetchTokens([...new Set(rows.map((r) => r.profile_id))]);
  // A batch can contain several rows from the same coalescing group (e.g. the retry sweep picks
  // up a whole burst at once) — process each (profile, collapse_key) pair only once.
  const handledGroups = new Set<string>();

  for (const row of rows) {
    const groupKey = row.collapse_key ? `${row.profile_id}::${row.collapse_key}` : null;
    if (groupKey && handledGroups.has(groupKey)) continue;

    let idsToStamp = [row.id];
    let rendered: Rendered | null;
    let count = 1;

    try {
      const threshold = row.collapse_key ? COALESCE_THRESHOLD[row.type] : undefined;
      if (groupKey && threshold && row.game_id) {
        const windowMin = COALESCE_WINDOW_MIN[row.type];
        // Count every sibling in the window, sent or not — most rows get individually dispatched
        // within milliseconds of being enqueued, so gating on "still unsent" almost never catches a
        // real burst: by the time request #2 lands, #1 has usually already sent and been stamped.
        // The count that matters is "how many of these has this recipient gotten in the window",
        // which includes ones already pushed.
        const { data: siblings } = await supabase
          .from("notifications")
          .select("id, sent_at")
          .eq("profile_id", row.profile_id)
          .eq("collapse_key", row.collapse_key)
          .gt("created_at", new Date(Date.now() - windowMin * 60_000).toISOString());
        const siblingRows = (siblings ?? []) as { id: string; sent_at: string | null }[];
        count = siblingRows.length;
        // Only ever stamp/send for rows still unsent — an already-sent sibling keeps its original
        // individual copy; this pass just adds one more (now coalesced) push on top for whichever
        // row(s) are new.
        const unsent = siblingRows.filter((s) => s.sent_at === null).map((s) => s.id);
        if (count >= threshold) {
          idsToStamp = unsent.length > 0 ? unsent : [row.id];
          rendered = await renderCoalesced(row.type, count, row.game_id);
        } else {
          rendered = await renderIndividual(row);
        }
        handledGroups.add(groupKey);
      } else {
        rendered = await renderIndividual(row);
      }
    } catch (err) {
      // A real render failure (RPC error, network blip) — leave sent_at null so the retry sweep
      // (dispatch_notification_retries, every 5 min) picks it back up instead of permanently
      // stamping a blank title/body onto the row.
      console.error(`renderIndividual failed for notification ${row.id}:`, err);
      continue;
    }

    if (!rendered) {
      // Nothing to render (the game or message was deleted under us) — stamp it sent anyway so
      // the retry sweep doesn't loop on it forever.
      await markSent(idsToStamp);
      continue;
    }

    const { title, body } = rendered.body;
    const token = tokens.get(row.profile_id);
    if (token) {
      const badge = await getUnreadCount(row.profile_id);
      const categoryId = CATEGORY_FOR_TYPE[row.type];
      await sendExpoPush([{ profile_id: row.profile_id, expo_token: token }], {
        title,
        body,
        data: { type: row.type, screen: rendered.screen, game_id: row.game_id, notification_id: row.id },
        tier: row.priority as PushTier,
        channelId: CHANNEL_FOR_TYPE[row.type] ?? "reminders",
        ...(categoryId ? { categoryId } : {}),
        badge,
      });
    }

    await markSent(idsToStamp, title, body);
  }
}

Deno.serve(async (req) => {
  const expectedKey = Deno.env.get("PUSH_DISPATCH_KEY");
  const auth = req.headers.get("Authorization");
  if (!expectedKey || auth !== `Bearer ${expectedKey}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = (await req.json()) as { ids?: string[]; type?: string };

  if (payload.type === "prune_receipts") {
    await pruneDeadTokens();
  } else if (Array.isArray(payload.ids)) {
    await dispatchNotifications(payload.ids);
  }

  return new Response("ok", { status: 200 });
});
