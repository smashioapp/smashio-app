import { formatDate } from "./format";

// Host picks how long the court's booked for, in 15-minute steps (create-game-plan.md §9.12 —
// 1h30 is the most common Sydney badminton block, and rounding to a whole hour publishes an end
// time later than what the receipt actually proves). Hours stay the unit callers pass around
// (durationMs, the wizard draft, edit form) since durationMs(1.5) is already exact — only the
// DB column is minutes (games.duration_minutes).
export const DEFAULT_DURATION_HOURS = 1.5;
export const MIN_DURATION_HOURS = 1;
export const MAX_DURATION_HOURS = 6;
export const DURATION_STEP_HOURS = 0.25;

export function durationMs(hours: number): number {
  return hours * 60 * 60 * 1000;
}

export function durationMinutesToHours(minutes: number): number {
  return minutes / 60;
}

export function hoursToDurationMinutes(hours: number): number {
  return Math.round(hours * 60);
}

// "1h 30m" / "2h" — the display form everywhere a fractional-hour value would otherwise read as
// "1.5h", which nobody actually says.
export function formatDuration(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (m === 0) return `${h}h`;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

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

// Rebook prefill (my-games-plan.md §M4): same weekday + time as the past game, but snapped to
// a slot the wizard's own pickers can actually show — dateOptions only spans 4 days and time is
// one of TIME_OPTIONS, so a raw "+7 days" startsAt would land on a chip that isn't rendered.
export function nextRebookSlot(pastStartsAt: Date, now: Date = new Date()): Date {
  const targetWeekday = pastStartsAt.getDay();
  const targetH = pastStartsAt.getHours();
  const targetM = pastStartsAt.getMinutes();
  const timeMatch = TIME_OPTIONS.find(({ h, m }) => h === targetH && m === targetM) ?? TIME_OPTIONS[0];
  const dateMatch = dateOptions(now).find(({ date }) => date.getDay() === targetWeekday);
  if (dateMatch && isSlotBookable(dateMatch.date, timeMatch.h, timeMatch.m, now)) {
    return slotAt(dateMatch.date, timeMatch.h, timeMatch.m);
  }
  return firstBookableSlot(now) ?? slotAt(now, timeMatch.h, timeMatch.m);
}

// fill-the-spot P1.1: the WHEN row is chips first, native pickers behind "Pick a date" / "Other".
// Hours a host most often books, evenings first (venue-specific popular times aren't in the data yet).
export const QUICK_HOURS = [18, 19, 20, 21];

export type QuickDay = { key: string; label: string; date: Date };

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function quickTimes(day: Date, now: Date = new Date()): { label: string; h: number }[] {
  return QUICK_HOURS.filter((h) => isSlotBookable(day, h, 0, now)).map((h) => ({ label: `${h > 12 ? h - 12 : h}${h >= 12 ? "pm" : "am"}`, h }));
}

// Tonight (only while a slot is left), Tomorrow, then the next Sat and Sun that aren't already
// one of those. Anything else is "Pick a date".
export function quickDays(now: Date = new Date()): QuickDay[] {
  const today = startOfDay(now);
  const out: QuickDay[] = [];
  if (quickTimes(today, now).length > 0) out.push({ key: "today", label: "Tonight", date: today });
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  out.push({ key: "tomorrow", label: "Tomorrow", date: tomorrow });
  for (const [dow, label] of [[6, "Sat"], [0, "Sun"]] as const) {
    const d = new Date(today);
    d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7));
    if (!isSameDay(d, today) && !isSameDay(d, tomorrow)) out.push({ key: label.toLowerCase(), label, date: d });
  }
  return out;
}

// A new draft's slot: before 5pm, the next common slot today; after, 7pm tomorrow.
export function defaultDraftSlot(now: Date = new Date()): Date {
  const today = startOfDay(now);
  if (now.getHours() < 17) {
    const next = quickTimes(today, now)[0];
    if (next) return slotAt(today, next.h, 0);
  }
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return slotAt(tomorrow, 19, 0);
}

// "tonight 7pm" / "tomorrow 7pm" / "Sat 7pm" for one-line summaries.
export function friendlyWhen(startsAt: Date, now: Date = new Date()): string {
  const today = startOfDay(now);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const h = startsAt.getHours();
  const m = startsAt.getMinutes();
  const clock = `${h % 12 === 0 ? 12 : h % 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h >= 12 ? "pm" : "am"}`;
  let day: string;
  if (isSameDay(startsAt, today)) day = h >= 17 ? "tonight" : "today";
  else if (isSameDay(startsAt, tomorrow)) day = "tomorrow";
  else day = startsAt.toLocaleDateString("en-AU", { weekday: "short" });
  return `${day} ${clock}`;
}
