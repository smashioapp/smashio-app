// The three trust signals behind the short-a-player promise (docs/short-a-player-plan.md §0):
// is the court real, will they be my level, will they turn up. Pure helpers so every surface
// (list row, featured card, map card, game detail, vetting strip, player card, share text) words
// them the same way. A signal that's absent is omitted, never shown as a negative (§2).

// D4: below this many co-player votes, a player's own pick is what shows, labelled as theirs.
export const PEER_LEVEL_MIN_VOTES = 3;

// A reliability score starts at 100 for everyone, so on a brand-new host "turns up 100%" would
// be a claim about nobody. Only say it once there's a track record behind it.
export const TURNS_UP_MIN_GAMES = 3;

export type LevelLine = { label: string; text: string; earned: boolean };

// "Intermediate (voted by 7)" once enough people have voted, else "says Intermediate".
export function levelLine(
  peerLabel: string | null | undefined,
  peerVotes: number | null | undefined,
  selfLabel: string | null | undefined,
): LevelLine | null {
  if (peerLabel && (peerVotes ?? 0) >= PEER_LEVEL_MIN_VOTES) {
    return { label: peerLabel, text: `${peerLabel} (voted by ${peerVotes})`, earned: true };
  }
  if (selfLabel) return { label: selfLabel, text: `says ${selfLabel}`, earned: false };
  return null;
}

// Null when there's nothing honest to show: hidden by the host, or too few games to mean much.
export function turnsUpPercent(score: number | null | undefined, games: number | null | undefined): number | null {
  if (score == null || games == null || games < TURNS_UP_MIN_GAMES) return null;
  return Math.round(Math.max(0, Math.min(100, score)));
}

export function courtBookedLabel(status: "none" | "pending" | "verified" | null | undefined): string | null {
  if (status === "verified") return "Court booked";
  if (status === "pending") return "Checking booking";
  return null;
}

// "Needs 2" / "Full" — frames a game by what it needs, not by what's done (S3).
export function needsLabel(open: number): string {
  return open > 0 ? `Needs ${open}` : "Full";
}

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Discover's featured-card kicker (S3). "NEEDS 1 · YOUR LEVEL · TONIGHT" only when all three are
// true: that's the join that matters most. Anything less keeps the old line.
export function heroKicker(open: number, levelMatch: boolean, startsAt: string, now: Date = new Date()): string {
  const start = new Date(startsAt);
  if (open <= 0 || !levelMatch || !sameLocalDay(start, now)) return "BEST MATCH FOR YOU";
  return `NEEDS ${open} · YOUR LEVEL · ${start.getHours() >= 17 ? "TONIGHT" : "TODAY"}`;
}

// "Short a player tonight" rail (S4): 1-2 spots open, starting within 12h, fewest spots first
// (a game needing one is the most satisfying join and the most valuable to its host), then soonest.
export function shortAPlayer<T extends { startsAt: string }>(games: T[], openOf: (g: T) => number, now: number = Date.now()): T[] {
  return games
    .filter((g) => {
      const open = openOf(g);
      const ms = new Date(g.startsAt).getTime() - now;
      return open >= 1 && open <= 2 && ms > 0 && ms <= 12 * 60 * 60 * 1000;
    })
    .sort((a, b) => openOf(a) - openOf(b) || new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}
