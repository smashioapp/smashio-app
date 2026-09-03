import type { EditGameFields } from "./store";
import { detailsChangedPushPreview, rescheduledPushPreview } from "./pushPreview";

// Host a Game v3 edit mode (create-game-plan.md band 08 item 4): "loud" fields reach players
// because they're the ones the notifications-plan trigger actually pushes for
// (20260903000000_game_details_changed_push.sql) — start time, duration, courts, cost and
// max_players. Everything else is "quiet": no trigger fires on it, so no player is ever told.
// Court number rides inside the WHEN row visually but is itself quiet (court_label isn't in the
// trigger's column list) — a WHEN-row edit can be loud, quiet, or both at once.
export type DirtyRow = { dirty: boolean; loud: boolean };

export function whenRow(d: EditGameFields, o: EditGameFields): DirtyRow {
  const loud = d.startsAt.getTime() !== o.startsAt.getTime() || d.durationHours !== o.durationHours || d.courtsBooked !== o.courtsBooked;
  const quiet = d.courtLabel !== o.courtLabel;
  return { dirty: loud || quiet, loud };
}
export function whoRow(d: EditGameFields, o: EditGameFields): DirtyRow {
  const loud = d.maxPlayers !== o.maxPlayers;
  const quiet = d.skill !== o.skill || d.skillMax !== o.skillMax;
  return { dirty: loud || quiet, loud };
}
export function costRow(d: EditGameFields, o: EditGameFields): DirtyRow {
  const loud = d.cost !== o.cost;
  return { dirty: loud, loud };
}
export function moreRow(d: EditGameFields, o: EditGameFields): DirtyRow {
  const dirty = d.format !== o.format || d.visibility !== o.visibility || d.autoApprove !== o.autoApprove || d.shuttles !== o.shuttles || d.notes !== o.notes;
  return { dirty, loud: false };
}

// "6 players get a heads-up about the new time." / "...about the time, spot count and price."
export function loudSummary(d: EditGameFields, o: EditGameFields, approvedCount: number): string | null {
  const names: string[] = [];
  if (whenRow(d, o).loud) names.push("time");
  if (whoRow(d, o).loud) names.push("spot count");
  if (costRow(d, o).loud) names.push("price");
  if (names.length === 0) return null;
  const who = `${approvedCount} ${approvedCount === 1 ? "player gets" : "players get"} a heads-up`;
  if (names.length === 1) return `${who} about the new ${names[0]}.`;
  const list = names.length === 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${who} about the ${list}.`;
}

// The literal string a joined player receives — real title/body from
// supabase/functions/push-dispatch/format.ts, not invented marketing copy
// (create-game-plan.md band 08 defect #3). Reschedule wins over details-changed when both fire,
// matching trigger_notify_game_change's elsif priority.
export function pushPreview(d: EditGameFields, o: EditGameFields, venueName: string): { title: string; body: string } | null {
  if (d.startsAt.getTime() !== o.startsAt.getTime()) {
    return rescheduledPushPreview(d.startsAt.toISOString(), o.startsAt.toISOString());
  }
  if (whenRow(d, o).loud || whoRow(d, o).loud || costRow(d, o).loud) {
    return detailsChangedPushPreview(venueName, d.startsAt.toISOString(), Math.round(d.cost * 100), d.courtLabel || null);
  }
  return null;
}
