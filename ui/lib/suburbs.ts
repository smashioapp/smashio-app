// Suburbs as a search result and a Discover location (short-a-player-ux-plan.md §4.3/§4.4).
// There's no suburb table: a suburb is the set of venues (and games) that carry its name, and
// its point is their centroid. Good enough to centre a 10km search on; never stored anywhere.
export type SuburbHit = { suburb: string; lat: number; lng: number; venueCount: number; gameCount: number };

type Located = { suburb: string; lat: number | null; lng: number | null };

export function suburbHits(venues: Located[], games: Located[], query: string): SuburbHit[] {
  const q = query.trim().toLowerCase();
  const bySuburb = new Map<string, { name: string; lats: number[]; lngs: number[]; venues: number; games: number }>();
  const add = (row: Located, kind: "venues" | "games") => {
    if (!row.suburb) return;
    const key = row.suburb.trim().toLowerCase();
    if (q && !key.includes(q)) return;
    const entry = bySuburb.get(key) ?? { name: row.suburb.trim(), lats: [], lngs: [], venues: 0, games: 0 };
    if (row.lat != null && row.lng != null) {
      entry.lats.push(row.lat);
      entry.lngs.push(row.lng);
    }
    entry[kind]++;
    bySuburb.set(key, entry);
  };
  venues.forEach((v) => add(v, "venues"));
  games.forEach((g) => add(g, "games"));
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return Array.from(bySuburb.values())
    .filter((e) => e.lats.length > 0)
    .map((e) => ({ suburb: e.name, lat: avg(e.lats), lng: avg(e.lngs), venueCount: e.venues, gameCount: e.games }))
    // A suburb that starts with what you typed beats one that merely contains it.
    .sort((a, b) => {
      const aStarts = a.suburb.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.suburb.toLowerCase().startsWith(q) ? 0 : 1;
      return aStarts - bStarts || b.gameCount - a.gameCount || b.venueCount - a.venueCount || a.suburb.localeCompare(b.suburb);
    });
}

// Rounded so a GPS wobble of a few metres doesn't refetch a distance-sorted list.
export function roundedPoint(p: { lat: number; lng: number }): { lat: number; lng: number } {
  return { lat: Math.round(p.lat * 1000) / 1000, lng: Math.round(p.lng * 1000) / 1000 };
}
