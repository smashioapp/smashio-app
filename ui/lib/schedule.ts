import { formatDate } from "./format";

// Every game is a fixed 2h block for MVP — the wizard and the edit screen both offer a single
// start time and derive ends_at from it.
export const GAME_DURATION_MS = 2 * 60 * 60 * 1000;

export const TIME_OPTIONS = [
  { label: "6:00 PM", h: 18, m: 0 },
  { label: "7:00 PM", h: 19, m: 0 },
  { label: "7:30 PM", h: 19, m: 30 },
  { label: "8:00 PM", h: 20, m: 0 },
  { label: "9:00 AM", h: 9, m: 0 },
  { label: "10:00 AM", h: 10, m: 0 },
];

export function dateOptions(now: Date = new Date()): { label: string; date: Date }[] {
  return Array.from({ length: 4 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : formatDate(d.toISOString());
    return { label, date: d };
  });
}

export function slotAt(day: Date, h: number, m: number): Date {
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
}

// A slot 15 minutes out is technically future but useless to publish — anything inside the
// buffer reads as unpickable so "Today" can't produce an already-started game.
const LEAD_TIME_MS = 15 * 60 * 1000;

export function isSlotBookable(day: Date, h: number, m: number, now: Date = new Date()): boolean {
  return slotAt(day, h, m).getTime() > now.getTime() + LEAD_TIME_MS;
}

// The earliest slot the picker still offers, used to snap a stale draft forward rather than
// leaving the user on a greyed-out selection with no obvious fix. TIME_OPTIONS is ordered by
// popularity (evenings first), so scan it chronologically here.
export function firstBookableSlot(now: Date = new Date()): Date | null {
  const chronological = [...TIME_OPTIONS].sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m));
  for (const { date } of dateOptions(now)) {
    for (const { h, m } of chronological) {
      if (isSlotBookable(date, h, m, now)) return slotAt(date, h, m);
    }
  }
  return null;
}

export function isSameSlot(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}
