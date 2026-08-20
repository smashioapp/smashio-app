export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

export function formatTimeRange(startIso: string, endIso: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true }).replace(" ", "");
  return `${fmt(startIso)}–${fmt(endIso)}`;
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

// venues_near carries no distance_m (map-plan.md pins are viewport-bound, not distance-sorted
// server-side) — client-side haversine is the cheap way to rank/label them against the map center.
export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Players think in days, not list position — Discover's day-grouped sections use this instead
// of the full weekday/date formatDate() gives.
// Compact form for map pins, where a full "7:00 PM" doesn't fit — "7pm" / "7:30pm".
export function formatTimeShort(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
}

// Past tab groups by month, not by day — a history list is long enough that day headers would
// just be noise (my-games-plan.md §M4).
export function monthLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) return "This month";
  return d.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
}

export function dayLabel(iso: string, now: Date = new Date(), opts: { todayLabel?: string } = {}): string {
  const d = new Date(iso);
  const startOfDay = (x: Date) => {
    const y = new Date(x);
    y.setHours(0, 0, 0, 0);
    return y.getTime();
  };
  const diffDays = Math.round((startOfDay(d) - startOfDay(now)) / DAY_MS);
  if (diffDays === 0) return opts.todayLabel ?? "Tonight";
  if (diffDays === 1) return "Tomorrow";
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

// Only meaningful inside a 24h window — anything further out isn't "urgent", caller should
// skip rendering the chip entirely (see useCountdown).
export function formatCountdown(startsAtIso: string, now: Date = new Date()): string | null {
  const diffMs = new Date(startsAtIso).getTime() - now.getTime();
  if (diffMs <= 0 || diffMs > DAY_MS) return null;
  const totalMins = Math.round(diffMs / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `Starts in ${m}m`;
  return `Starts in ${h}h ${m}m`;
}

function mondayOfWeek(d: Date): number {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const dayIdx = (start.getDay() + 6) % 7; // Monday = 0
  start.setDate(start.getDate() - dayIdx);
  return start.getTime();
}

// Consecutive weeks (Mon-Sun) with at least one completed game, counting back from the
// current or previous week — a gap of one full week before today breaks the streak.
export function computeWeekStreak(startsAtIsoDates: string[], now: Date = new Date()): number {
  if (startsAtIsoDates.length === 0) return 0;
  const weeks = Array.from(new Set(startsAtIsoDates.map((d) => mondayOfWeek(new Date(d))))).sort((a, b) => b - a);
  const thisWeek = mondayOfWeek(now);
  const weekMs = 7 * DAY_MS;
  if (weeks[0] !== thisWeek && weeks[0] !== thisWeek - weekMs) return 0;
  let streak = 0;
  let cursor = weeks[0];
  for (const w of weeks) {
    if (w !== cursor) break;
    streak++;
    cursor -= weekMs;
  }
  return streak;
}

// Strava-style calendar heatmap, shrunk (profile-plan.md P3) — grid[week][day], oldest week
// first, Monday-start rows to match computeWeekStreak's own week boundary.
export function buildWeekHeatmap(dates: string[], weeks: number = 12, now: Date = new Date()): number[][] {
  const grid: number[][] = Array.from({ length: weeks }, () => Array(7).fill(0));
  const weekMs = 7 * DAY_MS;
  const startMonday = mondayOfWeek(now) - (weeks - 1) * weekMs;
  for (const iso of dates) {
    const d = new Date(iso);
    const weekIdx = Math.round((mondayOfWeek(d) - startMonday) / weekMs);
    if (weekIdx < 0 || weekIdx >= weeks) continue;
    const dayIdx = (d.getDay() + 6) % 7;
    grid[weekIdx][dayIdx]++;
  }
  return grid;
}
