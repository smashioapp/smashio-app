import { dayLabel } from "./format";
import type { ChatMessage } from "./queries/messages";

export type TimelineEntry =
  | { type: "day"; id: string; label: string }
  | { type: "system"; id: string; message: ChatMessage }
  | { type: "message"; id: string; message: ChatMessage; groupStart: boolean; groupEnd: boolean };

const GROUP_GAP_MS = 5 * 60 * 1000;

// Day separators + consecutive-sender grouping (avatar/name once per run, tighter gaps
// between bubbles in the same run) — chat-plan.md §Message rendering.
export function buildChatTimeline(messages: ChatMessage[]): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  let lastDayKey: string | null = null;
  let lastSenderId: string | null = null;
  let lastTime = 0;

  for (const m of messages) {
    const d = new Date(m.createdAt);
    const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (dayKey !== lastDayKey) {
      out.push({ type: "day", id: `day-${dayKey}`, label: dayLabel(m.createdAt, new Date(), { todayLabel: "Today" }) });
      lastDayKey = dayKey;
      lastSenderId = null;
    }

    if (m.kind === "system") {
      out.push({ type: "system", id: m.id, message: m });
      lastSenderId = null;
      continue;
    }

    const groupStart = m.senderId !== lastSenderId || d.getTime() - lastTime > GROUP_GAP_MS;
    out.push({ type: "message", id: m.id, message: m, groupStart, groupEnd: false });
    lastSenderId = m.senderId;
    lastTime = d.getTime();
  }

  for (let i = 0; i < out.length; i++) {
    const entry = out[i];
    if (entry.type !== "message") continue;
    const next = out[i + 1];
    entry.groupEnd = !(next && next.type === "message" && !next.groupStart);
  }

  return out;
}
