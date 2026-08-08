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

const DAY_MS = 24 * 60 * 60 * 1000;

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
