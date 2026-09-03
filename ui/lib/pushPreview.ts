// Mirrors supabase/functions/push-dispatch/format.ts's gameRescheduledBody / detailsChangedBody
// closely enough to show the host the actual string a player receives (create-game-plan.md band
// 08 defect #3 — the save bar must not invent copy). Can't import the Deno edge function into RN,
// so this is a parallel pure implementation; keep it in sync with format.ts if that file changes.

const SYDNEY_TZ = "Australia/Sydney";

function shortTime(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", { timeZone: SYDNEY_TZ, weekday: "short", hour: "numeric", minute: "2-digit" });
}

function money(cents: number | null | undefined): string {
  if (!cents) return "free";
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

// B2 — fires when starts_at changes (trigger_notify_game_change).
export function rescheduledPushPreview(newStartsAtIso: string, oldStartsAtIso: string): { title: string; body: string } {
  return {
    title: `New time, ${shortTime(newStartsAtIso)}`,
    body: `Moved from ${shortTime(oldStartsAtIso)}. Still in?`,
  };
}

// B3 — fires when duration, courts, cost or max_players change without a reschedule.
export function detailsChangedPushPreview(venueName: string, startsAtIso: string, costPerPlayerCents: number, courtLabel: string | null): { title: string; body: string } {
  return {
    title: "Game details updated",
    body: `${courtLabel ? `${courtLabel} · ` : ""}${money(costPerPlayerCents)} per player · ${venueName}, ${shortTime(startsAtIso)}.`,
  };
}
